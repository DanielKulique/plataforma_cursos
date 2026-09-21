#!/usr/bin/env bash
set -Eeuo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"
: "${BACKUP_DIR:?Defina BACKUP_DIR}"
RPO_HOURS=${RPO_HOURS:-24}
COMPOSE_ENV_FILE=${COMPOSE_ENV_FILE:-.env.production}
COMPOSE=(docker compose --env-file "$COMPOSE_ENV_FILE" -f compose.yaml)
if [[ -n "${COMPOSE_OVERRIDE_FILE:-}" ]]; then COMPOSE+=(-f "$COMPOSE_OVERRIDE_FILE"); fi
local_status=$("${COMPOSE[@]}" run --rm --no-deps -T -v "$BACKUP_DIR:$BACKUP_DIR:ro" app \
    node scripts/backup_manifest.js status --root "$BACKUP_DIR" --rpo-hours "$RPO_HOURS")
remote_completion='null'

if [[ "${BACKUP_OFFSITE_ENABLED:-false}" == true ]]; then
    : "${AZURE_STORAGE_ACCOUNT:?Defina AZURE_STORAGE_ACCOUNT}"
    AZURE_STORAGE_CONTAINER=${AZURE_STORAGE_CONTAINER:-plataforma-backups}
    BACKUP_REMOTE_PREFIX=${BACKUP_REMOTE_PREFIX:-plataforma-cursos/backups}
    if ! az account show --output none 2>/dev/null; then az login --identity --allow-no-subscriptions --output none >/dev/null; fi
    pointer=$(mktemp "${TMPDIR:-/tmp}/backup-status-pointer.XXXXXX.json")
    completion=$(mktemp "${TMPDIR:-/tmp}/backup-status-completion.XXXXXX.json")
    trap 'rm -f "$pointer" "$completion"' EXIT
    if az storage blob download --account-name "$AZURE_STORAGE_ACCOUNT" --container-name "$AZURE_STORAGE_CONTAINER" \
        --auth-mode login --name "$BACKUP_REMOTE_PREFIX/latest-good.json" --file "$pointer" --overwrite true --only-show-errors >/dev/null 2>&1; then
        remote_id=$(python3 -c 'import json,re,sys; x=json.load(open(sys.argv[1],encoding="utf-8")); bid=x.get("backup_id",""); print(bid,end="") if x.get("format_version")==1 and re.fullmatch(r"backup-[0-9]{8}T[0-9]{6}Z-[0-9a-f-]{36}",bid) else sys.exit(2)' "$pointer" 2>/dev/null || true)
        if [[ -n "$remote_id" ]] && az storage blob download --account-name "$AZURE_STORAGE_ACCOUNT" --container-name "$AZURE_STORAGE_CONTAINER" \
            --auth-mode login --name "$BACKUP_REMOTE_PREFIX/$remote_id/complete.json" --file "$completion" --overwrite true --only-show-errors >/dev/null 2>&1; then
            remote_completion=$(python3 -c 'import json,re,sys; x=json.load(open(sys.argv[1],encoding="utf-8")); ok=x.get("status")=="COMPLETE" and x.get("backup_id")==sys.argv[2] and re.fullmatch(r"[0-9a-f]{64}",x.get("package_sha256","")); print(json.dumps(x),end="") if ok else sys.exit(2)' "$completion" "$remote_id" 2>/dev/null || printf null)
        fi
    fi
fi

python3 -c 'import datetime,json,sys; local=json.loads(sys.argv[1]); remote=json.loads(sys.argv[2]); hours=float(sys.argv[3]); now=datetime.datetime.now(datetime.timezone.utc); parse=lambda x:datetime.datetime.fromisoformat(x.replace("Z","+00:00")); state=lambda created:{"status":"RPO_AT_RISK","age_seconds":None} if not created else (lambda age:{"status":"RPO_OK" if age<=hours*3600 else "RPO_AT_RISK","age_seconds":max(0,int(age))})((now-parse(created)).total_seconds()); result={"checked_at":now.isoformat().replace("+00:00","Z"),"rpo_target_hours":hours,"local":{"backup_id":local.get("backup_id"),"created_at":local.get("created_at"),**state(local.get("created_at"))},"offsite":{"backup_id":remote.get("backup_id") if remote else None,"created_at":remote.get("created_at") if remote else None,**state(remote.get("created_at") if remote else None)}}; result["status"]="RPO_OK" if result["local"]["status"]==result["offsite"]["status"]=="RPO_OK" else "RPO_AT_RISK"; print(json.dumps(result,indent=2));sys.exit(0 if result["status"]=="RPO_OK" else 2)' "$local_status" "$remote_completion" "$RPO_HOURS"
