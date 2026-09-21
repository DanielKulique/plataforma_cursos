const request = require('supertest');
const express = require('express');
const healthRoutes = require('../api/routes/health.routes');
const healthController = require('../api/controllers/health.controller');
const checkAuth = require('../middlewares/checkAuth.middleware');
const checkRole = require('../middlewares/checkRole.middleware');

jest.mock('../api/services/operational-status.service', () => ({
    readiness: jest.fn(),
    metrics: jest.fn()
}));

// Mock dos middlewares
jest.mock('../middlewares/checkAuth.middleware', () => (req, res, next) => {
    req.user = { id_usuario: 1, tipo: 'ADMIN' };
    next();
});
jest.mock('../middlewares/checkRole.middleware', () => (role) => (req, res, next) => next());
jest.mock('../utils/logger', () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }));

const operational = require('../api/services/operational-status.service');
const app = express();
app.use(express.json());
app.get('/healthz', healthController.publicStatus);
app.get('/readyz', healthController.readyStatus);
app.use('/api/health', healthRoutes);

describe('Health Controller', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/health', () => {
        it('deve retornar status saudável quando banco estiver operacional', async () => {
            operational.metrics.mockResolvedValue({
                database: { status: 'ok', pool: { status: 'ok' } },
                storage: { status: 'ok' },
                backup: { status: 'ok' }
            });

            const response = await request(app).get('/api/health');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                status: 'ok',
                components: { database: 'ok', storage: 'ok', backup: 'ok', pool: 'ok' }
            });
        });

        it('deve retornar 503 seguro quando banco estiver indisponível', async () => {
            operational.metrics.mockRejectedValue(new Error('ECONNREFUSED mysql.internal:3306 secret-path'));

            const response = await request(app).get('/api/health');

            expect(response.status).toBe(503);
            expect(response.body).toEqual({
                status: 'degraded',
                components: {
                    database: 'unavailable', storage: 'unavailable',
                    backup: 'unavailable', pool: 'unavailable'
                }
            });
            expect(JSON.stringify(response.body)).not.toMatch(/ECONNREFUSED|mysql\.internal|secret-path/);
        });

        it('deve retornar status indefinido quando resposta do banco for inesperada', async () => {
            operational.metrics.mockResolvedValue({
                database: { status: 'degraded', pool: { status: 'ok' } },
                storage: { status: 'ok' },
                backup: { status: 'at_risk' }
            });

            const response = await request(app).get('/api/health');

            expect(response.status).toBe(503);
            expect(response.body).toEqual({
                status: 'degraded',
                components: { database: 'degraded', storage: 'ok', backup: 'at_risk', pool: 'ok' }
            });
        });
    });

    describe('GET /healthz', () => {
        it('expõe somente o estado mínimo quando saudável', async () => {
            const response = await request(app).get('/healthz');
            expect(response.status).toBe(200);
            expect(response.body).toEqual({ status: 'ok' });
        });

        it('continua vivo mesmo se as dependências estiverem indisponíveis', async () => {
            operational.readiness.mockResolvedValue({ ready: false, database: 'unavailable', storage: 'ok' });
            const response = await request(app).get('/healthz');
            expect(response.status).toBe(200);
            expect(response.body).toEqual({ status: 'ok' });
        });
    });

    describe('GET /readyz', () => {
        it('retorna 200 somente com DB e storage prontos', async () => {
            operational.readiness.mockResolvedValue({ ready: true, database: 'ok', storage: 'ok' });
            expect((await request(app).get('/readyz')).status).toBe(200);
        });

        it('retorna 503 mínimo quando uma dependência falha', async () => {
            operational.readiness.mockResolvedValue({ ready: false, database: 'unavailable', storage: 'ok' });
            const response = await request(app).get('/readyz');
            expect(response.status).toBe(503);
            expect(response.body).toEqual({ status: 'degraded' });
        });
    });
});
