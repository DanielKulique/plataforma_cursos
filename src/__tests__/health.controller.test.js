const request = require('supertest');
const express = require('express');
const healthRoutes = require('../api/routes/health.routes');
const checkAuth = require('../middlewares/checkAuth.middleware');
const checkRole = require('../middlewares/checkRole.middleware');

// Mock do database
jest.mock('../config/database', () => ({
    query: jest.fn()
}));

// Mock dos middlewares
jest.mock('../middlewares/checkAuth.middleware', () => (req, res, next) => {
    req.user = { id_usuario: 1, tipo: 'ADMIN' };
    next();
});
jest.mock('../middlewares/checkRole.middleware', () => (role) => (req, res, next) => next());

const db = require('../config/database');
const app = express();
app.use(express.json());
app.use('/api/health', healthRoutes);

describe('Health Controller', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/health', () => {
        it('deve retornar status saudável quando banco estiver operacional', async () => {
            db.query.mockResolvedValue([[{ ok: 1 }]]);

            const response = await request(app).get('/api/health');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('mensagem', 'Aplicação e banco de dados estão operacionais.');
            expect(response.body).toHaveProperty('banco', 'ok');
        });

        it('deve retornar erro 500 quando banco estiver indisponível', async () => {
            db.query.mockRejectedValue(new Error('Connection refused'));

            const response = await request(app).get('/api/health');

            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('mensagem', 'Falha ao verificar status do banco de dados.');
        });

        it('deve retornar status indefinido quando resposta do banco for inesperada', async () => {
            db.query.mockResolvedValue([[{ ok: 0 }]]);

            const response = await request(app).get('/api/health');

            expect(response.status).toBe(200);
            expect(response.body.banco).toBe('indefinido');
        });
    });
});
