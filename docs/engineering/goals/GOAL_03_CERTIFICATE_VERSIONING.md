> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Goal 03 — Certificate reissuance and versioning

**CERTIFICATE_REISSUANCE_VERSIONING_READY** — implementação e validação concluídas em 09/09/2026. D-14 **RESOLVIDO**.

## Implementação

- Constraint anterior: `uk_certificado_aluno_turma UNIQUE(id_aluno,id_turma)`; a emissão retornava inclusive REVOGADO.
- Modelo: `versao` inicial 1; `id_certificado_anterior`; motivo (3–500), reemissor/data; `snapshot_json` privado por nova versão.
- Único ATIVO: coluna gerada armazenada `ativo_unico = CASE WHEN status='ATIVO' THEN 1 ELSE NULL END`; UNIQUE(aluno,turma,ativo_unico). UNIQUE(aluno,turma,versao) impede versões duplicadas e UNIQUE(predecessor) impede bifurcação no fluxo. [MySQL UNIQUE e NULL](https://dev.mysql.com/doc/refman/8.0/en/create-index.html).
- Migration `009_certificate_versioning.sql`: um único ALTER atômico instala as proteções e só então remove a constraint antiga, sem janela de desproteção. Reaplicável por INFORMATION_SCHEMA; legados ficam v1, preservando ID/código/SHA/storage/status/revogação. Snapshot legado NULL não é reconstruído com cadastro atual.
- Preflight: SQL rejeita metadados inválidos e conflitos; `migrate_database.js` também verifica presença/tamanho/hash de todos os PDFs antes da 009. Interrompe com diagnóstico por ID, sem correção silenciosa. O runner deve ser usado para obter a proteção do filesystem.
- Emissão inicial: ADMIN ou professor responsável; reutiliza somente ATIVO. Histórico sem ativo exige reemissão administrativa, 409 também para ADMIN na rota inicial.
- Revogação isolada: permanece ADMIN, irreversível pela API, sem exclusão/reescrita de PDF e sem reemissão automática.
- Reemissão: `POST /api/certificados/:id_certificado/reemitir`, ADMIN, JSON apenas motivo. Última versão ATIVA é revogada na mesma transação da sucessora. Se já REVOGADA, autoria/data/motivo originais não mudam.
- Academia: usa `buscarRequisitos` após lock de contexto; exige matrícula APROVADO e Teste Final >=75%. A regra acadêmica final não exige conclusão exata e inicia emissão automaticamente. Versionamento, snapshot, hash e proteção de um único ATIVO permanecem.
- Concorrência: lock de matrícula/turma e leitura atual da última versão com FOR UPDATE; duas requisições ao mesmo ID resultam em 201 + 409 e somente uma sucessora. Versão cresce sobre histórico preservado.
- Retry: o ID anterior é precondição persistente; após substituição retorna 409. Idempotency-Key foi avaliado e não introduzido: não há repetição automática usando o ID sucessor, e o histórico permite reconciliar resposta perdida.
- Filesystem/SQL: gerar e publicar PDF novo antes da transição; revogação + INSERT + COMMIT na mesma transação. Rollback compensa somente arquivo novo. UUID, código/QR e SHA são novos; template institucional preservado.
- Validação pública: código antigo continua REVOGADO, novo VALIDO; upload identifica a versão exata pelo SHA, com REVOGADO/AUTENTICO e NAO_VALIDADO para bytes adulterados. Inclui versão sem CPF/e-mail/snapshot/motivos internos ou código sucessor.
- Histórico: `GET :id/historico`, `/meus` e downloads mantêm ownership. Aluno vê ativo e histórico recolhido; ADMIN tem Correção/Reemissão separada da Revogação e confirmação contextual; professor emite inicialmente e vê orientação administrativa para revogado. Roster escolhe última versão sem duplicar matrícula.
- Auditoria específica: emissão/revogação/reemissão com usuário/data/motivo/versão/predecessor consultáveis; sem sistema geral de audit log. Snapshot estruturado privado inclui dados do PDF, CPF, responsável, conteúdos e requisitos acadêmicos realmente usados.
- Backup inclui DB e todos os PDFs, sem filtro de status. Replicação de turma continua sem certificados, código, hash, versões ou arquivos.

## Testes e gates locais

MySQL do sistema estava falhando antes da tarefa. Validação executada em instância MySQL 8.0.46 descartável, porta 3307, somente banco canônico de testes. Nenhum dado do banco legado foi alterado.

| Gate | Resultado |
|---|---|
| Serviços PDF/storage/certificados + schema/infra + frontend | 6 suítes, 67 testes aprovados |
| Integração direcionada certificados | 29 testes aprovados |
| Contrato do empacotamento Docker | 5 testes aprovados; dependências da migration e smoke incluídas |
| npm run lint | Aprovado |
| npm test | 55 suítes, 566 testes aprovados |
| npm run test:integration | 13 suítes, 190 testes aprovados |
| npm run build | Artefatos validados |
| npm audit | 0 vulnerabilidades |
| npm audit --omit=dev | 0 vulnerabilidades |
| git diff --check | Aprovado |

Não foi executado `test:stability`. Cobertura inclui autorização, payload controlado, elegibilidade, PDFs reais, novo código/QR/hash/storage, snapshot, histórico, versão monotônica, concorrência inicial/reemissão, constraints por INSERT direto, falhas de PDF/storage/SQL/código, COMMIT incerto, migration de ATIVO/REVOGADO e rejeição de legados inválidos. Logs locais: `.deployments/certificate-versioning/`.

## Staging

Ambiente existente Azure: `plataforma-cursos-demo-dk-20260901.chilecentral.cloudapp.azure.com`. Antes do deploy, app/db/Caddy saudáveis e `CERTIFICATE_STORAGE_OK certificados=2`. Atualização por bundle, sem reprovisionamento. Backup completo de DB/materiais/certificados + manifesto criado em `20260909T123629Z`. Migration 009 aplicada e contrato das 19 tabelas validado. O primeiro build revelou ausência do novo script no COPY explícito do Dockerfile; interrompeu antes da migration, mantendo o app anterior. Empacotamento corrigido, teste específico incluído e deploy final aprovado.

| Smoke | Resultado |
|---|---|
| A/B | Aluno elegível por progresso + prova final real; professor emitiu v1 ATIVA; código VALIDO |
| C/I | ADMIN reemitiu; requisições simultâneas produziram 201 + 409; retry do ID anterior também 409; somente v2 ATIVA |
| D/E | Código e PDF original de v1 retornam REVOGADO |
| F/G | Código de v2 retorna VALIDO e upload retorna AUTENTICO; PDF alterado retorna NAO_VALIDADO |
| H | Aluno baixa PDFs de v1 e v2; SHA coincide com bytes privados |
| J | App reiniciado; mesmos IDs, versões, códigos, SHA e estados confirmados novamente |
| Preservação | Dois certificados anteriores mantidos; quatro certificados verificados após smoke/restart; zero grupos com dois ATIVOS |
| UI | Firefox desktop 1440px e celular 390px; aluno/ADMIN/professor sem erro JS ou overflow de página; oito capturas revisadas, disposition ship |

Cenário persistente: turma 32. v1 ID 5, REVOGADO; v2 ID 6, ATIVO. O smoke usa turma própria e contas fictícias existentes, sem alterar cadastro nem documentos anteriores. Não foram apagados certificados para limpar a demonstração.

- v1 código `CERT-D76F69FE-65082E1B-9FE1C1A0-C21535C1`; SHA `f2c0a0f8a4c24995a2da296b05600967c13933e61239bc72cedc29f8ae72c198`.
- v2 código `CERT-4C993DBE-0262F025-34F0D746-73AE810D`; SHA `264ff2fb5cdfc1130b19866303f8a4cb86bff6bf4d82f5af45087ee46a0c4dcf`.
- Bundle implantado: `594aebc9bc4aec5ba44412a7f0cd6dcf2f6d991e6a4bf84c80754eaea226229d`.
- Fontes locais e implantadas: `65679d95a175deaf9514ef5b6571a5e01ef42698f727b30a0dbd03f9ed41a324`, registrado no deploy às 12:36:49 UTC. A atualização final somente documental não modifica esse hash das fontes.

Logs em `.deployments/certificate-versioning/`: `goal03-deploy-final.log`, `goal03-smoke.log`, `goal03-restart-smoke.log`, `goal03-browser-final.log`, `goal03-ui-review.md` e gates. Capturas em `.impeccable/review/goal03/`. Verificação visual independente limitada às alterações solicitadas; sem redesenho do template ou da identidade. A configuração local `.env` foi restaurada após os testes e a instância MySQL descartável foi encerrada.

## Revalidação em 10/09/2026

A retomada do pedido encontrou a implementação e o deploy acima já concluídos. O SHA-256 da árvore-fonte foi recalculado localmente e na VM: ambos continuam `65679d95a175deaf9514ef5b6571a5e01ef42698f727b30a0dbd03f9ed41a324`, igual ao deploy validado. Não houve alteração de código, nova migration ou redeploy nesta retomada.

- Reexecutados 68 testes direcionados: 53 de serviços/PDF/storage, 8 de schema/infraestrutura e 7 de frontend, todos aprovados. Os totais do gate original acima são registros daquela execução.
- Conferidos os logs dos gates completos de 09/09: 566 testes principais, 190 integrações, lint, build e ambos os audits aprovados. Esses gates completos não foram repetidos nesta retomada; não há mudança nos fontes nem nova falha que justifique repeti-los.
- Staging app/db/Caddy saudáveis; contrato remoto validado com 19 tabelas. Smoke em modo `verify` aprovado em 10/09 às 12:27 UTC: turma 32, v1 ID 5 REVOGADO e v2 ID 6 ATIVO, códigos/hashes originais, upload adulterado recusado, downloads históricos autorizados, quatro certificados preservados e zero pares com dois ATIVOS.
- `git diff --check` aprovado. Evidências adicionais em `.deployments/certificate-versioning/goal03-recheck-{services,schema,frontend,staging,remote-contract}.log`.

Status mantido: **CERTIFICATE_REISSUANCE_VERSIONING_READY**; D-14 **RESOLVIDO**.

## Limitações preservadas

Crash entre publicação e commit pode deixar arquivo órfão. Se a resposta do COMMIT se perde, o arquivo é preservado porque a transação pode ter sido confirmada; consultar banco/histórico antes de qualquer remoção. Falha do próprio filesystem ao compensar exige diagnóstico operacional. Isso não cria dois ATIVOS nem autoriza sobrescrever histórico; reconciliação geral e backup externo permanecem D-10/D-11. Não há assinatura Ed25519/PAdES/ICP-Brasil, e acesso SQL privilegiado não é tornado imutável por criptografia. Não há limite de tentativas, reemissão automática ou redesenho de template.

## Aceite

| Critérios do pedido | Evidência de conclusão |
|---|---|
| 1–4: imutabilidade, múltiplas versões, único ATIVO e monotonicidade | Model/service sem atualização de identidade; snapshot e bytes comparados; migration 009 + UNIQUE; v1→v2→v3 em testes |
| 5–7: ADMIN, motivo e anterior revogado preservado | Guard de rota e serviço; contrato 3–500; testes de papéis, motivo e revogação isolada seguida de reemissão |
| 8–12: novo PDF/código/QR/SHA/storage | Mesmo gerador institucional recebe novo snapshot/código; PDFs reais diferentes, UUID/hash próprios e validação independente por versão |
| 13–15: validação histórica e upload correto | Integração real e smoke D–G, bytes alterados recusados |
| 16: concorrência | Reemissões simultâneas 201/409; INSERT direto de outro ATIVO/versão duplicada recusado pelo MySQL |
| 17: migration preserva legados | Legacy 006 com ATIVO/REVOGADO migrado duas vezes; campos originais e bytes iguais; preflight recusa inválidos; staging preservado |
| 18: elegibilidade atual | Fonte única Goal 02, casos de conteúdo/prova/matrícula inconsistentes sem revogação prematura |
| 19: staging | A–J aprovados, quatro PDFs íntegros e zero pares com dois ATIVOS após restart |
| 20: baseline | Documentos 01/02/03/04/05/06/08/09/10, EXECUTIVE_SUMMARY e manual de certificados atualizados |

**CERTIFICATE_REISSUANCE_VERSIONING_READY**. D-14 **RESOLVIDO**.
