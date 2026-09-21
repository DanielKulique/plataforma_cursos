# Instalação local

Para desenvolver, execute Node no host e MySQL 8.4 em um container exclusivo da plataforma.
Não instale nem inicie o MySQL nativo. A integração local usa somente `127.0.0.1:33307`.

## 1. Requisitos

Use Node.js 20 (versão da imagem e da CI), npm, Git, Docker Engine com Compose v2 e shell
compatível com os exemplos Bash. Comandos partem da raiz `plataforma_cursos/`.

```bash
node --version
docker compose version
npm ci
```

Não há bundle de frontend a gerar. `npm ci` instala as versões do lockfile.

## 2. Configuração

Em um clone novo:

```bash
cp .env.example .env
cp .env.test.example .env.test
```

Preencha os placeholders antes de continuar, sem sobrescrever ambientes já configurados:

- `.env`: `DB_HOST=127.0.0.1`, `DB_PORT=33307`, banco/identidade `plataforma_cursos_dev`;
- usuário/senha MySQL próprios, `MYSQL_ROOT_PASSWORD` e `JWT_SECRET` aleatórios;
- `CANONICAL_SEED_PASSWORD` para as contas locais do seed;
- `.env.test`: mesmo usuário/senha da instância, banco/identidade `plataforma_cursos_test`,
  `NODE_ENV=test`, `APP_ENV=test`, JWT exclusivo e `TEST_SEED_PASSWORD` descartável;
- `APP_BASE_URL=http://localhost:3000`; deixe `CORS_ORIGIN` vazio no uso de mesma origem;
- mantenha `DETECTOR_ENABLED=false` em desenvolvimento. Não é necessário iniciar motor externo;
- sem remetente Resend configurado, use `EMAIL_DELIVERY_ENABLED=false` localmente.
  Nesse modo não há entrega de códigos/reset, nem exposição desses valores na API.

Os testes que exercitam detector usam dublês do serviço; o exemplo de teste habilita essa
capacidade para verificar os contratos. Isso não inicia um motor de IA. Veja o
[catálogo de variáveis](environment-variables.md).

## 3. Banco Docker

```bash
docker compose --env-file .env -f compose.yaml -f compose.local-db.yaml up -d db
docker compose --env-file .env -f compose.yaml -f compose.local-db.yaml ps db
```

Espere o serviço ficar saudável. Na primeira criação do volume, o init cria os schemas
de desenvolvimento e teste e suas identidades. O volume dedicado é
`plataforma_cursos_local_mysql84_data`. O init não executa de novo em volume existente.

```bash
npm run db:identity:verify
NODE_ENV=test npm run db:identity:verify
npm run db:dev:setup
```

O setup dev verifica um schema existente e não limpa dados. Falha de identidade ou contrato
exige diagnóstico; não remova o volume nem use outro banco como fallback.

## 4. Ledger e dados locais

O init/setup canônico cria tabelas, mas não registra automaticamente `schema_migrations`.
Em instalação recém-criada por esse procedimento, sem ledger, execute a adoção explícita:

```bash
npm run db:schema:validate -- --allow-missing-ledger
npm run db:migrate -- --baseline-existing=011
npm run db:migrate:status
npm run db:schema:validate
```

O runner valida o schema, registra 001–011 e aplica as posteriores na mesma execução.
Se já há ledger, não repita baseline: use `npm run db:migrate` e valide status/schema.
Em banco com dados anteriores, faça backup antes da adoção; veja [migrations](../database/migrations.md).

```bash
npm run db:dev:seed
npm start
```

O seed exige a senha configurada; use apenas no desenvolvimento canônico. Acesse
`http://localhost:3000`. Para uma instalação sem dados demonstrativos, crie o primeiro
administrador pelo [bootstrap](../operations/deployment.md).

## 5. Primeiros testes

```bash
npm test
NODE_ENV=test npm run db:identity:verify
npm run db:test:setup
npm run test:integration
```

O setup de teste recria somente o banco descartável validado. A suíte também limpa dados;
nunca guarde trabalho nesse banco. Continue em [testes](../testing/overview.md).
