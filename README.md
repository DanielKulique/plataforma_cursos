# Plataforma de Cursos (API + Frontend)

Projeto Node.js com Express e MySQL para gestão de cursos, turmas, matrículas e usuários, com autenticação JWT e páginas estáticas em `src/public`.

## Stack

- Node.js
- Express
- MySQL (`mysql2`)
- JWT (`jsonwebtoken`)
- Validações (`express-validator`)
- Hash de senha (`bcrypt`)

## Estrutura principal

```text
plataforma_cursos/
├─ index.js
├─ src/
│  ├─ api/
│  │  ├─ controllers/
│  │  ├─ models/
│  │  └─ routes/
│  ├─ config/
│  ├─ middlewares/
│  └─ public/
├─ mysql/
└─ docs/
```

## Pré-requisitos

- Node.js 18+
- MySQL 8+

## Configuração

1. Instale dependências:

```bash
npm ci
```

2. Copie `.env.example` para `.env` e substitua todos os placeholders. Arquivos `.env` reais não devem ser versionados:

```bash
cp .env.example .env
```

3. Prepare explicitamente o banco local canônico:

```bash
npm run db:dev:setup
CANONICAL_SEED_PASSWORD='<senha-das-contas-mock>' npm run db:dev:seed
```

O runtime não cria nem altera tabelas. Consulte `docs/GOAL2_BANCO_MATRICULA.md` para o contrato e as proteções.

## Executar o projeto

```bash
node index.js
```

Servidor disponível em:

- `http://localhost:3000`

Rota de status da aplicação e conexão com banco (protegida para ADMIN):

- `GET /api/health`

## Rotas principais da API

- `/api/auth`
- `/api/usuarios`
- `/api/cursos`
- `/api/turmas`
- `/api/matriculas`
- `/api/plagio`
- `/api/turmas/:id_turma/questionarios`
- `/api/turmas/:id_turma/conteudos`

> Algumas rotas exigem autenticação e permissões por papel (middlewares em `src/middlewares`).

## Observações

- Frontend estático em `src/public`.
- Scripts SQL e modelagem estão na pasta `mysql/`.
- Documentação complementar de backlog em `docs/BACKLOG_FRONTEND_EXECUTAVEL.md`.

## Banco, seeds e testes

O desenvolvimento usa exclusivamente `plataforma_cursos_dev`; `site_cursos` é legado somente leitura. Para integração, use exclusivamente `plataforma_cursos_test`:

```bash
cp .env.test.example .env.test
npm run db:test:setup
npm run db:test:seed
npm run test:security
npm run test:integration
```

Defina `TEST_SEED_PASSWORD` somente no ambiente local ignorado pelo Git ou no cofre de secrets da CI. `npm test` roda unitários, contratos, frontend e segurança com cobertura; `npm run test:all` acrescenta a integração. Nunca aponte `.env.test` para um banco com dados reais.

Os scripts validam os nomes exatos. Não há alias nem variável de exceção para contornar a proteção. O setup de teste pode recriar somente `plataforma_cursos_test`; o setup de desenvolvimento nunca limpa um banco preenchido.

### Primeiro administrador

O cadastro público cria exclusivamente usuários `ALUNO`. Para inicializar uma instalação, preencha no ambiente `INITIAL_ADMIN_NOME`, `INITIAL_ADMIN_CPF`, `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_TELEFONE` e `INITIAL_ADMIN_PASSWORD`, além das variáveis do banco, e execute:

```bash
npm run admin:bootstrap
```

O comando não possui credenciais padrão, não imprime senha, usa transação e encerra sem duplicar um administrador existente. A criação deliberada de um administrador adicional deve passar por revisão operacional e exige `INITIAL_ADMIN_ALLOW_ADDITIONAL=I_UNDERSTAND_CREATE_ANOTHER_ADMIN`.

## Motor de similaridade

```bash
cd ../motor_ia
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000
```

Configure `IA_ANALISE_URL=http://127.0.0.1:8000/api/analisar`. A API Node envia `texto_original` e `texto_suspeito`, aplica timeout e devolve 503 quando o motor está indisponível.

## Segurança e produção

O startup exige banco e `JWT_SECRET`. Helmet com CSP, limite JSON, CORS configurável, 404 de API e rate limiting de autenticação estão ativos. Use `CSP_REPORT_ONLY=true` apenas temporariamente para diagnosticar violações legítimas; o padrão é bloqueante.

O frontend ainda guarda JWT em `localStorage`; isso preserva compatibilidade nesta versão. A migração para cookie `HttpOnly`, `Secure` e `SameSite`, acompanhada de proteção CSRF, permanece uma pendência técnica separada.

Quando o envio de e-mail estiver desabilitado em desenvolvimento, a API informa que a mensagem não foi enviada, mas nunca devolve o código de verificação. Autoria de conteúdos/questionários permanece fora do escopo atual, e o detector de plágio depende de um motor externo ainda em desenvolvimento.

### Rotação obrigatória de segredos

Como `.env.test` já esteve no histórico Git, rotacione manualmente `JWT_SECRET`, a senha do banco e qualquer outro valor que tenha sido armazenado no arquivo. Remover o arquivo do índice atual não apaga versões antigas do histórico. A reescrita do histórico não é executada automaticamente e exige coordenação com todos os clones e ambientes.
