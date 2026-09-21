const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    checksum,
    compareLedger,
    discoverMigrations,
    lockName
} = require('../../scripts/lib/migration-runner');

function fixture(files) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-migrations-'));
    for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(directory, name), content);
    return directory;
}

describe('migration discovery e checksums', () => {
    const directories = [];
    afterEach(() => {
        for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
    });

    it('ordena numericamente e calcula SHA-256 dos bytes exatos', () => {
        const directory = fixture({ '002_second.sql': 'SELECT 2;\n', '001_first.sql': 'SELECT 1;\r\n' });
        directories.push(directory);
        const migrations = discoverMigrations(directory);
        expect(migrations.map((item) => item.version)).toEqual([1, 2]);
        expect(migrations[0].checksumSha256).toBe(checksum(Buffer.from('SELECT 1;\r\n')));
        expect(migrations[0].checksumSha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it('bloqueia duas migrations com a mesma versão antes de SQL', () => {
        const directory = fixture({ '001_first.sql': 'SELECT 1;', '001_other.sql': 'SELECT 2;' });
        directories.push(directory);
        expect(() => discoverMigrations(directory)).toThrow(expect.objectContaining({ code: 'DUPLICATE_MIGRATION_VERSION' }));
    });

    it('bloqueia gaps monotônicos', () => {
        const directory = fixture({ '001_first.sql': 'SELECT 1;', '003_third.sql': 'SELECT 3;' });
        directories.push(directory);
        expect(() => discoverMigrations(directory)).toThrow(expect.objectContaining({ code: 'MIGRATION_VERSION_GAP' }));
    });

    it('detecta alteração de migration aplicada sem atualizar o ledger', () => {
        const directory = fixture({ '001_first.sql': 'SELECT 1;' });
        directories.push(directory);
        const [migration] = discoverMigrations(directory);
        const result = compareLedger([migration], [{
            version: 1,
            filename: migration.filename,
            checksumSha256: '0'.repeat(64),
            appliedAt: null,
            executionMs: 0
        }]);
        expect(result.errors[0]).toMatchObject({
            type: 'CHECKSUM_MISMATCH',
            expectedChecksum: '0'.repeat(64),
            actualChecksum: migration.checksumSha256
        });
        expect(result.statuses[0].state).toBe('CHECKSUM_MISMATCH');
    });

    it('bloqueia ledger que não seja um prefixo contínuo das migrations', () => {
        const directory = fixture({ '001_first.sql': 'SELECT 1;', '002_second.sql': 'SELECT 2;' });
        directories.push(directory);
        const migrations = discoverMigrations(directory);
        const result = compareLedger(migrations, [{
            version: 2,
            filename: migrations[1].filename,
            checksumSha256: migrations[1].checksumSha256,
            appliedAt: null,
            executionMs: 0
        }]);
        expect(result.errors).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'LEDGER_OUT_OF_ORDER', expectedVersion: 1, actualVersion: 2 })
        ]));
    });

    it('deriva lock específico e estável por banco sem expor credenciais', () => {
        expect(lockName('plataforma_cursos_test')).toBe(lockName('plataforma_cursos_test'));
        expect(lockName('plataforma_cursos_test')).not.toBe(lockName('plataforma_cursos_staging'));
        expect(lockName('plataforma_cursos_test').length).toBeLessThanOrEqual(64);
    });
});
