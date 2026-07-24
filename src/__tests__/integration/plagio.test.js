/**
 * Teste de integração (rascunho) para rota de plágio.
 *
 * IMPORTANTE:
 * - O microsserviço Python/FastAPI é externo.
 * - Aqui fazemos mock do service do Node para que os testes rodem
 *   sem depender do servidor Python em execução.
 */

jest.mock('../../api/services/plagio.service', () => ({
    enviarParaAnaliseIA: jest.fn()
}));

const request = require('supertest');
const plagioService = require('../../api/services/plagio.service');
const { initTestPool, clearDatabase, seedBasicData, closeTestPool, getTestPassword } = require('./setup');
const { app } = require('../../../index');
const applicationDb = require('../../config/database');

const server = app;
const testPassword = getTestPassword();
let alunoToken = null;

describe('Testes de Integração - Plágio', () => {
    beforeAll(async () => {
        await initTestPool();
        await clearDatabase();
        await seedBasicData();

        const login = await request(server)
            .post('/api/auth/login')
            .send({
                email: 'aluno@teste.com',
                senha: testPassword
            });

        alunoToken = login.body.token;
    });

    afterEach(async () => {
        jest.clearAllMocks();
    });

    afterAll(async () => {
        await closeTestPool();
        await applicationDb.end();
    });

    it('deve analisar texto e retornar score com id do registro', async () => {
        plagioService.enviarParaAnaliseIA.mockResolvedValue({
            score_similaridade: 85,
            fontes_encontradas: [
                { titulo: 'Artigo Exemplo', url: 'https://exemplo.com/artigo' }
            ]
        });

        const response = await request(server)
            .post('/api/plagio/analisar')
            .set('Authorization', `Bearer ${alunoToken}`)
            .send({
                texto_original: 'Este é o texto original usado como referência na comparação.',
                texto_suspeito: 'Este texto de exemplo possui conteúdo suficiente para validação.'
            });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('id_registro');
        expect(response.body.resultado).toHaveProperty('score_similaridade', 85);
        expect(plagioService.enviarParaAnaliseIA).toHaveBeenCalledWith(
            'Este é o texto original usado como referência na comparação.',
            'Este texto de exemplo possui conteúdo suficiente para validação.'
        );
    });

    it('deve retornar 503 quando serviço de IA falhar', async () => {
        const error = new Error('Serviço indisponível');
        error.status = 503;
        plagioService.enviarParaAnaliseIA.mockRejectedValue(error);

        const response = await request(server)
            .post('/api/plagio/analisar')
            .set('Authorization', `Bearer ${alunoToken}`)
            .send({
                texto_original: 'Texto original válido para simular indisponibilidade no backend.',
                texto_suspeito: 'Texto válido para simular erro de indisponibilidade no backend.'
            });

        expect(response.status).toBe(503);
        expect(response.body).toHaveProperty('mensagem');
    });
});
