#!/usr/bin/env bash
set -euo pipefail

: "${APP_DOMAIN:?Defina APP_DOMAIN}"
: "${ACME_EMAIL:?Defina ACME_EMAIL}"

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
ENV_FILE=${STAGING_ENV_FILE:-$ROOT/.env.staging}
CREDENTIALS_FILE=${STAGING_CREDENTIALS_FILE:-$ROOT/.staging-credentials}
umask 077

random_hex() {
    openssl rand -hex "$1"
}

db_password=$(random_hex 24)
root_password=$(random_hex 24)
jwt_secret=$(random_hex 48)
admin_password="A!$(random_hex 18)a1"
demo_password="D!$(random_hex 18)a1"
basic_password="B!$(random_hex 18)a1"
basic_hash=$(docker run --rm caddy:2.8-alpine caddy hash-password --plaintext "$basic_password")
basic_hash_escaped=${basic_hash//\$/\$\$}

install -m 600 /dev/null "$ENV_FILE"
printf '%s\n' \
    'NODE_ENV=production' \
    'APP_ENV=staging' \
    'APP_PORT=3000' \
    "APP_DOMAIN=$APP_DOMAIN" \
    "APP_BASE_URL=https://$APP_DOMAIN" \
    'APP_NAME=Plataforma de Cursos - Demonstracao' \
    'DB_HOST=db' \
    'DB_PORT=3306' \
    'DB_NAME=plataforma_cursos_staging' \
    'DB_ENVIRONMENT_IDENTITY=plataforma_cursos_staging' \
    'DB_USER=plataforma_staging' \
    "DB_PASSWORD=$db_password" \
    'DB_POOL_MAX=10' \
    'DB_POOL_QUEUE_LIMIT=50' \
    'DB_POOL_WAIT_FOR_CONNECTIONS=true' \
    'DB_CONNECT_TIMEOUT_MS=10000' \
    "MYSQL_ROOT_PASSWORD=$root_password" \
    "JWT_SECRET=$jwt_secret" \
    'SESSION_TTL_SECONDS=28800' \
    'AUTH_RATE_LIMIT_MAX=100' \
    'PASSWORD_RESET_TTL_MINUTES=20' \
    'PASSWORD_RECOVERY_RATE_LIMIT=20' \
    'PASSWORD_RESET_RATE_LIMIT=20' \
    "CORS_ORIGIN=https://$APP_DOMAIN" \
    'CSP_REPORT_ONLY=false' \
    'SLOW_REQUEST_MS=2000' \
    'DEFAULT_PAGE_SIZE=50' \
    'MAX_PAGE_SIZE=100' \
    'DISK_WARNING_PERCENT=15' \
    'DISK_CRITICAL_PERCENT=5' \
    'BACKUP_DIR=/var/backups/plataforma-cursos' \
    'RPO_HOURS=24' \
    'EMAIL_DELIVERY_ENABLED=false' \
    'RESEND_API_KEY=' \
    'MAIL_FROM=' \
    'DETECTOR_ENABLED=false' \
    'IA_ANALISE_URL=http://motor-ia:8000/api/analisar' \
    'IA_ANALISE_TIMEOUT_MS=10000' \
    'DETECTOR_API_URL=http://motor-ia:8000' \
    'DETECTOR_API_TIMEOUT_MS=15000' \
    'DETECTOR_API_TIMEOUT_INCREMENTAL_MS=8000' \
    'DETECTOR_API_TIMEOUT_COMPLETE_MS=20000' \
    'DETECTOR_RATE_LIMIT_MAX=60' \
    'DETECTOR_RATE_LIMIT_WINDOW_MS=60000' \
    'MOTOR_IA_API_URL=http://motor-ia:8000' \
    'MOTOR_IA_INTERNAL_API_TOKEN=' \
    'STAGING_BASIC_AUTH_USER=demo' \
    "STAGING_BASIC_AUTH_HASH=$basic_hash_escaped" \
    "ACME_EMAIL=$ACME_EMAIL" \
    'INITIAL_ADMIN_NOME=Administrador de Demonstracao' \
    'INITIAL_ADMIN_CPF=91000000100' \
    'INITIAL_ADMIN_EMAIL=admin.demo@example.test' \
    'INITIAL_ADMIN_TELEFONE=41910000100' \
    "INITIAL_ADMIN_PASSWORD=$admin_password" \
    'INITIAL_ADMIN_ALLOW_ADDITIONAL=' \
    "STAGING_DEMO_PASSWORD=$demo_password" \
    'ALLOW_PRODUCTION_ADMIN_BOOTSTRAP=' \
    'ALLOW_PRODUCTION_MIGRATIONS=' \
    'ALLOW_STAGING_DEMO_SEED=' > "$ENV_FILE"

install -m 600 /dev/null "$CREDENTIALS_FILE"
printf '%s\n' \
    'BASIC_AUTH_USER=demo' \
    "BASIC_AUTH_PASSWORD=$basic_password" \
    'ADMIN_EMAIL=admin.demo@example.test' \
    "ADMIN_PASSWORD=$admin_password" \
    'PROFESSOR_EMAIL=professor.demo@example.test' \
    'ALUNO_EMAIL=aluno.demo@example.test' \
    'UNENROLLED_EMAIL=sem.matricula.demo@example.test' \
    "DEMO_PASSWORD=$demo_password" > "$CREDENTIALS_FILE"

echo "Configuração criada em $ENV_FILE; credenciais em $CREDENTIALS_FILE (modo 600)."
