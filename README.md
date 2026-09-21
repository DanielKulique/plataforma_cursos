# Plataforma de Cursos

Plataforma web para oferecer cursos, organizar turmas e acompanhar a aprendizagem.
Alunos estudam e respondem avaliações; professores gerenciam suas turmas; administradores
mantêm usuários, ofertas e certificados. O backend decide permissões, progresso e aprovação.

Inclui matrícula e rematrícula por ciclo, aulas com materiais privados, exercícios,
prova final, certificados em PDF com histórico e validação pública, além de backup e restore.
O detector de similaridade é uma integração opcional, desabilitada no desenvolvimento padrão.

## Tecnologias e estrutura

Node.js 20, Express 5, MySQL 8.4 em Docker, HTML/CSS/JavaScript sem framework,
Caddy para HTTPS, Jest/Supertest para testes, pdf-lib e QR Code para certificados.

```text
index.js            servidor e montagem da API
src/api/            rotas, controllers, models e serviços
src/public/         páginas, estilos, JavaScript e assets
src/config/         configuração e contratos de ambiente
mysql/              schema canônico, init e migrations
scripts/ e deploy/  operação, seeds, validação e systemd
compose*.yaml       infraestrutura Docker
storage/            arquivos privados locais (ignorado pelo Git)
docs/               documentação atual e histórico separado
```

## Começar

Instale Node.js e Docker com Compose v2. Na raiz deste repositório:

```bash
npm ci
cp .env.example .env
cp .env.test.example .env.test
```

Preencha os arquivos conforme o [guia de instalação](docs/getting-started/installation.md)
antes de iniciar o banco. Desenvolvimento e integração local usam exclusivamente
MySQL Docker em `127.0.0.1:33307`; o MySQL nativo do host não faz parte da plataforma.

```bash
docker compose --env-file .env -f compose.yaml -f compose.local-db.yaml up -d db
npm run db:dev:setup
npm run db:dev:seed
npm start
```

Acesse `http://localhost:3000`. O seed exige `CANONICAL_SEED_PASSWORD` configurado.
O guia explica a inicialização do ledger de migrations em volumes novos ou existentes.

## Testar

```bash
npm test
```

Para integração, depois de preencher `.env.test` e conferir a identidade do banco Docker:

```bash
NODE_ENV=test npm run db:identity:verify
npm run db:test:setup
npm run test:integration
```

O setup e as integrações usam dados descartáveis de `plataforma_cursos_test`.
Veja [testes](docs/testing/overview.md) para lint, build, migrations e suíte completa.

## Documentação

Comece pelo [índice](docs/index.md): produto, regras, arquitetura, API, banco,
segurança, desenvolvimento, deploy e recuperação. Relatórios datados ficam em
[engenharia](docs/engineering/README.md) e não substituem os guias atuais.
