# Testes e integração

## Bancos e proteção

- `plataforma_cursos_dev`: runtime e testes manuais em `localhost:3000`. Nenhuma suíte automatizada limpa esse banco.
- `plataforma_cursos_test`: banco descartável exclusivo da integração. O setup pode recriar somente esse nome.
- `site_cursos`: legado somente para consulta/backup. Runtime, setup, seed e testes recusam esse alvo.

O arquivo `.env` local fornece a conexão MySQL e aponta o runtime para o banco de desenvolvimento. O `.env.test`, também ignorado pelo Git, deve definir ao menos:

```env
NODE_ENV=test
DB_NAME=plataforma_cursos_test
JWT_SECRET=<segredo_jwt_exclusivo_de_teste>
TEST_SEED_PASSWORD=<senha_descartavel_dos_usuarios_de_teste>
```

Não registre valores reais. Use `.env.example` e `.env.test.example` apenas como modelos. O runner valida `NODE_ENV` e o nome exato antes de abrir o pool ou executar limpeza.

## Preparação reproduzível

```bash
npm ci
npm run db:test:setup
npm run db:test:seed
npm run db:test:seed
```

O setup recria o banco descartável e aplica `mysql/schema.sql`. O segundo seed deve terminar sem duplicar os registros canônicos. O desenvolvimento só recebe setup/seed por comando explícito:

```bash
npm run db:dev:setup
CANONICAL_SEED_PASSWORD='<senha-local>' npm run db:dev:seed
```

O setup de desenvolvimento não apaga dados e apenas aceita um banco vazio ou já compatível com o contrato canônico.

## Comandos oficiais

```bash
npm run test:security
npm test
npm run test:integration
npm run test:all
```

- `npm test`: unitários, contratos, frontend e segurança, com cobertura e detecção de handles abertos.
- `npm run test:security`: subconjunto de regressões de sessão, CSP/XSS, redaction, autorização e proteção dos bancos.
- `npm run test:integration`: fluxos HTTP com MySQL real em `plataforma_cursos_test`.
- `npm run test:all`: `npm test` seguido da integração.

Os thresholds globais oficiais são superiores a 50% para statements, branches, functions e lines. A integração usa `supertest` diretamente sobre o app Express; não abre porta fixa.

## Mapa atual

| Categoria | Evidência principal |
|---|---|
| Sessão/autenticação | `auth.controller.test.js`, `auth.model.test.js`, `middlewares.test.js`, `session.frontend.test.js`, `auth.integration.test.js` |
| Cliente HTTP | `api.frontend.test.js` |
| Matrícula | `matricula.controller.test.js`, `matricula.model.test.js`, `matriculas.integration.test.js` |
| Aluno/professor | `goal3.models.test.js`, `goal3.routes.test.js`, `goal3-fluxos.integration.test.js` |
| Administração | `goal4.models.test.js`, `goal4.interface.test.js`, `goal4-admin.integration.test.js` |
| Segurança | `frontend.security.test.js`, `admin.routes.security.test.js`, `conteudos.routes.security.test.js`, `logger.test.js`, `test_database_safety.test.js` |
| Contrato | `schema_contract.test.js`, `seed_admin_inicial.test.js` |
| Serviço externo | `plagio.service.test.js`, `plagio.test.js` (serviço externo simulado) |

Os testes unitários isolam dependências com mocks quando o objetivo é controller/model. Os fluxos de integração validam persistência, transações, chaves e autorização no MySQL real descartável. O motor externo do detector de plágio permanece simulado na integração Node e ainda está em desenvolvimento.

## Seed de integração

O helper de integração cria um usuário de cada papel e lê a senha descartável de `TEST_SEED_PASSWORD`. Os testes acessam essa variável por helper e nunca imprimem seu valor. Cada cenário limpa e recria os dados necessários, fecha pools no teardown e captura IDs retornados pelo banco.

Exemplo:

```javascript
const request = require('supertest');
const { app } = require('../../../index');
const { getTestPassword } = require('./setup');

const response = await request(app)
    .post('/api/auth/login')
    .send({ email: 'usuario-descartavel@example.test', senha: getTestPassword() });
```

## CI

O workflow `.github/workflows/ci.yml` usa `npm ci`, verifica sintaxe, recria o banco descartável com a credencial administrativa efêmera do serviço MySQL, aplica o seed com o usuário da aplicação e executa segurança e `test:all`. Configure no GitHub:

- `CI_MYSQL_ROOT_PASSWORD`;
- `CI_DB_PASSWORD`;
- `CI_JWT_SECRET`;
- `CI_TEST_SEED_PASSWORD`.

Nenhum valor deve ser colocado no YAML. O pipeline não referencia nem acessa `site_cursos`.

## Limitações conhecidas

- A autoria de conteúdos e questionários continua fora do escopo; as telas atuais são de consulta/acompanhamento.
- O JWT ainda fica em `localStorage`; migrar para cookie `HttpOnly`, `Secure` e `SameSite`, com CSRF, é trabalho futuro.
- O detector de plágio depende de um motor externo ainda em desenvolvimento.
- Interação visual, teclado, responsividade e console CSP exigem validação humana quando não houver driver de navegador automatizável.
