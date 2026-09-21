'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../../utils/logger');
const PDF_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/;
const TEMP_NAME = new RegExp(PDF_NAME.source.replace('pdf', 'pending'));

function event(operation, namespace, name, error) {
    logger.warn(`storage.${operation}`, { namespace, storageName: PDF_NAME.test(name) || TEMP_NAME.test(name) ? name : undefined, errorCode: error?.code });
}

async function directory(root, create = false) {
    if (create) await fs.promises.mkdir(root, { recursive: true, mode: 0o700 });
    const stat = await fs.promises.lstat(root);
    if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.promises.realpath(root) !== path.resolve(root)) {
        throw Object.assign(new Error('Diretório de storage não canônico.'), { code: 'UNSAFE_STORAGE' });
    }
    if (create) await fs.promises.access(root, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);
    return root;
}

async function safeFile(root, name, allowLinks = false) {
    if (!PDF_NAME.test(name) && !TEMP_NAME.test(name)) throw Object.assign(new Error('Referência de storage inválida.'), { code: 'UNSAFE_STORAGE' });
    await directory(root);
    const file = path.join(root, name);
    const stat = await fs.promises.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || (!allowLinks && stat.nlink !== 1) || await fs.promises.realpath(file) !== file) {
        throw Object.assign(new Error('Arquivo de storage inseguro.'), { code: 'UNSAFE_STORAGE' });
    }
    return { file, stat };
}

// A crash between link and unlink can leave exactly the two publication names.
// Only that matching pair is recoverable; arbitrary hardlinks stay refused.
async function safeTemporary(root, name) {
    if (!TEMP_NAME.test(name)) throw Object.assign(new Error('Temporário inválido.'), { code: 'UNSAFE_STORAGE' });
    const result = await safeFile(root, name, true);
    if (result.stat.nlink === 1) return result;
    if (result.stat.nlink !== 2) throw Object.assign(new Error('Hardlink inesperado.'), { code: 'UNSAFE_STORAGE' });
    const final = await safeFile(root, name.replace(/\.pending$/, '.pdf'), true);
    if (final.stat.ino !== result.stat.ino || final.stat.dev !== result.stat.dev) {
        throw Object.assign(new Error('Hardlink inesperado.'), { code: 'UNSAFE_STORAGE' });
    }
    return result;
}

async function syncDirectory(root) {
    const handle = await fs.promises.open(root, 'r');
    try { await handle.sync(); } finally { await handle.close(); }
}

async function compensate(root, name, namespace) {
    if (!name) return;
    try {
        const { file } = await safeFile(root, name, true);
        await fs.promises.unlink(file);
        await syncDirectory(root);
    } catch (error) {
        if (error.code !== 'ENOENT') event('compensation_failed', namespace, name, error);
    }
}

// Connection-scoped advisory lock: held only AFTER the network body is received.
// Collector uses the same key, including for .pending, so grace is not the sole race defence.
async function lock(connection, namespace, name, timeout = 0) {
    const key = `storage:${namespace}:${name.replace(/\.(pdf|pending)$/, '')}`;
    const [[row]] = await connection.query('SELECT GET_LOCK(?, ?) AS acquired', [key, timeout]);
    if (Number(row.acquired) !== 1) return null;
    return async () => {
        try { await connection.query('SELECT RELEASE_LOCK(?)', [key]); }
        catch (error) { event('lock_release_failed', namespace, name, error); connection.destroy(); }
    };
}

async function rollback(connection) {
    try { await connection.rollback(); }
    catch (error) { event('rollback_failed', 'database', '', error); connection.destroy(); }
}

async function stage(root, buffer, namespace, name = `${crypto.randomUUID()}.pdf`) {
    await directory(root, true);
    if (!PDF_NAME.test(name)) throw Object.assign(new Error('Nome inválido.'), { code: 'UNSAFE_STORAGE' });
    const pending = name.replace(/\.pdf$/, '.pending');
    let created = false;
    try {
        const handle = await fs.promises.open(path.join(root, pending), 'wx', 0o600);
        created = true;
        try { await handle.writeFile(buffer); await handle.sync(); } finally { await handle.close(); }
        return { storage_name: name, pending, sha256: crypto.createHash('sha256').update(buffer).digest('hex'), size_bytes: buffer.length };
    } catch (error) {
        event('write_failed', namespace, name, error);
        if (created) await compensate(root, pending, namespace);
        throw error;
    }
}

async function publish(root, file, namespace) {
    try {
        await safeFile(root, file.pending);
        // Same-volume atomic publication without overwrite (rename on POSIX can overwrite).
        await fs.promises.link(path.join(root, file.pending), path.join(root, file.storage_name));
        file.published = true;
        await fs.promises.unlink(path.join(root, file.pending));
        await syncDirectory(root);
    } catch (error) {
        event('write_failed', namespace, file.storage_name, error);
        throw error;
    }
}

async function hashFile(root, name) {
    const { file, stat } = await safeFile(root, name);
    const handle = await fs.promises.open(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
        const opened = await handle.stat();
        if (opened.ino !== stat.ino || opened.dev !== stat.dev) throw Object.assign(new Error('Arquivo mudou.'), { code: 'STORAGE_CHANGED' });
        const hash = crypto.createHash('sha256');
        for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk);
        return { sha256: hash.digest('hex'), size: opened.size, stat: opened };
    } finally { await handle.close(); }
}

module.exports = { rollback, PDF_NAME, TEMP_NAME, directory, safeFile, safeTemporary, syncDirectory, compensate, lock, stage, publish, hashFile, event };
