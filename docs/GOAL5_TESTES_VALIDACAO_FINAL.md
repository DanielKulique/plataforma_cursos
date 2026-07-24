# Goal 5 — Testes, cobertura e validação final

Data da validação automatizada: 22/07/2026.

## Estado do gate

O gate automatizado foi atendido, inclusive com 50 verificações em uma sessão
real do Firefox 152 por WebDriver BiDi e inspeção visual das telas pública
desktop e móvel. O gate integral permanece **pendente de confirmação humana**
para operações mutáveis que não foram acionadas no banco de desenvolvimento,
como criar/editar/excluir registros pelo painel, alterar senha e submeter nova
tentativa de questionário. O aplicativo está disponível em
`http://localhost:3000` para essa auditoria complementar.

Não foram executados commit, push, merge, checkout ou reescrita de histórico.
Nenhuma escrita foi realizada no banco legado `site_cursos`. O banco de teste
foi o único recriado automaticamente.

## Linha de base

Antes das correções deste Goal:

- `npm test`: 23 suítes e 232 testes aprovados;
- cobertura: 75,94% statements, 63,54% branches, 79,90% functions e 77,85% lines;
- `npm run test:integration`: 6 suítes e 70 testes aprovados;
- sintaxe JavaScript, JSON e YAML: válida;
- `git diff --check`: aprovado;
- lint: não há script de lint configurado;
- o worktree já continha alterações não commitadas dos Goals anteriores, que
  foram preservadas.

Os gates documentados dos Goals 1 a 4 estavam aprovados. A configuração local
de desenvolvimento apontava para `plataforma_cursos_dev`, a de testes para
`plataforma_cursos_test`, e o fingerprint inicial de `site_cursos` era
`94ed0f1425b1ed29987ec3cabbebff98fc6735c0dd3012ba6bccb25c58ac863c`.

## Auditoria dos testes existentes

- **Unitários e mocks:** controllers, models, middlewares, logger, serviço de
  e-mail e detector de plágio. Os mocks continuam úteis para erros locais e
  contratos de chamada; regras de persistência foram cobertas também por banco
  real.
- **Integração com MySQL real:** autenticação, matrícula, cursos/turmas, fluxos
  de aluno/professor e CRUD administrativo. A integração do detector mantém o
  serviço externo simulado, mas usa aplicação e autorização reais.
- **Frontend:** testes de sessão, interface administrativa, política do cliente
  HTTP e harness de DOM para segurança. São testes comportamentais sem navegador
  completo.
- **Segurança:** CSP, XSS, URLs, redaction, limites HTTP, autorização, cadastro
  público e proteção dos bancos.
- **Contrato:** schema canônico, seed inicial e validações de ambiente/banco.
- **Smoke de API:** executado contra a aplicação de desenvolvimento em
  `localhost:3000`, sem depender de porta adicional.

Os testes antigos parcialmente sobrepostos foram mantidos e tiveram asserções
estreitadas. Foram eliminadas expectativas HTTP amplas, dependência da rota de
autenticação antiga, servidores em porta fixa e fechamentos de servidor que não
era aberto. As integrações usam diretamente `request(app)`, limpam seu estado e
fecham pools. A suíte foi repetida sem duplicações nem handles abertos.

Pontos frágeis remanescentes: parte dos testes de interface valida contratos
estáticos de fonte/DOM; por isso não substitui a auditoria humana. Os módulos de
menor cobertura são `analise.model.js`, `plagio.controller.js`,
`matricula.models.js` e `env.js`; os fluxos principais de matrícula e regras de
ambiente têm cobertura complementar de integração/contrato. O detector de
plágio permanece em desenvolvimento. Nenhum arquivo de aplicação ficou com
zero statements medidos como justificativa para o gate global.

## Falhas encontradas e correções

1. O cliente HTTP repetia mutações e respostas 4xx e reutilizava o mesmo
   `AbortController`. Agora somente `GET` pode repetir falhas transitórias; cada
   tentativa possui controller e timeout próprios, e 400/401/403/404/409 não
   são repetidos.
2. A resposta de envio de verificação podia expor o código em modo de debug. O
   código foi removido da resposta.
3. Testes antigos aceitavam resultados contraditórios, usavam rota incorreta ou
   porta fixa. As expectativas e o ciclo de vida foram corrigidos.
4. O workflow de CI aplicava schema divergente e pulava o gate de cobertura. O
   pipeline agora usa setup/seed canônicos e executa segurança e `test:all`.
5. A senha do seed de teste era fixa. Ela agora é recebida por
   `TEST_SEED_PASSWORD`; exemplos e CI não contêm um valor real.
6. O catálogo filtrado produzia 74 px de rolagem horizontal em uma viewport de
   390 px. As grades agora podem encolher com `minmax(0, 1fr)`, cards e itens
   flex têm largura mínima segura, e a regressão ganhou teste permanente.

## Arquivos alterados neste Goal

- `.env.test` (local e ignorado pelo Git, sem valores documentados);
- `.env.test.example`;
- `.github/workflows/ci.yml`;
- `README.md`;
- `docs/TESTES_INTEGRACAO.md`;
- `docs/GOAL5_TESTES_VALIDACAO_FINAL.md`;
- `package.json`;
- `scripts/seed_database.js`;
- `src/api/controllers/auth.controller.js`;
- `src/public/css/style.css`;
- `src/public/js/api.js`;
- `src/__tests__/api.frontend.test.js`;
- `src/__tests__/auth.model.test.js`;
- `src/__tests__/auth.controller.test.js`;
- `src/__tests__/cursos.controller.test.js`;
- `src/__tests__/turmas.controller.test.js`;
- `src/__tests__/usuarios.controller.test.js`;
- `src/__tests__/frontend.security.test.js`;
- `src/__tests__/session.frontend.test.js`;
- `src/__tests__/integration/setup.js`;
- `src/__tests__/integration/auth.integration.test.js`;
- `src/__tests__/integration/cursos-turmas.integration.test.js`;
- `src/__tests__/integration/matriculas.integration.test.js`;
- `src/__tests__/integration/goal3-fluxos.integration.test.js`;
- `src/__tests__/integration/goal4-admin.integration.test.js`;
- `src/__tests__/integration/plagio.test.js`.

## Resultado final automatizado

- `npm run db:test:setup`: aprovado; 14 tabelas canônicas verificadas em
  `plataforma_cursos_test`;
- `npm run db:test:seed`, executado duas vezes: aprovado e idempotente;
- `npm test`: 25 suítes, 253 testes, código 0;
- cobertura: 79,86% statements, 67,98% branches, 83,10% functions e 82,12%
  lines;
- `npm run test:security`: 6 suítes, 56 testes, código 0;
- `npm run test:integration`: 6 suítes, 84 testes, código 0;
- `npm run test:all`: unitários/cobertura e integrações aprovados, código 0;
- sintaxe JavaScript, JSON e YAML: válida;
- `git diff --check`: aprovado;
- lint: não executável porque o projeto não possui script de lint.

Os logs de erro vistos durante as suítes correspondem a cenários negativos
deliberados e validados pelos testes. Não houve handle, timer, conexão ou
servidor de teste aberto ao final.

## Smoke de API em desenvolvimento

Foram aprovadas 33 verificações contra `plataforma_cursos_dev`:

- visitante: páginas públicas, catálogo e bloqueio das rotas privadas/admin;
- ALUNO: login, sessão, sala virtual, proteção de matrícula duplicada,
  conteúdos, progresso, questionário, submissão, histórico e bloqueio das rotas
  de professor/admin;
- PROFESSOR: login, próprias turmas, alunos, progresso, nota, conteúdos,
  questionários, 404 de turma inexistente e bloqueio de admin;
- ADMIN: login, health, usuários sem senha/hash, cursos, turmas, conflitos,
  autoexclusão e proteção do último ADMIN;
- HTTP: CSP bloqueante presente e `X-Powered-By` ausente.

O smoke efetuou somente operações funcionais normais no banco de desenvolvimento:
registro de progresso/tentativa e atualização de nota. Não apagou dados, não
executou setup/seed e não criou ou excluiu recursos administrativos.

## Auditoria em Firefox

Uma instância isolada do Firefox 152.0.6 headless foi controlada pela interface
nativa WebDriver BiDi, sem instalar dependências e sem registrar credenciais.
As 50 verificações passaram, abrangendo:

- visitante, catálogo, filtro real, controles públicos e redirecionamento de
  página protegida;
- login real de ALUNO, PROFESSOR e ADMIN, além de senha incorreta;
- menu de avatar operado por Enter e Escape, com movimentação correta do foco;
- sala virtual, sala de aula, conteúdos, progresso após recarga,
  questionário e histórico;
- próprias turmas do professor, alunos, progresso, conteúdos, questionários e
  diálogo de nota cancelado sem mutação;
- painel administrativo, busca, estado vazio, abas, abertura/cancelamento de
  formulários, campos obrigatórios e ausência de hash no HTML;
- logout dos três papéis, ausência de violação CSP e ausência de erro de console
  originado pela aplicação;
- viewport móvel de 390 x 844 sem overflow depois da correção responsiva.

As capturas realizadas depois do término das animações foram inspecionadas em
1365 x 768 e 390 x 844. O catálogo, cabeçalho, hero, estado de visitante e cards
apresentaram leitura e encaixe coerentes nas duas larguras.

## Segurança, bancos e CI

Os testes confirmam CSP sem `unsafe-inline` em `script-src`, ausência de scripts
e handlers inline, renderização de payloads XSS como texto, allowlist de URLs,
redaction de credenciais e dados pessoais, limite de payload, cadastro público
somente como `ALUNO`, papel autoritativo consultado no banco e ausência de
senha/hash nas respostas. A varredura de arquivos não encontrou valores reais
dos segredos locais versionados.

O fingerprint final somente leitura de `site_cursos` permaneceu exatamente
`94ed0f1425b1ed29987ec3cabbebff98fc6735c0dd3012ba6bccb25c58ac863c`,
com as mesmas 7 tabelas e contagens: Conteudos 120, Cursos 5,
EmailVerificacoes 3, Matriculas 16, ProgressoAluno 0, Turmas 6 e Usuarios 9.

O workflow localmente validado usa MySQL descartável, `npm ci`, secrets do
GitHub, setup/seed canônicos e as suítes de segurança, integração e cobertura.
Ele nunca referencia `site_cursos`. Uma execução real no GitHub não foi feita,
pois interação remota e publicação estão fora do escopo.

## Checklist obrigatório no navegador

Executar em `http://localhost:3000` com contas locais previamente provisionadas.
`[x]` identifica evidência já obtida no Firefox real; `[ ]` continua pendente de
confirmação humana ou de uma operação mutável deliberada.

### Visitante

- [x] abrir catálogo público e usar o filtro de cursos;
- [x] confirmar ausência de avatar, notificações e controles privados;
- [x] confirmar ausência de aviso contraditório e bloqueio de páginas privadas.

### ALUNO

- [x] fazer login e abrir o menu do avatar;
- [ ] matricular-se e confirmar atualização imediata do catálogo;
- [x] abrir sala virtual, sala de aula e conteúdos;
- [x] recarregar e confirmar o progresso existente; concluir um novo conteúdo
  permanece pendente;
- [x] abrir questionário e conferir o histórico; submeter uma nova tentativa
  permanece pendente;
- [x] fazer logout e confirmar remoção da sessão visual.

### PROFESSOR

- [x] fazer login e ver somente as próprias turmas;
- [x] validar alunos e progresso; estado vazio em navegador permanece pendente;
- [ ] alterar uma nota e confirmar persistência após recarga;
- [x] abrir conteúdos e metadados dos questionários;
- [ ] confirmar bloqueio de turma alheia;
- [x] fazer logout.

### ADMIN

- [x] fazer login e testar listagem/busca de usuários;
- [ ] criar, editar e excluir um usuário sem vínculos;
- [ ] confirmar proteções do último ADMIN, autoexclusão e vínculos;
- [ ] trocar a própria senha, usando uma conta apropriada para esse teste;
- [ ] executar criação, edição e exclusão válidas de curso e turma;
- [ ] provocar conflitos e conferir mensagens adequadas;
- [x] abrir e cancelar os diálogos de usuário, senha, curso e turma, validando
  campos e estados sem gravar alterações;
- [x] fazer logout.

### Segurança e interface

- [x] manter o console aberto e confirmar ausência de violações CSP;
- [x] confirmar que página protegida sem sessão permanece oculta e redireciona;
- [ ] confirmar que payloads HTML/XSS persistidos aparecem somente como texto;
- [x] operar o menu do avatar por teclado;
- [x] verificar responsividade básica em larguras móvel e desktop;
- [ ] verificar que todos os botões visíveis possuem ação;
- [ ] observar estados de loading, vazio, sucesso e erro.

## Riscos e limitações conhecidos

- o JWT permanece em `localStorage`; migração futura para cookie `HttpOnly` está
  fora deste Goal;
- autoria de conteúdos/questionários continua fora do escopo;
- o detector de plágio permanece em desenvolvimento;
- não há lint configurado;
- a automação nativa e as capturas não substituem a percepção humana completa de
  acessibilidade, responsividade e interação;
- o gate integral somente poderá ser declarado atendido após o checklist manual
  ser executado e registrado.
