#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"
ENV_FILE=${STAGING_ENV_FILE:-.env.staging}
env_backup_dir=$(sed -n 's/^BACKUP_DIR=//p' "$ENV_FILE" 2>/dev/null | tail -n 1 || true)
export BACKUP_DIR=${STAGING_BACKUP_DIR:-${env_backup_dir:-/var/backups/plataforma-cursos}}
COMPOSE=(docker compose --env-file "$ENV_FILE" -f compose.yaml -f compose.staging.yaml)

command -v docker >/dev/null || { echo 'Docker não encontrado.' >&2; exit 1; }
docker compose version >/dev/null
test -f "$ENV_FILE" || { echo "Arquivo ausente: $ENV_FILE" >&2; exit 1; }
if grep -Eq '<[^>]+>' "$ENV_FILE"; then
    echo "$ENV_FILE ainda contém placeholders." >&2
    exit 1
fi
if [ "$(stat -c '%a' "$ENV_FILE")" -gt 600 ]; then
    echo "$ENV_FILE deve usar permissão 600 ou mais restritiva." >&2
    exit 1
fi

"${COMPOSE[@]}" config --quiet

# A imagem nova é construída antes do backup, sem substituir o container em execução.
# Assim os utilitários de manifesto do formato corrente já estão disponíveis para a captura.
"${COMPOSE[@]}" build --pull app
"${COMPOSE[@]}" up -d db

# Preflight somente leitura: drift/checksum interrompe o deploy antes do backup
# e antes de qualquer DDL. O primeiro banco legado exige baseline manual explícito.
"${COMPOSE[@]}" run --rm app npm run db:migrate:status

if "${COMPOSE[@]}" ps --status running db --quiet | grep -q .; then
    mkdir -p "$BACKUP_DIR"
    COMPOSE_ENV_FILE="$ENV_FILE" COMPOSE_OVERRIDE_FILE=compose.staging.yaml \
        BACKUP_DIR="$BACKUP_DIR" DB_NAME=$(sed -n 's/^DB_NAME=//p' "$ENV_FILE" | tail -n 1) \
        ./scripts/backup_database.sh
fi

"${COMPOSE[@]}" run --rm -e ALLOW_PRODUCTION_MIGRATIONS=I_UNDERSTAND app npm run db:migrate
"${COMPOSE[@]}" run --rm app npm run db:schema:validate
ADMIN_PASSWORD=$(sed -n 's/^INITIAL_ADMIN_PASSWORD=//p' "$ENV_FILE" | tail -n 1)
if [ -n "$ADMIN_PASSWORD" ]; then
    "${COMPOSE[@]}" run --rm -e ALLOW_PRODUCTION_ADMIN_BOOTSTRAP=I_UNDERSTAND app npm run admin:bootstrap
else
    ADMIN_COUNT=$("${COMPOSE[@]}" exec -T db sh -c \
        'exec mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE" -Nse "SELECT COUNT(*) FROM Usuarios WHERE tipo = '\''ADMIN'\''"')
    if [ "${ADMIN_COUNT:-0}" -lt 1 ]; then
        echo 'Nenhum ADMIN existe e INITIAL_ADMIN_PASSWORD está vazio.' >&2
        exit 1
    fi
    echo 'Bootstrap ADMIN ignorado: administrador existente confirmado.'
fi
if [ "${SKIP_STAGING_DEMO_SEED:-0}" != 1 ]; then
    "${COMPOSE[@]}" run --rm -e ALLOW_STAGING_DEMO_SEED=I_UNDERSTAND_STAGING_DEMO app npm run staging:seed
fi
"${COMPOSE[@]}" up -d --remove-orphans

for attempt in $(seq 1 30); do
    if "${COMPOSE[@]}" exec -T app node -e \
        "fetch('http://127.0.0.1:' + process.env.APP_PORT + '/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
        break
    fi
    if [ "$attempt" -eq 30 ]; then
        "${COMPOSE[@]}" logs --tail=200 app db caddy
        exit 1
    fi
    sleep 2
done

mkdir -p .deployments
REVISION=$(git rev-parse HEAD 2>/dev/null || printf 'bundle-without-git')
SOURCE_SHA=$(find package.json package-lock.json index.js Dockerfile .dockerignore \
    compose.yaml compose.staging.yaml Caddyfile Caddyfile.staging src scripts mysql \
    -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}')
printf '%s revision=%s source_sha256=%s\n' "$(date -u +%FT%TZ)" "$REVISION" "$SOURCE_SHA" \
    >> .deployments/staging-history.log
"${COMPOSE[@]}" ps
