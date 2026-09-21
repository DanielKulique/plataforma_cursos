'use strict';

const fs = require('node:fs');
const { loadEnvironment } = require('../src/config/loadEnvironment');

const mode = String(process.env.APP_ENV || process.env.NODE_ENV || 'development').toLowerCase();
loadEnvironment(mode === 'test' ? 'test' : mode, require('node:path').join(__dirname, '..'));

const { buildRuntimeConfig } = require('../src/config/runtime-config');
const { obterDiretorioMateriais } = require('../src/config/material-storage');
const { backupStatus } = require('../src/api/services/backup-status.service');

async function checkReadiness(baseUrl, fetchImpl = fetch) {
    try {
        const response = await fetchImpl(`${baseUrl}/readyz`, { signal: AbortSignal.timeout(5000) });
        return response.ok ? 'ok' : 'error';
    } catch {
        return 'error';
    }
}

async function checkDisk(config, statfs = fs.promises.statfs) {
    try {
        const stats = await statfs(obterDiretorioMateriais());
        const total = Number(stats.blocks) * Number(stats.bsize);
        const free = Number(stats.bavail) * Number(stats.bsize);
        const freePercent = total > 0 ? (free / total) * 100 : 0;
        return {
            status: freePercent <= config.disk.criticalPercent ? 'critical'
                : freePercent <= config.disk.warningPercent ? 'warning' : 'ok',
            freePercent: Number(freePercent.toFixed(2))
        };
    } catch {
        return { status: 'error', freePercent: null };
    }
}

async function run(options = {}) {
    const config = options.config || buildRuntimeConfig(process.env);
    const baseUrl = options.baseUrl || process.env.OPERATIONAL_CHECK_URL
        || `http://127.0.0.1:${config.appPort}`;
    const [readiness, disk, backup] = await Promise.all([
        checkReadiness(baseUrl, options.fetchImpl),
        checkDisk(config, options.statfs),
        backupStatus(process.env, options.now)
    ]);
    const ok = readiness === 'ok' && disk.status !== 'critical' && disk.status !== 'error'
        && backup.status === 'ok';
    return { ok, readiness, disk, backup };
}

if (require.main === module) {
    run().then((result) => {
        process.stdout.write(`${JSON.stringify(result)}\n`);
        process.exitCode = result.ok ? 0 : 1;
    }).catch((error) => {
        process.stdout.write(`${JSON.stringify({ ok: false, error: error.code || 'OPERATIONAL_CHECK_FAILED' })}\n`);
        process.exitCode = 1;
    });
}

module.exports = { checkDisk, checkReadiness, run };
