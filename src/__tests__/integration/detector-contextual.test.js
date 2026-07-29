'use strict';

jest.mock('../../api/services/detector-contextual.service', () => ({
    analisar: jest.fn(),
    analisarSegmento: jest.fn(),
    analisarDocumento: jest.fn()
}));

const request = require('supertest');
const detectorService = require('../../api/services/detector-contextual.service');
const {
    validDetectorResponse,
    validIncrementalResponse,
    validCompleteV2Response
} = require('../fixtures/detector-contextual.fixture');
const { resetDetectorRateLimit } = require('../../middlewares/detectorRateLimit.middleware');
const {
    initTestPool,
    clearDatabase,
    seedBasicData,
    closeTestPool,
    getTestPassword
} = require('./setup');
const { app } = require('../../../index');
const applicationDb = require('../../config/database');

const tokens = {};
let pool;
const payload = {
    documento: 'Documento sintético usado apenas no teste de integração.',
    fonte_comparada: 'Fonte sintética usada apenas no teste de integração.'
};
const incrementalPayload = {
    sessao_id: 'sessao-efemera',
    segmento_id: 'segmento-estavel',
    versao: 4,
    texto_segmento: 'Parágrafo sintético para integração.',
    modo_fontes: 'BUSCA_AUTOMATICA',
    limite_candidatos: 5,
    contexto: { referencias_atuais: [] }
};
const completePayload = {
    documento: 'Documento completo sintético para integração.',
    modo_fontes: 'BUSCA_AUTOMATICA',
    limite_candidatos: 5
};

describe('integração Node do detector contextual', () => {
    beforeAll(async () => {
        pool = await initTestPool();
        await clearDatabase();
        await seedBasicData();
        for (const [role, email] of [
            ['aluno', 'aluno@teste.com'],
            ['professor', 'professor@teste.com'],
            ['admin', 'admin@teste.com']
        ]) {
            const login = await request(app).post('/api/auth/login').send({
                email,
                senha: getTestPassword()
            });
            tokens[role] = login.body.token;
        }
    });

    beforeEach(() => {
        jest.clearAllMocks();
        resetDetectorRateLimit();
        process.env.DETECTOR_RATE_LIMIT_MAX = '10';
    });

    afterAll(async () => {
        delete process.env.DETECTOR_RATE_LIMIT_MAX;
        await closeTestPool();
        await applicationDb.end();
    });

    test('retorna 401 sem sessão e não chama o detector', async () => {
        const response = await request(app).post('/api/analises/contextual').send(payload);
        expect(response.status).toBe(401);
        expect(detectorService.analisar).not.toHaveBeenCalled();
    });

    test('valida antes da chamada externa', async () => {
        const response = await request(app)
            .post('/api/analises/contextual')
            .set('Authorization', `Bearer ${tokens.aluno}`)
            .send({ documento: '', fonte_comparada: 'fonte' });
        expect(response.status).toBe(422);
        expect(detectorService.analisar).not.toHaveBeenCalled();
    });

    test('retorna 413 para documento excessivo', async () => {
        const response = await request(app)
            .post('/api/analises/contextual')
            .set('Authorization', `Bearer ${tokens.aluno}`)
            .send({ documento: 'x'.repeat(100001), fonte_comparada: 'fonte' });
        expect(response.status).toBe(413);
    });

    test('persiste apenas resumo e devolve contrato validado', async () => {
        detectorService.analisar.mockResolvedValue(validDetectorResponse());
        const response = await request(app)
            .post('/api/analises/contextual')
            .set('Authorization', `Bearer ${tokens.aluno}`)
            .send(payload);
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            success: true,
            data: { versao_contrato: '1.0', status_analise: 'CONCLUIDO' }
        });
        const [rows] = await pool.query(
            `SELECT id_usuario, total_segmentos, total_alertas, versao_contrato, parametros_json
             FROM AnalisesContextuais WHERE id = ?`,
            [response.body.id_analise]
        );
        expect(rows).toHaveLength(1);
        const serialized = JSON.stringify(rows[0]);
        expect(serialized).not.toContain(payload.documento);
        expect(serialized).not.toContain(payload.fonte_comparada);
    });

    test.each([
        [503, 'DETECTOR_INDISPONIVEL'],
        [504, 'DETECTOR_TIMEOUT'],
        [502, 'DETECTOR_RESPOSTA_INVALIDA']
    ])('preserva erro seguro %i', async (status, code) => {
        detectorService.analisar.mockRejectedValue(Object.assign(new Error('Mensagem segura'), {
            status,
            code
        }));
        const response = await request(app)
            .post('/api/analises/contextual')
            .set('Authorization', `Bearer ${tokens.aluno}`)
            .send(payload);
        expect(response.status).toBe(status);
        expect(response.body.codigo).toBe(code);
        expect(JSON.stringify(response.body)).not.toContain(payload.documento);
    });

    test('limita por usuário autenticado', async () => {
        process.env.DETECTOR_RATE_LIMIT_MAX = '1';
        detectorService.analisar.mockResolvedValue(validDetectorResponse());
        const first = await request(app).post('/api/analises/contextual')
            .set('Authorization', `Bearer ${tokens.aluno}`).send(payload);
        const second = await request(app).post('/api/analises/contextual')
            .set('Authorization', `Bearer ${tokens.aluno}`).send(payload);
        expect(first.status).toBe(200);
        expect(second.status).toBe(429);
        expect(second.body.codigo).toBe('DETECTOR_LIMITE_EXCEDIDO');
    });

    test.each([
        ['ALUNO', 'aluno'],
        ['PROFESSOR', 'professor'],
        ['ADMIN', 'admin']
    ])('autoriza a função %s registrada no banco', async (_role, tokenKey) => {
        detectorService.analisar.mockResolvedValue(validDetectorResponse());
        const response = await request(app)
            .post('/api/analises/contextual')
            .set('Authorization', `Bearer ${tokens[tokenKey]}`)
            .send(payload);
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
    });

    test('rota incremental exige sessão e nunca persiste a versão intermediária', async () => {
        const unauthorized = await request(app)
            .post('/api/analises/contextual/segmento')
            .send(incrementalPayload);
        expect(unauthorized.status).toBe(401);

        const [before] = await pool.query('SELECT COUNT(*) AS total FROM AnalisesContextuais');
        detectorService.analisarSegmento.mockResolvedValue(validIncrementalResponse({
            sessao_id: incrementalPayload.sessao_id,
            segmento_id: incrementalPayload.segmento_id,
            versao: incrementalPayload.versao,
            status_analise: 'PARCIAL',
            status_contexto: 'RECUPERACAO_INDISPONIVEL',
            status_recuperacao: 'INDISPONIVEL',
            fontes_candidatas: []
        }));
        const response = await request(app)
            .post('/api/analises/contextual/segmento')
            .set('Authorization', `Bearer ${tokens.aluno}`)
            .send(incrementalPayload);
        const [after] = await pool.query('SELECT COUNT(*) AS total FROM AnalisesContextuais');
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            success: true,
            data: {
                segmento_id: incrementalPayload.segmento_id,
                versao: incrementalPayload.versao,
                status_contexto: 'RECUPERACAO_INDISPONIVEL'
            }
        });
        expect(after[0].total).toBe(before[0].total);
    });

    test('rota completa 2.0 persiste somente o resumo técnico', async () => {
        detectorService.analisarDocumento.mockResolvedValue(validCompleteV2Response());
        const response = await request(app)
            .post('/api/analises/contextual/documento')
            .set('Authorization', `Bearer ${tokens.professor}`)
            .send(completePayload);
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            success: true,
            id_analise: expect.any(Number),
            data: { versao_contrato: '2.0', modo_analise: 'COMPLETA' }
        });
        const [rows] = await pool.query(
            'SELECT versao_contrato, parametros_json FROM AnalisesContextuais WHERE id = ?',
            [response.body.id_analise]
        );
        expect(rows[0].versao_contrato).toBe('2.0');
        expect(JSON.stringify(rows[0])).not.toContain(completePayload.documento);
    });
});
