'use strict';

const path = require('node:path');
const { buildRuntimeConfig } = require('../../config/runtime-config');
const { BACKUP_ID, assertInside, readJson, rpoState } = require('../../../scripts/lib/backup-core');

async function backupStatus(env = process.env, now = Date.now()) {
    const config = buildRuntimeConfig(env);
    const root = config.backup.statusDirectory;
    if (!root) return { status: 'unavailable', latestGood: false, ageSeconds: null, rpoHours: config.backup.rpoHours };
    try {
        const pointer = await readJson(path.join(root, 'latest-good.json'), 'latest-good.json');
        if (!BACKUP_ID.test(String(pointer.backup_id || ''))) throw new Error('backup_id inválido');
        const directory = assertInside(root, path.join(root, pointer.backup_id));
        const complete = await readJson(path.join(directory, 'complete.json'), 'complete.json');
        if (complete.backup_id !== pointer.backup_id || !['LOCAL_GOOD', 'GOOD'].includes(complete.status)) {
            throw new Error('latest-good incompleto');
        }
        const rpo = rpoState(pointer.created_at, config.backup.rpoHours, now);
        return {
            status: rpo.status === 'RPO_OK' ? 'ok' : 'at_risk',
            latestGood: true,
            createdAt: pointer.created_at,
            ageSeconds: rpo.age_seconds,
            rpoHours: rpo.rpo_hours
        };
    } catch {
        return { status: 'error', latestGood: false, ageSeconds: null, rpoHours: config.backup.rpoHours };
    }
}

module.exports = { backupStatus };
