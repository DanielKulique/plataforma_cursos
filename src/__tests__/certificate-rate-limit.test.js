'use strict';

const express = require('express');
const request = require('supertest');
const { criarLimitadorCertificados } = require('../api/services/certificate-rate-limit.service');

describe('rate limit da validação pública', () => {
    it('bloqueia consultas acima do limite e expõe cabeçalhos padronizados', async () => {
        const app = express();
        app.get('/validar', criarLimitadorCertificados(2, 60_000), (req, res) => {
            res.status(200).json({ resultado: 'NAO_ENCONTRADO' });
        });

        const primeira = await request(app).get('/validar');
        const segunda = await request(app).get('/validar');
        const terceira = await request(app).get('/validar');

        expect(primeira.status).toBe(200);
        expect(segunda.status).toBe(200);
        expect(terceira.status).toBe(429);
        expect(primeira.headers).toHaveProperty('ratelimit');
        expect(terceira.headers).toHaveProperty('retry-after');
    });
});
