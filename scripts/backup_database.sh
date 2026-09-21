#!/usr/bin/env bash
set -Eeuo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"
: "${BACKUP_DIR:?Defina BACKUP_DIR fora dos volumes protegidos}"
: "${DB_NAME:?Defina DB_NAME}"

BACKUP_LOCAL_RETENTION_DAYS=${BACKUP_LOCAL_RETENTION_DAYS:-7}
BACKUP_OFFSITE_ENABLED=${BACKUP_OFFSITE_ENABLED:-false}
BACKUP_REQUIRE_OFFSITE=${BACKUP_REQUIRE_OFFSITE:-false}
COMPOSE_ENV_FILE=${COMPOSE_ENV_FILE:-.env.production}
COMPOSE=(docker compose --env-file "$COMPOSE_ENV_FILE" -f compose.yaml)
if [[ -n "${COMPOSE_OVERRIDE_FILE:-}" ]]; then COMPOSE+=(-f "$COMPOSE_OVERRIDE_FILE"); fi

[[ "$BACKUP_DIR" = /* ]] || { echo 'BACKUP_DIR deve ser absoluto.' >&2; exit 64; }
[[ "$BACKUP_LOCAL_RETENTION_DAYS" =~ ^[0-9]+$ ]] && (( BACKUP_LOCAL_RETENTION_DAYS >= 1 )) || {
    echo 'BACKUP_LOCAL_RETENTION_DAYS inválido.' >&2; exit 64;
}
if [[ "$BACKUP_REQUIRE_OFFSITE" == true && "$BACKUP_OFFSITE_ENABLED" != true ]]; then
    echo 'Offsite é obrigatório para esta execução.' >&2; exit 64
fi

umask 077
mkdir -p "$BACKUP_DIR"
exec 9>"$BACKUP_DIR/.backup.lock"
if ! flock -n 9; then echo 'BACKUP_ALREADY_RUNNING: outra execução possui o lock.' >&2; exit 75; fi

started_epoch=$(date +%s)
created_at=$(date -u +%FT%TZ)
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_id="backup-${timestamp}-$(tr 'A-F' 'a-f' </proc/sys/kernel/random/uuid)"
partial="$BACKUP_DIR/.partial-$backup_id"
final="$BACKUP_DIR/$backup_id"
lock_pid=''
lock_input=''
lock_output=''
app_was_running=false
app_suspended=false

log() { printf '%s backup_id=%s %s\n' "$(date -u +%FT%TZ)" "$backup_id" "$*"; }
backup_cli() {
    "${COMPOSE[@]}" run --rm --no-deps -T -v "$BACKUP_DIR:$BACKUP_DIR" app node scripts/backup_manifest.js "$@"
}

release_purge_lock() {
    if [[ -n "$lock_pid" ]]; then
        printf "SELECT RELEASE_LOCK('plataforma:backup-storage');\nquit\n" >&"$lock_input" 2>/dev/null || true
        IFS= read -r _release_result <&"$lock_output" 2>/dev/null || true
        wait "$lock_pid" 2>/dev/null || true
        lock_pid=''
    fi
}

resume_app() {
    if [[ "$app_suspended" == true && "$app_was_running" == true ]]; then
        "${COMPOSE[@]}" start app >/dev/null
        local healthy=false
        for _attempt in $(seq 1 30); do
            if "${COMPOSE[@]}" exec -T app node -e "fetch('http://127.0.0.1:' + process.env.APP_PORT + '/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
                healthy=true
                break
            fi
            sleep 1
        done
        app_suspended=false
        [[ "$healthy" == true ]] || { log 'application_writes=RESUME_FAILED'; return 1; }
        log 'application_writes=RESUMED'
    fi
}

cleanup() {
    local status=$?
    release_purge_lock
    resume_app || true
    if (( status != 0 )); then
        rm -rf -- "$partial"
        log "status=FAILED exit_code=$status"
    fi
    exit "$status"
}
trap cleanup EXIT INT TERM

mkdir -p "$partial/storage/materials" "$partial/storage/certificates"
log "status=STARTED destination=$final"

if "${COMPOSE[@]}" ps --status running app --quiet | grep -q .; then app_was_running=true; fi
if [[ "$app_was_running" == true ]]; then
    "${COMPOSE[@]}" stop --timeout 30 app >/dev/null
    app_suspended=true
fi
if "${COMPOSE[@]}" ps --status running app --quiet | grep -q .; then
    echo 'Não foi possível suspender writes da aplicação.' >&2
    exit 1
fi
log 'application_writes=SUSPENDED'

# O reconciliador APPLY usa a mesma trava. A aplicação já está parada, então uploads,
# substituições, emissão/reemissão e purge não podem mudar o ponto de recuperação.
coproc MYSQL_LOCK { "${COMPOSE[@]}" exec -T db sh -c 'exec mysql --unbuffered --batch --skip-column-names -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' 2>/dev/null; }
lock_pid=$MYSQL_LOCK_PID
exec {lock_input}>&"${MYSQL_LOCK[1]}"
exec {lock_output}<&"${MYSQL_LOCK[0]}"
printf "SELECT GET_LOCK('plataforma:backup-storage',30);\n" >&"$lock_input"
IFS= read -r lock_result <&"$lock_output" || true
[[ "$lock_result" == 1 ]] || { echo 'Não foi possível coordenar backup com purge.' >&2; exit 1; }

"${COMPOSE[@]}" run --rm --no-deps -T app node scripts/capture_backup_metadata.js >"$partial/database-metadata.json"
"${COMPOSE[@]}" exec -T db sh -c \
    'exec mysqldump --single-transaction --quick --no-tablespaces --routines --triggers --events --hex-blob --default-character-set=utf8mb4 -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"' \
    | gzip -9 >"$partial/database.sql.gz"
gzip -t "$partial/database.sql.gz"
[[ -s "$partial/database.sql.gz" ]] || { echo 'Dump vazio.' >&2; exit 1; }

if [[ "${BACKUP_FAILURE_INJECTION:-}" == after_dump ]]; then
    echo 'BACKUP_FAILURE_INJECTION=after_dump' >&2
    exit 86
fi

"${COMPOSE[@]}" run --rm --no-deps -T app sh -c \
    'directory=${MATERIAL_STORAGE_DIR:-/app/storage/materials}; test -d "$directory"; exec tar -C "$directory" --exclude="*.pending" -cf - .' \
    | tar -C "$partial/storage/materials" -xf -
"${COMPOSE[@]}" run --rm --no-deps -T app sh -c \
    'directory=${CERTIFICATE_STORAGE_DIR:-/app/storage/certificates}; test -d "$directory"; exec tar -C "$directory" --exclude="*.pending" -cf - .' \
    | tar -C "$partial/storage/certificates" -xf -

release_purge_lock
resume_app

revision=${APP_RELEASE_SHA:-$(git rev-parse HEAD 2>/dev/null || printf unknown)}
dirty=false
if [[ -n "${APP_RELEASE_SHA:-}" ]]; then
    [[ "$APP_RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo 'APP_RELEASE_SHA inválido.' >&2; exit 64; }
elif ! git diff --quiet --ignore-submodules HEAD 2>/dev/null || [[ -n "$(git ls-files --others --exclude-standard 2>/dev/null | head -n 1)" ]]; then dirty=true; fi
source_sha=$(find package.json package-lock.json index.js Dockerfile compose.yaml compose.production.yaml production-content/manifest.json src scripts mysql -type f -print0 \
    | sort -z | xargs -0 sha256sum | sha256sum | awk '{print $1}')
backup_cli create --dir "$partial" --id "$backup_id" --created "$created_at" \
    --metadata "$partial/database-metadata.json" --commit "$revision" --source-sha "$source_sha" --dirty "$dirty"
backup_cli checksums --dir "$partial"
backup_cli verify --dir "$partial" --allow-incomplete

[[ ! -e "$final" ]] || { echo 'Colisão de backup_id.' >&2; exit 1; }
mv "$partial" "$final"
backup_cli complete --dir "$final"

offsite_status=DISABLED
if [[ "$BACKUP_OFFSITE_ENABLED" == true ]]; then
    scripts/backup_offsite.sh upload "$final"
    offsite_status=GOOD
fi
latest_scope=local
if [[ "$offsite_status" == GOOD ]]; then latest_scope=local-and-offsite; fi
backup_cli latest --root "$BACKUP_DIR" --dir "$final" --scope "$latest_scope"

backup_cli retention --root "$BACKUP_DIR" --days "$BACKUP_LOCAL_RETENTION_DAYS"
duration=$(( $(date +%s) - started_epoch ))
size=$(du -sb "$final" | awk '{print $1}')
log "status=GOOD duration_seconds=$duration size_bytes=$size local=$final offsite=$offsite_status"
trap - EXIT INT TERM
printf '%s\n' "$final"
