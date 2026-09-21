'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const request = require('supertest');
const { buildRuntimeConfig } = require('../config/runtime-config');
const { normalizePoolAcquisitionError } = require('../config/database-pool-errors');
const { parsePagination } = require('../utils/pagination');
const { backupStatus } = require('../api/services/backup-status.service');
const httpMetrics = require('../api/services/http-metrics.service');
const requestContext = require('../middlewares/requestContext.middleware');
const httpObservability = require('../middlewares/httpObservability.middleware');

jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
jest.mock('../config/database', () => ({
    query: jest.fn(),
    metrics: jest.fn(() => ({
        connectionLimit: 10, queueLimit: 50, waitForConnections: true,
        activeConnections: 0, pendingAcquisitions: 0, totalAcquisitions: 0,
        acquisitionFailures: 0, acquisitionLatencyMs: { count: 0, average: 0, max: 0 }
    }))
}));
const logger = require('../utils/logger');
const database = require('../config/database');
const operational = require('../api/services/operational-status.service');

function validEnv(overrides = {}) {
    return {
        NODE_ENV: 'test', APP_ENV: 'test', APP_PORT: '3000',
        DB_HOST: '127.0.0.1', DB_PORT: '33307', DB_USER: 'app', DB_PASSWORD: 'secret',
        DB_NAME: 'plataforma_cursos_test', DB_ENVIRONMENT_IDENTITY: 'plataforma_cursos_test',
        ...overrides
    };
}

describe('runtime config fail-closed', () => {
    it.each(['0', '70000', 'banana'])('recusa APP_PORT=%s', (value) => {
        expect(() => buildRuntimeConfig(validEnv({ APP_PORT: value }))).toThrow('APP_PORT');
    });

    it('recusa fila ilimitada e timeout inválido', () => {
        expect(() => buildRuntimeConfig(validEnv({ DB_POOL_QUEUE_LIMIT: '0' }))).toThrow('DB_POOL_QUEUE_LIMIT');
        expect(() => buildRuntimeConfig(validEnv({ DB_CONNECT_TIMEOUT_MS: 'x' }))).toThrow('DB_CONNECT_TIMEOUT_MS');
    });

    it('expõe defaults conservadores e congelados', () => {
        const config = buildRuntimeConfig(validEnv());
        expect(config.database).toMatchObject({ poolMax: 10, queueLimit: 50, waitForConnections: true });
        expect(Object.isFrozen(config)).toBe(true);
        expect(Object.isFrozen(config.database)).toBe(true);
    });
});

describe('saturação segura do pool', () => {
    it('converte erro bruto de fila em 503 sem detalhe mysql2 na mensagem pública', () => {
        const error = normalizePoolAcquisitionError(new Error('Queue limit reached for mysql.internal'));
        expect(error).toMatchObject({ status: 503, code: 'DB_POOL_SATURATED' });
        expect(error.message).toBe('Banco temporariamente saturado.');
        expect(error.message).not.toContain('mysql.internal');
    });
});

describe('paginação centralizada', () => {
    it('aplica defaults, máximo e offset', () => {
        expect(parsePagination({})).toEqual({ page: 1, limit: 50, offset: 0 });
        expect(parsePagination({ page: '3', limit: '999999' })).toEqual({ page: 3, limit: 100, offset: 200 });
    });

    it.each([{ page: '0' }, { limit: '0' }, { page: 'x' }, { limit: '-1' }])('recusa %j', (query) => {
        try {
            parsePagination(query);
            throw new Error('paginação inválida foi aceita');
        } catch (error) {
            expect(error).toMatchObject({ status: 400, code: 'PAGINACAO_INVALIDA' });
        }
    });
});

describe('backup latest-good/RPO leve', () => {
    let directory;
    const backupId = 'backup-20260917T120000Z-12345678-1234-4123-8123-123456789abc';

    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-status-'));
        fs.mkdirSync(path.join(directory, backupId));
        fs.writeFileSync(path.join(directory, 'latest-good.json'), JSON.stringify({
            format_version: 1, backup_id: backupId, created_at: '2026-09-17T12:00:00.000Z'
        }));
        fs.writeFileSync(path.join(directory, backupId, 'complete.json'), JSON.stringify({
            format_version: 1, backup_id: backupId, status: 'LOCAL_GOOD'
        }));
    });

    afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

    it('distingue GOOD recente de RPO em risco sem executar backup', async () => {
        await expect(backupStatus(validEnv({ BACKUP_STATUS_DIR: directory, RPO_HOURS: '24' }), Date.parse('2026-09-18T11:00:00Z')))
            .resolves.toMatchObject({ status: 'ok', latestGood: true });
        await expect(backupStatus(validEnv({ BACKUP_STATUS_DIR: directory, RPO_HOURS: '24' }), Date.parse('2026-09-18T13:00:01Z')))
            .resolves.toMatchObject({ status: 'at_risk', latestGood: true });
    });

    it('reporta ausência de latest-good sem revelar paths', async () => {
        fs.rmSync(path.join(directory, 'latest-good.json'));
        await expect(backupStatus(validEnv({ BACKUP_STATUS_DIR: directory })))
            .resolves.toEqual({ status: 'error', latestGood: false, ageSeconds: null, rpoHours: 24 });
    });
});

describe('thresholds de disco sem preencher filesystem', () => {
    const stats = (freeBlocks) => async () => ({ bsize: 1, blocks: 100, bavail: freeBlocks });

    it('classifica ok, warning e critical com valores centralizados', async () => {
        await expect(operational.diskStatus(validEnv(), stats(50))).resolves.toMatchObject({ status: 'ok', freePercent: 50 });
        await expect(operational.diskStatus(validEnv(), stats(10))).resolves.toMatchObject({ status: 'warning', freePercent: 10 });
        await expect(operational.diskStatus(validEnv(), stats(5))).resolves.toMatchObject({ status: 'critical', freePercent: 5 });
    });
});

describe('snapshot administrativo', () => {
    it('expõe memória/pool numéricos sem incluir secrets', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-snapshot-'));
        const materials = path.join(root, 'materials');
        const certificates = path.join(root, 'certificates');
        fs.mkdirSync(materials);
        fs.mkdirSync(certificates);
        database.query.mockResolvedValue([[{ ok: 1 }]]);
        try {
            const snapshot = await operational.metrics(validEnv({
                DB_PASSWORD: 'segredo-que-nao-pode-vazar',
                MATERIAL_STORAGE_DIR: materials,
                CERTIFICATE_STORAGE_DIR: certificates
            }));
            expect(snapshot.process.memory).toEqual(expect.objectContaining({
                rss: expect.any(Number), heapUsed: expect.any(Number),
                heapTotal: expect.any(Number), external: expect.any(Number)
            }));
            expect(snapshot.database.pool).toEqual(expect.objectContaining({
                connectionLimit: 10, queueLimit: 50, activeConnections: 0
            }));
            expect(JSON.stringify(snapshot)).not.toContain('segredo-que-nao-pode-vazar');
        } finally {
            fs.rmSync(root, { recursive: true, force: true });
        }
    });
});

describe('métricas HTTP e request-id', () => {
    beforeEach(() => {
        httpMetrics.resetForTests();
        jest.clearAllMocks();
    });

    it('contabiliza 2xx, 5xx, duração, slow request e volta in-flight a zero', async () => {
        const app = express();
        app.use(requestContext);
        app.use(httpObservability({ slowRequestMs: 1 }));
        app.get('/ok', (req, res) => setTimeout(() => res.json({ ok: true }), 5));
        app.get('/fail', (req, res) => res.status(500).json({ error: 'seguro' }));

        const healthy = await request(app).get('/ok').set('X-Request-ID', 'nao-confiar-neste-id');
        await request(app).get('/fail');
        const snapshot = httpMetrics.snapshot();

        expect(healthy.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
        expect(healthy.headers['x-request-id']).not.toBe('nao-confiar-neste-id');
        expect(snapshot).toMatchObject({ totalRequests: 2, inFlight: 0 });
        expect(snapshot.slowRequests).toBeGreaterThanOrEqual(1);
        expect(snapshot.responses['2xx']).toBe(1);
        expect(snapshot.responses['5xx']).toBe(1);
        expect(snapshot.durationMs.count).toBe(2);
        expect(logger.warn).toHaveBeenCalledWith('http.request.slow', expect.objectContaining({ route: '/ok' }));
    });
});
