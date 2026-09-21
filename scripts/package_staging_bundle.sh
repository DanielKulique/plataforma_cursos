#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
OUTPUT=${1:-/tmp/plataforma-cursos-staging.tgz}
cd "$ROOT"

tar -czf "$OUTPUT" \
    package.json package-lock.json index.js jest.integration.config.js eslint.config.js \
    Dockerfile .dockerignore compose.yaml compose.staging.yaml \
    Caddyfile Caddyfile.staging .env.staging.example \
    src scripts mysql docs deploy README.md
sha256sum "$OUTPUT"
printf 'Base revision: %s\n' "$(git rev-parse HEAD 2>/dev/null || printf 'sem-git')"
