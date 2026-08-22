'use strict';

jest.mock('../middlewares/checkAuth.middleware', () => (req, res, next) => {
    const role = req.headers['x-test-role'];
    if (!role) return res.status(401).json({ mensagem: 'Token não fornecido' });
    req.user = { id_usuario: 42, tipo: role };
    return next();
});

jest.mock('../api/services/indexed-analysis.service', () => ({
    analisar: jest.fn(),
    status: jest.fn(),
    reload: jest.fn()
}));

const express = require('express');
const request = require('supertest');
const service = require('../api/services/indexed-analysis.service');
const router = require('../api/routes/indexed-analysis.routes');
const requestContext = require('../middlewares/requestContext.middleware');
const { resetIndexedAnalysisRateLimits } = require('../middlewares/indexedAnalysisRateLimit.middleware');

const analysis = {
    analysis_id: '00000000-0000-4000-8000-000000000001',
    query_segment_count: 1,
    candidate_count: 0,
    analyzed_pair_count: 0,
    index_snapshot_id: 'snapshot',
    model_fingerprint: 'f'.repeat(64),
    candidates: [], warnings: ['NO_CANDIDATE_IN_CURRENT_CORPUS_INDEX_MODEL_AND_PARAMETERS']
};

function app() {
    const instance = express();
    instance.use(express.json());
    instance.use(requestContext);
    instance.use('/api', router);
    return instance;
}

describe('rotas da análise indexada', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        resetIndexedAnalysisRateLimits();
        service.analisar.mockResolvedValue(analysis);
        service.status.mockResolvedValue({ enabled: true, loaded: true, ready: true, vector_count: 2, warnings: [] });
        service.reload.mockResolvedValue({ changed: false, current: { enabled: true, loaded: true, ready: true, vector_count: 2, warnings: [] } });
    });

    test('exige autenticação e autoriza ALUNO, PROFESSOR e ADMIN na análise', async () => {
        await request(app()).post('/api/analises/similaridade').send({ text: 'Texto sintético.' }).expect(401);
        for (const role of ['ALUNO', 'PROFESSOR', 'ADMIN']) {
            const response = await request(app())
                .post('/api/analises/similaridade')
                .set('x-test-role', role)
                .send({ text: 'Texto sintético.' })
                .expect(200);
            expect(response.body.data).toEqual(analysis);
            expect(response.headers['x-request-id']).toBe(response.body.request_id);
        }
    });

    test('status e reload são exclusivos de ADMIN', async () => {
        await request(app()).get('/api/admin/corpus/index/status').set('x-test-role', 'ALUNO').expect(403);
        await request(app()).post('/api/admin/corpus/index/reload').set('x-test-role', 'PROFESSOR').expect(403);
        await request(app()).get('/api/admin/corpus/index/status').set('x-test-role', 'ADMIN').expect(200);
        await request(app()).post('/api/admin/corpus/index/reload').set('x-test-role', 'ADMIN').expect(200);
    });

    test('valida vazio, tamanho, top-k, filtros, IDs e campos livres antes do motor', async () => {
        const base = request(app()).post('/api/analises/similaridade').set('x-test-role', 'ALUNO');
        await base.send({ text: '' }).expect(422);
        await request(app()).post('/api/analises/similaridade').set('x-test-role', 'ALUNO')
            .send({ text: 'x', top_k: 999 }).expect(422);
        await request(app()).post('/api/analises/similaridade').set('x-test-role', 'ALUNO')
            .send({ text: 'x', allowed_section_types: ['INVALID'] }).expect(422);
        await request(app()).post('/api/analises/similaridade').set('x-test-role', 'ALUNO')
            .send({ text: 'x', url: 'https://example.org' }).expect(422);
        expect(service.analisar).not.toHaveBeenCalled();
    });

    test('rate limits são separados e reload é restritivo', async () => {
        const previous = process.env.RETRIEVAL_RELOAD_RATE_LIMIT_MAX;
        process.env.RETRIEVAL_RELOAD_RATE_LIMIT_MAX = '1';
        try {
            await request(app()).post('/api/admin/corpus/index/reload').set('x-test-role', 'ADMIN').expect(200);
            await request(app()).post('/api/admin/corpus/index/reload').set('x-test-role', 'ADMIN').expect(429);
            await request(app()).get('/api/admin/corpus/index/status').set('x-test-role', 'ADMIN').expect(200);
        } finally {
            if (previous === undefined) delete process.env.RETRIEVAL_RELOAD_RATE_LIMIT_MAX;
            else process.env.RETRIEVAL_RELOAD_RATE_LIMIT_MAX = previous;
        }
    });

    test('propaga erro sanitizado sem devolver texto submetido', async () => {
        service.analisar.mockRejectedValue(Object.assign(new Error('Indisponível.'), {
            code: 'ANALISE_MOTOR_503', status: 503
        }));
        const response = await request(app()).post('/api/analises/similaridade')
            .set('x-test-role', 'ALUNO').send({ text: 'segredo acadêmico sintético' }).expect(503);
        expect(JSON.stringify(response.body)).not.toContain('segredo acadêmico sintético');
        expect(response.body.codigo).toBe('ANALISE_MOTOR_503');
    });
});
