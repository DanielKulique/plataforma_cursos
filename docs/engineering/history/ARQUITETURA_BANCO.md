> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Arquitetura e operação segura do banco

## Instâncias isoladas

O banco da plataforma é o serviço `db` do Docker Compose, baseado em MySQL 8.4 e com volume nomeado exclusivo. O runtime nunca usa o MySQL nativo do host.

| Uso | Endpoint visto pelo Node | Identidade persistente | Instância |
|---|---|---|---|
| Node no host (dev/test) | `127.0.0.1:33307` | `plataforma_cursos_dev` ou `plataforma_cursos_test` | `db` com `compose.local-db.yaml` |
| App no Compose | `db:3306` | conforme `DB_ENVIRONMENT_IDENTITY` | `db` na rede Compose |
| Staging | `db:3306` | `plataforma_cursos_staging` | `db` da stack de staging |
| Produção | `db:3306` | `plataforma_cursos_prod` | `db` da stack de produção |

O container `goal12-mysql84`, publicado em `127.0.0.1:33306`, é exclusivo do projeto `motor_ia`. A plataforma não o utiliza. O `mysql.service` e `/var/lib/mysql` do host também não são utilizados, iniciados ou administrados por este projeto.

## Preparação local

Preencha `.env` a partir de `.env.example`, incluindo `MYSQL_ROOT_PASSWORD`, e `.env.test` a partir de `.env.test.example`. `DB_USER` e `DB_PASSWORD` de `.env.test` devem ter os mesmos valores do usuário da plataforma em `.env`; os dois arquivos continuam ignorados pelo Git.

Suba somente o banco dedicado:

```bash
docker compose --env-file .env -f compose.yaml -f compose.local-db.yaml up -d db
```

O override publica somente `127.0.0.1:33307:3306` e usa o volume `plataforma_cursos_local_mysql84_data`. Ele inicializa `plataforma_cursos_dev` e `plataforma_cursos_test`, sem bind mount para um diretório de dados do host.

Confira estado e identidade antes de qualquer integração:

```bash
docker compose --env-file .env -f compose.yaml -f compose.local-db.yaml ps db
npm run db:identity:verify
NODE_ENV=test npm run db:identity:verify
```

Os comandos de identidade mostram host, porta, database, tipo de instância/container declarado e os valores observados por `DATABASE()`, `VERSION()`, `@@hostname` e `@@port`. Qualquer divergência aborta.

Prepare/alimente o desenvolvimento e execute o Node no host:

```bash
npm run db:dev:setup
npm run db:dev:seed
npm start
```

Pare apenas o banco desta stack, preservando o volume:

```bash
docker compose --env-file .env -f compose.yaml -f compose.local-db.yaml stop db
```

Não use `down -v` como rotina e não remova volumes para “corrigir” falhas.

## Testes e migrations

Testes unitários e gates sem banco:

```bash
npm run lint
npm run db:isolation:verify
npm run build
npm test -- --runInBand
```

Antes da integração, confira a identidade de teste como mostrado acima. Só então:

```bash
npm run db:test:setup
npm run db:test:seed
npm run test:integration
```

Migrations também validam o marcador antes do primeiro SQL estrutural:

```bash
npm run db:identity:verify
npm run db:migrate
npm run db:schema:verify
```

Um banco existente sem `environment_identity` é recusado. Após backup e conferência operacional independente do alvo, o cadastro único pode ser feito explicitamente:

```bash
ALLOW_DATABASE_IDENTITY_REGISTRATION=I_UNDERSTAND_REGISTER_EXISTING_DATABASE npm run db:identity:register
```

Esse comando não altera um marcador existente e só aceita um schema canônico anterior ao marcador.

## Backup e restore

O backup é lógico (`mysqldump --single-transaction`) e inclui manifesto e checksums. Use um caminho absoluto fora dos volumes protegidos:

Se o Node estiver rodando diretamente no host, encerre-o de forma graciosa antes do backup local; o script consegue suspender automaticamente apenas o serviço `app` do Compose.

```bash
COMPOSE_ENV_FILE=.env \
COMPOSE_OVERRIDE_FILE=compose.local-db.yaml \
BACKUP_DIR=/caminho/absoluto/backups \
DB_NAME=plataforma_cursos_dev \
./scripts/backup_database.sh
```

O restore valida manifesto, versão e identidade do destino antes de executar o `DROP DATABASE`, e valida novamente o schema/identidade após importar o dump:

```bash
COMPOSE_ENV_FILE=.env \
COMPOSE_OVERRIDE_FILE=compose.local-db.yaml \
./scripts/restore_database.sh \
  --backup /caminho/absoluto/backups/backup-ID \
  --target development --mode in-place --apply
```

Backups/restores nunca copiam arquivos físicos do InnoDB nem diretórios de dados. Produção e staging usam os mesmos scripts com seus arquivos externos de ambiente e sem publicação da porta do banco.

## Proteções fail-closed

- `DB_HOST`, `DB_PORT`, usuário, senha, nome e identidade são obrigatórios e não possuem fallback.
- Endpoints locais na porta nativa são recusados; a exceção de CI exige flags e identificador efêmero explícitos.
- `.env.test` substitui integralmente as variáveis de conexão e nunca herda endpoint de `.env`.
- Runtime, migration, setup, seed, limpeza de integração, backup e restore conferem o marcador persistente.
- Setup de teste confere a identidade antes de apagar um banco preenchido.
- O gate `db:isolation:verify` examina arquivos operacionais e possui allowlist contextual para Compose interno e CI efêmero.
- Os containers `db`, `app` e `caddy` rotacionam logs (`10m`, três arquivos).
