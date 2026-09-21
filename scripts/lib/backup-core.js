'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const FORMAT_VERSION = 1;
const BACKUP_ID = /^backup-\d{8}T\d{6}Z-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const STORAGE_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/;
const SHA256 = /^[0-9a-f]{64}$/;
const MANAGED_FILES = new Set(['manifest.json', 'checksums.sha256', 'complete.json']);

function fail(message, code = 'BACKUP_INVALID') {
    throw Object.assign(new Error(message), { code });
}

function assertBackupId(value) {
    if (!BACKUP_ID.test(String(value || ''))) fail('backup_id inválido.', 'UNSAFE_BACKUP_ID');
    return value;
}

function assertInside(root, target) {
    const resolvedRoot = path.resolve(root);
    const resolved = path.resolve(target);
    const prefix = resolvedRoot === path.parse(resolvedRoot).root ? resolvedRoot : `${resolvedRoot}${path.sep}`;
    if (resolved === resolvedRoot || !resolved.startsWith(prefix)) {
        fail('Caminho fora do namespace de backup.', 'UNSAFE_BACKUP_PATH');
    }
    return resolved;
}

function safeRelative(value) {
    if (!value || path.isAbsolute(value) || value.includes('\\')) fail('Caminho relativo inválido.', 'UNSAFE_BACKUP_PATH');
    const normalized = path.posix.normalize(value);
    if (normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized !== value) {
        fail('Caminho relativo não canônico.', 'UNSAFE_BACKUP_PATH');
    }
    return normalized;
}

async function atomicWriteJson(file, value, mode = 0o600) {
    const temporary = `${file}.partial-${process.pid}-${crypto.randomUUID()}`;
    await fs.promises.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode, flag: 'wx' });
    await fs.promises.rename(temporary, file);
}

async function readJson(file, description = path.basename(file)) {
    let value;
    try { value = JSON.parse(await fs.promises.readFile(file, 'utf8')); }
    catch (error) { fail(`${description} inválido: ${error.code || error.message}`); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${description} deve ser um objeto JSON.`);
    return value;
}

async function hashFile(file) {
    const stat = await fs.promises.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) fail(`Arquivo inseguro: ${path.basename(file)}`, 'UNSAFE_BACKUP_PATH');
    const handle = await fs.promises.open(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const opened = await handle.stat();
        if (opened.ino !== stat.ino || opened.dev !== stat.dev || opened.size !== stat.size) fail('Arquivo mudou durante o hash.', 'BACKUP_CHANGED');
        const hash = crypto.createHash('sha256');
        for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk);
        return { sha256: hash.digest('hex'), size: opened.size };
    } finally { await handle.close(); }
}

async function walkFiles(root, current = root) {
    const rootPath = path.resolve(root);
    const directory = path.resolve(current);
    assertInside(path.dirname(rootPath), rootPath);
    const stat = await fs.promises.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('Diretório de backup inseguro.', 'UNSAFE_BACKUP_PATH');
    const result = [];
    const entries = await fs.promises.readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        const absolute = assertInside(rootPath, path.join(directory, entry.name));
        const relative = path.relative(rootPath, absolute).split(path.sep).join('/');
        safeRelative(relative);
        if (entry.isSymbolicLink()) fail(`Link simbólico não permitido: ${relative}`, 'UNSAFE_BACKUP_PATH');
        if (entry.isDirectory()) result.push(...await walkFiles(rootPath, absolute));
        else if (entry.isFile()) result.push(relative);
        else fail(`Entrada não regular não permitida: ${relative}`, 'UNSAFE_BACKUP_PATH');
    }
    return result;
}

function validateRecord(record, namespace) {
    if (!record || !STORAGE_NAME.test(String(record.storage_name || ''))) fail(`Registro ${namespace} com storage_name inválido.`);
    if (!SHA256.test(String(record.sha256 || ''))) fail(`Registro ${namespace} com SHA-256 inválido.`);
    const size = Number(namespace === 'certificates' ? record.tamanho_bytes : record.size_bytes);
    if (!Number.isSafeInteger(size) || size < 0) fail(`Registro ${namespace} com tamanho inválido.`);
}

async function storageEntries(backupDir, namespace, records) {
    const relativeRoot = `storage/${namespace}`;
    const absoluteRoot = path.join(backupDir, relativeRoot);
    const files = (await walkFiles(absoluteRoot)).map((name) => `${relativeRoot}/${name}`);
    const entries = [];
    for (const relative of files) {
        const name = path.posix.basename(relative);
        if (!STORAGE_NAME.test(name) || relative !== `${relativeRoot}/${name}`) fail(`Arquivo inesperado no storage: ${relative}`);
        entries.push({ name, ...await hashFile(path.join(backupDir, relative)) });
    }
    const byName = new Map(entries.map((entry) => [entry.name, entry]));
    for (const record of records) {
        validateRecord(record, namespace);
        const actual = byName.get(record.storage_name);
        const mayBeAbsent = namespace === 'materials' && record.status === 'PURGADO';
        if (!actual && !mayBeAbsent) fail(`${namespace}:${record.storage_name} ausente do backup.`);
        if (actual) {
            const size = Number(namespace === 'certificates' ? record.tamanho_bytes : record.size_bytes);
            if (actual.sha256 !== record.sha256 || actual.size !== size) fail(`${namespace}:${record.storage_name} diverge do banco.`);
        }
    }
    return entries;
}

function validateMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object') fail('Metadata de banco inválida.');
    if (!/^plataforma_cursos_(?:dev|test|staging|prod)$/.test(String(metadata.database_identity || ''))) {
        fail('Identidade persistente do banco ausente ou inválida.');
    }
    if (!Array.isArray(metadata.materials) || !Array.isArray(metadata.certificates)) fail('Inventário de storage ausente.');
    if (!metadata.table_counts || typeof metadata.table_counts !== 'object') fail('Contagens do banco ausentes.');
    for (const [table, count] of Object.entries(metadata.table_counts)) {
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(table) || !Number.isSafeInteger(Number(count)) || Number(count) < 0) fail('Contagem de tabela inválida.');
    }
}

async function createManifest(backupDir, options) {
    assertBackupId(options.backupId);
    const metadata = await readJson(options.metadataFile, 'metadata do banco');
    validateMetadata(metadata);
    const databaseFile = 'database.sql.gz';
    const database = await hashFile(path.join(backupDir, databaseFile));
    if (database.size === 0) fail('Dump do banco está vazio.');
    const materials = await storageEntries(backupDir, 'materials', metadata.materials);
    const certificates = await storageEntries(backupDir, 'certificates', metadata.certificates);
    const manifest = {
        format_version: FORMAT_VERSION,
        backup_id: options.backupId,
        created_at: options.createdAt,
        status: 'COMPLETE',
        application: {
            commit: options.appCommit || 'unknown',
            source_sha256: options.sourceSha256 || null,
            working_tree_dirty: options.workingTreeDirty === true
        },
        database: {
            file: databaseFile,
            ...database,
            mysql_version: metadata.mysql_version,
            name: metadata.database_name,
            environment_identity: metadata.database_identity,
            table_counts: metadata.table_counts
        },
        schema: { latest_migration: metadata.latest_migration },
        storage: {
            materials: { path: 'storage/materials', records: metadata.materials, files: materials },
            certificates: { path: 'storage/certificates', records: metadata.certificates, files: certificates }
        },
        consistency: {
            application_writes: 'SUSPENDED',
            purge_coordination: 'MYSQL_ADVISORY_LOCK',
            mysql_dump: 'SINGLE_TRANSACTION'
        },
        external_secrets_required: [
            'DB_PASSWORD', 'MYSQL_ROOT_PASSWORD', 'JWT_SECRET', 'CORS_ORIGIN',
            'RESEND_API_KEY when email delivery is enabled', 'offsite identity or credential'
        ]
    };
    await atomicWriteJson(path.join(backupDir, 'manifest.json'), manifest);
    return manifest;
}

async function writeChecksums(backupDir) {
    const ignored = new Set(['checksums.sha256', 'complete.json']);
    const files = (await walkFiles(backupDir)).filter((file) => !ignored.has(file));
    if (!files.includes('manifest.json') || !files.includes('database.sql.gz')) fail('Backup sem dump ou manifesto.');
    const lines = [];
    for (const file of files.sort()) lines.push(`${(await hashFile(path.join(backupDir, file))).sha256}  ${file}`);
    await fs.promises.writeFile(path.join(backupDir, 'checksums.sha256'), `${lines.join('\n')}\n`, { mode: 0o600, flag: 'wx' });
    return lines.length;
}

function parseChecksums(content) {
    const result = new Map();
    for (const line of content.split('\n').filter(Boolean)) {
        const match = /^([0-9a-f]{64})[ ]{2}(.+)$/.exec(line);
        if (!match) fail('checksums.sha256 malformado.');
        const relative = safeRelative(match[2]);
        if (MANAGED_FILES.has(relative) && relative !== 'manifest.json') fail('checksums inclui arquivo de controle inválido.');
        if (result.has(relative)) fail('Checksum duplicado.');
        result.set(relative, match[1]);
    }
    return result;
}

function assertManifestShape(manifest, expectedId) {
    if (manifest.format_version !== FORMAT_VERSION) fail(`format_version não suportado: ${manifest.format_version}`);
    assertBackupId(manifest.backup_id);
    if (expectedId && manifest.backup_id !== expectedId) fail('backup_id diverge do diretório.');
    if (manifest.status !== 'COMPLETE') fail('Manifesto não está COMPLETE.');
    if (!Number.isFinite(Date.parse(manifest.created_at))) fail('created_at inválido.');
    if (manifest.database?.file !== 'database.sql.gz' || !SHA256.test(manifest.database.sha256) || !Number.isSafeInteger(manifest.database.size)) fail('Seção database inválida.');
    for (const namespace of ['materials', 'certificates']) {
        const section = manifest.storage?.[namespace];
        if (!section || !Array.isArray(section.records) || !Array.isArray(section.files)) fail(`Seção ${namespace} inválida.`);
        for (const record of section.records) validateRecord(record, namespace);
        for (const file of section.files) {
            if (!STORAGE_NAME.test(file.name) || !SHA256.test(file.sha256) || !Number.isSafeInteger(file.size)) fail(`Arquivo ${namespace} inválido no manifesto.`);
        }
    }
}

async function verifyBackupDir(backupDir, { requireComplete = true } = {}) {
    const resolved = path.resolve(backupDir);
    const directory = await fs.promises.lstat(resolved);
    if (!directory.isDirectory() || directory.isSymbolicLink()) fail('Backup deve ser um diretório regular.');
    const expectedId = BACKUP_ID.test(path.basename(resolved)) ? path.basename(resolved) : null;
    const manifest = await readJson(path.join(resolved, 'manifest.json'), 'manifest.json');
    assertManifestShape(manifest, expectedId);
    const checksums = parseChecksums(await fs.promises.readFile(path.join(resolved, 'checksums.sha256'), 'utf8'));
    const actualFiles = (await walkFiles(resolved)).filter((file) => !['checksums.sha256', 'complete.json'].includes(file)).sort();
    const listed = [...checksums.keys()].sort();
    if (JSON.stringify(actualFiles) !== JSON.stringify(listed)) fail('Lista de checksums não corresponde ao conteúdo do backup.');
    for (const [relative, expected] of checksums) {
        if ((await hashFile(path.join(resolved, relative))).sha256 !== expected) fail(`SHA-256 divergente: ${relative}`);
    }
    const dump = await hashFile(path.join(resolved, manifest.database.file));
    if (dump.sha256 !== manifest.database.sha256 || dump.size !== manifest.database.size) fail('Dump diverge do manifesto.');
    for (const namespace of ['materials', 'certificates']) {
        const section = manifest.storage[namespace];
        const actual = await storageEntries(resolved, namespace, section.records);
        if (JSON.stringify(actual) !== JSON.stringify(section.files)) fail(`Inventário ${namespace} diverge do manifesto.`);
    }
    if (requireComplete) {
        const complete = await readJson(path.join(resolved, 'complete.json'), 'complete.json');
        if (complete.backup_id !== manifest.backup_id || !['LOCAL_GOOD', 'GOOD'].includes(complete.status)) fail('Completion marker inválido.');
        const checksumHash = await hashFile(path.join(resolved, 'checksums.sha256'));
        if (complete.checksums_sha256 !== checksumHash.sha256) fail('Completion marker diverge dos checksums.');
    }
    return { backup_id: manifest.backup_id, created_at: manifest.created_at, manifest };
}

async function markComplete(backupDir) {
    const verified = await verifyBackupDir(backupDir, { requireComplete: false });
    const checksums = await hashFile(path.join(backupDir, 'checksums.sha256'));
    await atomicWriteJson(path.join(backupDir, 'complete.json'), {
        format_version: FORMAT_VERSION,
        backup_id: verified.backup_id,
        status: 'LOCAL_GOOD',
        completed_at: new Date().toISOString(),
        checksums_sha256: checksums.sha256
    });
    return verifyBackupDir(backupDir);
}

async function updateLatestGood(root, backupDir, scope = 'local') {
    const verified = await verifyBackupDir(backupDir);
    assertInside(root, backupDir);
    await atomicWriteJson(path.join(root, 'latest-good.json'), {
        format_version: FORMAT_VERSION,
        backup_id: verified.backup_id,
        created_at: verified.created_at,
        scope,
        updated_at: new Date().toISOString()
    });
    return verified;
}

async function readLatestGood(root) {
    const pointer = await readJson(path.join(root, 'latest-good.json'), 'latest-good.json');
    assertBackupId(pointer.backup_id);
    const backupDir = assertInside(root, path.join(root, pointer.backup_id));
    const verified = await verifyBackupDir(backupDir);
    if (verified.backup_id !== pointer.backup_id || verified.created_at !== pointer.created_at) fail('latest-good diverge do backup apontado.');
    return { pointer, backupDir, verified };
}

async function applyRetention(root, days, now = Date.now()) {
    if (!Number.isSafeInteger(days) || days < 1 || days > 36500) fail('Retenção local inválida.');
    const latest = await readLatestGood(root);
    const removed = [];
    for (const entry of await fs.promises.readdir(root, { withFileTypes: true })) {
        if (!entry.isDirectory() || !BACKUP_ID.test(entry.name) || entry.name === latest.pointer.backup_id) continue;
        const target = assertInside(root, path.join(root, entry.name));
        let verified;
        try { verified = await verifyBackupDir(target); } catch { continue; }
        if (now - Date.parse(verified.created_at) < days * 86400000) continue;
        await fs.promises.rm(target, { recursive: true, force: false });
        removed.push(entry.name);
    }
    return { preserved: latest.pointer.backup_id, removed };
}

function rpoState(createdAt, rpoHours, now = Date.now()) {
    if (!Number.isFinite(Date.parse(createdAt))) fail('Timestamp de latest-good inválido.');
    if (!Number.isFinite(rpoHours) || rpoHours <= 0) fail('RPO inválido.');
    const ageSeconds = Math.max(0, Math.floor((now - Date.parse(createdAt)) / 1000));
    return { age_seconds: ageSeconds, rpo_hours: rpoHours, status: ageSeconds <= rpoHours * 3600 ? 'RPO_OK' : 'RPO_AT_RISK' };
}

function validateRemoteNamespace(account, container, prefix) {
    if (!/^[a-z0-9]{3,24}$/.test(String(account || ''))) fail('Storage account inválido.', 'UNSAFE_REMOTE_PATH');
    if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(String(container || ''))) fail('Container inválido.', 'UNSAFE_REMOTE_PATH');
    if (!/^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)+$/.test(String(prefix || '')) || prefix.includes('..') || prefix.startsWith('/') || prefix.endsWith('/')) {
        fail('Prefixo remoto inseguro.', 'UNSAFE_REMOTE_PATH');
    }
    return { account, container, prefix };
}

module.exports = {
    FORMAT_VERSION, BACKUP_ID, STORAGE_NAME, SHA256, assertBackupId, assertInside, safeRelative,
    atomicWriteJson, readJson, hashFile, walkFiles, createManifest, writeChecksums, parseChecksums,
    verifyBackupDir, markComplete, updateLatestGood, readLatestGood, applyRetention, rpoState,
    validateRemoteNamespace
};
