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
const { initTestPool, clearDatabase, seedBasicData, closeTestPool } = require('./setup');
const { app } = require('../../../index');

let server = null;
let alunoToken = null;

describe('Testes de Integração - Plágio', () => {
    beforeAll(async () => {
        await initTestPool();
        await clearDatabase();
        await seedBasicData();

        const PORT = process.env.PORT || 3001;
        server = app.listen(PORT);

        const login = await request(server)
            .post('/api/auth/login')
            .send({
                email: 'aluno@teste.com',
                senha: 'Teste@123'
            });

        alunoToken = login.body.token;
    });

    afterEach(async () => {
        jest.clearAllMocks();
    });

    afterAll(async () => {
        if (server) {
            await new Promise(resolve => server.close(resolve));
        }
        await closeTestPool();
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
                texto: 'Este texto de exemplo possui conteúdo suficiente para validação.'
            });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('id_registro');
        expect(response.body.resultado).toHaveProperty('score_similaridade', 85);
        expect(plagioService.enviarParaAnaliseIA).toHaveBeenCalledTimes(1);
    });

    it('deve retornar 503 quando serviço de IA falhar', async () => {
        const error = new Error('Serviço indisponível');
        error.status = 503;
        plagioService.enviarParaAnaliseIA.mockRejectedValue(error);

        const response = await request(server)
            .post('/api/plagio/analisar')
            .set('Authorization', `Bearer ${alunoToken}`)
            .send({
                texto: 'Texto válido para simular erro de indisponibilidade no backend.'
            });

        expect(response.status).toBe(503);
        expect(response.body).toHaveProperty('message');
    });
});
