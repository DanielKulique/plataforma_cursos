> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../index.md).

# Rastreabilidade e auditoria de cobertura do pedido

## Requisito → regra → endpoint → implementação → tabela → teste

Nomes de implementação abreviados seguem o catálogo RF. Quando não há service separado, o model é a implementação real; não foi inventada camada ausente. Teste listado é evidência direcionada, não prova de que todo o requisito esteja coberto isoladamente.

| RF | RN | Endpoint/operação | Service/model/controller ou UI | Tabela/estado | Teste em src/__tests__ |
| --- | --- | --- | --- | --- | --- |
| RF-001 | RN-007 | GET /api/cursos; GET /api/turmas | cursos.models.js; turmas.models.js; script.js | Cursos, Turmas, Usuarios | `integration/cursos-turmas.integration.test.js` |
| RF-002 | RN-001, RN-002 | POST /api/usuarios | usuarios.controller.js; usuarios.models.js; email.service.js | Usuarios, EmailVerificacoes | `usuarios.controller.test.js`; `goal4.models.test.js`; `integration/auth.integration.test.js` |
| RF-003 | RN-001 | POST /api/usuarios/verificar-disponibilidade | usuarios.models.js:verificarDisponibilidade | Usuarios | `usuarios.controller.test.js` |
| RF-004 | RN-002 | POST /api/auth/enviar-codigo-verificacao | auth.models.js; email.service.js; emailVerificationRateLimit.middleware.js | Usuarios, EmailVerificacoes | `auth.model.test.js`; `email.service.test.js`; `identity-email-flow.routes.test.js` |
| RF-005 | RN-002 | POST /api/auth/verificar-codigo-email | auth.models.js:verificarCodigoEmail; emailVerificationRateLimit.middleware.js | EmailVerificacoes | `auth.model.test.js`; `identity-email-flow.routes.test.js`; `integration/auth.integration.test.js` |
| RF-006 | RN-002, RN-003 | POST /api/auth/login | auth.controller.js; auth.models.js; session.js | Usuarios, EmailVerificacoes | `auth.controller.test.js`; `integration/auth.integration.test.js`; `integration/mvp-security.integration.test.js` |
| RF-007 | RN-003 | GET /api/auth/me; GET /api/auth/csrf | checkAuth.middleware.js; auth.controller.js | Usuarios | `session.frontend.test.js` |
| RF-008 | RN-004 | POST /api/auth/logout | auth.models.js:invalidarSessoes | Usuarios | `integration/mvp-security.integration.test.js` |
| RF-009 | RN-005 | POST /api/auth/recuperar-senha | auth.controller.js; auth.models.js; email.service.js | PasswordResetTokens, Usuarios | `integration/mvp-security.integration.test.js` |
| RF-010 | RN-004, RN-005 | POST /api/auth/redefinir-senha | auth.models.js:redefinirSenha | PasswordResetTokens, Usuarios | `integration/mvp-security.integration.test.js` |
| RF-011 | RN-001, RN-004 | GET/PATCH /api/usuarios/:id; PATCH /api/usuarios/:id/senha | usuarios.models.js | Usuarios | `usuarios.controller.test.js` |
| RF-012 | RN-001, RN-006 | GET/POST /api/admin/usuarios; GET/PATCH/DELETE /api/admin/usuarios/:id | usuarios.models.js | Usuarios e tabelas de vínculos | `integration/goal4-admin.integration.test.js` |
| RF-013 | RN-007, RN-024 | POST /api/cursos; PUT/DELETE /api/cursos/:id | cursos.models.js | Cursos, Turmas | `integration/goal4-admin.integration.test.js` |
| RF-014 | RN-007, RN-008, RN-024 | POST /api/turmas; PATCH/DELETE /api/turmas/:id | turmas.models.js | Turmas, Cursos, Usuarios | `integration/cursos-turmas.integration.test.js` |
| RF-015 | RN-011, RN-013 | GET /api/turmas/professor/:id | turmas.controller.js; turmas.models.js | Turmas, Matriculas | `turmas.controller.test.js` |
| RF-016 | RN-009, RN-010 | POST /api/matriculas | matricula.models.js | Matriculas, Turmas, ConteudosProgresso | `integration/matriculas.integration.test.js`; `integration/enrollment-lifecycle.integration.test.js` |
| RF-017 | RN-008, RN-011, RN-021 | GET /api/matriculas/minha-sala; GET /api/matriculas/:id; GET /api/matriculas/aluno/:id | matricula.models.js; sala-virtual.js | Matriculas, Conteudos, ConteudosProgresso | `integration/goal3-fluxos.integration.test.js`; `sala-virtual.resilience.test.js` |
| RF-018 | RN-011, RN-012 | DELETE /api/matriculas/:id | matricula.models.js:cancelarMatricula | Matriculas, Certificados | `integration/matriculas.integration.test.js` |
| RF-019 | RN-013, RN-014, RN-015, RN-024 | POST /api/turmas/:id_turma/modulos; PATCH/DELETE /api/modulos/:id_modulo | conteudos.models.js | Modulos, Turmas | `integration/professor-content-management.integration.test.js` |
| RF-020 | RN-013, RN-014, RN-015, RN-016, RN-024 | POST /api/turmas/:id_turma/conteudos; PATCH/DELETE /api/conteudos/:id_conteudo | conteudos.models.js | Conteudos, Modulos, Matriculas | `integration/professor-content-management.integration.test.js` |
| RF-021 | RN-014, RN-017, RN-022 | GET /api/turmas/:id_turma/conteudos; GET /api/turmas/:id_turma/questionarios | sala-aula.js; learning-path.js | Modulos, Conteudos, Questionarios, Q_Tentativas | `learning-path.frontend.test.js` |
| RF-022 | RN-017, RN-018 | GET /api/conteudos/:id_conteudo/material | conteudos.controller.js:material; private-pdf.js | Conteudos, ArquivosMateriais, Turmas, Matriculas | `integration/pdf-upload.integration.test.js`; `private-pdf.frontend.test.js` |
| RF-023 | RN-013, RN-018, RN-019 | POST /api/turmas/:id_turma/conteudos/pdf | material-upload.service.js; pdf-validation.service.js; conteudos.models.js | ArquivosMateriais, Conteudos | `material-upload.service.test.js`; `integration/pdf-upload.integration.test.js` |
| RF-024 | RN-018, RN-019 | PUT /api/conteudos/:id_conteudo/pdf | material-upload.service.js; pdf-validation.service.js; conteudos.models.js:substituirPdfComArquivo | ArquivosMateriais, Conteudos | `integration/pdf-upload.integration.test.js` |
| RF-025 | RN-020, RN-021 | PUT /api/conteudos/:id_conteudo/progresso | conteudos.models.js:registrarProgresso | ConteudosProgresso, Matriculas | `integration/goal3-fluxos.integration.test.js` |
| RF-026 | RN-011, RN-021 | GET /api/matriculas/turma/:id_turma; GET /api/turmas/:id_turma/progresso | matricula.models.js; conteudos.models.js | Matriculas, ConteudosProgresso, Certificados | `integration/goal3-fluxos.integration.test.js` |
| RF-027 | RN-012, RN-023 | PATCH /api/matriculas/:id | matricula.models.js:atualizarMatricula | Matriculas, Certificados | `integration/goal3-fluxos.integration.test.js`; `integration/enrollment-lifecycle.integration.test.js` |
| RF-028 | RN-013, RN-014, RN-025, RN-028 | POST /api/turmas/:id_turma/questionarios; PATCH/DELETE /api/questionarios/:id_questionario | questoes.models.js | Questionarios, Turmas, Modulos | `integration/professor-content-management.integration.test.js` |
| RF-029 | RN-026, RN-028 | POST /api/questionarios/:id_questionario/perguntas; PATCH/DELETE /api/perguntas/:id_pergunta | questoes.models.js | Q_Perguntas, Q_Opcoes, Q_Respostas | `integration/goal3-fluxos.integration.test.js` |
| RF-030 | RN-026, RN-027 | POST /api/perguntas/:id_pergunta/opcoes; PATCH/DELETE /api/opcoes/:id_opcao | questoes.models.js | Q_Opcoes, Q_Respostas | `integration/goal3-fluxos.integration.test.js` |
| RF-031 | RN-025, RN-026 | GET /api/turmas/:id_turma/questionarios/disponivel | questoes.models.js:listarAluno | Questionarios, Q_Perguntas, Q_Opcoes | `questionario.frontend.test.js` |
| RF-032 | RN-029, RN-030, RN-031 | POST /api/questionarios/:id_questionario/submissoes | questoes.models.js:submeter | Q_Tentativas, Q_Respostas | `integration/goal3-fluxos.integration.test.js` |
| RF-033 | RN-032 | GET /api/questionarios/historico; GET /api/turmas/:id_turma/questionarios/resultados | questoes.models.js | Q_Tentativas, Questionarios, Usuarios | `integration/goal3-fluxos.integration.test.js` |
| RF-034 | RN-033, RN-034, RN-019 | GET /api/turmas/:id/replicacao-resumo; POST /api/turmas/:id/replicar | turma-replication.service.js | ReplicacoesTurma, Turmas, Modulos, Conteudos, Questionarios, Q_Perguntas, Q_Opcoes | `integration/turma-replication.integration.test.js` |
| RF-035 | RN-035, RN-036 | POST /api/certificados/matriculas/:id_matricula/emitir | certificate.service.js; certificados.models.js | Certificados, Matriculas, Usuarios, Turmas, Cursos | `integration/certificados.integration.test.js` |
| RF-036 | RN-037 | GET /api/certificados/meus; GET /api/certificados/:id_certificado/pdf | certificate.service.js; certificados.controller.js; sala-virtual.js; private-pdf.js | Certificados, Turmas | `integration/certificados.integration.test.js`; `certificates.frontend.test.js`; `sala-virtual.resilience.test.js`; `private-pdf.frontend.test.js` |
| RF-037 | RN-038 | POST /api/certificados/:id_certificado/revogar | certificate.service.js | Certificados | `integration/certificados.integration.test.js` |
| RF-038 | RN-039 | GET /api/public/certificados/:codigo | certificate.service.js:validarPorCodigo | Certificados | `integration/certificados.integration.test.js` |
| RF-039 | RN-039 | POST /api/public/certificados/validar-arquivo | certificate.service.js:validarArquivo | Certificados | `integration/certificados.integration.test.js` |
| RF-040 | RN-040 | GET /api/capabilities | capabilities.controller.js | Sem tabela própria | `integration/mvp-security.integration.test.js` |
| RF-041 | RN-040 | POST /api/analises/contextual; POST /api/analises/contextual/documento | detector-contextual.service.js; analise-contextual.model.js | AnalisesContextuais | `integration/detector-contextual.test.js` |
| RF-042 | RN-040 | POST /api/analises/contextual/segmento | detector-contextual.service.js; incremental-editor.js | Sem persistência local | `incremental-editor.frontend.test.js` |
| RF-043 | RN-040 | POST /api/analises/similaridade | indexed-analysis.service.js | Sem persistência local | `indexed-analysis.routes.test.js` |
| RF-044 | RN-040 | GET /api/admin/corpus/index/status; POST /api/admin/corpus/index/reload | indexed-analysis.service.js | Índice externo; sem tabela local | `indexed-analysis.routes.test.js` |
| RF-045 | RN-040 | POST /api/plagio/analisar | plagio.service.js; analise.model.js | AnalisesPlagio | `integration/plagio.test.js` |
| RF-046 | RN-003 | GET /healthz; GET /readyz; GET /api/health; GET /api/admin/metrics; npm run ops:check | index.js; health.controller.js; httpObservability; database wrapper; operational/backup status | SELECT 1; storages; lê latest-good; sem persistência de métricas | `health.controller.test.js`; `runtime-observability.test.js`; `integration/pool-saturation.integration.test.js`; `integration/runtime-load.integration.test.js` |
| RF-047 | RN-041 | backup/restore/offsite/status/drill + systemd | manifesto v1, SHA-256, completion/latest-good, reconciliador | 19 tabelas funcionais, marcador de identidade e ambos os volumes | `backup-core.test.js`; storage integration; drill real Goal 08 |

## Cobertura de cada item do pedido original

“Coberto” significa análise e documentação realizadas, com limites declarados. Requisito operacional não executado durante a auditoria é diferenciado de implementação ausente. O pedido não autorizava deploy/refatoração; essas ações não são critérios de conclusão.

| Item original | Evidência documental | Resultado/limite |
| --- | --- | --- |
| 0 Princípio fundamental | README, catálogos e evidências | Código atual como fonte, estados e limites explícitos. |
| 1 Repositório | 00-system-overview | Árvore e responsabilidades. |
| 2 Visão geral | 00 e EXECUTIVE_SUMMARY | Finalidade, público, execução e fronteiras. |
| 3 Atores | 00 e 05 | Cinco humanos, três papéis persistidos. |
| 4 RF | 01 | 47 requisitos com campos pedidos. |
| 5 RN | 02 | 41 regras, exceções e inconsistências. |
| 6 RNF | 01 e 06–09 | 26 requisitos observáveis com estado/evidência/risco. |
| 7 Qualidade | 08 | Oito atributos, sem notas arbitrárias. |
| 8 Arquitetura | 03 | Monólito, camadas reais e acoplamentos. |
| 9 C4 | 03 | Contexto, containers e componentes. |
| 10 Deploy | 07 | Topologia, rede, portas, TLS, volumes e ambientes. |
| 11 Modelo | 04 | 19 tabelas, PK/FK/índices/constraints e ER. |
| 12 Dicionário | 04 | Campos semânticos, enums e integridade. |
| 13 API | 05 e evidence/routes.json | 86 operações com entrada/saída/erro/autorização. |
| 14 Autorização | 05 | Matriz com ownership e exceções de ADMIN. |
| 15 E2E | 03 | Cadastro/aluno/professor/admin/PDF/replicação/certificado. |
| 16 Sequências | 03 | Oito fluxos implementados. |
| 17 Estados | 03 e 04 | Quatro diagramas e transições adicionais/limites descritos. |
| 18 Segurança | 06 | Fronteiras, controles e lacunas separadas. |
| 19 Arquivos | 06 | Materiais, certificados, outros, lifecycle e órfãos. |
| 20 Testes | 08 e evidence/test-summary.json | Principal reconferida; integração datada e limites de ambiente. |
| 21 CI/CD | 07 | Workflow real, bundle, deploy manual, migrations, smoke e backup. |
| 22 Infra | 07 | Scripts e configuração; Azure datado sem alegar inspeção remota atual. |
| 23 Dependências | 07 | Finalidade, criticidade, fallback e estado. |
| 24 Falhas | 09 | HTTP, rollback, storage, banco e serviços. |
| 25 Concorrência | 09 | Locks, UNIQUE, idempotência e lacunas. |
| 26 Integridade por camada | 04 | Frontend/backend/banco, garantias e falhas cruzadas. |
| 27 Rastreabilidade | Este arquivo | Todos os RF relacionados a implementação/tabela/teste. |
| 28 Decisões | 03 | Contexto, motivação inferida/evidenciada, consequências. |
| 29 Dívida | 09 | D-01 a D-28, prioridade qualitativa e recomendação. |
| 30 Riscos | 09 | Probabilidade qualitativa, impacto e mitigações. |
| 31 Pontos fortes | 09 | Controles e evidências positivas. |
| 32 Gaps funcionais | 00, 05 e 09 | Órfãos/UX parcial/legado sem implementar. |
| 33 Gaps não funcionais | 09 | Necessidade proporcional à maturidade. |
| 34 Escala | 09 | Três cenários sem benchmark fictício. |
| 35 Privacidade | 06 | Inventário técnico; sem parecer jurídico. |
| 36 UX | 08 | Catálogo/sala/autoria/admin/certificado, inspeção estática/histórica. |
| 37 Manutenibilidade | 08 | Camadas, CSS, frontend, duplicação e configuração. |
| 38 Maturidade | 09 | Apenas categorias solicitadas, justificadas. |
| 39 Features | 00 | Estado por capacidade e evidência. |
| 40 Documentos | README | Todos os 12 arquivos técnicos pedidos e resumo executivo. |
| 41 Executivo | EXECUTIVE_SUMMARY | Texto de apresentação de aproximadamente 2–4 páginas, conforme diagramação. |
| 42 Diagramas | 03, 04, 06 e 07 | Mermaid validado por parser; contagem em validation.json. |
| 43 Evidências | Links/caminhos e evidence/ | Referências de fonte, teste, schema e configuração. |
| 44 Segredos | README e validação documental | Nenhum valor de .env, senha, token, cookie ou conexão publicado. |
| 45 Preservação | Manifesto e verificação final | Goals posteriores alteraram código de forma rastreada; mudanças locais anteriores e segredos foram preservados. |
| 46 Qualidade do levantamento | Catálogos cruzados, D-01…D-28 | Rotas, models, controllers, services, frontend, testes, SQL, Compose e runbooks examinados. |
| 47 Validação | 08 e validation.json | lint/build/Jest, esquema consultado, git diff --check; sem stability repetido. |
| 48 Entrega final | README e resposta final | Resumo dos 18 pontos e marcador de conclusão documental. |

## Evidência insuficiente ou não obtida

- Firewall e conta Azure não foram reauditados integralmente. VM, HTTPS, revisão implantada e containers app/Caddy/MySQL foram observados no staging em 16/09 UTC durante o Goal 09.
- Existência de produção institucional independente do staging: não comprovada. Não declarar inexistência absoluta a partir de ausência de acesso.
- Banco persistente de desenvolvimento não foi acessado. MySQL Docker descartável 8.4.11 em `127.0.0.1:33307` validou o Goal 11A. Em staging, somente o ledger técnico foi criado e a migration 012 idempotente foi registrada/aplicada após backup e baseline explícito; a comparação pós-operação confirmou dados de domínio e storages inalterados.
- Entrega real de e-mail, configuração de Resend e operação real do motor/corpus externo.
- SLA, benchmark de capacidade, alertas centralizados, PITR e DR multirregional. Uptime/memória/HTTP/pool/disco/RPO e check machine-readable estão cobertos no Goal 11B; RPO/RTO, agendamento, cópia offsite e ensaio integral permanecem autoridade do Goal 08.
- Acessibilidade integral, leitor de tela, desempenho de browser e regressão de pixels nesta execução.
- CVEs/estado de suporte das versões, conta cloud, permissões efetivas de operadores e conformidade jurídica.

Essas incertezas delimitam o conhecimento do sistema observado. Não foram preenchidas com intenção de README nem com valores supostos.

## Implementação posterior — Goal 11A (17/09/2026)

| Achado | Implementação | Verificação |
| --- | --- | --- |
| D-23 RESOLVIDO | Ledger SHA-256, sequência sem gaps, lock MySQL, baseline 001–011 e forward-only | Fresh 001–012, baseline+012+NO-OP, checksum drift, falha sem ledger, dois runners concorrentes em 33307 e rollout staging validado |
| D-28 RESOLVIDO | `schema-contract.json` compara estrutura integral e fornece saída humana/JSON | 21 tabelas, 173 colunas, 74 índices, 35 FKs, 12 CHECKs e 94 constraints; drift de tipo/índice/FK detectado |
| CI/deploy | CI migra banco vazio e valida; deploy executa status antes de backup/DDL e valida ao final | Workflow/script versionados; staging: backup GOOD, baseline, NO-OP, schema/restore/health OK em 17/09/2026 |

[Política e operação de migrations](history/DATABASE_MIGRATIONS.md).

## Implementação posterior — Goal 02 (08/09/2026)

| Achado/regras | Implementação | Verificação |
| --- | --- | --- |
| D-03 RESOLVIDO; RN-021/RN-023; RF-026/RF-027 | `academic-progress.service.js`, `matricula.models.js`, `conteudos.models.js`, rótulo em `professor-turma.js` | `academic-progress.test.js`, `matricula.model.test.js`, `integration/matriculas.integration.test.js`: 200/201, papéis, nota, contagens e isolamento |
| D-13 PARCIAL; RN-035; RF-035 | `certificate.service.js`: nova emissão revalida contagens sob transação antes dos efeitos | `certificate.service.test.js`, `integration/certificados.integration.test.js`: pendências, concorrência, ENCERRADA e documento existente |
| Aceite operacional | `scripts/smoke_academic_completion_staging.js` | Casos A–D com limpeza do cenário isolado; evidências em [entrega](goals/GOAL_02_ACADEMIC_COMPLETION_INTEGRITY.md) |

D-13 permanece parcial porque a política de estrutura após emissão/reemissão pertence ao Goal 03; os gates de nova emissão estão implementados. D-04/D-05 foram resolvidos posteriormente no Goal 04; D-08 permanece fora do escopo.


## Goal 02 substitutivo — ACADEMIC_PROGRESS_EXAM_AND_APPROVAL_INTEGRITY

| Requisito | Fonte | Verificação |
| --- | --- | --- |
| Designação final única, sem inferência | migration 008, schema, questoes.models/routes, formulário docente, replicação | migration upgrade/idempotência e testes de designação/replicação |
| 80% dos conteúdos; EXERCICIO/Simulado opcional | academic-progress.service; leitura/submissão questoes.models | academic-progress.test; academic-exam.integration |
| 75%, tentativa final única e idempotência | Q_Tentativas, correção em centésimos, locks turma/matrícula | 74,99/75, retry UUID igual, novo UUID recusado, concorrência com uma tentativa final |
| Aprovação automática sem nota | avaliarAprovacao após progresso/submissão final | duas ordens, concorrência, sem certificado automático |
| D-03 RESOLVIDO / D-13 PARCIAL histórico | conclusão exata e certificado com todos os requisitos | 200/201, ausência de prova, sem PDF/linha em falhas |
| Interface e staging A–F | sala-aula, questionario, professor-turma; smoke_academic_completion_staging.js | [entrega](goals/GOAL_02_ACADEMIC_EXAM_APPROVAL.md) |

Esta consolidação substitui a política manual documentada anteriormente; D-13 permanece parcial exclusivamente pela política dos documentos já emitidos, reservada ao Goal 03.

### Goal 03 — D-14 resolvido

| Requisito/invariante | Implementação | Evidência |
|---|---|---|
| RF-035/RN-035: inicial v1 e histórico revogado explícito | emitirCertificado, lock de contexto | serviço e integração certificados |
| RF-037/RN-038: reemissão ADMIN com motivo | POST :id/reemitir, reemitirCertificado | autorização/contrato/academia/conflito |
| RN-036: identidade imutável por versão | snapshot_json, novo PDF/QR/código/UUID/SHA | bytes reais e comparação de snapshots |
| D-14: versões, único ATIVO e lineage | migration 009; três índices UNIQUE; coluna gerada | migration preserva legados; INSERT direto proibido; concorrência |
| RF-036/RN-037: acesso histórico | GET :id/historico, /meus, /pdf; interfaces turma/aluno | ownership, ordem, downloads e frontend |
| RF-038/039/RN-039: validação por documento | lookup por código/SHA | v1 REVOGADO, v2 VALIDO/AUTENTICO, alterados NAO_VALIDADO |
| Atomicidade SQL e compensação | preparar PDF; revogar+INSERT+COMMIT; rollback | falhas PDF/storage/SQL/código e resposta COMMIT perdida |
| Staging e persistência | smoke_certificate_versioning_staging.js | [registro do Goal 03](goals/GOAL_03_CERTIFICATE_VERSIONING.md) |

### Goal 04 — D-04/D-05 resolvidos

| Requisito/invariante | Implementação | Evidência |
|---|---|---|
| CANCELADO só sai por rematrícula própria em ABERTA | guarda em `atualizarMatricula`; fluxo `matricularAluno` | PATCH professor/ADMIN 409; FECHADA/ENCERRADA 403 |
| Ciclo 1 e incremento monotônico | `Matriculas.ciclo_atual`; lock turma→matrícula | ciclos 1→2→3 e concorrência 200/409 |
| Tentativa pertence ao ciclo bloqueado | `Q_Tentativas.ciclo_matricula`; idempotência por ciclo | mesma submission_id cria tentativa nova em ciclo novo |
| Estado atual isolado | `academic-progress.service` filtra conteúdos/exercícios pelo ciclo; Teste Final usa aluno+turma | conteúdos/exercícios reiniciam; Teste Final conserva tentativa única e resultado >=75 entre ciclos |
| Histórico preservado | histórico/resultados retornam ciclo sem filtro | tentativas/respostas antigas idênticas e consultáveis |
| Legados | migration 010 reaplicável e backfill conservador | órfão rejeitado; ciclo 1 normal; data reiniciada separa anterior/atual |
| Certificados | proteção de ATIVO e elegibilidade atual preservadas | suíte de certificados e nenhuma mutação pela rematrícula |
| Staging | `smoke_enrollment_lifecycle_staging.js` | [registro do Goal 04](goals/GOAL_04_ENROLLMENT_LIFECYCLE.md) |


## Atualização — Goal 06

D-08 → helper de autorização transacional + controllers/modelos de autoria + PATCH de turma/matrícula → `academic-access.test.js` e `atomic-academic-authorization.integration.test.js` → smoke funcional de troca/encerramento/reabertura. Regressões preservam conclusão, 80%/75%, ciclos e certificados dos Goals 02–04; invariantes de histórico/coerência do Goal 05 recebem cobertura explícita.

Contrato, inventário e evidências: [GOAL_06_ATOMIC_ACADEMIC_AUTHORIZATION.md](goals/GOAL_06_ATOMIC_ACADEMIC_AUTHORIZATION.md).

## Storage e reconciliação — Goal 07

RF-022 e RNF de integridade/storage: private-storage.service.js, storage-reconciliation.service.js, private-download.service.js, migration 011 e testes private-storage.service.test.js, private-download.service.test.js e integration/storage-integrity.integration.test.js. [Contrato, inventário e evidências](goals/GOAL_07_STORAGE_DATABASE_INTEGRITY.md).
