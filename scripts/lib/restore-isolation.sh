#!/usr/bin/env bash

# Called only by the isolated workflow; normal in-place restore/backup is unchanged.
restore_use_snapshot() {
    : "${RESTORE_ISOLATION_CONFIG:?Restore isolado exige snapshot validado pelo restore_drill.sh}"
    : "${COMPOSE_PROJECT_NAME:?Restore isolado exige projeto exclusivo}"
    python3 "$ROOT/scripts/lib/restore-isolation.py" check \
        --project "$COMPOSE_PROJECT_NAME" --snapshot "$RESTORE_ISOLATION_CONFIG" || return
    COMPOSE=(docker compose --project-name "$COMPOSE_PROJECT_NAME" --file "$RESTORE_ISOLATION_CONFIG")
}

# A separate process group lets signal handlers stop the active CLI and its children
# before inspecting/removing this run's resources (including docker compose run).
restore_exec_to() {
    local output=$1
    shift
    # Redirect only the child. Redirecting the controller function would also hide
    # EXIT-trap diagnostics inside a temporary file when interrupted during wait.
    setsid --wait "$@" <&0 > "$output" &
    restore_wait "$!"
}

restore_wait() {
    local status=0
    restore_child_pid=$1
    wait "$restore_child_pid" || status=$?
    restore_child_pid=''
    return "$status"
}

restore_exec() {
    # Inherit stdout's descriptor; opening /dev/stdout with > would truncate a
    # caller's regular log file and corrupt evidence from earlier steps.
    setsid --wait "$@" <&0 &
    restore_wait "$!"
}

restore_signal() {
    local status=$1
    trap '' INT TERM
    if [[ -n "${restore_child_pid:-}" ]]; then
        kill -TERM -- "-$restore_child_pid" 2>/dev/null || true
        wait "$restore_child_pid" 2>/dev/null || true
        restore_child_pid=''
    fi
    exit "$status"
}
