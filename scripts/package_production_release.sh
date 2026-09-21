#!/usr/bin/env bash
set -euo pipefail

# Artifact only from an exact commit already confirmed on the selected remote branch.
: "${APP_RELEASE_SHA:?Defina o SHA completo da release}"
: "${RELEASE_BRANCH:?Defina a branch revisada}"
: "${RELEASE_ARCHIVE:?Defina o destino do arquivo tar.gz fora do repositório}"
[[ "$APP_RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo 'SHA inválido.' >&2; exit 1; }
git check-ref-format "refs/heads/$RELEASE_BRANCH"
remote=$(git remote get-url origin)
[[ "$remote" == 'https://github.com/DanielKulique/plataforma_cursos.git' ]] || { echo 'Remote inesperado.' >&2; exit 1; }
remote_sha=$(git ls-remote origin "refs/heads/$RELEASE_BRANCH" | cut -f1)
[[ "$remote_sha" == "$APP_RELEASE_SHA" ]] || { echo 'GitHub não confirma a release.' >&2; exit 1; }
[[ "$(git rev-parse HEAD)" == "$APP_RELEASE_SHA" ]] || { echo 'HEAD local divergente.' >&2; exit 1; }
[[ -z "$(git status --porcelain --untracked-files=normal)" ]] || { echo 'Working tree não está limpa.' >&2; exit 1; }
git archive --format=tar.gz --output="$RELEASE_ARCHIVE" "$APP_RELEASE_SHA"
printf 'Release %s empacotada a partir do Git confirmado.\n' "$APP_RELEASE_SHA"
