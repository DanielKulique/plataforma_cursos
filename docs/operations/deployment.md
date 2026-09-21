# Deploy

Para a produção real e a Turma 2026/2, siga o [runbook de release](production-release.md),
que usa `compose.production.yaml` e migrations sobre banco vazio. Os comandos genéricos
abaixo não substituem esse fluxo de instalação inicial.

A stack de publicação contém Caddy, Node e MySQL 8.4 com volumes privados. O MySQL não tem
porta pública. O procedimento usa uma revisão aprovada e configuração externa; não executa
seeds demonstrativos em produção.

## Preparação

Em VPS Linux com Docker Engine/Compose v2, configure DNS e portas 80/443. Copie
`.env.production.example` para `.env.production`, preencha placeholders e restrinja permissões.
Use `APP_ENV=production`, banco `plataforma_cursos`, identidade `plataforma_cursos_prod`,
`APP_DOMAIN` sem protocolo e `APP_BASE_URL`/`CORS_ORIGIN` HTTPS coerentes.
Configure JWT, MySQL e e-mail reais. Mantenha `DETECTOR_ENABLED=false` para publicação sem motor.

A revisão deve passar os testes relevantes em ambiente de teste dedicado antes do deploy.
No host de publicação, confira configuração sem imprimir valores e construa a imagem:

```bash
docker compose --env-file .env.production -f compose.yaml config --quiet
docker compose --env-file .env.production -f compose.yaml build app
docker compose --env-file .env.production -f compose.yaml up -d db
```

Espere MySQL saudável. A imagem executa como usuário `node`, usa Node 20 e healthcheck `/readyz`.

## Primeira instalação e ledger

O init em volume novo cria schema e identidade, mas não ledger. Confira antes de adotar:

```bash
docker compose --env-file .env.production -f compose.yaml run --rm --no-deps app npm run db:identity:verify
docker compose --env-file .env.production -f compose.yaml run --rm --no-deps app npm run db:schema:validate -- --allow-missing-ledger
docker compose --env-file .env.production -f compose.yaml run --rm --no-deps -e ALLOW_PRODUCTION_MIGRATIONS=I_UNDERSTAND app npm run db:migrate -- --baseline-existing=011
docker compose --env-file .env.production -f compose.yaml run --rm --no-deps app npm run db:migrate:status
docker compose --env-file .env.production -f compose.yaml run --rm --no-deps app npm run db:schema:validate
```

Use baseline somente quando não há histórico no ledger e o schema foi validado; em volume
anterior com dados, faça backup GOOD primeiro. O runner aplica migrations posteriores ao
baseline. Veja [contrato e falhas](../database/migrations.md).

## Primeiro administrador

Preencha `INITIAL_ADMIN_NOME`, `INITIAL_ADMIN_CPF`, `INITIAL_ADMIN_EMAIL`,
`INITIAL_ADMIN_TELEFONE` e `INITIAL_ADMIN_PASSWORD` no ambiente operacional. Não há senha padrão.

```bash
docker compose --env-file .env.production -f compose.yaml run --rm --no-deps -e ALLOW_PRODUCTION_ADMIN_BOOTSTRAP=I_UNDERSTAND app npm run admin:bootstrap
docker compose --env-file .env.production -f compose.yaml up -d app caddy
```

O bootstrap é transacional e não duplica o administrador existente. Criação adicional é um
procedimento deliberado com `INITIAL_ADMIN_ALLOW_ADDITIONAL=I_UNDERSTAND_CREATE_ANOTHER_ADMIN`.
Remova a senha inicial do arquivo operacional após uso.

## Atualização

1. Capture e valide [backup coordenado](backup-and-restore.md) com a revisão antiga.
2. Prepare a revisão/imagem aprovada e uma janela sem escritas para mudanças de schema.
3. Pare o serviço app, aplique migrations e valide contrato/status.
4. Recrie app/Caddy e execute os checks de aceite abaixo.

```bash
docker compose --env-file .env.production -f compose.yaml build app
docker compose --env-file .env.production -f compose.yaml stop app
docker compose --env-file .env.production -f compose.yaml run --rm --no-deps -e ALLOW_PRODUCTION_MIGRATIONS=I_UNDERSTAND app npm run db:migrate
docker compose --env-file .env.production -f compose.yaml run --rm --no-deps app npm run db:migrate:status
docker compose --env-file .env.production -f compose.yaml run --rm --no-deps app npm run db:schema:validate
docker compose --env-file .env.production -f compose.yaml up -d app caddy
```

Pare a sequência se algum passo falhar; não reabra tráfego com contrato inconsistente.
Rollback de código só é seguro se compatível com schema atual. Não existe migration down:
se incompatível, restaure o conjunto validado em manutenção.

## Staging e aceite

Staging usa `.env.staging`, banco/identidade `plataforma_cursos_staging` e
`-f compose.yaml -f compose.staging.yaml` em todos os comandos correspondentes.
O override usa Caddy de staging, Basic Auth e entrega de e-mail desabilitada por padrão.
Scripts `provision_azure_staging.sh`, `bootstrap_azure_vm.sh`, `package_staging_bundle.sh`
e `deploy_staging.sh` apoiam esse ambiente; revise destino/configuração antes de executar.
Basic Auth da borda é separado da sessão da aplicação.

Valide HTTPS, healthz, readyz, login, CSRF, perfis/ownership, uma leitura privada de PDF,
jornada acadêmica e validação de certificado existente. Confirme persistência após recriação,
backup/RPO e ausência de secrets nos diagnósticos. Para testar recuperação de senha real,
entrega de e-mail deve estar habilitada. Registre data, revisão e ambiente da validação.

```bash
docker compose --env-file .env.production -f compose.yaml ps
docker compose --env-file .env.production -f compose.yaml logs --tail=200 app caddy
```

Este guia não afirma que staging/produção foram reimplantados ou revalidados nesta consolidação.
