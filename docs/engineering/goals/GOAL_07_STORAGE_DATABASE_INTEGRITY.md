> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Goal 07 — integridade e reconciliação do storage

**STORAGE_DATABASE_INTEGRITY_READY — 11 de setembro de 2026.** D-09 e D-12 resolvidos no escopo definido. Implementação, falhas, concorrência, gates e staging validados; evidências estruturadas abaixo.

## Inventário auditado

| Namespace / operação | Código responsável | Persistência e leitura |
|---|---|---|
| Material: receber e validar PDF | `material-upload.service.js`, rotas de conteúdos, controller `criarPdf/substituirPdf` | Multipart limitado (padrão 20 MiB), extensão, MIME, assinatura `%PDF-`; nome original somente metadata. Body completo antes de obter conexão/lock. |
| Material: preparar, publicar, vincular | `conteudos.models.js`, `material-upload.service.js`, `private-storage.service.js` | `.pending` privado com UUID; write exclusivo, fechamento/fsync, SHA dos bytes finais, publicação sem sobrescrita; metadata e vínculo antes do COMMIT, na mesma conexão do lock de turma. |
| Material: substituir, mudar tipo, excluir | `conteudos.models.js`, `material-lifecycle.service.js` | Versão anterior não sofre overwrite/unlink. Última referência removida torna o asset RETIDO e grava `retido_em`. |
| Material: replicar entre turmas | `turma-replication.service.js` | Compartilha referência imutável; trava/check do asset ATIVO antes de criar novo vínculo. Retenção considera todas as turmas. |
| Material: download privado | `conteudos.controller.js`, `private-download.service.js` | Autorização existente; abertura com O_NOFOLLOW, descriptor do arquivo validado; sem hash scan por download. Material legado em `src/public/assets/materiais` continua somente na rota autorizada e fica fora do collector de UUIDs. |
| Certificado: preparar e renderizar | `certificate-pdf.service.js`, `certificate.service.js` | Imagens/fontes preparadas antes do lock; texto, QR e versão usam snapshot acadêmico protegido. PDF fixo de duas páginas; limites de conteúdo do gerador preservados. |
| Certificado: armazenar e versionar | `certificate-storage.service.js`, `private-storage.service.js`, `certificados.models.js` | Cada versão tem UUID, SHA e PDF próprios; bytes duráveis antes de INSERT/COMMIT. Emissão/reemissão mantém as constraints e locks dos Goals 03/06. |
| Certificado: download/histórico | `certificados.controller.js`, `certificate.service.js`, `private-download.service.js` | Autoriza versão solicitada; indisponibilidade dos bytes não altera histórico nem causa reemissão automática. |
| Certificado: validação pública | `certificate.service.js:validarArquivo/validarPorCodigo` | SHA do buffer enviado comparado ao DB, independente da cópia local. Resposta pública não promete disponibilidade de download nem expõe filesystem. |
| Reconciliação, hash e purge | `storage-reconciliation.service.js`, `scripts/reconcile_storage.js` | Somente dois diretórios conhecidos, sem recursão. Hash por streaming, leitura de metadata, revalidação antes de ações individualizadas. |
| Inspeção anterior de certificados | `scripts/verify_certificate_storage.js`, `certificate_migration_preflight.js` | Verificações de hash/tamanho existentes permanecem somente leitura; nenhuma mudança automática de hash. |
| Backup/restore | `scripts/backup_database.sh`, `restore_database.sh`, `deploy_staging.sh` | Dump MySQL e tar integral de cada volume (inclui pending e histórico). Nenhum novo diretório fora da cobertura. Restore e política de backup são Goal 08. |
| Scripts auxiliares | geração de amostras, smoke de certificados/conclusão | Amostras visuais em docs não são storage acadêmico. O smoke antigo de conclusão possui cleanup explícito de suas fixtures; não é collector e não foi executado sobre certificados históricos neste Goal. |

Os paths completos são `src/api/services/`, `src/api/models/` e `src/api/controllers/` para arquivos da aplicação acima. As definições originais são migrations 005 (materiais), 006/009 (certificados); 011 acrescenta o lifecycle. `scripts/schema_contract.js` valida a baseline incremental.

## Diretórios e privacidade

| Ambiente | Materiais | Certificados |
|---|---|---|
| Local, padrão | `<repo>/storage/materials` | `<repo>/storage/certificates` |
| Compose / Azure staging | `/app/storage/materials` no volume `material_uploads` | `/app/storage/certificates` no volume `certificate_uploads` |
| Temporários | UUID `.pending` dentro do mesmo diretório/volume do final | UUID `.pending` dentro do mesmo diretório/volume do final |

`MATERIAL_STORAGE_DIR` e `CERTIFICATE_STORAGE_DIR` devem ser diretórios privados separados, canônicos e fora de `src/public`. A imagem prepara os diretórios com modo 0700; arquivos novos usam 0600. Startup verifica diretórios e acesso de escrita. O reconciliador não cria diretórios durante dry-run. Caddy monta somente suas configurações e certificados TLS, sem os volumes acadêmicos; faz reverse proxy. `/assets/materiais` público continua bloqueado pelo Express. Não há limpeza no boot nem scan em `/healthz`.

## Janelas anteriores e pipeline atual

Antes, o upload de material renomeava o temporário antes de obter o lock de turma. O controller removia o final em qualquer exceção do model, inclusive após COMMIT cuja confirmação se perdesse. Substituição/exclusão preservavam bytes sem atualizar RETIDO. Certificados já tinham publicação atômica sem overwrite e preservavam bytes no COMMIT incerto, mas escondiam erros de compensação e não tinham reconciliador.

Material agora segue: receber buffer limitado → validar → obter conexão → advisory lock do UUID → temp exclusivo/0600 → write e fsync/close/hash → BEGIN → autorização e estado sob lock de turma → validações acadêmicas → publicar final → INSERT asset/vínculo ou substituição → atualizar retenção anterior → COMMIT → remover pending/liberar trava. Receber bytes pela rede não mantém MySQL lock. O buffer por request ocupa até o limite de PDF; a concorrência de uploads continua limitada pela capacidade do processo, sem spool externo.

A publicação utiliza `link(temp, final)` exclusivo seguido de `unlink(temp)` no mesmo filesystem, e fsync do diretório. É equivalente ao move atômico para visibilidade do final e evita o overwrite que `rename` POSIX permite. Não há copy entre volumes. Colisão de UUID não remove nem sobrescreve o PDF existente. Hash corresponde aos bytes finais, após todas as transformações. Não há estado READY confirmado antes dos bytes.

Certificado prepara imagens e fontes antes da transação. A composição final depende do snapshot travado (nome/curso/responsável/conclusão/conteúdos/versão). Publica antes de revogar predecessor e inserir nova versão. Falha restaura a transição SQL; v1 não é removida pela compensação de v2. COMMIT incerto conserva o novo arquivo. Falha de rollback destrói a conexão para não devolver uma transação pendente ao pool.

## Resíduos e recuperação segura

| Ponto de interrupção | Estado possível | Tratamento |
|---|---|---|
| Criação/escrita/fsync do temp | Nenhum arquivo ou `.pending` parcial | Compensação tenta unlink. Residual vira TEMP_STALE após carência. |
| Publicação antes de remover pending | Dois nomes do mesmo inode | Final temporariamente UNSAFE_PATH; pending recuperável somente se os dois nomes UUID correspondem ao mesmo inode com exatamente dois links. Após remover pending, nova análise classifica o final. Hardlinks arbitrários continuam recusados. |
| Publicação antes de INSERT/COMMIT | Final sem metadata committed | ORPHAN. Trava de publicação evita remoção enquanto request ainda vive; carência protege arquivos recentes. |
| SQL antes de COMMIT falha | Vínculo antigo intacto | Rollback e compensação do novo arquivo. Erro de compensação gera log estruturado e deixa ORPHAN detectável. |
| Confirmação de COMMIT se perde | Operação pode ter sido confirmada ou revertida | Nunca apagar final por suposição; reconciliar como OK/RETAINED ou ORPHAN. |
| Arquivo conhecido removido externamente | MISSING | Preservar DB/hash/histórico; download autorizado responde 503 controlado. Restore confiável pertence ao Goal 08. |
| Bytes alterados | HASH_MISMATCH | Preservar SHA esperado; nunca executar fix-hash. |
| Collector falha após intenção de purge | PURGANDO com ou sem bytes | PURGE_PENDING; retry explícito revalida referências/idade e finaliza PURGADO. |

Não se afirma ACID distribuído. Falha de mídia além das garantias de fsync continua detectável e requer cópia confiável. Leituras do reconciliador são observações; apenas APPLY revalida alvos sob lock. Não se executa hashing histórico dentro de uma transação MySQL.

## Lifecycle e política

ATIVO significa material referenciado por um ou mais conteúdos. RETIDO significa asset conhecido sem referências, preservado desde `retido_em`. A migration 011 classifica legados sem referências como RETIDO e inicia uma janela nova, sem presumir idade anterior. Reaplicar não reinicia a data. O estado elegível é calculado, não uma coluna extra.

`MATERIAL_RETENTION_DAYS=90` é o padrão (inteiro >=1). `STORAGE_GRACE_HOURS=48` é a carência padrão (ambiente >=24). Material RETIDO somente é elegível após retenção e carência; ORPHAN/TEMP_STALE exige idade em mtime **e ctime**, além de nenhuma operação ativa. O collector nunca apaga asset ainda referenciado, mesmo se o status estiver incorreto.

Purge segue: revalidar hash/canonicalização/idade → travar só o asset → conferir todas as referências em READ COMMITTED → confirmar intenção PURGANDO → remover um arquivo → fsync diretório → gravar PURGADO e `purgado_em`. A metadata, SHA e nome permanecem para auditoria. INSERT de referência da replicação exige asset ATIVO sob lock; não pode reativar PURGANDO. Hash scan e remoção não retêm locks de turma nem de tabela inteira.

Certificados ATIVO, REVOGADO e versões anteriores têm retenção permanente neste mecanismo. A barreira de namespace exclui **todos os PDFs de certificados, inclusive órfãos**, de qualquer caminho de unlink no collector. Órfãos de certificados exigem investigação institucional; temporários abandonados podem ser limpos após validação e carência. A compensação de uma emissão malsucedida só pode remover o PDF recém-produzido, nunca uma versão histórica confirmada.

## Operação do reconciliador

Primeiro executar e guardar o dry-run; nenhuma mutação DB/filesystem ocorre por padrão:

```bash
npm run storage:reconcile
npm run --silent storage:reconcile -- --json > storage-dry-run.json
```

Saída contém contagens por namespace e detalhes seguros (ID, UUID, classificação, elegibilidade, ação). Não inclui nome original, CPF, conteúdo, credenciais, tokens ou código público. Nomes inesperados são representados por um digest, sem reproduzir conteúdo arbitrário do diretório. Logs estruturados ficam no stderr; JSON fica no stdout ao usar `--silent`.

Classificações: OK, RETAINED, CERTIFICATE_HISTORICAL, ORPHAN, MISSING, HASH_MISMATCH, TEMP_RECENT, TEMP_STALE, PURGE_PENDING, PURGED, PURGED_RESIDUE, LIFECYCLE_MISMATCH, UNSAFE_PATH, UNKNOWN, UNREADABLE, DIRECTORY_UNAVAILABLE e CHANGED_DURING_SCAN. Incidentes não são confundidos com elegibilidade de exclusão.

APPLY exige alvos individuais revisados; não existe APPLY global:

```bash
npm run storage:reconcile -- --apply \
  --only materials:123e4567-e89b-42d3-a456-426614174000.pdf
```

Pode repetir `--only`. Sem elegibilidade, o alvo é preservado. Symlinks, paths relativos/absolutos fora do namespace, subdiretórios e arquivos não gerenciados são recusados; não há recursão nem `rm -rf`. Duas execuções concorrentes usam a mesma trava que o publisher. Uma segunda execução após purge é idempotente.

Para um **órfão de teste recém-criado, identificado por UUID e conteúdo**, a carência pode ser explicitamente reduzida por `--grace-hours 0`; o valor efetivo consta no relatório. Isso não ignora referências, namespace, path ou locks e não muda a política de retenção. Não usar essa opção para dados reais apenas porque apareceram como ORPHAN após restore. O smoke de staging limita essa exceção a um único fixture conhecido; nenhum material acadêmico legítimo é coletado.

## Testes e evidências

Unidades: `src/__tests__/private-storage.service.test.js` cobre bytes/hash/permissões, falha de criação/escrita/publicação, colisão, compensação e symlink; `src/__tests__/private-download.service.test.js` cobre streaming, 503 e recusa de symlink. Os testes anteriores de materiais, armazenamento/renderização/serviço de certificados continuam no gate.

MySQL real: `src/__tests__/integration/storage-integrity.integration.test.js` cobre A→B, exclusão, compartilhamento, duas substituições concorrentes, SQL failure, COMMIT revertido e confirmação perdida após COMMIT real, cleanup failure→ORPHAN, publicação falha, MISSING/HASH_MISMATCH, dry-run sem mutação, carência, lock de operação ativa, purge/retry/idempotência, PURGANDO com bytes e sem bytes, crash link/unlink, alvos inseguros e proteção de todos os PDFs de certificados. Também verifica upload por hash de certificado cuja cópia local foi perdida.

Regressões direcionadas: upload HTTP (5 casos), certificados/replicação/autorização Goal 06/reconciliador (84 casos na primeira rodada), reconciliador ampliado/certificados (45 casos). Os gates completos e staging estão registrados abaixo. Testes usam MySQL descartável em loopback; `.env` e banco legado não foram alterados. Overrides de conexão residem em setup de teste isolado, sem flags de fault injection no runtime.

## Fechamento e limites

A restauração automática de MISSING/HASH_MISMATCH, backup offsite, agendamento, retenção de backups e RPO/RTO ficam explicitamente para Goal 08. Não se adiciona backup de secrets/configuração, object storage nem stack de observabilidade. As regras de aprovação (80%/75%/conclusão), ciclos, congelamento de tentativas, certificados versionados e autorização transacional do Goal 06 permanecem sob seus serviços existentes.

## Gates concluídos

| Gate | Evidência atual |
|---|---|
| `npm run lint` | Código da aplicação sem erros; execução encontrou quatro `no-undef` somente no helper local `.deployments/storage-integrity/setup-db.cjs`. Extensão corrigida para `.js`; ESLint direcionado passou. Smoke e testes adicionais também passaram no lint. |
| `npm test` | 58 suítes, 595 testes passaram. Cobertura: statements 61,85%; branches 55,56%; functions 63,20%; lines 65,11%. |
| `npm run test:integration` | 16 suítes, 248 testes passaram na execução completa. `--setupFiles` direcionou conexões ao MySQL descartável 33106 sem editar `.env`. |
| Aceite final adicional | Quatro testes direcionados passaram: APPLY preserva órfão/temp recentes; HTTP de material/certificado ausentes retorna 503; histórico e upload por hash continuam válidos. Total combinado: 252 casos de integração, sem alegar uma segunda execução completa. |
| `npm run build` | Artefatos de produção validados. Dockerfile inclui reconciliador e smoke. |
| `npm audit` / `npm audit --omit=dev` | Zero vulnerabilidades reportadas em ambos. |
| `git diff --check` | Passou; repetido após alterações documentais finais. |
| Migration 011 | Reaplicada no MySQL de teste; contrato de 19 tabelas válido. Staging executou as 11 migrations e verificou o schema. |
| Concorrência / Goal 06 | 38 casos existentes incluídos no gate, mais substituições simultâneas e travas publisher/collector. Sem falha/flakiness restante; `test:stability` não foi executado. |

Os quatro testes finais foram adicionados na auditoria de aceite para tornar explícitos os contratos de carência no APPLY e os endpoints reais de indisponibilidade. Não houve mudança do runtime depois dos gates completos. Os [resultados estruturados](../evidence/goal07-validation.json) incluem SHA dos logs locais em `.deployments/storage-integrity`; a [baseline de testes](../evidence/test-summary.json) distingue execução completa e casos adicionais.

## Staging e primeiro dry-run

Atualizado o Azure staging existente, sem reprovisionamento. Backup pré-deploy: `/opt/plataforma-cursos/backups/plataforma_cursos_staging-backup-20260911T174032Z.sha256`. Bundle SHA-256: `2dae3a9f0c76af88a02f65ad8cb799232129b7d45cee124f1c1102f32ace19c4`. Após recriação, **188 arquivos de runtime** conferiram com a árvore local, sem divergência ([verificação](../evidence/goal07-runtime-verification.json)). Inspeção real confirmou os dois volumes nomeados no app e sua ausência no Caddy.

Primeiro dry-run, salvo antes de qualquer APPLY ([JSON integral](../evidence/goal07-first-dry-run.json)):

| Classificação | Materiais | Certificados |
|---|---:|---:|
| OK | 3 | 2 |
| RETAINED | 1 | 0 |
| CERTIFICATE_HISTORICAL | 0 | 2 |
| ORPHAN | 0 | 0 |
| MISSING | 0 | 0 |
| HASH_MISMATCH | 0 | 0 |
| TEMP_STALE | 0 | 0 |

O smoke HTTPS criou uma turma/curso descartáveis, fez upload A, download/hash, substituiu por B, confirmou A RETIDO e B ATIVO com hashes próprios. Criou exatamente um órfão conhecido e o detectou em dry-run. Criou também um material RETIDO de teste, removeu somente seus bytes para simular MISSING, comprovou preservação da metadata/hash e restaurou a fixture a partir dos próprios bytes recém-gerados.

O primeiro e único APPLY removeu **somente** `materials:8041c180-55b3-4373-a4ec-6bac76e4f0b7.pdf`, fixture recém-criada, com `--grace-hours 0` explícito. [Relatório do APPLY](../evidence/goal07-fixture-apply.json): um alvo, uma ação REMOVED. Nenhum certificado ou material legítimo foi alvo de purge; não houve APPLY global.

O container app foi recriado com `--force-recreate`; A e B continuaram íntegros, assim como os quatro PDFs de certificados. Smoke adicional em modo verify confirmou v1 REVOGADO/v2 ATIVO existentes, download autorizado, validação pública por código/upload, rejeição de bytes alterados e quatro registros anteriores preservados. Não foi gerada nova versão para testar o collector.

Cleanup removeu somente conteúdo/turma/curso do smoke pelas APIs usuais. As duas versões do material permaneceram RETIDAS; a fixture MISSING restaurada também ficou RETIDA. Dry-run final: **3 materiais OK e 4 RETAINED; 2 certificados OK e 2 CERTIFICATE_HISTORICAL; zero ORPHAN/MISSING/HASH_MISMATCH/TEMP_STALE** ([JSON final](../evidence/goal07-final-dry-run.json)). A diferença de três retidos corresponde exclusivamente às fixtures deste Goal, preservadas pela política normal.

## Auditoria dos critérios de aceite

| Requisitos do anexo | Evidência que fecha o grupo |
|---|---|
| 1–4: preservar Goals e inventariar/invariantes | Inventário acima; fontes e testes acadêmicos existentes no gate completo; 38 regressões de atomicidade do Goal 06. |
| 5–13: escrita, nomes, compensação, crash e carência | Helpers privados, fsync/publicação, COMMIT incerto e testes reais de falha; residual de hardlink recuperável e temp protegido por trava. |
| 14–20: substituição, concorrência, exclusão e retenção | Testes MySQL A→B, duas substituições, múltiplas referências, datas, carência e purge; migration 011 reaplicada. |
| 21–24: certificados, reemissão e hash final | Gate de certificados, testes de preservação histórica/rollback/COMMIT, PDF/hash independente por versão; smoke público/privado em staging. |
| 25–37: CLI, dry-run, classificações, caminhos e downloads | Relatórios JSON antes/depois, dry-run sem mutação, recusa de symlink/paths, MISSING/HASH_MISMATCH sem alterar DB, endpoints 503 e validação por hash sem cópia local. |
| 38–43: collector explícito, purge e segurança | APPLY exige UUIDs; revalida referências/retido/idade/locks; PURGANDO recuperável; barreira explícita contra PDF de certificado; testes de idempotência e hardlinks/symlinks. |
| 44–52: logs, startup, volumes, migration e baseline | Eventos estruturados; startup sem limpeza; health sem scan; Compose/Dockerfile e mounts reais; migration 011; primeiro dry-run preservado. |
| 53–64: testes de upload/falhas/concorrência/performance | Suites citadas acima: buffer limitado antes de qualquer conexão de escrita; hash fora da transação do collector; nenhum scan em request/health; gates e quatro aceites adicionais. |
| 65–67: limites de backup/recuperação/configuração | Mesmos volumes integralmente cobertos pelo tar; backup pré-deploy registrado; nenhuma ampliação para secrets/offsite/restore automático. |
| 68–71: documentação, gates, staging e primeiro APPLY | Comandos e política acima; gates completos uma vez com correção pontual; smoke de fixture e container recriado; APPLY somente de órfão conhecido. |
| 72–75: baseline, proibições, aceite e entrega | Baselines 02–10 afetadas atualizadas, D-09/D-12 resolvidos, evidências versionáveis e relatório cobrindo os 24 itens da entrega; Goal 08 explicitamente delimitado. |
