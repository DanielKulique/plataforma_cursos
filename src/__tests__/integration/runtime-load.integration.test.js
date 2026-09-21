'use strict';

const request = require('supertest');
const { createApp } = require('../../../index');
const db = require('../../config/database');
const httpMetrics = require('../../api/services/http-metrics.service');

describe('load smoke proporcional do runtime', () => {
    const app = createApp();

    beforeEach(() => httpMetrics.resetForTests());
    afterAll(async () => db.end());

    it('atende dezenas de liveness e listagens paginadas concorrentes sem fila residual', async () => {
        const requests = [];
        for (let index = 0; index < 20; index += 1) {
            requests.push(request(app).get('/healthz'));
            requests.push(request(app).get('/api/turmas?page=1&limit=10'));
        }
        const responses = await Promise.all(requests);
        expect(responses.every((response) => response.status === 200)).toBe(true);
        expect(responses.filter((_response, index) => index % 2 === 1)
            .every((response) => Array.isArray(response.body.items) && response.body.limit === 10)).toBe(true);
        expect(httpMetrics.snapshot()).toMatchObject({ totalRequests: 40, inFlight: 0 });
        expect(db.metrics().pendingAcquisitions).toBe(0);
        expect(db.metrics().activeConnections).toBe(0);
    });

    it('devolve conexões após transações repetidas e continua operacional', async () => {
        for (let index = 0; index < 20; index += 1) {
            const connection = await db.getConnection();
            try {
                await connection.beginTransaction();
                await connection.query('SELECT 1');
                await connection.rollback();
            } finally {
                connection.release();
            }
        }
        expect(db.metrics().activeConnections).toBe(0);
        expect(db.metrics().pendingAcquisitions).toBe(0);
        await expect(db.query('SELECT 1 AS ok')).resolves.toEqual(expect.arrayContaining([
            expect.arrayContaining([expect.objectContaining({ ok: 1 })])
        ]));
    });
});
