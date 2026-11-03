#!/usr/bin/env bash
set -Eeuo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"
umask 077
source "$ROOT/scripts/lib/backup-offsite-permissions.sh"
BACKUP_REMOTE_PROVIDER=${BACKUP_REMOTE_PROVIDER:-azure}
AZURE_STORAGE_CONTAINER=${AZURE_STORAGE_CONTAINER:-plataforma-backups}
BACKUP_REMOTE_PREFIX=${BACKUP_REMOTE_PREFIX:-plataforma-cursos/backups}
BACKUP_OFFSITE_RETENTION_DAYS=${BACKUP_OFFSITE_RETENTION_DAYS:-30}
COMPOSE_ENV_FILE=${COMPOSE_ENV_FILE:-.env.production}
COMPOSE=(docker compose --env-file "$COMPOSE_ENV_FILE" -f compose.yaml)
if [[ -n "${COMPOSE_OVERRIDE_FILE:-}" ]]; then COMPOSE+=(-f "$COMPOSE_OVERRIDE_FILE"); fi

if [[ -n "${RESTORE_ISOLATION_CONFIG:-}" ]]; then
    source "$ROOT/scripts/lib/restore-isolation.sh"
    restore_use_snapshot
    [[ "${1:-}" == download ]] || { echo 'Restore isolado permite somente download offsite.' >&2; exit 1; }
    python3 "$ROOT/scripts/lib/restore-isolation.py" download-path \
        --project "$COMPOSE_PROJECT_NAME" --snapshot "$RESTORE_ISOLATION_CONFIG" --path "${3:-}"
fi

fail() { echo "BACKUP_OFFSITE_FAILED: $*" >&2; exit 1; }
az_storage() { az storage "$@" --account-name "$AZURE_STORAGE_ACCOUNT" --auth-mode login; }
backup_verify() {
    local directory=$1 backup_id
    backup_id=$(basename "$directory")
    if [[ -n "${RESTORE_ISOLATION_CONFIG:-}" ]]; then
        python3 "$ROOT/scripts/lib/restore-isolation.py" backup-path \
            --project "$COMPOSE_PROJECT_NAME" --snapshot "$RESTORE_ISOLATION_CONFIG" --path "$directory"
    fi
    "${COMPOSE[@]}" run --rm --no-deps -T -v "$directory:/backup/$backup_id:ro" app node scripts/backup_manifest.js verify --dir "/backup/$backup_id" >/dev/null
    printf 'OFFSITE_MANIFEST_GOOD backup_id=%s\n' "$backup_id"
}
backup_verifier_identity() {
    local identity
    identity=$("${COMPOSE[@]}" run --rm --no-deps -T app sh -c 'printf "%s:%s\n" "$(id -u)" "$(id -g)"') || fail 'não foi possível identificar o usuário verificador.'
    [[ "$identity" =~ ^[0-9]+:[0-9]+$ ]] || fail 'identidade do verificador inválida.'
    printf '%s\n' "$identity"
}

[[ "$BACKUP_REMOTE_PROVIDER" == azure ]] || fail 'provider não suportado.'
: "${AZURE_STORAGE_ACCOUNT:?Defina AZURE_STORAGE_ACCOUNT}"
[[ "$AZURE_STORAGE_ACCOUNT" =~ ^[a-z0-9]{3,24}$ ]] || fail 'storage account inválido.'
[[ "$AZURE_STORAGE_CONTAINER" =~ ^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$ ]] || fail 'container inválido.'
[[ "$BACKUP_REMOTE_PREFIX" =~ ^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)+$ ]] || fail 'prefixo remoto inválido.'
[[ "$BACKUP_REMOTE_PREFIX" != *..* && "$BACKUP_REMOTE_PREFIX" != /* && "$BACKUP_REMOTE_PREFIX" != */ ]] || fail 'prefixo remoto inseguro.'
[[ "$BACKUP_OFFSITE_RETENTION_DAYS" =~ ^[0-9]+$ ]] && (( BACKUP_OFFSITE_RETENTION_DAYS >= 1 )) || fail 'retenção remota inválida.'
command -v az >/dev/null || fail 'Azure CLI ausente.'
if ! az account show --output none 2>/dev/null; then az login --identity --allow-no-subscriptions --output none >/dev/null; fi

public_access=$(az_storage container show --name "$AZURE_STORAGE_CONTAINER" --query properties.publicAccess -o tsv)
[[ -z "$public_access" || "$public_access" == None || "$public_access" == null ]] || fail 'container remoto é público.'

upload() (
    local backup_dir=$1 backup_id package downloaded completion sidecar latest sha remote_root created cutoff newest marker rest id stamp epoch
    backup_dir=$(realpath "$backup_dir")
    backup_id=$(basename "$backup_dir")
    [[ "$backup_id" =~ ^backup-[0-9]{8}T[0-9]{6}Z-[0-9a-f-]{36}$ ]] || fail 'backup_id inválido.'
    backup_verify "$backup_dir"
    remote_root="$BACKUP_REMOTE_PREFIX/$backup_id"
    package=$(mktemp "${TMPDIR:-/tmp}/$backup_id.XXXXXX.tar.gz")
    downloaded=$(mktemp "${TMPDIR:-/tmp}/$backup_id.download.XXXXXX.tar.gz")
    completion=$(mktemp "${TMPDIR:-/tmp}/$backup_id.complete.XXXXXX.json")
    sidecar=$(mktemp "${TMPDIR:-/tmp}/$backup_id.sha256.XXXXXX")
    latest=$(mktemp "${TMPDIR:-/tmp}/$backup_id.latest.XXXXXX.json")
    trap 'rm -f -- "$package" "$downloaded" "$completion" "$sidecar" "$latest"' EXIT
    created=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["created_at"], end="")' "$backup_dir/manifest.json")
    tar --sort=name --owner=0 --group=0 --numeric-owner --mtime="$created" -C "$(dirname "$backup_dir")" -czf "$package" "$backup_id"
    sha=$(sha256sum "$package" | awk '{print $1}')
    az_storage blob upload --container-name "$AZURE_STORAGE_CONTAINER" --name "$remote_root/package.tar.gz" --file "$package" --overwrite true --only-show-errors >/dev/null
    if [[ "${BACKUP_FAILURE_INJECTION:-}" == during_upload ]]; then
        echo "BACKUP_FAILURE_INJECTION=during_upload remote_prefix=$remote_root completion_marker=ABSENT" >&2
        return 87
    fi
    printf '%s  package.tar.gz\n' "$sha" >"$sidecar"
    az_storage blob upload --container-name "$AZURE_STORAGE_CONTAINER" --name "$remote_root/package.sha256" --file "$sidecar" --overwrite true --only-show-errors >/dev/null
    az_storage blob download --container-name "$AZURE_STORAGE_CONTAINER" --name "$remote_root/package.tar.gz" --file "$downloaded" --overwrite true --only-show-errors >/dev/null
    [[ "$(sha256sum "$downloaded" | awk '{print $1}')" == "$sha" ]] || fail 'checksum após download divergiu.'
    printf '{"format_version":1,"backup_id":"%s","status":"COMPLETE","created_at":"%s","package_sha256":"%s"}\n' "$backup_id" "$created" "$sha" >"$completion"
    az_storage blob upload --container-name "$AZURE_STORAGE_CONTAINER" --name "$remote_root/complete.json" --file "$completion" --overwrite true --only-show-errors >/dev/null
    printf '{"format_version":1,"backup_id":"%s","created_at":"%s","updated_at":"%s"}\n' "$backup_id" "$created" "$(date -u +%FT%TZ)" >"$latest"
    az_storage blob upload --container-name "$AZURE_STORAGE_CONTAINER" --name "$BACKUP_REMOTE_PREFIX/latest-good.json" --file "$latest" --overwrite true --only-show-errors >/dev/null

    # Cleanup somente depois do novo COMPLETE. O prefixo e cada ID são revalidados.
    cutoff=$(( $(date +%s) - BACKUP_OFFSITE_RETENTION_DAYS * 86400 ))
    newest=$backup_id
    while IFS= read -r marker; do
        [[ "$marker" == "$BACKUP_REMOTE_PREFIX/"*/complete.json ]] || continue
        rest=${marker#"$BACKUP_REMOTE_PREFIX/"}
        id=${rest%/complete.json}
        [[ "$id" =~ ^backup-[0-9]{8}T[0-9]{6}Z-[0-9a-f-]{36}$ ]] || continue
        [[ "$id" == "$newest" ]] && continue
        stamp=${id#backup-}; stamp=${stamp%%-*}
        epoch=$(date -u -d "${stamp:0:8} ${stamp:9:2}:${stamp:11:2}:${stamp:13:2}" +%s 2>/dev/null || printf 0)
        if (( epoch > 0 && epoch < cutoff )); then
            az_storage blob delete-batch --source "$AZURE_STORAGE_CONTAINER" --pattern "$BACKUP_REMOTE_PREFIX/$id/*" --only-show-errors >/dev/null
        fi
    done < <(az_storage blob list --container-name "$AZURE_STORAGE_CONTAINER" --prefix "$BACKUP_REMOTE_PREFIX/" --query "[?ends_with(name, '/complete.json')].name" -o tsv)
    printf 'OFFSITE_GOOD backup_id=%s target=azure://%s/%s/%s package_sha256=%s\n' "$backup_id" "$AZURE_STORAGE_ACCOUNT" "$AZURE_STORAGE_CONTAINER" "$remote_root" "$sha"
)

download() (
    local requested=$1 destination=$2 pointer backup_id remote_root package completion expected actual listing extract_root verifier_identity
    mkdir -p "$destination"
    destination=$(realpath "$destination")
    pointer=$(mktemp "$destination/.partial-latest.XXXXXX.json")
    trap 'rm -f -- "$pointer" "${package:-}" "${completion:-}" "${listing:-}"; [[ -z "${extract_root:-}" ]] || rm -rf -- "$extract_root"' EXIT
    if [[ "$requested" == latest ]]; then
        az_storage blob download --container-name "$AZURE_STORAGE_CONTAINER" \
            --name "$BACKUP_REMOTE_PREFIX/latest-good.json" --file "$pointer" \
            --overwrite true --only-show-errors >/dev/null
        backup_id=$(python3 -c 'import json,re,sys; x=json.load(open(sys.argv[1],encoding="utf-8")); bid=x.get("backup_id",""); ok=x.get("format_version")==1 and re.fullmatch(r"backup-[0-9]{8}T[0-9]{6}Z-[0-9a-f-]{36}",bid); print(bid,end="") if ok else sys.exit(2)' "$pointer")
    else backup_id=$requested; fi
    [[ "$backup_id" =~ ^backup-[0-9]{8}T[0-9]{6}Z-[0-9a-f-]{36}$ ]] || fail 'backup_id remoto inválido.'
    remote_root="$BACKUP_REMOTE_PREFIX/$backup_id"
    package=$(mktemp "$destination/.partial-$backup_id.XXXXXX.tar.gz")
    completion=$(mktemp "$destination/.partial-$backup_id.XXXXXX.json")
    listing=$(mktemp "$destination/.partial-$backup_id.XXXXXX.list")
    extract_root="$destination/.extract-$backup_id"
    az_storage blob download --container-name "$AZURE_STORAGE_CONTAINER" --name "$remote_root/complete.json" --file "$completion" --overwrite true --only-show-errors >/dev/null
    expected=$(python3 -c 'import json,re,sys; x=json.load(open(sys.argv[1], encoding="utf-8")); ok=x.get("status")=="COMPLETE" and x.get("backup_id")==sys.argv[2] and re.fullmatch(r"[0-9a-f]{64}",x.get("package_sha256", "")); print(x["package_sha256"], end="") if ok else sys.exit(2)' "$completion" "$backup_id")
    az_storage blob download --container-name "$AZURE_STORAGE_CONTAINER" --name "$remote_root/package.tar.gz" --file "$package" --overwrite true --only-show-errors >/dev/null
    actual=$(sha256sum "$package" | awk '{print $1}')
    [[ "$actual" == "$expected" ]] || fail 'SHA-256 do pacote remoto divergiu.'
    printf 'OFFSITE_PACKAGE_SHA256_GOOD backup_id=%s sha256=%s\n' "$backup_id" "$actual"
    tar -tzf "$package" >"$listing"
    python3 -c 'import sys; names=[x for x in open(sys.argv[1], encoding="utf-8").read().splitlines() if x]; bid=sys.argv[2]; sys.exit(0 if all((n in (bid,bid+"/") or n.startswith(bid+"/")) and ".." not in n.split("/") and not n.startswith("/") for n in names) else 2)' "$listing" "$backup_id" || fail 'pacote contém caminho inseguro.'
    if tar -tvzf "$package" | awk 'substr($1,1,1) ~ /[lhbcp]/ { bad=1 } END { exit bad ? 0 : 1 }'; then fail 'pacote contém entrada não regular.'; fi
    rm -rf -- "$extract_root"
    mkdir -m 700 -- "$extract_root"
    # --no-same-owner evita confiar no owner do tar, mas root ainda cria arquivos root:root.
    # Normalize somente a árvore temporária para o UID/GID real do serviço verificador.
    tar -xzf "$package" -C "$extract_root" --no-same-owner --no-same-permissions
    verifier_identity=$(backup_verifier_identity)
    backup_prepare_verifier_tree "$extract_root" "$verifier_identity" || fail 'não foi possível preparar a árvore privada do verificador.'
    backup_verify "$extract_root/$backup_id"
    [[ ! -e "$destination/$backup_id" ]] || fail 'destino do download já existe.'
    mv -- "$extract_root/$backup_id" "$destination/$backup_id"
    rmdir -- "$extract_root"
    printf '%s\n' "$destination/$backup_id"
)

case "${1:-}" in
    upload) [[ $# == 2 ]] || fail 'uso: backup_offsite.sh upload <backup-dir>'; upload "$2" ;;
    download) [[ $# == 3 ]] || fail 'uso: backup_offsite.sh download <latest|backup-id> <destino>'; download "$2" "$3" ;;
    *) fail 'uso: backup_offsite.sh upload|download ...' ;;
esac
