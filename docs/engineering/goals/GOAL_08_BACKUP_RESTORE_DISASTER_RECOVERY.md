> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Goal 08 — backup, restore e disaster recovery

**BACKUP_RESTORE_DISASTER_RECOVERY_READY — revalidado em 14 de setembro de 2026 (15/09 UTC).** D-10 e D-11 estão
resolvidos no escopo definido: houve upload offsite real, novo download, validação integral de
hashes e restore funcional em ambiente isolado. RPO e RTO foram formalizados e medidos.

## Arquitetura anterior e problemas encontrados

O ponto de partida gerava artefatos independentes de banco e volumes. Não havia identidade única
do conjunto, manifesto machine-readable, checksum de cada PDF, completion marker, latest-good
confiável, retenção, scheduler, cópia externa nem ensaio completo de recuperação. O restore podia
misturar estado anterior com o snapshot e não fazia preflight integral antes da etapa destrutiva.
Também não havia coordenação explícita com o purge do Goal 07 nem evidência de RPO/RTO.

Isso permitia ter um dump legível sem provar que banco e filesystem pertenciam ao mesmo ponto,
selecionar upload parcial e descobrir corrupção ou incompatibilidade apenas durante o restore.
Secrets corretamente continuam fora do conjunto, mas agora há uma lista explícita do que o
operador deve fornecer separadamente.

## Arquitetura final

```text
systemd diário
  -> flock
  -> suspender app + advisory lock contra purge APPLY
  -> mysqldump consistente + metadata + materials + certificates
  -> retomar app e confirmar health
  -> manifest v1 + checksums + validação integral + LOCAL_GOOD
  -> pacote determinístico -> Azure Blob privado
  -> novo download + SHA-256 -> complete.json remoto
  -> latest-good local/remoto -> retenção
```

Cada conjunto usa `backup-YYYYMMDDTHHMMSSZ-UUID/` e contém:

```text
database.sql.gz
database-metadata.json
storage/materials/<uuid>.pdf
storage/certificates/<uuid>.pdf
manifest.json
checksums.sha256
complete.json
```

O banco protege schema, migrations, constraints, usuários, dados acadêmicos, matrículas,
progresso, tentativas, respostas, certificados e metadata de materiais. Os dois namespaces
privados incluem arquivos ATIVO, RETIDO, REVOGADO e históricos ainda necessários. Ficam fora:
secrets, `.env`, logs comuns, caches, temporários `.pending`, `node_modules`, imagens Docker,
build reproduzível e `.git`.

## Manifesto, hashes e consistência

O manifesto v1 registra ID/timestamp, revisão ou hash da fonte disponível, MySQL e migration,
arquivo do dump, todas as 19 contagens de tabela e inventários de materiais/certificados com
estado, tamanho e SHA-256. `checksums.sha256` cobre dump, metadata, manifesto e cada arquivo de
storage. A validação recalcula todos os hashes, testa gzip, recusa paths/tipos inseguros e compara
o conjunto ao manifesto; erro retorna non-zero e nunca publica GOOD.

O único writer da aplicação é parado durante dump e cópia de storage. O reconciliador APPLY
disputa `plataforma:backup-storage`; assim, nenhum purge confirmado corre dentro da janela. A
aplicação volta e passa pelo health antes das etapas demoradas de hash/upload. Isso produz um
ponto coordenado sem afirmar transação distribuída ou PITR.

## Retenção, offsite, scheduler e falhas

- Retenção local: 7 dias; offsite: 30 dias. Cleanup só ocorre depois de um novo conjunto válido e
  sempre preserva latest-good.
- Offsite: conta `platcursosbk20260912`, container `plataforma-backups`, prefixo exclusivo
  `plataforma-cursos/backups/`, em `chilecentral`.
- Proteção: container sem acesso público, HTTPS/TLS 1.2 mínimo, criptografia Azure at rest e
  identidade gerenciada da VM com `Storage Blob Data Contributor` somente no container. Nenhuma
  storage key ou SAS fica persistida.
- Scheduler: `plataforma-backup.timer`, 03:15 `America/Sao_Paulo`, diário e `Persistent=true`;
  serviço instalado exige offsite. `BACKUP_SCHEDULE` permite alterar o calendário por um drop-in
  validado com `systemd-analyze`; `flock` impede sobreposição.
- Latest-good só muda após validação local e, quando offsite é obrigatório, após upload,
  re-download e completion marker. Download/status consomem e validam esse ponteiro explícito,
  em vez de inferi-lo pelo timestamp. Um `LOCAL_GOOD` decorrente de falha remota não o substitui.

As injeções provaram fail-closed: lock concorrente retornou 75; falha após dump retornou 86 e
removeu parcial; falha durante upload retornou 87 depois de publicar `package.tar.gz`, sem criar
completion marker e sem substituir latest-good;
falha de import MySQL no isolado retornou 88 e não abriu app; checksum corrompido abortou no
preflight sem alterar as contagens de staging. Em todos os casos aplicáveis o app voltou saudável.

## Restore e integração com o Goal 07

`restore_database.sh` é dry-run por padrão e exige `--backup` e `--target`; `--apply` é explícito.
No in-place, o target deve coincidir com o ambiente configurado; staging recusou `production` com
exit 64 antes de validar ou mutar o backup.
Antes de mutar, valida formato, marker, manifesto, todos os hashes, gzip, espaço, secrets externos,
Compose, target e major do MySQL. No modo in-place para o app antes de recriar o banco, substitui
integralmente os dois storages e mantém maintenance se uma validação pós-início destrutivo falhar.

O MySQL é restaurado em database vazio, sem merge. Os storages de destino são substituídos, com
diretórios 0700 e arquivos 0600. Depois, o verificador compara schema, 19 contagens, campos
críticos, códigos/versões/status, SHA e bytes. O reconciliador do Goal 07 roda somente em DRY-RUN;
ORPHAN, MISSING, HASH_MISMATCH ou outra classificação grave impede sucesso. Migrations futuras e
collector APPLY não são executados automaticamente.

`restore_drill.sh` cria Compose project, rede, banco e volumes exclusivos, baixa novamente o
latest-good remoto, restaura, valida, mede e remove todo o laboratório. O staging ativo nunca foi
alvo do APPLY de teste.

## Evidência real de staging

O conjunto final comprovado foi
`backup-20260914T061501Z-dbe1247a-e441-4328-be82-5b5555278d79`, criado automaticamente às
06:15:01Z. A captura durou 25 s e ocupou 442.872 bytes localmente. O pacote remoto possui 381.788
bytes e SHA-256 `813855bbd7f545bd5a9f9649e503ddf36590489fb6f84c379f3b91673edaebfa`; existem pacote, hash e
completion marker no Blob.

O novo download conferiu esse SHA e alimentou o restore isolado. Foram restauradas 19 tabelas na
migration 011, sete materiais (3 ATIVO e 4 RETIDO) e quatro certificados (2 ATIVO e 2 REVOGADO),
com 14 entradas de conteúdo nos checksums. Certificados permaneceram byte-identical e materiais
mantiveram os hashes. O reconciliador retornou somente 3 OK/4 RETAINED para materiais e
2 OK/2 CERTIFICATE_HISTORICAL para certificados. Schema e health passaram; após cleanup não
restaram containers ou volumes do drill.

RPO alvo: 24 h. Às 00:13:31Z de 15/09, local e offsite apontavam ao mesmo ID, idade 64.710 s e
`RPO_OK`. RTO alvo: 4 h. O drill mediu 50 s ponta a ponta: build 4 s, download 9 s, validação 2 s,
DB 3 s, storage 3 s, reconciliação 3 s, startup 4 s e smoke autenticado abaixo de 1 s; o restore
interno totalizou 15 s.
O relatório remoto está em
`/var/backups/plataforma-cursos-drills/reports/<backup-id>-drill-summary.json`.

O timer ficou enabled/active, disparou com sucesso em 13 e 14/09 e tinha próximo disparo em
15/09/2026 06:15 UTC (03:15 em São Paulo), `Persistent=yes`; o último service registrou
`Result=success`/`ExecMainStatus=0`. Depois do gate
de integração, banco/usuário, contêiner e volumes temporários foram removidos, a variável global
de trigger voltou a 0 e o health interno respondeu 200.

Na auditoria final, um conjunto remoto sintético de 01/01/2025 foi criado dentro do prefixo
dedicado: os três objetos antigos foram removidos pela execução normal com retenção de 30 dias,
enquanto um sentinel fora de `plataforma-cursos/backups/` permaneceu intacto. Ambos os fixtures
foram removidos explicitamente depois da prova. Uma nova execução GOOD deixou local/offsite no ID
`backup-20260915T003433Z-90482b60-96a9-45a4-8239-7d890412d66f`, idade 80 s e `RPO_OK` às
00:35:53Z; o service terminou `success/0` e o app continuou 200.
Um download real posterior leu `latest-good.json`, selecionou exatamente esse ID, validou o
completion marker, pacote, manifesto e hashes e removeu apenas sua cópia temporária de auditoria.

## Testes e gates

| Gate | Resultado final |
|---|---|
| Manifesto, retenção e paths | `backup-core.test.js`: 14 casos; conjunto com storage privado: 23 casos direcionados aprovados |
| Certificados + core | 19 casos aprovados |
| Goal 07 / trava backup-purge | 19 casos MySQL 8.4 aprovados, incluindo recusa de purge APPLY durante backup |
| Endurecimento final | 35 casos direcionados aprovados para core, systemd, preflight, latest-good, fases, smoke, permissões e storage privado |
| Failure injection e preflight | lock, dump, upload, checksum e import falharam com non-zero e sem promover conjunto inválido |
| `npm run lint` | aprovado |
| `npm test` | 59 suítes, 609 testes; 61,63% statements, 55,39% branches, 63,20% functions, 64,93% lines |
| `npm run test:integration` | 16 suítes, 253 testes no MySQL 8.4 descartável, todos aprovados em 132,21 s |
| `npm run build` | aprovado |
| `npm audit` e `npm audit --omit=dev` | zero vulnerabilidades em ambos |
| `git diff --check` | aprovado antes da consolidação documental e repetido no fechamento |

Não foi executado `test:stability`, conforme a instrução de economia do Goal. As tentativas
iniciais do gate de integração expuseram configuração incompleta do laboratório (feature flag,
senha de fixture e privilégios de trigger/lock); nenhuma era regressão do produto. A rodada final
reproduziu a preparação do CI, passou integralmente e fez cleanup verificável.

## Entrega objetiva — 33 itens

| # | Item | Resultado |
|---:|---|---|
| 1 | Arquitetura anterior | Dump e cópias separados, sem prova de conjunto restaurável. |
| 2 | Problemas | Sem manifesto integral, GOOD, offsite, retenção, agenda, preflight seguro ou drill. |
| 3 | Formato final | Diretório v1 identificado com dump, metadata, dois storages, manifesto, checksums e marker. |
| 4 | Conteúdo protegido | DB completo e todo storage privado necessário; descartáveis e secrets excluídos. |
| 5 | Manifest | JSON com identidade, fonte, versões, contagens e inventários. |
| 6 | SHA-256 | Por arquivo, pacote remoto e revalidação após download. |
| 7 | Consistência DB/filesystem | App suspenso e purge coordenado durante snapshot. |
| 8 | Retenção local | 7 dias, preservando latest-good. |
| 9 | Destino offsite | Azure Blob no prefixo dedicado do container `plataforma-backups`. |
| 10 | Proteção offsite | Privado, TLS 1.2, criptografia at rest e identidade gerenciada com escopo mínimo. |
| 11 | Retenção offsite | 30 dias, namespace validado e latest-good preservado. |
| 12 | Scheduler | systemd diário 03:15 São Paulo, persistente. |
| 13 | Falhas | Non-zero, limpeza/preservação segura e injeções validadas. |
| 14 | Latest-good | Ponteiro explícito local/remoto, promovido somente após validação exigida. |
| 15 | Fluxo de restore | Download, preflight, APPLY, DB/storage, verificação, reconciliação e health. |
| 16 | Preflight | Completo e anterior a qualquer destruição; target divergente falha com exit 64. |
| 17 | Suspensão de writes | App parado durante restore in-place; falha tardia mantém maintenance. |
| 18 | MySQL | Recriação limpa e import validado. |
| 19 | Storage | Substituição exata dos dois namespaces com permissões privadas. |
| 20 | Goal 07 | Reconciliador DRY-RUN e trava compartilhada; nunca APPLY automático pós-restore. |
| 21 | Certificados | 4 registros/PDFs preservados, códigos, versões, status, hashes e bytes conferidos. |
| 22 | Materiais | 7 registros/PDFs preservados, hashes e lifecycle conferidos. |
| 23 | Offsite real | Upload, novo download, SHA e completion marker comprovados. |
| 24 | Drill real | Restore do objeto offsite em stack totalmente isolada e removida. |
| 25 | RPO | Alvo 24 h; `RPO_OK`, idade final observada 80 s no latest de 15/09 UTC. |
| 26 | RTO | Alvo 4 h; 50 s observados ponta a ponta, com smoke autenticado. |
| 27 | systemd | Unit/timer instalados, enabled/active, última execução success/0. |
| 28 | Testes | Core, storage, preflight, offsite, falhas, concorrência e regressão Goal 07. |
| 29 | Gates | Lint, 609 unitários, 253 integrações, build, audits e diff aprovados. |
| 30 | Staging | Backup/download/restore/reconcile/health reais aprovados sem usar staging como alvo destrutivo. |
| 31 | Documentação | Runbook operacional e cenário de VM perdida publicados. |
| 32 | Baseline | Arquitetura, segurança, deploy, testes, riscos, rastreabilidade e síntese atualizados; D-10/D-11 resolvidos. |
| 33 | Limitações | Sem PITR, HA ou multi-região; capacidade/RTO deve ser remedida com crescimento. |

## Limitações remanescentes

O offsite está fora da VM e de seus volumes, mas na mesma região Azure; não cobre falha regional.
Não há PITR/binlog arquivado, replicação MySQL, HA, object storage direto no runtime, automação
multirregional nem alerta centralizado. O timer/journal/status fornecem detecção local; o operador
deve monitorar `RPO_AT_RISK`. Secrets dependem de canal externo e um novo host precisa receber
identidade/credenciais antes do restore. Os 50 s refletem apenas o volume atual e não são SLA.

Comandos, escalonamento de falhas e cenário de perda da VM estão no
[runbook](../history/BACKUP_RESTORE_RUNBOOK.md); os resultados machine-readable estão em
[goal08-validation.json](../evidence/goal08-validation.json).
