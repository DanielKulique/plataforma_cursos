#!/usr/bin/env bash
set -Eeuo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"
: "${BACKUP_DRILL_DIR:?Defina BACKUP_DRILL_DIR fora do storage da aplicação}"
umask 077
COMPOSE_ENV_FILE=${RESTORE_DRILL_ENV_FILE:-${COMPOSE_ENV_FILE:-.env.staging}}
COMPOSE_OVERRIDE_FILE=${RESTORE_DRILL_OVERRIDE_FILE:-compose.restore-drill.yaml}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
project="plataforma-restore-${timestamp,,}"
COMPOSE_PROJECT_NAME=$project
export COMPOSE_PROJECT_NAME COMPOSE_ENV_FILE COMPOSE_OVERRIDE_FILE
COMPOSE=(docker compose --project-name "$project" --env-file "$COMPOSE_ENV_FILE" -f compose.yaml -f "$COMPOSE_OVERRIDE_FILE")
download_dir="$BACKUP_DRILL_DIR/downloads/$timestamp"
report_dir="$BACKUP_DRILL_DIR/reports/$timestamp"
compose_isolated=false

cleanup() {
    local status=$? leftovers
    trap - EXIT INT TERM
    if [[ "$compose_isolated" == true ]]; then
        "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
        docker image rm "$project-app" >/dev/null 2>&1 || true
    fi
    leftovers=$(docker ps -aq --filter "label=com.docker.compose.project=$project" || true; docker volume ls -q --filter "label=com.docker.compose.project=$project" || true; docker network ls -q --filter "label=com.docker.compose.project=$project" || true)
    if [[ -z "$leftovers" ]] && rm -rf -- "$download_dir" "$report_dir" && [[ ! -e "$download_dir" && ! -e "$report_dir" ]]; then
        echo "RESTORE_DRILL_TEMP_CLEANUP PASS project=$project"
    else
        echo "RESTORE_DRILL_TEMP_CLEANUP FAIL project=$project" >&2
        status=1
    fi
    exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -p "$download_dir" "$report_dir"

# Nunca permita que um override com nomes fixos reutilize volumes permanentes.
if ! "${COMPOSE[@]}" config --format json | python3 -c 'import json,sys; project=sys.argv[1]; config=json.load(sys.stdin); names=[volume.get("name", key) for key,volume in config.get("volumes",{}).items()]; sys.exit(0 if names and all(name.startswith(project+"_") for name in names) else 1)' "$project"; then
    echo 'O projeto de restore não possui volumes exclusivos.' >&2
    exit 1
fi
compose_isolated=true

started=$(date +%s)
# O project name isolado também dá um nome próprio à imagem; construa-a sem iniciar serviços.
build_started=$started
"${COMPOSE[@]}" build app >/dev/null
build_seconds=$(( $(date +%s) - build_started ))
download_started=$(date +%s)
download_output=$(scripts/backup_offsite.sh download latest "$download_dir")
backup_dir=$(printf '%s\n' "$download_output" | tail -n 1)
printf '%s\n' "$download_output" | sed '$d'
download_seconds=$(( $(date +%s) - download_started ))
"${COMPOSE[@]}" up -d db >/dev/null
for attempt in $(seq 1 30); do
    "${COMPOSE[@]}" exec -T db sh -c 'mysqladmin ping -h 127.0.0.1 -uroot -p"$MYSQL_ROOT_PASSWORD" --silent' >/dev/null 2>&1 && break
    [[ "$attempt" != 30 ]] || { echo 'MySQL isolado não ficou saudável.' >&2; exit 1; }
    sleep 2
done
RESTORE_REPORT_DIR="$report_dir" scripts/restore_database.sh \
    --backup "$backup_dir" --target isolated-offsite-drill --mode isolated --apply
restore_report="$report_dir/$(basename "$backup_dir")-isolated-offsite-drill.json"

# Health é obrigatório. Autenticação também é verificada quando o operador fornece o arquivo
# externo de credenciais; os valores seguem apenas por stdin e nunca aparecem em logs/argv.
smoke_started=$(date +%s)
smoke_mode=HEALTH_ONLY
smoke_email=''
smoke_password=''
if [[ -n "${RESTORE_SMOKE_CREDENTIALS_FILE:-}" ]]; then
    [[ -f "$RESTORE_SMOKE_CREDENTIALS_FILE" ]] || { echo 'Arquivo de credenciais do smoke ausente.' >&2; exit 1; }
    smoke_email=$(sed -n 's/^ADMIN_EMAIL=//p' "$RESTORE_SMOKE_CREDENTIALS_FILE" | tail -n 1 | tr -d '\r')
    smoke_password=$(sed -n 's/^ADMIN_PASSWORD=//p' "$RESTORE_SMOKE_CREDENTIALS_FILE" | tail -n 1 | tr -d '\r')
    [[ -n "$smoke_email" && -n "$smoke_password" ]] || { echo 'Credenciais de smoke incompletas.' >&2; exit 1; }
    smoke_mode=AUTHENTICATED
fi
printf '%s\n%s\n' "$smoke_email" "$smoke_password" | "${COMPOSE[@]}" exec -T app node -e '
let input="";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => { input += chunk; });
process.stdin.on("end", () => {
  (async () => {
    const [email, password] = input.replace(/\r/g, "").split("\n");
    const port = process.env.APP_PORT || "3000";
    const health = await fetch(`http://127.0.0.1:${port}/readyz`);
    if (!health.ok) throw new Error(`health ${health.status}`);
    if (email || password) {
      if (!email || !password) throw new Error("credenciais incompletas");
      const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, senha: password })
      });
      const body = await login.json().catch(() => ({}));
      if (!login.ok || !login.headers.get("set-cookie") || !body.csrf_token) throw new Error(`login ${login.status}`);
    }
    console.log(`RESTORE_SMOKE_OK mode=${email ? "AUTHENTICATED" : "HEALTH_ONLY"}`);
  })().catch(error => { console.error(`RESTORE_SMOKE_FAILED: ${error.message}`); process.exitCode = 1; });
});'
smoke_seconds=$(( $(date +%s) - smoke_started ))
total_seconds=$(( $(date +%s) - started ))
report="$report_dir/$(basename "$backup_dir")-drill-summary.json"
python3 -c 'import datetime,json,os,sys; file,restore_file,bid,total,build,download,smoke,smoke_mode=sys.argv[1:]; restore=json.load(open(restore_file,encoding="utf-8")); value={"backup_id":bid,"source":"OFFSITE","status":"DRILL_VERIFIED","rpo_target_hours":24,"rto_target_hours":4,"rto_observed_seconds":int(total),"duration_seconds":{"build":int(build),"download":int(download),"validation":restore["duration_seconds"]["preflight"],"database":restore["duration_seconds"]["database"],"storage":restore["duration_seconds"]["storage"],"reconciliation":restore["duration_seconds"]["reconciliation"],"startup":restore["duration_seconds"]["startup"],"smoke":int(smoke)},"smoke_mode":smoke_mode,"completed_at":datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00","Z")}; fd=os.open(file,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600); os.write(fd,(json.dumps(value,indent=2)+"\n").encode()); os.close(fd)' \
    "$report" "$restore_report" "$(basename "$backup_dir")" "$total_seconds" "$build_seconds" "$download_seconds" "$smoke_seconds" "$smoke_mode"
echo "RESTORE_DRILL_GOOD backup_id=$(basename "$backup_dir") rto_observed_seconds=$total_seconds"
