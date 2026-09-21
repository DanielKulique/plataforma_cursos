#!/usr/bin/env bash
set -Eeuo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
[[ $(id -u) -ne 0 ]] || { echo 'Execute como operador não-root com sudo.' >&2; exit 1; }
: "${BACKUP_ENV_SOURCE:?Defina BACKUP_ENV_SOURCE para o arquivo preenchido}"
[[ -f "$BACKUP_ENV_SOURCE" ]] || { echo 'Arquivo de configuração ausente.' >&2; exit 1; }
if grep -Eq '<[^>]+>' "$BACKUP_ENV_SOURCE"; then echo 'Configuração ainda contém placeholder.' >&2; exit 1; fi
backup_dir=$(sed -n 's/^BACKUP_DIR=//p' "$BACKUP_ENV_SOURCE" | tail -n 1)
drill_dir=$(sed -n 's/^BACKUP_DRILL_DIR=//p' "$BACKUP_ENV_SOURCE" | tail -n 1)
backup_schedule=$(sed -n 's/^BACKUP_SCHEDULE=//p' "$BACKUP_ENV_SOURCE" | tail -n 1)
backup_schedule=${backup_schedule:-'*-*-* 03:15:00 America/Sao_Paulo'}
if [[ "$backup_schedule" == \'*\' && "$backup_schedule" == *\' ]]; then
    backup_schedule=${backup_schedule:1:${#backup_schedule}-2}
elif [[ "$backup_schedule" == \"*\" && "$backup_schedule" == *\" ]]; then
    backup_schedule=${backup_schedule:1:${#backup_schedule}-2}
fi
[[ "$backup_dir" = /* && "$backup_dir" != / ]] || { echo 'BACKUP_DIR inseguro.' >&2; exit 1; }
[[ "$drill_dir" = /* && "$drill_dir" != / ]] || { echo 'BACKUP_DRILL_DIR inseguro.' >&2; exit 1; }
systemd-analyze calendar "$backup_schedule" >/dev/null || { echo 'BACKUP_SCHEDULE inválido.' >&2; exit 1; }

schedule_override=$(mktemp "${TMPDIR:-/tmp}/plataforma-backup-schedule.XXXXXX")
trap 'rm -f "$schedule_override"' EXIT
printf '[Timer]\nOnCalendar=\nOnCalendar=%s\n' "$backup_schedule" >"$schedule_override"

sudo install -d -m 0750 -o root -g root /etc/plataforma-cursos
sudo install -m 0600 -o root -g root "$BACKUP_ENV_SOURCE" /etc/plataforma-cursos/backup.env
sudo install -d -m 0700 -o azureuser -g azureuser "$backup_dir" "$drill_dir"
sudo install -m 0644 "$ROOT/deploy/systemd/plataforma-backup.service" /etc/systemd/system/plataforma-backup.service
sudo install -m 0644 "$ROOT/deploy/systemd/plataforma-backup.timer" /etc/systemd/system/plataforma-backup.timer
sudo install -d -m 0755 /etc/systemd/system/plataforma-backup.timer.d
sudo install -m 0644 "$schedule_override" /etc/systemd/system/plataforma-backup.timer.d/schedule.conf
sudo systemctl daemon-reload
sudo systemctl enable --now plataforma-backup.timer
sudo systemctl status plataforma-backup.timer --no-pager
sudo systemctl list-timers plataforma-backup.timer --no-pager
