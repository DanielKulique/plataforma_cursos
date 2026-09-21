> **Histórico.** Consulte a [documentação vigente](../../index.md).

# Plataforma de Cursos (API + Frontend)

MVP Node.js com Express e MySQL para gestão de cursos, turmas, matrículas e usuários. A sessão web usa JWT em cookie `HttpOnly`, proteção CSRF e páginas estáticas em `src/public`.

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

- Node.js 20
- Docker com Compose (o MySQL 8.4 é exclusivo da plataforma e roda em container)

## Configuração

1. Instale dependências:

```bash
npm ci
```

2. Copie `.env.example` para `.env` e substitua todos os placeholders. Arquivos `.env` reais não devem ser versionados:

```bash
cp .env.example .env
```

3. Suba somente o MySQL dedicado e prepare o banco local canônico:

```bash
docker compose --env-file .env -f compose.yaml -f compose.local-db.yaml up -d db
npm run db:dev:setup
CANONICAL_SEED_PASSWORD='<senha-das-contas-mock>' npm run db:dev:seed
```

O Node executado no host usa somente `127.0.0.1:33307`; dentro do Compose, a aplicação usa `db:3306`. O runtime não cria nem altera tabelas. Consulte [ARQUITETURA_BANCO.md](ARQUITETURA_BANCO.md) para operação, identidade persistente, backup/restore e proteções.

Para um banco de desenvolvimento já existente, aplique a migration idempotente e valide o contrato:

```bash
npm run db:migrate
npm run db:schema:verify
```

## Executar o projeto

```bash
npm start
```

Servidor disponível em:

- `http://localhost:3000`

Rotas operacionais:

- `GET /healthz`: liveness público mínimo;
- `GET /readyz`: readiness público mínimo (DB + storages essenciais);
- `GET /api/health`: diagnóstico resumido protegido para ADMIN;
- `GET /api/admin/metrics`: métricas operacionais protegidas para ADMIN.

Node, Docker, Compose e Caddy compartilham `APP_PORT` (default 3000). O healthcheck do container usa `GET /readyz`. Consulte [RUNTIME_OPERATIONS.md](RUNTIME_OPERATIONS.md) para precedência das envs, pool, métricas, request-id, disco e backup/RPO.

## Rotas principais da API

- `/api/auth`
- `/api/usuarios`
- `/api/cursos`
- `/api/turmas`
- `/api/matriculas`
- `/api/plagio`
- `/api/capabilities`
- `/api/turmas/:id_turma/questionarios`
- `/api/turmas/:id_turma/conteudos`

> Algumas rotas exigem autenticação e permissões por papel (middlewares em `src/middlewares`).

## Observações

- Frontend estático em `src/public`.
- Scripts SQL e modelagem estão na pasta `mysql/`.
- Documentação complementar de backlog em `docs/engineering/history/BACKLOG_FRONTEND_EXECUTAVEL.md`.
- Regras, permissões e cobertura do fluxo acadêmico em `docs/engineering/history/AUDITORIA_FLUXO_ACADEMICO.md`.

## Banco, seeds e testes

O desenvolvimento usa exclusivamente `plataforma_cursos_dev`; o banco legado/MySQL nativo não integra mais a arquitetura. Para integração, use exclusivamente `plataforma_cursos_test` no mesmo container dedicado:

```bash
cp .env.test.example .env.test
npm run db:test:setup
npm run test:all
npm run test:stability
```

Defina `TEST_SEED_PASSWORD` somente no ambiente local ignorado pelo Git ou no cofre de secrets da CI. `npm test` roda unitários, contratos, frontend e segurança com cobertura; `npm run test:all` acrescenta lint, integração MySQL e validação dos artefatos de produção. `npm run test:stability` executa o conjunto completo duas vezes sem retry. Nunca aponte `.env.test` para um banco com dados reais.

Os scripts validam os nomes exatos. Não há alias nem variável de exceção para contornar a proteção. O setup de teste pode recriar somente `plataforma_cursos_test`; o setup de desenvolvimento nunca limpa um banco preenchido.

### Primeiro administrador

O cadastro público cria exclusivamente usuários `ALUNO`. Para inicializar uma instalação, preencha no ambiente `INITIAL_ADMIN_NOME`, `INITIAL_ADMIN_CPF`, `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_TELEFONE` e `INITIAL_ADMIN_PASSWORD`, além das variáveis do banco, e execute:

```bash
npm run admin:bootstrap
```

O comando não possui credenciais padrão, não imprime senha, usa transação e encerra sem duplicar um administrador existente. Em produção também exige `ALLOW_PRODUCTION_ADMIN_BOOTSTRAP=I_UNDERSTAND`. A criação deliberada de um administrador adicional deve passar por revisão operacional e exige `INITIAL_ADMIN_ALLOW_ADDITIONAL=I_UNDERSTAND_CREATE_ANOTHER_ADMIN`.

## Motor de similaridade

```bash
cd ../motor_ia
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000
```

O motor é opcional no MVP. Com `DETECTOR_ENABLED=false`, a plataforma sobe normalmente, informa a capacidade desabilitada em `/api/capabilities`, oculta o acesso na interface e devolve 503 controlado nas rotas do detector. Para habilitá-lo, configure as URLs e o token interno descritos em `.env.example`.

## Segurança e produção

O startup exige banco e `JWT_SECRET`; em produção também exige URL HTTPS da aplicação e configuração real do Resend. Helmet com CSP, limite JSON, CORS configurável, 404 de API e rate limiting de autenticação estão ativos. Use `CSP_REPORT_ONLY=true` apenas temporariamente para diagnosticar violações legítimas; o padrão é bloqueante.

O JWT não é exposto ao JavaScript: permanece apenas no cookie `HttpOnly`, `SameSite=Lax` e `Secure` em produção. Mutações autenticadas por cookie exigem `X-CSRF-Token`. Logout e troca de senha invalidam sessões anteriores. A recuperação usa resposta indistinguível por e-mail, token aleatório armazenado somente como hash, validade curta e uso único.

Quando o envio de e-mail estiver desabilitado em desenvolvimento, a API nunca devolve códigos ou tokens. O professor responsável administra módulos, conteúdos e questionários da própria turma pela área da turma; a API bloqueia professor alheio, aluno e qualquer mudança estrutural em turma encerrada.

## Produção

O pacote inclui imagem não-root em Node 20, MySQL 8.4 sem porta pública e Caddy com HTTPS automático. O procedimento completo está em [DEPLOY_VPS.md](DEPLOY_VPS.md); validação em [STAGING_CHECKLIST.md](STAGING_CHECKLIST.md); emissão e validação pública em [CERTIFICADOS.md](CERTIFICADOS.md); backup e restauração em [BACKUP_RESTORE.md](BACKUP_RESTORE.md); contrato e limites de segurança em [SECURITY_MVP.md](SECURITY_MVP.md).

## Detector contextual

A rota autenticada `POST /api/analises/contextual` integra a plataforma ao endpoint experimental
`POST /api/v1/detectar` do motor externo e permanece compatível. Os contratos atuais adicionam
`POST /api/analises/contextual/segmento` e `/documento`, encaminhados aos endpoints FastAPI 2.0.
O incremental possui timeout curto, cancelamento e não persiste versões; somente a ação completa
pode persistir resumo técnico. O navegador nunca acessa diretamente o FastAPI.

### Interface contextual

O verificador autenticado em `/verificador.html` é um editor que analisa o parágrafo alterado
depois de 900 ms de pausa. IDs e versões vivem somente na memória, requisições anteriores são
canceladas e respostas obsoletas são descartadas. Fonte manual, busca automática e modo híbrido
estão previstos; sem provider autorizado, a busca informa indisponibilidade e não simula
resultados. A análise completa permanece disponível por botão. Consulte
`docs/engineering/history/ROADMAP_DETECTOR_INCREMENTAL_FONTES.md` para arquitetura, contratos, privacidade e gates.

### Rotação obrigatória de segredos

Como `.env.test` já esteve no histórico Git, rotacione manualmente `JWT_SECRET`, a senha do banco e qualquer outro valor que tenha sido armazenado no arquivo. Remover o arquivo do índice atual não apaga versões antigas do histórico. A reescrita do histórico não é executada automaticamente e exige coordenação com todos os clones e ambientes.
