#!/usr/bin/env bash

backup_prepare_verifier_tree() {
    local root=$1 verifier_identity=$2 unsupported
    [[ -d "$root" && ! -L "$root" ]] || { echo 'Árvore temporária de verificação inválida.' >&2; return 1; }
    [[ "$verifier_identity" =~ ^[0-9]+:[0-9]+$ ]] || { echo 'UID/GID do verificador inválido.' >&2; return 1; }
    unsupported=$(find "$root" -mindepth 1 ! -type d ! -type f -print -quit)
    [[ -z "$unsupported" ]] || { echo 'Árvore de verificação contém entrada não regular.' >&2; return 1; }

    # root extrai em uma área privada; somente essa árvore temporária muda de owner.
    chown -R -- "$verifier_identity" "$root"
    find "$root" -type d -exec chmod 700 -- {} +
    find "$root" -type f -exec chmod 600 -- {} +
    chmod 700 -- "$root"
}
