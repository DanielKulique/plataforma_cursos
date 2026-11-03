#!/usr/bin/env bash
set -Eeuo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"
COMPOSE_ENV_FILE=${COMPOSE_ENV_FILE:-.env.production}
COMPOSE=(docker compose --env-file "$COMPOSE_ENV_FILE" -f compose.yaml)
if [[ -n "${COMPOSE_OVERRIDE_FILE:-}" ]]; then COMPOSE+=(-f "$COMPOSE_OVERRIDE_FILE"); fi

backup_dir=''
target=''
mode='in-place'
apply=false
while (($#)); do
    case "$1" in
        --backup) backup_dir=${2:-}; shift 2 ;;
        --target) target=${2:-}; shift 2 ;;
        --mode) mode=${2:-}; shift 2 ;;
        --apply) apply=true; shift ;;
        *) echo "Opção inválida: $1" >&2; exit 64 ;;
    esac
done

[[ -n "$backup_dir" && -n "$target" ]] || {
    echo 'Uso: restore_database.sh --backup <diretório> --target <nome> [--mode in-place|isolated] [--apply]' >&2; exit 64;
}
[[ "$target" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$ ]] || { echo 'Target inválido.' >&2; exit 64; }
[[ "$mode" == in-place || "$mode" == isolated ]] || { echo 'Modo inválido.' >&2; exit 64; }
if [[ "$mode" == in-place ]]; then
    configured_target=$(sed -n 's/^APP_ENV=//p' "$COMPOSE_ENV_FILE" 2>/dev/null | tail -n 1)
    if [[ -z "$configured_target" ]] && grep -Eq '^NODE_ENV=production$' "$COMPOSE_ENV_FILE" 2>/dev/null; then
        configured_target=production
    fi
    [[ -n "$configured_target" && "$target" == "$configured_target" ]] || {
        echo "Target não corresponde ao ambiente configurado: esperado ${configured_target:-indefinido}." >&2
        exit 64
    }
fi
if [[ "$mode" == isolated ]]; then
    source "$ROOT/scripts/lib/restore-isolation.sh"
    # Refuse standalone isolated calls without the drill's validated, owned model.
    # In particular, do not start the backup verifier with inherited production mounts.
    restore_use_snapshot
    DB_NAME=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["services"]["app"]["environment"]["DB_NAME"])' "$RESTORE_ISOLATION_CONFIG")
else
    DB_NAME=${DB_NAME:-$(sed -n 's/^DB_NAME=//p' "$COMPOSE_ENV_FILE" 2>/dev/null | tail -n 1)}
fi

backup_dir=$(realpath "$backup_dir")
backup_id=$(basename "$backup_dir")
[[ "$backup_id" =~ ^backup-[0-9]{8}T[0-9]{6}Z-[0-9a-f-]{36}$ ]] || { echo 'backup_id inválido.' >&2; exit 64; }
if [[ "$mode" == isolated ]]; then
    python3 "$ROOT/scripts/lib/restore-isolation.py" backup-path \
        --project "$COMPOSE_PROJECT_NAME" --snapshot "$RESTORE_ISOLATION_CONFIG" --path "$backup_dir"
fi
backup_cli() {
    "${COMPOSE[@]}" run --rm --no-deps -T -v "$backup_dir:/backup/$backup_id:ro" app node scripts/backup_manifest.js "$1" --dir "/backup/$backup_id"
}

echo "Target: $target"
echo "Database: $DB_NAME"
echo 'Storage: volumes privados materials + certificates'
echo "Mode: $([[ "$apply" == true ]] && echo APPLY || echo DRY_RUN) ($mode)"

# PREFLIGHT: nenhuma alteração antes de todas as verificações abaixo.
started=$(date +%s)
backup_cli verify --dir "$backup_dir" >/dev/null
gzip -t "$backup_dir/database.sql.gz"
"${COMPOSE[@]}" config --quiet
[[ "$DB_NAME" =~ ^[A-Za-z0-9_]+$ ]] || { echo 'DB_NAME inseguro.' >&2; exit 1; }
if [[ "$mode" == isolated ]]; then
    python3 -c 'import json,sys; c=json.load(open(sys.argv[1])); a=c["services"]["app"]["environment"]; d=c["services"]["db"]["environment"]; sys.exit(0 if a.get("DB_PASSWORD") and a.get("JWT_SECRET") and d.get("MYSQL_ROOT_PASSWORD") else 1)' "$RESTORE_ISOLATION_CONFIG"
else
    [[ -f "$COMPOSE_ENV_FILE" ]] || { echo "Arquivo de ambiente ausente: $COMPOSE_ENV_FILE" >&2; exit 1; }
    for required in DB_PASSWORD MYSQL_ROOT_PASSWORD JWT_SECRET; do
        grep -Eq "^${required}=.+" "$COMPOSE_ENV_FILE" || { echo "Secret externo ausente: $required" >&2; exit 1; }
    done
fi
if [[ "$mode" == in-place ]]; then
    "${COMPOSE[@]}" run --rm --no-deps -T app npm run db:identity:verify
fi
required_kb=$(du -sk "$backup_dir" | awk '{print $1 * 3}')
available_kb=$(df -Pk "$ROOT" | awk 'NR==2 {print $4}')
(( available_kb > required_kb )) || { echo 'Espaço livre insuficiente para restore.' >&2; exit 1; }
manifest_mysql=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["database"].get("mysql_version", ""), end="")' "$backup_dir/manifest.json")
manifest_database=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["database"].get("name", ""), end="")' "$backup_dir/manifest.json")
manifest_identity=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["database"].get("environment_identity", ""), end="")' "$backup_dir/manifest.json")
if [[ "$mode" == isolated ]]; then
    expected_identity=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["services"]["app"]["environment"]["DB_ENVIRONMENT_IDENTITY"])' "$RESTORE_ISOLATION_CONFIG")
else
    expected_identity=$(sed -n 's/^DB_ENVIRONMENT_IDENTITY=//p' "$COMPOSE_ENV_FILE" | tail -n 1 | tr -d '\r')
fi
[[ "$manifest_database" == "$DB_NAME" && -n "$expected_identity" && "$manifest_identity" == "$expected_identity" ]] || {
    echo 'Backup pertence a database/identidade diferente do destino.' >&2; exit 1;
}
running_mysql=$("${COMPOSE[@]}" exec -T db sh -c 'mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" -Nse "SELECT VERSION()" "$MYSQL_DATABASE"' 2>/dev/null || true)
[[ -n "$running_mysql" && "${running_mysql%%.*}" == "${manifest_mysql%%.*}" ]] || { echo 'Versão principal do MySQL incompatível ou DB indisponível.' >&2; exit 1; }
preflight_seconds=$(( $(date +%s) - started ))
echo "PREFLIGHT_OK backup_id=$(basename "$backup_dir") format_version=1 mysql=$running_mysql"

if [[ "$apply" != true ]]; then
    echo 'DRY_RUN_OK: banco e storage não foram alterados.'
    exit 0
fi

phase_started=$(date +%s)
app_stopped=false
restore_success=false
if [[ "$mode" == in-place ]]; then
    "${COMPOSE[@]}" stop --timeout 30 app >/dev/null
    app_stopped=true
    if "${COMPOSE[@]}" ps --status running app --quiet | grep -q .; then
        echo 'Falha ao suspender writes da aplicação.' >&2; exit 1
    fi
else
    if "${COMPOSE[@]}" ps --status running app --quiet | grep -q .; then
        echo 'Stack isolada já possui app aceitando writes.' >&2; exit 1
    fi
fi
maintenance_seconds=$(( $(date +%s) - phase_started ))

# O target final deve representar somente o snapshot, nunca dados antigos + restaurados.
phase_started=$(date +%s)
"${COMPOSE[@]}" exec -T db sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "DROP DATABASE IF EXISTS \`$MYSQL_DATABASE\`; CREATE DATABASE \`$MYSQL_DATABASE\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL PRIVILEGES ON \`$MYSQL_DATABASE\`.* TO '\''$MYSQL_USER'\''@'\''%'\''; FLUSH PRIVILEGES"'
if [[ "${RESTORE_FAILURE_INJECTION:-}" == mysql ]]; then echo 'RESTORE_FAILURE_INJECTION=mysql' >&2; exit 88; fi
gzip -dc "$backup_dir/database.sql.gz" | "${COMPOSE[@]}" exec -T db sh -c 'exec mysql -u"$MYSQL_USER" -p"$MYSQL_PASSWORD" "$MYSQL_DATABASE"'
db_seconds=$(( $(date +%s) - phase_started ))

restore_namespace() {
    local namespace=$1 source=$2
    tar -C "$source" -cf - . | "${COMPOSE[@]}" run --rm --no-deps -T -e RESTORE_NAMESPACE="$namespace" -e RESTORE_ID="$(basename "$backup_dir")" app sh -c '
        set -eu
        if [ "$RESTORE_NAMESPACE" = materials ]; then root=${MATERIAL_STORAGE_DIR:-/app/storage/materials}; expected=/app/storage/materials;
        else root=${CERTIFICATE_STORAGE_DIR:-/app/storage/certificates}; expected=/app/storage/certificates; fi
        [ "$root" = "$expected" ] || { echo "Storage root inesperado." >&2; exit 1; }
        stage="$root/.restore-$RESTORE_ID"
        rm -rf -- "$stage"
        mkdir -m 700 "$stage"
        tar -C "$stage" -xf -
        find "$stage" -mindepth 1 -maxdepth 1 -type f ! -name "*.pdf" -print -quit | grep -q . && { echo "Arquivo inesperado." >&2; exit 1; }
        find "$root" -mindepth 1 -maxdepth 1 ! -name ".restore-$RESTORE_ID" -exec rm -rf -- {} +
        find "$stage" -mindepth 1 -maxdepth 1 -type f -exec chmod 600 {} +
        find "$stage" -mindepth 1 -maxdepth 1 -type f -exec mv -t "$root" -- {} +
        rmdir "$stage"
        chmod 700 "$root"'
}

phase_started=$(date +%s)
restore_namespace materials "$backup_dir/storage/materials"
restore_namespace certificates "$backup_dir/storage/certificates"
storage_seconds=$(( $(date +%s) - phase_started ))

phase_started=$(date +%s)
"${COMPOSE[@]}" run --rm --no-deps -T app npm run db:schema:verify
"${COMPOSE[@]}" run --rm --no-deps -T -v "$backup_dir:/backup:ro" app node scripts/verify_restored_backup.js /backup
reconcile_seconds=$(( $(date +%s) - phase_started ))

phase_started=$(date +%s)
"${COMPOSE[@]}" up -d app >/dev/null
for attempt in $(seq 1 30); do
    if "${COMPOSE[@]}" exec -T app node -e "fetch('http://127.0.0.1:' + process.env.APP_PORT + '/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then break; fi
    [[ "$attempt" != 30 ]] || { echo 'Health pós-restore falhou; aplicação permanece fora do tráfego.' >&2; "${COMPOSE[@]}" stop app >/dev/null; exit 1; }
    sleep 2
done
startup_seconds=$(( $(date +%s) - phase_started ))
restore_success=true
total_seconds=$(( $(date +%s) - started ))

report_dir=${RESTORE_REPORT_DIR:-$ROOT/.restore-reports}
mkdir -p "$report_dir"
report="$report_dir/$(basename "$backup_dir")-$target.json"
python3 -c 'import datetime,json,os,sys; file,bid,target,mode,total,preflight,maintenance,db,storage,reconcile,startup=sys.argv[1:]; value={"backup_id":bid,"target":target,"mode":mode,"status":"RESTORE_VERIFIED","completed_at":datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00","Z"),"duration_seconds":{"total":int(total),"preflight":int(preflight),"maintenance":int(maintenance),"database":int(db),"storage":int(storage),"reconciliation":int(reconcile),"startup":int(startup)}}; fd=os.open(file,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600); os.write(fd,(json.dumps(value,indent=2)+"\n").encode()); os.close(fd)' \
    "$report" "$(basename "$backup_dir")" "$target" "$mode" "$total_seconds" "$preflight_seconds" "$maintenance_seconds" "$db_seconds" "$storage_seconds" "$reconcile_seconds" "$startup_seconds"
echo "RESTORE_VERIFIED backup_id=$(basename "$backup_dir") duration_seconds=$total_seconds report=$report"
