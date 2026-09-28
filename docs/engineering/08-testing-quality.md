> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../index.md).

# Testes, qualidade, UX e manutenibilidade

## Estratégia existente

- **Jest principal:** 64 arquivos/suítes, 648 casos expandidos na execução de 15/09/2026. Mistura unitários, rotas Supertest com dependências simuladas, contratos de infraestrutura e frontend estático/DOM simulado. Não chamar todos de unitários puros.
- **Integração:** 16 arquivos em `src/__tests__/integration`, 253 casos expandidos na execução de 15/09/2026. Usa MySQL real, fixtures por teste e execução sequencial; gates de banco descartável impedem manipular o banco legado ou um nome arbitrário.
- **Frontend:** testes de HTML/CSS, busca de sinks inseguros, helpers, VM/DOM simulado, dialogs, sessão, learning-path e fluxos de fetch. `visual.*.test.js` não equivale a comparação automatizada de pixels em browser.
- **Segurança:** rotas ADMIN, conteúdo privado, CSRF/cookies/reset, logger, URL/XSS e isolamento de IDs. Integrações exercitam autorização, arquivo inválido, rollback, idempotência e concorrência pontual.
- **Operação:** smoke externo de staging e certificados; scripts de persistência/learning-path/capturas; runbooks com verificações históricas. Não integram healthz automaticamente e podem gravar dados de demonstração.
- **Runtime/observabilidade (Goal 11B):** unitários cobrem config fail-closed, paginação, liveness/readiness, autorização de métricas, request-id, 5xx/duração/slow, memória, disco e RPO. Integrações em MySQL Docker 8.4/127.0.0.1:33307 cobrem pool 2/fila 1, recuperação após saturação, load smoke de 40 requests, conexões após transações e migration 013/fresh DB.
- **CI:** MySQL 8.4 efêmero, migration fresh 001→latest, status/checksum, validator estrutural e `test:all` uma vez; o Goal 11A reproduziu localmente o contrato em MySQL 8.4.11 oficial isolado em `127.0.0.1:33307`. Não há matriz de browser, carga, falha de disco ou DR automatizado.

## Comandos e resultados datados

| Gate | O que realmente faz | Evidência desta auditoria |
| --- | --- | --- |
| npm run lint | ESLint no projeto | Passou na árvore do Goal 09 em 15/09/2026. |
| npm run build | validate_production_assets: arquivos/configuração de produção | Passou em 15/09; não compila frontend nem executa docker build. |
| npm test | Jest com coverage, detectOpenHandles e runInBand | 64 suítes/648 testes passaram em 15/09; zero falhas/pending. |
| npm run test:integration | Jest separado, MySQL real, sem coleta de cobertura | 16 suítes/253 testes passaram em MySQL 8.4.11 descartável em 15/09. A recusa inicial por ausência de MySQL e por versão 8.0 comprovou os guardrails; o gate válido terminou verde. |
| npm run test:security | Subconjunto nomeado de oito arquivos | Casos contidos na suíte principal; comando separado não foi repetido. Não inclui sozinho todo teste novo de certificado/upload/MVP. |
| npm run test:all | lint → test → integration → build | Etapas executadas separadamente em 06/09; não alegar execução literal de test:all. |
| npm run test:stability | test:all duas vezes, sem retry | Não executado nesta auditoria documental, conforme autorização do pedido. |
| npm run test:migrations | Parser/checksum/contrato e cenários MySQL reais | Goal 11A: 13 testes unitários e 6 integrações passaram; cobre fresh DB, baseline, mismatch, ledger fora de ordem, lock concorrente, falha e drift. |
| docker build / Compose runtime | Construção/execução da stack | Não executado; consulta Docker em 06/09 teve acesso negado ao socket. |
| git diff --check | Whitespace no diff | Passou na árvore final do Goal 09; resultado documental em evidence/validation.json. |
| Mermaid parser e links | Sintaxe dos diagramas e integridade documental | Resultados finais em evidence/validation.json. |

O processo de 06/09 foi observado nesta sessão e seus totais constam nos retornos dos comandos; arquivos temporários desse dia não sobreviveram à retomada. Não foram recriados como se fossem logs originais. `evidence/test-summary.json` preserva o resumo da execução mais recente do Goal 11B. Não há log bruto com dados de fixtures/ambiente no repositório.

**Goal 11B (18/09/2026):** `npm run lint`, `npm run build`, `docker build`, `git diff --check` e os dois `npm audit --audit-level=high` passaram (zero vulnerabilidades). `npm test -- --silent`: 67 suítes/689 testes, cobertura 63,19% statements, 56,64% branches, 65,09% functions e 66,36% lines. `npm run test:integration -- --silent`: 19 suítes/262 testes no MySQL Docker 8.4.11 descartável em 127.0.0.1:33307. Migration 013 passou em banco fresh, checksum/ledger e NO-OP posterior; staging passou smoke de runtime e migração. [Evidência sanitizada de staging](evidence/goal11b-staging-validation.json). Esses resultados atuais não alteram o caráter histórico das linhas de 15/09 na tabela acima.

**Goal 12 (18/09/2026):** validação estrutural de upload e substituição exercitada com PDF válido (tabela ou stream XRef), header falso, truncado, offset XRef adulterado, criptografado e tamanho excessivo. Unitários direcionados: 5/5; integrações de PDF/certificado: 37/37; regressões de storage/autorização corrigidas: 57/57. Gates finais: `npm run lint`, `npm test -- --silent` (67 suítes/691 testes), `npm run test:integration -- --silent` (19 suítes/263 testes), `npm run build`, `docker build`, os dois `npm audit --audit-level=high` (zero vulnerabilidades) e `git diff --check` passaram. A primeira execução integral de integração revelou fixture PDF antiga e permissão ausente em `performance_schema.data_lock_waits` no MySQL descartável; ambas foram corrigidas e a repetição integral passou. MySQL local foi exclusivamente Docker 8.4 em `127.0.0.1:33307`, removido após os testes. Staging existente recebeu somente a nova imagem do app; smoke direcionado passou para upload válido, rejeição estrutural/XRef/tamanho/nome, downloads privados e validação pública por hash. [Evidência sanitizada de staging](evidence/goal12-staging-validation.json).

**Cobertura principal em 15/09 após o Goal 09:** statements 61,86%; branches 55,78%; functions 63,34%; lines 65,09%. O limiar global configurado é 50% em cada medida. `collectCoverageFrom` exclui frontend JS e integração; este percentual não representa cobertura total do produto nem do banco. Contagem de casos vem do Jest, pois it.each expande testes; contagem textual de it/test subestima casos.

Para atualizar as contagens, execute os comandos existentes em ambiente autorizado e leia o resumo Jest; para listar suítes sem executá-las, use `npx jest --listTests --runInBand` e a configuração de integração. Não rode setup/seed de banco de produção para obter evidência documental.

## Cobertura por domínio e lacunas

| Domínio | Evidência de testes | O que cobre melhor | Lacunas observadas |
| --- | --- | --- | --- |
| Auth/usuários | auth.*, usuarios.controller, identity-email-flow.routes, email.service, integration/auth, mvp-security, goal4-admin | Sessão, senha, papéis, reset, cadastro/verificação atômicos, fail-closed, contrato do provedor e limites reais | Integração nova aguarda MySQL; entrega real/timeout de rede requer staging com credencial; códigos persistem legíveis e limites são locais ao processo. |
| Cursos/turmas/matrículas | cursos/turmas/matricula.*, integration/cursos-turmas, matriculas, goal3-fluxos, enrollment-lifecycle | Estados, ownership, duplicidade, nota/progresso, ciclos e rematrícula concorrente | Corridas entre troca de responsável/estado e mutações fora do fluxo de rematrícula; percentual arredondado. |
| Conteúdo/PDF | conteudos.routes.security, material-upload.service, pdf-upload.frontend, integration/pdf-upload/professor-content-management | Autorização, nomes/MIME/bytes/tamanho, rollback e compartilhamento imutável | Crash entre arquivo/SQL, antivírus, reconciliação geral de materiais. |
| Avaliações | goal3.models/routes, questionario.frontend, integration/goal3-fluxos | Integridade de respostas, correção, idempotência, histórico e opções | Adicionar pergunta depois de tentativas; payload divergente com mesmo UUID; UX de editar gabarito existente. |
| Replicação | turma-replication.frontend e integração dedicada | Cópia estrutural, novos IDs, exclusão de histórico, retry concorrente, rollback | Cópias de grande volume/carga e edição concorrente da estrutura em todos os caminhos. |
| Certificados | certificate.service/pdf/storage/rate-limit/infrastructure, certificates.frontend e integração | Unicidade, concorrência, hash, acesso, revogação e upload de validação | DR real e volumes grandes. Goal 03 cobre reemissão, legado ausente/corrompido, concorrência e compensação. |
| Detector | services/validation/routes e integrações dedicadas | Contratos e mapeamento de falhas com motor simulado | Motor/corpus real não homologado por esses mocks; não prova qualidade da inferência. |
| UI | visual.*, institutional, learning-path, session, admin.dialog | Estrutura, helpers, ausência de sinks em áreas críticas, estados | Browser real, leitor de tela, desempenho, contraste calculado e regressão de pixels contínua. |
| Operação | migration-runner, schema_contract, test_database_safety, env, certificate.infrastructure, backup-core e storage integration | Ledger/checksum/lock/baseline, 21 tabelas, 173 colunas, 78 índices e 94 constraints; manifesto/hash/latest/retention/RPO, readiness e métricas mínimas | Alertas centralizados externos, PITR e atualização compatível. |

`integration/setup.js` limpa tabelas com FK checks temporariamente desabilitados, usa seed e restaura os checks; isso exige cuidado com falhas de limpeza, que em alguns casos são registradas como aviso. Não é estratégia de migração ou saneamento de dados operacionais. Seeds contêm dados fictícios e não são evidência de funcionalidades disponíveis para usuário final.

No staging, o Goal 11A acrescentou evidência operacional sem fixture destrutiva: preflight antes do baseline, 001–012 com checksums OK, NO-OP posterior, validator integral, comparação do banco/storage com backup GOOD e health HTTPS. [Resultado sanitizado](evidence/goal11a-staging-validation.json).

## Atributos de qualidade, sem notas arbitrárias

| Atributo | Pontos fortes e evidências | Limitações/riscos | Melhoria futura proporcional |
| --- | --- | --- | --- |
| Adequação funcional | Formação completa por turma, objetivos, progresso, avaliação e certificado; RF e integrações | Autoria de perguntas existentes parcial; e-mail condicional; reemissão ADMIN implementada no Goal 03 | Completar autoria e estabilizar ciclo de identidade/certificado. |
| Confiabilidade | InnoDB, transações, UNIQUE, rollback, testes concorrentes e restore offsite ensaiado | SQL/arquivos não são ACID distribuído; host único e offsite na mesma região | Repetir drill/medição e evoluir PITR/região somente conforme requisito. |
| Eficiência | Pool/fila limitados, paginação direcionada, índices, assets estáticos e compressão Caddy | Subconsultas de progresso e PDF gerado com locks; UI administrativa ainda mostra somente a primeira página de até 100 itens | Medir consultas/latência e adicionar navegação de páginas conforme demanda. |
| Usabilidade | Aula como unidade, filtros, próxima aula, contexto, estados explícitos e falha local de certificados | Denominadores de progresso distintos; outros carregamentos multiparte ainda exigem classificação caso a caso | Explicar métricas e manter dados acessórios independentes dos críticos. |
| Segurança | Sessão HttpOnly/CSRF, ownership, CSP, arquivos privados, hashes | Verificação pública/limites, retorno legado bruto, ausência de MFA/AV | Resolver defeitos confirmados primeiro; adicionar controles conforme ameaça/escala. |
| Manutenibilidade | Domínios separados, suíte ampla, scripts e runbooks | Regras nos models/controllers, frontend extenso e duplicação | Consolidar regras com testes de contrato em futuro Goal, sem refatoração nesta análise. |
| Portabilidade | Docker/Compose, APP_PORT unificado e configuração por ambiente | Versões diferentes local/CI e disco local | Ensaiar reprodução em outro host com banco+arquivos e paridade de versões. |
| Compatibilidade | API same-origin, parse seguro de JSON/204/non-JSON e MySQL | Sem matriz formal de browsers/DB; envelopes históricos de sucesso e erro ainda coexistem | Migrar contratos gradualmente e testar navegação nos browsers prioritários. |

## UX e arquitetura da informação

Inspeção apoiada pela skill impeccable, fonte HTML/JS/CSS e capturas históricas de 05/09. Não foi realizado redesign. Não se atribui selo WCAG nem nota de usabilidade sem medir usuários ou navegador real.

| Área | Estrutura observada | Achado e impacto |
| --- | --- | --- |
| Catálogo | index.html e script.js, listagem de cursos/turmas | Oferta é pública; texto sobre “vagas” não corresponde a limite de capacidade no backend. |
| Sala virtual | Turmas e certificados carregados em paralelo com `Promise.allSettled` | Cada seção mantém loading/success/empty/error; falha de certificados preserva turmas e oferece “Tentar novamente”. |
| Sala de aula | Módulos apresentados como aulas, filtros/pesquisa e materiais complementares | Boa continuidade por contexto; resumo da aula inclui avaliações, percentual global não. Explicar denominações (P2). |
| Materiais | Texto seguro, vídeo incorporado, PDF privado com tratamento 404/503, link em nova aba e atividade textual | Atividade não tem entrega; abertura registra INICIADO antes de confirmar sucesso do recurso externo. Não equivale a comprovar leitura. |
| Avaliações | Página própria com contexto de aula, ID específico e envio por UUID | Teste Final libera a partir de 80% dos conteúdos e tem uma tentativa finalizada; nota >=75 aprova e emite certificado automaticamente, mesmo com conteúdo incompleto. Exercícios mantêm tentativas livres. |
| Professor | Alunos, nota, conteúdo e avaliações na mesma página | Adição de pergunta com duas opções existe, mas edição de perguntas/opções existentes não tem UX completa (P1 para autoria continuada). |
| Administração | UI gerada por admin.js para CRUD e replicação | Confirmações e erros ajudam; muitas responsabilidades em módulo de 1145 linhas dificultam manutenção. |
| Certificados | Área do aluno, ações de emissão/revogação na gestão e validador público | Distingue ativo/revogado e versões; ADMIN pode reemitir com confirmação, e PDFs históricos permanecem baixáveis. Texto deve explicar validação de registro versus bytes. |
| Institucional | HTML estático com assets e navegação | Sem CMS; alterações exigem entrega de código. Conteúdo institucional não demonstra integração acadêmica adicional. |

**Evidências positivas de acessibilidade:** skip links, landmarks, aria-live, aria-expanded/controls nas aulas, labels, progressbar e focus-visible; dialogs nativos e tratamento de foco. **Limitações:** CSS base aplica redução global de movimento com 0.01ms; preserva preferência de redução, mas não oferece alternativa específica por interação. Não foi medido se isso prejudica feedback (P2 para avaliação, não violação comprovada). A responsividade tem breakpoints e tabelas roláveis; nenhum novo problema de overflow/contraste foi afirmado sem medição.

O detector impeccable executado em 06/09 estava degradado por falta dos módulos de parser. Não calculou contraste/seletores; apontou apenas preferência estética pela fonte Fraunces. Esse aviso foi descartado como dívida técnica: popularidade de fonte não é defeito funcional. Não usar a ausência de achados dessa ferramenta como aprovação de acessibilidade. Capturas em `docs/screenshots/visao-aluno-conteudos-2026-09-05/` documentam sete estados desktop/mobile com dados fictícios; não provam todos os estados de erro nem o estado atual de produção.

## Manutenibilidade e pontos de acoplamento

1. `questoes.models.js` (~806 linhas) e `conteudos.models.js` (~644) misturam SQL, validação, regras históricas e transações. O service de replicação (~398) também contém SQL; não há padrão único de service/model.
2. Goal 02 centralizou conclusão exata e normalização em `academic-progress.service.js`, reutilizado por matrícula, conteúdos e certificado. O UPDATE em lote do cache percentual ainda usa SQL equivalente apenas para apresentação.
3. Gestão de permissões ocorre em middleware, controllers e service compartilhado; a verificação dentro da transação varia por operação. Isso é risco técnico verificável, não preferência estilística.
4. `professor-turma.js` (~958 linhas) e `admin.js` (~1145) concentram DOM, transporte, formulários e estado. Helpers acadêmicos/segurança/sessão reduzem duplicação, mas navegação/header ainda são repetidos em HTML multipágina.
5. CSS tem tokens, base, componentes, layouts, responsive e folhas específicas; convivência de camadas históricas exige cuidado na cascata. Não propor substituição de identidade visual por estética.
6. Scripts operacionais shell dependem de layout Compose, comandos Unix e extração textual de .env. Documentos de Goals antigos podem estar desatualizados; esta baseline referencia código e data em vez de “READY” histórico.

## Goal 02 inicial — histórico substituído pela consolidação abaixo (08/09/2026)

Regressões em `academic-progress.test.js`, `matricula.model.test.js`, `certificate.service.test.js`, `integration/matriculas.integration.test.js` e `integration/certificados.integration.test.js`: 0/0, 0/N, N/N, 200/201, limites visuais, rótulo, nota obrigatória sem mínimo, REPROVADO preservado, decisão manual, professor/ADMIN, identidade aluno/turma, cinco tipos de conteúdo e exclusão de provas/exercícios. Nova emissão bloqueada não chama gerador PDF, não cria arquivo nem Certificados. Testes reais cobrem adição pós-aprovação, restauração da elegibilidade, turma ENCERRADA, reutilização do documento existente e inclusão concorrente.

A conexão MySQL padrão recusou acesso antes dos testes (ECONNREFUSED). Validação local usa cópia dos mesmos fontes em `/tmp/goal02-validation`, MySQL 8.0.46 descartável em localhost:33307 e banco canônico `plataforma_cursos_test`; só a configuração local da conexão muda. Bancos de desenvolvimento e legado não são usados.

Resultados completos e smoke: [entrega do Goal 02](goals/GOAL_02_ACADEMIC_COMPLETION_INTEGRITY.md).


## Goal 02 substitutivo — progresso, prova e aprovação

As regras anteriores de aprovação manual e ausência de pré-requisito da prova foram substituídas. `academic-exam.integration.test.js` cobre leitura/submissão abaixo/acima de 80%, prova 74,99/75 real, EXISTS da melhor conquista, exercícios sem mínimo/duplicação, isolamento, provas intermediárias, ambas as ordens da aprovação, ausência de nota obrigatória, idempotência, concorrência e certificação completa em ENCERRADA. Fixtures antigas de aprovação/certificação agora incluem designação explícita e conquista da prova final.

`academic-progress.test.js` cobre 0/10, 7/10, 8/10, 9/10, 10/10, 3/4, 4/5, 80/101, 81/101, 0/0 e separação de conclusão 200/201. Migration 008 foi aplicada ao schema anterior e reaplicada para verificar idempotência. Evidências finais dos gates e smoke A–F em [entrega consolidada](goals/GOAL_02_ACADEMIC_EXAM_APPROVAL.md).

### Goal 03 — verificação de certificados versionados

`certificate.service.test.js`: autorização administrativa, motivo, histórico revogado, alvo obsoleto, requisitos acadêmicos, snapshot/lineage, preparação antes da revogação, rollback/compensação, colisão e COMMIT incerto. `integration/certificados.integration.test.js`: PDFs reais em MySQL 8, duas emissões e reemissões concorrentes, identidade própria, histórico ordenado, snapshot antigo preservado após mudança cadastral, códigos/uploads antigos e novos, adulteração, downloads/ownership, constraints fora da API, falhas PDF/storage/SQL e migration de legados ATIVO/REVOGADO reaplicada. `certificates.frontend.test.js`: ativo em destaque, agrupamento por ID da turma, histórico recolhido e links antigos, confirmação e motivo. [Gates e smoke](goals/GOAL_03_CERTIFICATE_VERSIONING.md).

### Goal 04 — integridade do ciclo de matrícula

`matricula.model.test.js` cobre incremento transacional e bloqueio de CANCELADO para CURSANDO/APROVADO/REPROVADO. `academic-progress.test.js` verifica o filtro por ciclo para conteúdos e exercícios. `integration/enrollment-lifecycle.integration.test.js`, em MySQL 8, cobre ciclos 1→2→3, rematrículas concorrentes (200/409), reset de conteúdo/nota, preservação de tentativas/respostas, idempotência por ciclo, turma FECHADA/ENCERRADA e migration 010 reaplicável. A regressão vigente também verifica que o Teste Final, sua tentativa única e a aprovação >=75 persistem por aluno+turma entre ciclos.


## Atualização — Goal 06

Testes específicos do helper e MySQL cobrem 18 mutações, troca de professor/encerramento nas duas ordens com cinco repetições, delete, tentativa/pergunta, curso/primeira estrutura e turmas independentes. A coordenação confirma espera real em `performance_schema.data_lock_waits`. Smoke de páginas abertas em desktop/mobile usa `scripts/smoke_atomic_authorization_staging.js`. Resultados finais e logs constam no relatório do Goal 06.

Contrato, inventário e evidências: [GOAL_06_ATOMIC_ACADEMIC_AUTHORIZATION.md](goals/GOAL_06_ATOMIC_ACADEMIC_AUTHORIZATION.md).

## Storage e reconciliação — Goal 07

O Goal 07 acrescenta testes reais de filesystem/MySQL com falhas de write/publicação/SQL/COMMIT/compensação, collector e concorrência; guarda logs em .deployments/storage-integrity. Resultados finais e limites constam no relatório específico. [Contrato, inventário e evidências](goals/GOAL_07_STORAGE_DATABASE_INTEGRITY.md).

## Backup e restore — Goal 08

`backup-core.test.js` cobre manifesto/parse/formato, SHA de dump/material/certificado, tamper,
completion/latest-good, retenção, RPO e barreiras de path/prefixo remoto. A integração de storage
ganhou o caso em que purge APPLY é recusado durante a trava global do backup; 19 casos passaram
em MySQL 8.4 descartável no staging. O aceite operacional criou backup real, fez upload privado,
baixou novamente, validou pacote, restaurou 19 tabelas e os dois volumes em stack isolada, conferiu
quatro certificados e sete materiais, executou reconciliador, health e login e mediu RTO de 50 s
na revalidação de 14/09/2026 (15/09 UTC).

## Resiliência frontend/API — Goal 09

`sala-virtual.resilience.test.js`, `api.frontend.test.js`, `private-pdf.frontend.test.js`,
`health.controller.test.js`, `http-response.test.js`, `certificates.frontend.test.js` e
`questionario.frontend.test.js` cobrem falha parcial, retry local, estados empty/error, 204,
não JSON, rede, 401/403/404/409/500/503, health seguro e mensagens acadêmicas vigentes. A
integração completa passou com 253 casos. O staging confirmou login, 5 turmas, 3 certificados,
health público/ADMIN, PDF privado real, assets implantados e containers saudáveis; falhas
destrutivas permaneceram simuladas nos testes. [Resultados e limites](goals/GOAL_09_FRONTEND_API_RESILIENCE.md).
