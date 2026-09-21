'use strict';

const fs = require('node:fs');
const db = require('../../config/database');
const { obterDiretorioMateriais } = require('../../config/material-storage');
const { obterDiretorioCertificados } = require('../../config/certificate-storage');
const { buildRuntimeConfig } = require('../../config/runtime-config');
const httpMetrics = require('./http-metrics.service');
const { backupStatus } = require('./backup-status.service');

async function databaseStatus() {
    try {
        const [rows] = await db.query('SELECT 1 AS ok');
        return rows?.[0]?.ok === 1 ? 'ok' : 'degraded';
    } catch {
        return 'unavailable';
    }
}

async function storageStatus(env = process.env) {
    const directories = [obterDiretorioMateriais(env), obterDiretorioCertificados(env)];
    try {
        await Promise.all(directories.map((directory) => fs.promises.access(
            directory,
            fs.constants.R_OK | fs.constants.W_OK
        )));
        return 'ok';
    } catch {
        return 'unavailable';
    }
}

async function diskStatus(env = process.env, statfs = fs.promises.statfs) {
    const config = buildRuntimeConfig(env);
    const target = obterDiretorioMateriais(env);
    const stats = await statfs(target);
    const blockSize = Number(stats.bsize);
    const totalBytes = Number(stats.blocks) * blockSize;
    const freeBytes = Number(stats.bavail) * blockSize;
    const freePercent = totalBytes > 0 ? (freeBytes / totalBytes) * 100 : 0;
    const status = freePercent <= config.disk.criticalPercent
        ? 'critical'
        : freePercent <= config.disk.warningPercent ? 'warning' : 'ok';
    return {
        status,
        totalBytes,
        freeBytes,
        freePercent: Number(freePercent.toFixed(2)),
        warningPercent: config.disk.warningPercent,
        criticalPercent: config.disk.criticalPercent
    };
}

function processStatus() {
    const memory = process.memoryUsage();
    return {
        uptimeSeconds: Number(process.uptime().toFixed(3)),
        pid: process.pid,
        nodeVersion: process.version,
        memory: {
            rss: memory.rss,
            heapUsed: memory.heapUsed,
            heapTotal: memory.heapTotal,
            external: memory.external
        }
    };
}

async function readiness(env = process.env) {
    const [database, storage] = await Promise.all([databaseStatus(), storageStatus(env)]);
    return { ready: database === 'ok' && storage === 'ok', database, storage };
}

async function metrics(env = process.env) {
    const [database, storage, disk, backup] = await Promise.all([
        databaseStatus(),
        storageStatus(env),
        diskStatus(env).catch(() => ({ status: 'unavailable' })),
        backupStatus(env)
    ]);
    const pool = db.metrics();
    return {
        process: processStatus(),
        http: httpMetrics.snapshot(),
        database: {
            status: database,
            pool: {
                ...pool,
                status: pool.pendingAcquisitions >= pool.queueLimit ? 'saturated' : 'ok'
            }
        },
        storage: { status: storage },
        disk,
        backup
    };
}

module.exports = {
    backupStatus,
    databaseStatus,
    diskStatus,
    metrics,
    processStatus,
    readiness,
    storageStatus
};
