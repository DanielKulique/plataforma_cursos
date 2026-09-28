'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const zlib = require('node:zlib');

const core = require('../../scripts/lib/backup-core');

const repositoryRoot = path.join(__dirname, '..', '..');
const permissionsHelper = path.join(repositoryRoot, 'scripts/lib/backup-offsite-permissions.sh');
let temporaryRoot;
let verifierUid;
let verifierGid;

function run(command, args, options = {}) {
    const result = spawnSync(command, args, { encoding: 'utf8', ...options });
    if (result.error) throw result.error;
    return result;
}

function expectCommandSuccess(result) {
    expect(result.status).toBe(0);
}

async function createBackupFixture() {
    const backupId = `backup-20260927T061501Z-${crypto.randomUUID()}`;
    const sourceDir = path.join(temporaryRoot, 'source');
    const backupDir = path.join(sourceDir, backupId);
    fs.mkdirSync(path.join(backupDir, 'storage/materials'), { recursive: true, mode: 0o700 });
    fs.mkdirSync(path.join(backupDir, 'storage/certificates'), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.join(backupDir, 'database.sql.gz'), zlib.gzipSync('fixture database snapshot'), { mode: 0o600 });
    const metadataFile = path.join(backupDir, 'database-metadata.json');
    fs.writeFileSync(metadataFile, JSON.stringify({
        mysql_version: '8.4.0',
        database_name: 'plataforma_cursos_prod',
        database_identity: 'plataforma_cursos_prod',
        latest_migration: '016_test',
        table_counts: { alunos: 1 },
        materials: [],
        certificates: []
    }), { mode: 0o600 });
    await core.createManifest(backupDir, {
        backupId,
        createdAt: '2026-09-27T06:15:01Z',
        metadataFile,
        appCommit: 'b11bc9993b9c109f37ccb8afd1da863758f8b9bb',
        sourceSha256: 'a'.repeat(64),
        workingTreeDirty: false
    });
    await core.writeChecksums(backupDir);
    await core.markComplete(backupDir);
    return { backupId, backupDir };
}

function setPrivateModes(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            setPrivateModes(absolute);
            fs.chmodSync(absolute, 0o700);
        } else fs.chmodSync(absolute, 0o600);
    }
    fs.chmodSync(directory, 0o700);
}

function invokeVerifier(directory) {
    return run(process.execPath, [
        path.join(repositoryRoot, 'scripts/backup_manifest.js'), 'verify', '--dir', directory
    ], { uid: verifierUid, gid: verifierGid });
}

function normalizeForVerifier(directory) {
    return run('bash', [
        '-c', 'source "$1"; backup_prepare_verifier_tree "$2" "$3"',
        'backup-permissions-test', permissionsHelper, directory, `${verifierUid}:${verifierGid}`
    ]);
}

function expectOwnershipAndPrivateModes(directory) {
    const stat = fs.lstatSync(directory);
    expect(stat.isDirectory()).toBe(true);
    expect(stat.uid).toBe(verifierUid);
    expect(stat.gid).toBe(verifierGid);
    expect(stat.mode & 0o777).toBe(0o700);
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name);
        const child = fs.lstatSync(absolute);
        expect(child.uid).toBe(verifierUid);
        expect(child.gid).toBe(verifierGid);
        if (entry.isDirectory()) expectOwnershipAndPrivateModes(absolute);
        else {
            expect(child.isFile()).toBe(true);
            expect(child.mode & 0o777).toBe(0o600);
        }
    }
}

beforeEach(() => {
    temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-offsite-perm-'));
    fs.chmodSync(temporaryRoot, 0o711);
    verifierUid = process.getuid() === 0 ? 65534 : process.getuid();
    verifierGid = process.getgid() === 0 ? 65534 : process.getgid();
});

afterEach(() => {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
});

it('BACKUP-PERM-01 normaliza archive root/restrito em workspace privado e valida manifesto/hash', async () => {
    const { backupId, backupDir } = await createBackupFixture();
    setPrivateModes(backupDir);
    const archive = path.join(temporaryRoot, 'offsite.tar.gz');
    const packed = run('tar', [
        '--sort=name', '--owner=0', '--group=0', '--numeric-owner', '--mtime=2026-09-27T06:15:01Z',
        '-czf', archive, '-C', path.dirname(backupDir), backupId
    ]);
    expectCommandSuccess(packed);
    const listing = run('tar', ['--numeric-owner', '-tvzf', archive]);
    expectCommandSuccess(listing);
    expect(listing.stdout).toMatch(/0\/0/);
    expect(listing.stdout).toMatch(/-rw-------/);
    expect(listing.stdout).toMatch(/drwx------/);
    fs.chmodSync(archive, 0o600);

    const extractionRoot = path.join(temporaryRoot, 'extract');
    fs.mkdirSync(extractionRoot, { mode: 0o700 });
    const extracted = run('tar', [
        '-xzf', archive, '-C', extractionRoot, '--no-same-owner', '--no-same-permissions'
    ]);
    expectCommandSuccess(extracted);

    const normalized = normalizeForVerifier(extractionRoot);
    expectCommandSuccess(normalized);
    expectOwnershipAndPrivateModes(extractionRoot);
    const verified = invokeVerifier(path.join(extractionRoot, backupId));
    expectCommandSuccess(verified);
    expect(JSON.parse(verified.stdout)).toMatchObject({ backup_id: backupId, status: 'GOOD' });
});

it('BACKUP-PERM-02 arquivo sem leitura e conteúdo corrompido continuam falhando', async () => {
    const { backupId, backupDir } = await createBackupFixture();
    setPrivateModes(backupDir);
    const extractionRoot = path.join(temporaryRoot, 'extract');
    fs.mkdirSync(extractionRoot, { mode: 0o700 });
    fs.renameSync(backupDir, path.join(extractionRoot, backupId));
    const normalized = normalizeForVerifier(extractionRoot);
    expectCommandSuccess(normalized);
    const restoredBackup = path.join(extractionRoot, backupId);
    const manifest = path.join(restoredBackup, 'manifest.json');

    fs.chmodSync(manifest, 0o000);
    const unreadable = invokeVerifier(restoredBackup);
    expect(unreadable.status).not.toBe(0);
    expect(unreadable.stderr).toMatch(/EACCES/);
    fs.chmodSync(manifest, 0o600);

    fs.writeFileSync(path.join(restoredBackup, 'database.sql.gz'), 'corrupted snapshot', { mode: 0o600 });
    const corrupted = invokeVerifier(restoredBackup);
    expect(corrupted.status).not.toBe(0);
    expect(corrupted.stderr).toMatch(/SHA-256|diverge/);
});
