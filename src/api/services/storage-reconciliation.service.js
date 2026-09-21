'use strict';

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const storage = require('./private-storage.service');
const { obterDiretorioMateriais } = require('../../config/material-storage');
const { obterDiretorioCertificados } = require('../../config/certificate-storage');
const { storagePolicy } = require('../../config/storage-policy');

const namespaces = {
    materials: { table: 'ArquivosMateriais', id: 'id_arquivo_material', root: obterDiretorioMateriais },
    certificates: { table: 'Certificados', id: 'id_certificado', root: obterDiretorioCertificados }
};

function oldEnough(date, milliseconds, now) {
    return date != null && Number.isFinite(new Date(date).getTime()) && now - new Date(date).getTime() >= milliseconds;
}

function safeName(name) {
    return storage.PDF_NAME.test(name) || storage.TEMP_NAME.test(name) ? name : `unknown:${crypto.createHash('sha256').update(String(name)).digest('hex').slice(0, 16)}`;
}

async function rowsFor(connection, namespace, name) {
    const config = namespaces[namespace];
    const fields = namespace === 'materials'
        ? `a.retido_em, a.purgado_em, a.size_bytes AS size, (SELECT COUNT(*) FROM Conteudos c WHERE c.id_arquivo_material = a.id_arquivo_material) AS refs`
        : 'a.tamanho_bytes AS size';
    const [rows] = await connection.query(`SELECT a.${config.id} AS id, a.storage_name, a.sha256, a.status, ${fields}
        FROM ${config.table} a${name ? ' WHERE a.storage_name = ?' : ''}`, name ? [name] : []);
    return rows;
}

async function classify(root, namespace, row, policy, now) {
    const entry = { namespace, name: safeName(row.storage_name), id: row.id, status: row.status, eligible: false };
    if (!storage.PDF_NAME.test(row.storage_name)) return { ...entry, classification: 'UNSAFE_PATH' };
    const referenced = Number(row.refs) > 0;
    const eligibleAge = oldEnough(row.retido_em, policy.retentionDays * 86400000, now);
    try {
        const actual = await storage.hashFile(root, row.storage_name);
        if (row.status === 'PURGADO') return { ...entry, classification: 'PURGED_RESIDUE' };
        if (actual.sha256 !== row.sha256 || Number(row.size) !== actual.size) return { ...entry, classification: 'HASH_MISMATCH' };
        if (namespace === 'certificates') return { ...entry, classification: row.status === 'ATIVO' ? 'OK' : 'CERTIFICATE_HISTORICAL' };
        if (referenced) return { ...entry, classification: row.status === 'ATIVO' ? 'OK' : 'LIFECYCLE_MISMATCH' };
        if (row.status === 'PURGANDO') return { ...entry, classification: 'PURGE_PENDING', eligible: eligibleAge };
        if (row.status !== 'RETIDO') return { ...entry, classification: 'LIFECYCLE_MISMATCH' };
        return { ...entry, classification: 'RETAINED', eligible: eligibleAge && oldEnough(actual.stat.ctime, policy.graceHours * 3600000, now) };
    } catch (error) {
        if (error.code === 'ENOENT') {
            if (namespace === 'materials' && row.status === 'PURGADO' && !referenced) return { ...entry, classification: 'PURGED' };
            if (namespace === 'materials' && row.status === 'PURGANDO' && !referenced) return { ...entry, classification: 'PURGE_PENDING', eligible: eligibleAge };
            return { ...entry, classification: 'MISSING' };
        }
        return { ...entry, classification: error.code === 'UNSAFE_STORAGE' ? 'UNSAFE_PATH' : 'UNREADABLE' };
    }
}

async function scan(connection, policy, now) {
    const entries = [];
    for (const [namespace, config] of Object.entries(namespaces)) {
        const root = config.root();
        const rows = await rowsFor(connection, namespace);
        const known = new Set(rows.map((row) => row.storage_name));
        for (const row of rows) entries.push(await classify(root, namespace, row, policy, now));
        try {
            await storage.directory(root);
            for (const name of await fs.promises.readdir(root)) {
                if (known.has(name)) continue;
                const entry = { namespace, name: safeName(name), eligible: false };
                if (!storage.PDF_NAME.test(name) && !storage.TEMP_NAME.test(name)) {
                    entries.push({ ...entry, classification: 'UNKNOWN' });
                    continue;
                }
                try {
                    const { stat } = await (storage.TEMP_NAME.test(name) ? storage.safeTemporary(root, name) : storage.safeFile(root, name));
                    const stale = oldEnough(stat.mtime, policy.graceHours * 3600000, now)
                        && oldEnough(stat.ctime, policy.graceHours * 3600000, now);
                    const temporary = storage.TEMP_NAME.test(name);
                    entries.push({ ...entry, classification: temporary ? (stale ? 'TEMP_STALE' : 'TEMP_RECENT') : 'ORPHAN',
                        eligible: stale && (temporary || namespace === 'materials') });
                } catch (error) {
                    entries.push({ ...entry, classification: error.code === 'ENOENT' ? 'CHANGED_DURING_SCAN' : 'UNSAFE_PATH' });
                }
            }
        } catch (error) {
            entries.push({ namespace, classification: 'DIRECTORY_UNAVAILABLE', eligible: false, errorCode: error.code });
        }
    }
    return entries;
}

async function unlinkChecked(root, name) {
    const { file } = await (storage.TEMP_NAME.test(name) ? storage.safeTemporary(root, name) : storage.safeFile(root, name));
    await fs.promises.unlink(file);
    await storage.syncDirectory(root);
}

async function applyEntry(pool, entry, policy, now) {
    const { namespace, name } = entry;
    const config = namespaces[namespace];
    // Explicit namespace barrier. No certificate PDF can enter any delete path.
    if (namespace === 'certificates' && !storage.TEMP_NAME.test(name)) return 'PROTECTED';
    if (!entry.eligible) return 'INELIGIBLE';
    const connection = await pool.getConnection();
    let unlock;
    try {
        unlock = await storage.lock(connection, namespace, name);
        if (!unlock) return 'IN_USE';
        const root = config.root();
        const rows = await rowsFor(connection, namespace, name);
        if (entry.classification === 'ORPHAN' || entry.classification === 'TEMP_STALE') {
            // Recheck after acquiring the publisher's lock; a scan is only a point-in-time observation.
            if (rows.length) return 'CHANGED';
            const { stat } = await (storage.TEMP_NAME.test(name) ? storage.safeTemporary(root, name) : storage.safeFile(root, name));
            if (!oldEnough(stat.mtime, policy.graceHours * 3600000, now) || !oldEnough(stat.ctime, policy.graceHours * 3600000, now)) return 'RECENT';
            await unlinkChecked(root, name);
            storage.event('purge_executed', namespace, name);
            return 'REMOVED';
        }
        if (namespace !== 'materials' || !rows.length) return 'CHANGED';
        const current = await classify(root, namespace, rows[0], policy, now);
        if (!current.eligible || !['RETAINED', 'PURGE_PENDING'].includes(current.classification)) return 'CHANGED';
        // Only this asset row is locked. Ref lookup is non-locking, at READ COMMITTED;
        // all reference-creating writers lock/check this asset before attaching it.
        await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
        await connection.beginTransaction();
        const [[row]] = await connection.query('SELECT status, retido_em FROM ArquivosMateriais WHERE id_arquivo_material = ? FOR UPDATE', [entry.id]);
        const [[refs]] = await connection.query('SELECT COUNT(*) AS total FROM Conteudos WHERE id_arquivo_material = ?', [entry.id]);
        if (!row || Number(refs.total) || !['RETIDO', 'PURGANDO'].includes(row.status) || !oldEnough(row.retido_em, policy.retentionDays * 86400000, now)) {
            await connection.rollback();
            return 'CHANGED';
        }
        await connection.query("UPDATE ArquivosMateriais SET status = 'PURGANDO' WHERE id_arquivo_material = ?", [entry.id]);
        await connection.commit(); // Durable intent BEFORE unlink: crash recovery is explicit.
        try { await unlinkChecked(root, name); }
        catch (error) { if (error.code !== 'ENOENT' || row.status !== 'PURGANDO') throw error; }
        await connection.query("UPDATE ArquivosMateriais SET status = 'PURGADO', purgado_em = NOW() WHERE id_arquivo_material = ? AND status = 'PURGANDO'", [entry.id]);
        storage.event('purge_executed', namespace, name);
        return 'PURGED';
    } catch (error) {
        await storage.rollback(connection);
        storage.event('purge_failed', namespace, name, error);
        return `FAILED:${error.code || 'IO_ERROR'}`;
    } finally {
        if (unlock) await unlock();
        connection.release();
    }
}

async function reconcile(pool, { apply = false, only = [], policy = storagePolicy(), now = Date.now() } = {}) {
    // Deliberately require named targets even with --apply; review dry-run then copy UUIDs.
    if (apply && !only.length) throw new Error('--apply exige --only namespace:UUID.pdf (ou .pending).');
    for (const target of only) {
        const [namespace, name, extra] = target.split(':');
        if (!namespaces[namespace] || extra || (!storage.PDF_NAME.test(name) && !storage.TEMP_NAME.test(name))) throw new Error('Alvo --only inválido.');
    }
    const relative = path.relative(obterDiretorioMateriais(), obterDiretorioCertificados());
    const reverse = path.relative(obterDiretorioCertificados(), obterDiretorioMateriais());
    if (!relative.startsWith('..') || !reverse.startsWith('..')) throw new Error('Namespaces de storage devem ser separados e não aninhados.');
    let backupGuard;
    try {
        if (apply) {
            backupGuard = await pool.getConnection();
            const [[row]] = await backupGuard.query("SELECT GET_LOCK('plataforma:backup-storage', 0) AS acquired");
            if (Number(row.acquired) !== 1) throw Object.assign(new Error('Backup em andamento; purge APPLY recusado.'), { code: 'BACKUP_IN_PROGRESS' });
        }
        const entries = await scan(pool, policy, now);
        for (const entry of entries) {
            if (['ORPHAN', 'MISSING', 'HASH_MISMATCH'].includes(entry.classification)) storage.event(`${entry.classification.toLowerCase()}_detected`, entry.namespace, entry.name);
            if (apply && only.includes(`${entry.namespace}:${entry.name}`)) entry.action = await applyEntry(pool, entry, policy, now);
        }
        const counts = { materials: {}, certificates: {} };
        for (const entry of entries) counts[entry.namespace][entry.classification] = (counts[entry.namespace][entry.classification] || 0) + 1;
        return { mode: apply ? 'APPLY' : 'DRY_RUN', generatedAt: new Date(now).toISOString(), policy, counts, entries };
    } finally {
        if (backupGuard) {
            let reusable = true;
            try { await backupGuard.query("SELECT RELEASE_LOCK('plataforma:backup-storage')"); }
            catch (error) { reusable = false; storage.event('lock_release_failed', 'backup', '', error); backupGuard.destroy(); }
            if (reusable) backupGuard.release();
        }
    }
}

module.exports = { reconcile, scan, classify, applyEntry, rowsFor };
