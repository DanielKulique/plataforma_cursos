> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Contrato de migrations do banco

## Regras invariáveis

- Arquivos usam `NNN_nome.sql`, versão numérica única e sequência sem gaps. A descoberta é ordenada numericamente, nunca pela ordem do filesystem.
- As migrations 001–012 são históricas. Depois de registrada, uma migration é imutável: qualquer diferença nos bytes produz `CHECKSUM_MISMATCH` e bloqueia migrations posteriores.
- Cada aplicação registra em `schema_migrations`: `version` (PK), `filename` (UNIQUE), SHA-256 completo dos bytes, `applied_at` e `execution_ms`.
- `schema_migrations` é infraestrutura do runner e é criada por ele antes de consultar o ledger; não existe migration 000.
- A política é **FORWARD-ONLY**. Correção usa uma migration nova ou restore de backup validado. Não há `db:migrate:down`.
- DDL MySQL pode fazer commit implícito. Falha não é anunciada como rollback seguro: a migration não entra no ledger, as seguintes não rodam e o operador diagnostica/restaura ou cria correção forward conforme o estado real.

## Comandos

```bash
npm run db:migrate
npm run db:migrate:status
npm run db:schema:validate
npm run db:schema:validate -- --json
```

`db:migrate` usa `GET_LOCK` específico do banco na mesma connection até o `finally`. Dois deploys não executam a mesma versão simultaneamente. `db:migrate:status` é somente leitura; pendências são normais, mas drift, checksum inválido ou ledger ausente em banco povoado retornam código não zero.

O validator compara `scripts/schema-contract.json` com `INFORMATION_SCHEMA`: tabelas/engine/collation; definição integral e ordem de colunas; tipos/tamanhos/unsigned; null/default/auto_increment/generated; charset/collation; PK/UNIQUE/índices e ordem; FKs/colunas/ON DELETE/ON UPDATE; CHECKs. `environment_identity` e `schema_migrations` são tabelas técnicas conhecidas. Tabela inesperada é erro e nunca é apagada automaticamente.

## Banco novo e initdb

`/docker-entrypoint-initdb.d` só executa na criação do volume e não atualiza bancos persistentes. Em banco totalmente vazio, o runner aplica o bootstrap canônico de `mysql/schema.sql`, registra a identidade explícita e então executa/registra 001→latest em ordem. Em volume já povoado, somente o runner promove versões.

## Baseline legado 001–011

Banco povoado com ledger vazio nunca é inferido automaticamente. Após backup GOOD e confirmação de identidade:

```bash
npm run db:schema:validate -- --allow-missing-ledger
npm run db:migrate -- --baseline-existing=011
npm run db:migrate:status
npm run db:migrate
npm run db:schema:validate
```

O runner obtém o lock, cria o ledger vazio, exige schema estrutural completo válido, calcula os checksums atuais de 001–011 e só então os registra sem reexecutar SQL histórico. A 012 existente fica pendente, é aplicada normalmente e um segundo migrate deve resultar em `NO-OP`. Qualquer drift bloqueia o baseline. Staging exige o procedimento acima em janela controlada, depois de backup `latest-good`; não se recria o banco.

Em checksum mismatch, restaure o arquivo histórico exatamente aos bytes registrados. Nunca atualize o hash do ledger. Se a mudança é necessária, reverta a edição e crie a próxima migration.

## Nova migration

1. Crie o próximo `NNN_nome.sql`, pequeno e determinístico.
2. Atualize `mysql/schema.sql` para bootstrap novo e `scripts/schema-contract.json` usando exclusivamente o banco descartável de teste.
3. Adicione teste da mudança e de drift relevante.
4. Prove banco vazio, upgrade a partir da versão anterior, status/checksum e validator final.
5. Faça commit; depois de aplicada, a migration não pode ser editada.

Testes locais de banco usam exclusivamente o MySQL Docker em `127.0.0.1:33307`. Indisponibilidade encerra o teste; não existe fallback para `localhost:3306` ou `127.0.0.1:3306`.

## Rollout inicial de staging

Em 17/09/2026, o staging MySQL 8.4.11 foi validado antes do baseline, recebeu o ledger explícito 001–011 e aplicou a 012 normalmente. Status posterior mostrou 001–012 `APPLIED OK`; a segunda execução foi `NO-OP`. O validator final conferiu 21 tabelas, 173 colunas, 74 índices e 94 constraints. O verificador de restore comparou o estado pós-baseline ao backup GOOD recém-capturado, incluindo 20 tabelas de domínio, materiais e certificados, sem divergências. [Evidência sanitizada](../evidence/goal11a-staging-validation.json).
