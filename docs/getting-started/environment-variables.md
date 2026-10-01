# Variáveis de ambiente

A configuração identifica a aplicação, o banco e os serviços externos. Segredos ficam em
arquivos locais ignorados pelo Git ou no ambiente do processo, nunca na documentação.
Os modelos públicos são [.env.example](../../.env.example),
[.env.test.example](../../.env.test.example), [.env.staging.example](../../.env.staging.example)
e [.env.production.example](../../.env.production.example).

## Precedência e ambientes

No runtime: ambiente do processo vence `.env.<modo>`, que vence `.env`. `index.js` escolhe
modo test para Jest/testes; fora disso usa `APP_ENV`, depois `NODE_ENV`, depois development.
Scripts de banco selecionam seu próprio modo explícito; em produção use Compose, que injeta
as variáveis. O `--env-file` fornece interpolação ao Compose; apenas valores mapeados em
`environment` chegam ao container. Não suponha que uma variável nova foi repassada.

`.env.test` deve declarar todas as variáveis de conexão: não herda endpoint faltante de `.env`.
Variáveis exportadas no shell ainda têm prioridade; confira-as sem imprimir secrets.
`NODE_ENV` aceita development/test/production; `APP_ENV` também distingue staging.
Staging usa `NODE_ENV=production` para as proteções de produção.

## Contrato principal

| Variável | Finalidade / padrão |
| --- | --- |
| `APP_PORT` | Porta HTTP, padrão 3000; `PORT` não configura o runtime |
| `APP_BASE_URL`, `APP_DOMAIN` | URL pública e domínio do Caddy; HTTPS em produção |
| `APP_NAME` | Nome exibido nas comunicações |
| `DB_HOST`, `DB_PORT` | Obrigatórios, sem fallback; host local usa `127.0.0.1:33307` |
| `DB_NAME`, `DB_ENVIRONMENT_IDENTITY` | Banco e marcador; consulte [isolamento](../architecture/database.md) |
| `DB_USER`, `DB_PASSWORD` | Credenciais obrigatórias da aplicação |
| `MYSQL_ROOT_PASSWORD` | Inicialização/gestão do container; não é usuário do runtime |
| `JWT_SECRET` | Obrigatório; pelo menos 32 caracteres em produção |
| `CORS_ORIGIN` | Origens separadas por vírgula; vazio para frontend de mesma origem local |
| `CSP_REPORT_ONLY` | false; true somente para diagnóstico deliberado |
| `SESSION_TTL_SECONDS` | 28800; validade da sessão, de 300 a 604800 segundos |

## Banco e operação

| Variável | Padrão / uso |
| --- | --- |
| `DB_POOL_MAX` | 10 conexões, faixa 1–100 |
| `DB_POOL_QUEUE_LIMIT` | 50 na fila, faixa 1–10000 |
| `DB_POOL_WAIT_FOR_CONNECTIONS` | true |
| `DB_CONNECT_TIMEOUT_MS` | 10000, faixa 1000–60000 |
| `DEFAULT_PAGE_SIZE`, `MAX_PAGE_SIZE` | 50 e 100 |
| `SLOW_REQUEST_MS` | 2000 para aviso de requisição lenta |
| `DISK_WARNING_PERCENT`, `DISK_CRITICAL_PERCENT` | 15 e 5 de espaço livre |
| `BACKUP_STATUS_DIR` | Diretório do latest-good, montado somente leitura no app |
| `RPO_HOURS` | 24, janela de backup monitorada |
| `CANONICAL_SEED_PASSWORD`, `TEST_SEED_PASSWORD` | Senhas locais de seeds; sem padrão |
| `INITIAL_ADMIN_*` | Dados explícitos para bootstrap administrativo |
| `ALLOW_PRODUCTION_MIGRATIONS` | `I_UNDERSTAND` somente na execução operacional de migrations |
| `ALLOW_PRODUCTION_ADMIN_BOOTSTRAP` | `I_UNDERSTAND` somente no bootstrap em produção |

## E-mail, autenticação e limites

`EMAIL_DELIVERY_ENABLED` é true por padrão no código, mas a configuração atual de
produção define `EMAIL_DELIVERY_ENABLED=false` e
`PUBLIC_REGISTRATION_EMAIL_VERIFICATION_REQUIRED=false`. Nessa combinação, o cadastro
público cria ALUNO já verificado, sem código ou envio, e permite login imediato;
a recuperação por e-mail permanece indisponível. Quando a entrega está ativa em
produção, exige `RESEND_API_KEY` e `MAIL_FROM` configurados no provedor.
`EMAIL_VERIFICATION_TTL_MINUTES=10`, `PASSWORD_RESET_TTL_MINUTES=20` e
`EMAIL_PROVIDER_TIMEOUT_MS=10000` controlam prazos.

Limites: `AUTH_RATE_LIMIT_MAX=20` por 15 minutos; recuperação/reset usam
`PASSWORD_RECOVERY_RATE_LIMIT=5` e `PASSWORD_RESET_RATE_LIMIT=10` por 15 minutos.
`EMAIL_VERIFICATION_RATE_LIMIT_WINDOW_MS=900000` acompanha envio por IP/identidade (20/5)
e confirmação por IP/identidade (60/10), configurados por `EMAIL_CODE_*_RATE_LIMIT_MAX`.

## PDFs e certificados

| Variável | Padrão / uso |
| --- | --- |
| `MATERIAL_STORAGE_DIR` | `./storage/materials`, privado |
| `PDF_MAX_SIZE_MB` | 20 para materiais |
| `MATERIAL_RETENTION_DAYS`, `STORAGE_GRACE_HOURS` | 90 dias / 48 horas; não acionam coleta automática |
| `CERTIFICATE_STORAGE_DIR` | `./storage/certificates`, privado e distinto dos materiais |
| `CERTIFICATE_UPLOAD_MAX_SIZE_MB` | 10 na comparação pública |
| `CERTIFICATE_PUBLIC_RATE_LIMIT_MAX` | 30 consultas por janela |
| `CERTIFICATE_UPLOAD_RATE_LIMIT_MAX` | 10 uploads por janela |
| `CERTIFICATE_RATE_LIMIT_WINDOW_MS` | 60000 |
| `CERTIFICATE_INSTITUTION_NAME`, `CERTIFICATE_CAMPUS`, `CERTIFICATE_RESPONSIBLE_ROLE` | Identidade institucional do documento |

## Integrações opcionais e backup

`DETECTOR_ENABLED=false` mantém o motor fora da jornada padrão. `IA_ANALISE_URL`,
`DETECTOR_API_URL`, `MOTOR_IA_API_URL` e `MOTOR_IA_INTERNAL_API_TOKEN` configuram a integração
quando deliberadamente utilizada. Os exemplos listam timeouts `DETECTOR_API_*`, limites
`DETECTOR_RATE_LIMIT_*` e `RETRIEVAL_*`. Não é necessário ativá-los para desenvolver cursos.

O [runbook de backup](../operations/backup-and-restore.md) explica `BACKUP_DIR`,
`BACKUP_OFFSITE_ENABLED`, retenções, destino Azure e configuração systemd. Esses valores
operacionais não devem ser confundidos com `BACKUP_STATUS_DIR`, que apenas permite leitura
do estado pelo runtime.

Valores ausentes/inválidos em configuração crítica interrompem a inicialização (fail-closed).
Fontes: [env.js](../../src/config/env.js), [runtime-config.js](../../src/config/runtime-config.js)
e [Compose](../../compose.yaml).
