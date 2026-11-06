# Migrations e contrato do banco

Migrations registram a evolução do schema. Cada arquivo aplicado torna-se imutável;
correções avançam com um arquivo novo. O servidor HTTP nunca altera tabelas ao iniciar.

## Arquivos, ledger e checksum

Arquivos em `mysql/migrations/` usam `NNN_nome.sql`, sequência numérica única sem lacunas.
A revisão atual contém 001–016. O runner cria `schema_migrations`, com `version`, `filename`,
`checksum_sha256`, `applied_at` e `execution_ms`. SHA-256 cobre todos os bytes do arquivo.
Não há migration 000 nem comando down.

`GET_LOCK` específico do banco serializa execuções na mesma conexão. Alterar uma migration
registrada resulta em `CHECKSUM_MISMATCH` e bloqueia as seguintes. Restaure o arquivo aos bytes
originais; não edite o checksum no ledger para silenciar divergência.

## Comandos de rotina

```bash
npm run db:identity:verify
npm run db:migrate:status
npm run db:migrate
npm run db:schema:validate
```

Para teste, prefixe os comandos de banco com `NODE_ENV=test`. Em produção/staging, use o
container com as variáveis injetadas e `ALLOW_PRODUCTION_MIGRATIONS=I_UNDERSTAND` somente
para escrita, conforme [deploy](../operations/deployment.md).

Status é somente leitura: pendências são informadas; drift, checksum inválido ou ledger ausente
em banco povoado geram saída diferente de zero. Uma segunda execução sem pendências é NO-OP.

## Banco novo versus banco com tabelas

O init do MySQL executa apenas na criação do volume. Ele aplica `mysql/schema.sql` e identidade,
mas não preenche o ledger do runner. O setup dev/test também cria o DDL canônico sem ledger.
Se o runner recebe um banco realmente sem tabelas, aplica bootstrap, identidade e migrations
001 até a última automaticamente.

Se há tabelas e não há ledger, a adoção exige baseline explícito, após conferir identidade,
schema e backup para dados existentes:

```bash
npm run db:schema:validate -- --allow-missing-ledger
npm run db:migrate -- --baseline-existing=011
npm run db:migrate:status
npm run db:schema:validate
```

O contrato deve estar integralmente compatível; a opção não contorna drift. O runner registra
checksums 001–011 sem reexecutá-las e aplica 012–016 pendentes na mesma chamada. Não use baseline
em banco que já possui registros no ledger. Não assuma que qualquer banco antigo aceita adoção:
diagnostique divergências e a revisão de origem antes de promover.

## Schema validator

`db:schema:validate` compara o banco com `scripts/schema-contract.json` usando
`INFORMATION_SCHEMA`: engine/collation, colunas e ordem, tipos, tamanhos, null/default,
unsigned, auto_increment, generated, charset, PK, UNIQUE, índices, FKs e ações, CHECKs.
As tabelas técnicas são conhecidas. Tabela inesperada é erro; o validator não a apaga.
`--json` produz relatório estruturado. `--allow-missing-ledger` serve à adoção explícita,
não à validação final de um deploy migrado.

## Falha e nova alteração

MySQL pode fazer commit implícito de DDL. Se uma migration falha, ela não é registrada como
aplicada e as posteriores param; isso não garante rollback do SQL que já executou.
Inspecione estado real, faça correção forward compatível ou restore de conjunto validado.
Não repita SQL destrutivo às cegas.

Para evoluir: crie o próximo arquivo, atualize DDL e contrato em banco descartável, teste
bootstrap/upgrade, checksum/status e drift. Use `npm run test:migrations:unit` e a integração
adequada em MySQL Docker `127.0.0.1:33307`. Nunca edite migrations aplicadas.

Fontes: [runner](../../scripts/lib/migration-runner.js),
[CLI](../../scripts/migrate_database.js), [validator](../../scripts/verify_schema.js).
