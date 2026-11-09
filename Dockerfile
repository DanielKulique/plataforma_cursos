FROM node:20-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-bookworm-slim AS runtime
ARG APP_RELEASE_SHA
ENV APP_RELEASE_SHA=${APP_RELEASE_SHA}
LABEL org.opencontainers.image.revision=${APP_RELEASE_SHA}
ENV NODE_ENV=production APP_PORT=3000
WORKDIR /app
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json index.js ./
COPY --chown=node:node src ./src
COPY --chown=node:node scripts/migrate_database.js scripts/schema_contract.js \
  scripts/schema-contract.json \
  scripts/seed_admin_inicial.js scripts/test_database_safety.js \
  scripts/user_verify.js \
  scripts/register_database_identity.js scripts/verify_database_identity.js \
  scripts/seed_staging_demo.js scripts/seed_learning_path_demo.js scripts/verify_schema.js \
  scripts/verify_certificate_storage.js scripts/reconcile_storage.js scripts/smoke_storage_integrity_staging.js \
  scripts/backup_manifest.js scripts/capture_backup_metadata.js scripts/verify_restored_backup.js \
  scripts/operational_check.js \
  scripts/smoke_identity_email_staging.js \
  scripts/seed_e2e_database.js scripts/reconcile_academic_certificates.js scripts/reconcile_academic_results.js \
  scripts/smoke_course_pdf_staging.js \
  scripts/smoke_academic_completion_staging.js scripts/certificate_migration_preflight.js \
  scripts/smoke_certificate_versioning_staging.js scripts/smoke_enrollment_lifecycle_staging.js ./scripts/
COPY --chown=node:node scripts/lib ./scripts/lib
COPY --chown=node:node scripts/production_bootstrap.js scripts/production_initial_access.js ./scripts/
COPY --chown=node:node production-content/manifest.json ./production-content/manifest.json
COPY --chown=node:node mysql ./mysql
RUN install -d -o node -g node -m 0700 /app/storage/materials /app/storage/certificates \
  /tmp/plataforma-cursos-e2e/materials /tmp/plataforma-cursos-e2e/certificates
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.APP_PORT + '/readyz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "index.js"]
