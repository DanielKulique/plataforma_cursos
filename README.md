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
npm install
```

2. Crie um arquivo `.env` na raiz do projeto (`plataforma_cursos/.env`) com variáveis como:

```env
PORT=3000
DB_HOST=localhost
DB_USER=seu_usuario
DB_PASSWORD=sua_senha
DB_NAME=site_cursos
JWT_SECRET=sua_chave_jwt
```

3. Crie/import o banco usando os arquivos da pasta `mysql/` (ex.: `schema.sql`).

## Executar o projeto

```bash
node index.js
```

Servidor disponível em:

- `http://localhost:3000`

Rota de teste de conexão com banco:

- `GET /teste-db`

## Rotas principais da API

- `/api/auth`
- `/api/usuarios`
- `/api/cursos`
- `/api/turmas`
- `/api/matriculas`

> Algumas rotas exigem autenticação e permissões por papel (middlewares em `src/middlewares`).

## Observações

- Frontend estático em `src/public`.
- Scripts SQL e modelagem estão na pasta `mysql/`.
- Documentação complementar de backlog em `docs/BACKLOG_FRONTEND_EXECUTAVEL.md`.
