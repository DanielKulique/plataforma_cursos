# Monitoramento

Liveness responde se o processo está vivo; readiness responde se consegue atender com DB e
storages essenciais. Backup atrasado pode coexistir com readiness saudável e exige alerta próprio.

| Endpoint/comando | Acesso | O que indica |
| --- | --- | --- |
| `GET /healthz` | Público | Corpo mínimo `{"status":"ok"}` enquanto HTTP responde |
| `GET /readyz` | Público | SELECT 1 e acesso aos storages; falha retorna 503 mínimo |
| `GET /api/health` | ADMIN | Estados resumidos de banco, storage, backup e pool |
| `GET /api/admin/metrics` | ADMIN | HTTP, uptime/memória, pool, disco, latest-good/RPO |
| `npm run ops:check` | Operador no ambiente configurado | JSON e código não zero para falhas operacionais |

## Logs e correlação

O backend atribui UUID próprio em `X-Request-ID`, sem confiar no valor enviado pelo cliente.
Logs JSON registram timestamp, ID, método, rota sanitizada, status e duração; não registram
body completo. `SLOW_REQUEST_MS` marca requisições lentas. Caddy também escreve JSON em stdout.
Compose limita logs de app/db/caddy a três arquivos de 10 MB.

```bash
docker compose --env-file .env.production -f compose.yaml logs --tail=200 app caddy db
docker compose --env-file .env.production -f compose.yaml exec -T app npm run ops:check
```

Não publique logs sem revisar dados sensíveis. Métricas HTTP ficam em memória e zeram no restart;
não são séries históricas persistentes. Elas incluem total, em voo, classes de status e duração.

## Pool, disco e backup

Pool MySQL tem tamanho e fila finitos. Confira falhas e latência de aquisição antes de aumentar
limites; a saturação pode vir de queries ou transações lentas. `DB_POOL_SATURATED` é erro controlado.
Disco acompanha o filesystem de materiais: aviso com 15% livre e crítico com 5%, por padrão.

O runtime lê `latest-good.json` e `complete.json` no `BACKUP_STATUS_DIR`, sem scan pesado.
Esse estado é local; verifique offsite pelo [runbook](backup-and-restore.md).
RPO padrão é 24 horas. `ops:check` não manda e-mail, não grava métricas, não faz backup ou coleta.

As units [health service](../../deploy/systemd/plataforma-health-check.service) e
[health timer](../../deploy/systemd/plataforma-health-check.timer) permitem checagem periódica
via journald. O padrão é `.env.production`; staging precisa de `COMPOSE_ENV_FILE=.env.staging`
em `/etc/default/plataforma-health-check`, root:root modo 600, sem secrets nesse override.
Instale/recarregue as units de forma explícita no host operacional.

Consulte [troubleshooting](troubleshooting.md) para relacionar sintomas a verificações.
