> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Runtime e operações

## Contrato e precedência de configuração

`APP_PORT` é a única porta HTTP da aplicação. Node, Docker healthcheck, Compose e Caddy usam o mesmo valor; o padrão documentado no Compose/imagem é `3000`. `PORT` não participa mais do runtime. Valores ausentes ou inválidos nas variáveis críticas interrompem o startup com erro curto e redigido.

A precedência é determinística:

1. ambiente do processo (shell, secret da VM ou `environment` do Compose);
2. `.env.<APP_ENV>` quando o Node é executado diretamente no host;
3. `.env` local;
4. defaults de código apenas para knobs operacionais não secretos.

O `--env-file` do Compose fornece valores para interpolação; a seção `environment` do serviço materializa o contrato dentro do container e vence defaults da imagem. Em test, `.env.test` é autocontido para o endpoint do banco. `NODE_ENV` aceita `development`, `test` ou `production`; `APP_ENV` distingue `development`, `test`, `staging` e `production`.

`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_ENVIRONMENT_IDENTITY` e `JWT_SECRET` são obrigatórios. Staging/produção não assumem host, porta, usuário, senha ou banco. O MySQL nativo do host não faz parte da arquitetura. Desenvolvimento e testes usam uma instância explicitamente configurada; integrações locais usam somente o MySQL Docker em `127.0.0.1:33307`, sem fallback para 3306.

O startup registra somente ambiente, porta, host/porta/nome do banco e limites do pool. Senhas, JWT, cookies, tokens, chaves e connection strings não são registrados.

## Pool MySQL

| Variável | Default | Contrato |
| --- | ---: | --- |
| `DB_POOL_MAX` | 10 | 1–100 conexões |
| `DB_POOL_QUEUE_LIMIT` | 50 | fila finita, 1–10000 |
| `DB_POOL_WAIT_FOR_CONNECTIONS` | true | boolean explícito |
| `DB_CONNECT_TIMEOUT_MS` | 10000 | 1–60 s para conexão |

Aquisições, falhas, espera e latência de aquisição são instrumentadas sem ler propriedades privadas do mysql2. Quando a fila está cheia, o erro bruto é convertido em `DB_POOL_SATURATED`, HTTP 503 e mensagem segura. Conexões explícitas permanecem sob `try/finally` com `release()`. As listagens crescentes de usuários, turmas, matrículas por turma, histórico de tentativas e resultados usam `page`/`limit`, default 50 e máximo 100.

A auditoria direcionada não encontrou leak conhecido em autenticação transacional, matrículas, questionários, certificados, replicação ou metadata de storage. EXPLAIN motivou a migration 013 com índices de listagem para usuários, turmas e tentativas por aluno/turma. A listagem de matrículas já filtra por `idx_matriculas_turma`; seu filesort por nome vindo do join não justificou outro índice.

## Saúde e métricas

- `GET /healthz`: liveness público; confirma somente que o processo HTTP responde e sempre devolve o corpo mínimo `{"status":"ok"}` enquanto o processo está vivo.
- `GET /readyz`: readiness público mínimo; faz `SELECT 1` e verifica acesso de leitura/escrita aos storages privados. Falha retorna 503 sem detalhes. Backup atrasado não derruba readiness.
- `GET /api/health`: diagnóstico resumido autenticado para ADMIN, com estados de database, storage, backup e pool.
- `GET /api/admin/metrics`: métricas autenticadas para ADMIN. Inclui uptime/memória, HTTP, pool, disco e latest-good/RPO; não inclui secrets, paths nem PII.

Cada request recebe UUID gerado pelo backend em `X-Request-ID`; um valor recebido do cliente não é confiado. Logs JSON de conclusão contêm timestamp, request-id, método, rota sanitizada, status e duração, sem body. `SLOW_REQUEST_MS` (default 2000) gera warning sanitizado. Counters HTTP in-memory cobrem total, in-flight, 2xx/3xx/4xx/5xx, média/máximo de duração e requests lentos; reiniciam com o processo.

Disco usa o filesystem do storage de materiais. `DISK_WARNING_PERCENT` (15) e `DISK_CRITICAL_PERCENT` (5) representam percentual livre. Backup lê de modo leve `latest-good.json` e o marcador `complete.json` produzido pelo Goal 08; `RPO_HOURS` default é 24. O diretório é montado read-only no app como `BACKUP_STATUS_DIR`. Em staging, a montagem usa o mesmo `/var/backups/plataforma-cursos` do timer diário do Goal 08. O estado exposto pelo app representa o latest-good local; a verificação offsite continua no procedimento próprio do Goal 08.

## Checagem operacional

`npm run ops:check` produz uma única linha JSON e retorna código diferente de zero quando readiness falha, disco está critical/indisponível ou latest-good/RPO não está OK. O comando não envia e-mail, não grava métricas e não executa backup/reconciliador. As units `deploy/systemd/plataforma-health-check.{service,timer}` permitem execução a cada cinco minutos via journald.

A unit usa `.env.production` por padrão. Em staging, defina `COMPOSE_ENV_FILE=.env.staging` em `/etc/default/plataforma-health-check`, recarregue o systemd e habilite `plataforma-health-check.timer`. O arquivo de override deve pertencer a root e usar modo `600`; ele contém apenas o nome do arquivo de ambiente, não seus secrets.

Diagnóstico básico:

1. confira `healthz`; se falhar, processo/porta/proxy não está respondendo;
2. confira `readyz`; se falhar, verifique DB e permissões dos storages;
3. como ADMIN, consulte health e metrics e correlacione pelo `X-Request-ID`;
4. se pool estiver saturado, confirme fila/latência e a causa no MySQL antes de aumentar limites;
5. para disco ou RPO, corrija espaço/backup pelo runbook do Goal 08 — readiness pode continuar saudável.
