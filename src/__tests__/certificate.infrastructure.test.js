'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('persistência, backup e replicação de certificados', () => {
    it('usa volume Docker privado separado e não o monta no Caddy', () => {
        const compose = read('compose.yaml');
        const caddy = compose.slice(compose.indexOf('  caddy:'), compose.indexOf('\nnetworks:'));

        expect(compose).toContain('certificate_uploads:/app/storage/certificates');
        expect(compose).toContain('CERTIFICATE_STORAGE_DIR: /app/storage/certificates');
        expect(caddy).not.toContain('certificate_uploads');
        expect(read('Dockerfile')).toContain('/app/storage/certificates');
    });

    it('empacota dependências da migration e smoke de versionamento na imagem runtime', () => {
        const dockerfile = read('Dockerfile');
        expect(dockerfile).toContain('scripts/certificate_migration_preflight.js');
        expect(dockerfile).toContain('scripts/smoke_certificate_versioning_staging.js');
    });

    it('inclui banco, materiais e certificados no mesmo manifesto de backup', () => {
        const backup = read('scripts/backup_database.sh');
        const restore = read('scripts/restore_database.sh');
        const metadata = read('scripts/capture_backup_metadata.js');
        const verifier = read('scripts/verify_restored_backup.js');

        expect(backup).toContain('CERTIFICATE_STORAGE_DIR');
        expect(backup).toContain('$partial/storage/certificates');
        expect(backup).toContain('backup_cli checksums');
        expect(metadata).toContain('FROM Certificados ORDER BY id_certificado');
        expect(restore).toContain('restore_namespace certificates');
        expect(restore).toContain('CERTIFICATE_STORAGE_DIR');
        expect(verifier).toContain("verifyStorageRecords(verified.manifest.storage.certificates.records, 'certificates'");
    });

    it('a replicação possui whitelist acadêmica sem qualquer cópia de certificados', () => {
        const replication = read('src/api/services/turma-replication.service.js');
        expect(replication).toContain('Certificados são documentos acadêmicos individuais');
        expect(replication).not.toMatch(/INSERT\s+INTO\s+Certificados/i);
        expect(replication).not.toMatch(/FROM\s+Certificados/i);
    });

    it('a migration impõe unicidade de aluno/turma, código e storage', () => {
        const migration = read('mysql/migrations/006_certificados.sql');
        expect(migration).toContain('UNIQUE KEY `uk_certificado_aluno_turma` (`id_aluno`, `id_turma`)');
        expect(migration).toContain('UNIQUE KEY `uk_certificado_codigo_publico` (`codigo_publico`)');
        expect(migration).toContain('UNIQUE KEY `uk_certificado_storage_name` (`storage_name`)');
        expect(migration).toContain('ON DELETE RESTRICT');
    });
});
