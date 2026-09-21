'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const core = require('../../scripts/lib/backup-core');

let root;
const materialName = '123e4567-e89b-42d3-a456-426614174000.pdf';
const certificateName = '223e4567-e89b-42d3-a456-426614174000.pdf';
const bytes = (name) => Buffer.from(`%PDF-${name}`);
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');

beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-core-')); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

async function fixture(createdAt = '2026-09-10T03:15:00Z', complete = true) {
    const compact = createdAt.replace(/[-:]/g, '').replace('.000', '');
    const id = `backup-${compact}-${crypto.randomUUID()}`;
    const dir = path.join(root, id);
    fs.mkdirSync(path.join(dir, 'storage', 'materials'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'storage', 'certificates'), { recursive: true });
    const material = bytes('material'); const certificate = bytes('certificate');
    fs.writeFileSync(path.join(dir, 'database.sql.gz'), Buffer.from('gzip-fixture'));
    fs.writeFileSync(path.join(dir, 'storage', 'materials', materialName), material);
    fs.writeFileSync(path.join(dir, 'storage', 'certificates', certificateName), certificate);
    const metadata = {
        database_name: 'plataforma_cursos_test', database_identity: 'plataforma_cursos_test',
        mysql_version: '8.4.0', latest_migration: '012_environment_identity.sql',
        table_counts: { Usuarios: 2, ArquivosMateriais: 1, Certificados: 1 },
        materials: [{ id_arquivo_material: 1, storage_name: materialName, size_bytes: material.length, sha256: sha(material), status: 'ATIVO', reference_count: 1 }],
        certificates: [{ id_certificado: 1, codigo_publico: 'CERT-fixture', versao: 1, status: 'ATIVO', storage_name: certificateName, tamanho_bytes: certificate.length, sha256: sha(certificate) }]
    };
    const metadataFile = path.join(dir, 'database-metadata.json');
    fs.writeFileSync(metadataFile, JSON.stringify(metadata));
    await core.createManifest(dir, { backupId: id, createdAt, metadataFile, appCommit: 'abc', workingTreeDirty: false });
    await core.writeChecksums(dir);
    if (complete) await core.markComplete(dir);
    return { id, dir };
}

it('cria manifesto v1, hashes por arquivo e completion marker verificável', async () => {
    const backup = await fixture();
    const result = await core.verifyBackupDir(backup.dir);
    expect(result).toMatchObject({ backup_id: backup.id, created_at: '2026-09-10T03:15:00Z' });
    expect(result.manifest.schema.latest_migration).toBe('012_environment_identity.sql');
    expect(result.manifest.storage.materials.files[0]).toMatchObject({ name: materialName, sha256: sha(bytes('material')) });
    expect(fs.readFileSync(path.join(backup.dir, 'checksums.sha256'), 'utf8')).toContain('manifest.json');
    expect(JSON.parse(fs.readFileSync(path.join(backup.dir, 'complete.json'))).status).toBe('LOCAL_GOOD');
});

it.each([
    ['dump', 'database.sql.gz'],
    ['material', `storage/materials/${materialName}`],
    ['certificado', `storage/certificates/${certificateName}`]
])('bloqueia %s corrompido antes de restore', async (_label, relative) => {
    const backup = await fixture();
    fs.appendFileSync(path.join(backup.dir, relative), 'tamper');
    await expect(core.verifyBackupDir(backup.dir)).rejects.toThrow(/diverge|SHA-256/);
});

it('bloqueia manifesto adulterado, versão desconhecida e conjunto sem certificado esperado', async () => {
    const backup = await fixture();
    const manifestFile = path.join(backup.dir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestFile)); manifest.format_version = 99;
    fs.writeFileSync(manifestFile, JSON.stringify(manifest));
    await expect(core.verifyBackupDir(backup.dir)).rejects.toThrow(/format_version/);

    const missing = await fixture('2026-09-11T03:15:00Z', false);
    fs.unlinkSync(path.join(missing.dir, 'storage', 'certificates', certificateName));
    await expect(core.verifyBackupDir(missing.dir, { requireComplete: false })).rejects.toThrow(/ausente|Lista de checksums/);
});

it('backup incompleto não substitui latest-good', async () => {
    const good = await fixture();
    await core.updateLatestGood(root, good.dir);
    const partial = await fixture('2026-09-11T03:15:00Z', false);
    await expect(core.updateLatestGood(root, partial.dir)).rejects.toThrow();
    expect((await core.readLatestGood(root)).pointer.backup_id).toBe(good.id);
});

it('retenção remove GOOD antigo, preserva recente e nunca remove o latest-good', async () => {
    const old = await fixture('2026-08-01T03:15:00Z');
    const recent = await fixture('2026-09-11T03:15:00Z');
    await core.updateLatestGood(root, old.dir);
    let result = await core.applyRetention(root, 7, Date.parse('2026-09-12T03:15:00Z'));
    expect(result.removed).toEqual([]);
    await core.updateLatestGood(root, recent.dir);
    result = await core.applyRetention(root, 7, Date.parse('2026-09-12T03:15:00Z'));
    expect(result).toEqual({ preserved: recent.id, removed: [old.id] });
    expect(fs.existsSync(recent.dir)).toBe(true);
});

it('status RPO diferencia backup saudável de backup vencido', () => {
    expect(core.rpoState('2026-09-11T12:00:00Z', 24, Date.parse('2026-09-12T11:59:00Z')).status).toBe('RPO_OK');
    expect(core.rpoState('2026-09-11T12:00:00Z', 24, Date.parse('2026-09-12T12:01:00Z')).status).toBe('RPO_AT_RISK');
});

it.each([
    ['', 'container', 'plataforma/backups'],
    ['account', 'container', '/'],
    ['account', 'container', 'plataforma/../outro'],
    ['account', 'container', 'plataforma/backups/']
])('restringe cleanup remoto ao namespace dedicado %#', (account, container, prefix) => {
    expect(() => core.validateRemoteNamespace(account, container, prefix)).toThrow(/inválido|inseguro/);
});

it('recusa traversal e links no conteúdo do backup', async () => {
    const backup = await fixture();
    fs.symlinkSync('/etc/passwd', path.join(backup.dir, 'storage', 'materials', 'link'));
    await expect(core.verifyBackupDir(backup.dir)).rejects.toThrow(/Link simbólico/);
    expect(() => core.safeRelative('../outside')).toThrow(/Caminho/);
});

it('aceita filho direto da raiz sem afrouxar a barreira de namespace', () => {
    expect(core.assertInside('/', '/backup')).toBe('/backup');
    expect(() => core.assertInside('/backup', '/backup-outside')).toThrow(/fora/);
});
