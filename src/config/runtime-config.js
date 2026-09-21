'use strict';

const path = require('node:path');
const { assertDatabaseConnectionEnvironment } = require('./database-connection');

const APP_ENVIRONMENTS = new Set(['development', 'test', 'staging', 'production']);
const NODE_ENVIRONMENTS = new Set(['development', 'test', 'production']);

function configurationError(message) {
    return Object.assign(new Error(message), { code: 'CONFIGURACAO_INVALIDA' });
}

function required(env, key) {
    const value = String(env[key] ?? '').trim();
    if (!value) throw configurationError(`${key} é obrigatória.`);
    return value;
}

function integer(env, key, fallback, { min, max }) {
    const raw = env[key] === undefined || env[key] === '' ? fallback : env[key];
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min || value > max || String(raw).trim() === '') {
        throw configurationError(`${key} deve ser um inteiro entre ${min} e ${max}.`);
    }
    return value;
}

function boolean(env, key, fallback) {
    const raw = env[key] === undefined || env[key] === '' ? String(fallback) : String(env[key]).toLowerCase();
    if (!['true', 'false'].includes(raw)) throw configurationError(`${key} deve ser true ou false.`);
    return raw === 'true';
}

function buildRuntimeConfig(env = process.env) {
    const nodeEnv = required(env, 'NODE_ENV').toLowerCase();
    if (!NODE_ENVIRONMENTS.has(nodeEnv)) {
        throw configurationError('NODE_ENV deve ser development, test ou production.');
    }

    const appEnvDefault = nodeEnv === 'test' ? 'test' : nodeEnv;
    const appEnv = String(env.APP_ENV || appEnvDefault).trim().toLowerCase();
    if (!APP_ENVIRONMENTS.has(appEnv)) {
        throw configurationError('APP_ENV deve ser development, test, staging ou production.');
    }
    if (nodeEnv === 'test' && appEnv !== 'test') {
        throw configurationError('NODE_ENV=test exige APP_ENV=test.');
    }
    if (['staging', 'production'].includes(appEnv) && nodeEnv !== 'production') {
        throw configurationError(`APP_ENV=${appEnv} exige NODE_ENV=production.`);
    }

    const database = assertDatabaseConnectionEnvironment(env);
    const diskWarningPercent = integer(env, 'DISK_WARNING_PERCENT', 15, { min: 1, max: 99 });
    const diskCriticalPercent = integer(env, 'DISK_CRITICAL_PERCENT', 5, { min: 1, max: 98 });
    if (diskCriticalPercent >= diskWarningPercent) {
        throw configurationError('DISK_CRITICAL_PERCENT deve ser menor que DISK_WARNING_PERCENT.');
    }

    const config = {
        nodeEnv,
        appEnv,
        appPort: integer(env, 'APP_PORT', 3000, { min: 1, max: 65535 }),
        database: {
            ...database,
            poolMax: integer(env, 'DB_POOL_MAX', 10, { min: 1, max: 100 }),
            queueLimit: integer(env, 'DB_POOL_QUEUE_LIMIT', 50, { min: 1, max: 10000 }),
            waitForConnections: boolean(env, 'DB_POOL_WAIT_FOR_CONNECTIONS', true),
            connectTimeoutMs: integer(env, 'DB_CONNECT_TIMEOUT_MS', 10000, { min: 1000, max: 60000 })
        },
        http: {
            slowRequestMs: integer(env, 'SLOW_REQUEST_MS', 2000, { min: 100, max: 120000 })
        },
        pagination: {
            defaultPageSize: integer(env, 'DEFAULT_PAGE_SIZE', 50, { min: 1, max: 100 }),
            maxPageSize: integer(env, 'MAX_PAGE_SIZE', 100, { min: 1, max: 500 })
        },
        disk: { warningPercent: diskWarningPercent, criticalPercent: diskCriticalPercent },
        backup: {
            statusDirectory: env.BACKUP_STATUS_DIR
                ? path.resolve(String(env.BACKUP_STATUS_DIR))
                : null,
            rpoHours: integer(env, 'RPO_HOURS', 24, { min: 1, max: 8760 })
        }
    };
    if (config.pagination.defaultPageSize > config.pagination.maxPageSize) {
        throw configurationError('DEFAULT_PAGE_SIZE não pode exceder MAX_PAGE_SIZE.');
    }
    return Object.freeze({
        ...config,
        database: Object.freeze(config.database),
        http: Object.freeze(config.http),
        pagination: Object.freeze(config.pagination),
        disk: Object.freeze(config.disk),
        backup: Object.freeze(config.backup)
    });
}

function sanitizedRuntimeSummary(config) {
    return {
        environment: config.appEnv,
        appPort: config.appPort,
        dbHost: config.database.host,
        dbPort: config.database.port,
        dbName: config.database.database,
        dbPoolMax: config.database.poolMax,
        dbQueueLimit: config.database.queueLimit,
        dbWaitForConnections: config.database.waitForConnections
    };
}

module.exports = { buildRuntimeConfig, configurationError, sanitizedRuntimeSummary };
