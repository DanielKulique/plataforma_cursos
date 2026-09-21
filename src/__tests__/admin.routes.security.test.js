const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');

jest.mock('../api/controllers/usuarios.controller', () => ({
    criarUsuarioAdmin: jest.fn((req, res) => res.status(201).json({ tipo: req.body.tipo })),
    buscarTodosUsuarios: jest.fn(),
    buscarUsuarioPorId: jest.fn(),
    atualizarUsuarioAdmin: jest.fn(),
    deletarUsuario: jest.fn()
}));
jest.mock('../api/models/auth.models', () => ({
    buscarUsuarioSessao: jest.fn()
}));
jest.mock('../api/controllers/health.controller', () => ({
    metrics: jest.fn((req, res) => res.json({ process: { uptimeSeconds: 1 } }))
}));

const usuariosController = require('../api/controllers/usuarios.controller');
const authModel = require('../api/models/auth.models');
const adminRoutes = require('../api/routes/admin.routes');
const healthController = require('../api/controllers/health.controller');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

const payload = {
    nome_completo: 'Usuário Administrativo',
    cpf: '12345678901',
    email: 'administrativo@example.test',
    senha: 'Senha@123',
    tipo: 'PROFESSOR'
};

describe('proteção da criação administrativa de usuários', () => {
    const originalSecret = process.env.JWT_SECRET;

    beforeAll(() => {
        process.env.JWT_SECRET = 'segredo-exclusivo-do-teste-de-rota';
    });

    afterAll(() => {
        if (originalSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = originalSecret;
    });

    beforeEach(() => jest.clearAllMocks());

    it('recusa criação sem autenticação', async () => {
        const response = await request(app).post('/api/admin/usuarios').send(payload);

        expect(response.status).toBe(401);
        expect(usuariosController.criarUsuarioAdmin).not.toHaveBeenCalled();
    });

    it('recusa usuário autenticado sem papel ADMIN', async () => {
        authModel.buscarUsuarioSessao.mockResolvedValue({ id_usuario: 2, tipo: 'ALUNO', versao_sessao: 0 });
        const token = jwt.sign({ id_usuario: 2, tipo: 'ALUNO', sv: 0 }, process.env.JWT_SECRET);
        const response = await request(app)
            .post('/api/admin/usuarios')
            .set('Authorization', `Bearer ${token}`)
            .send(payload);

        expect(response.status).toBe(403);
        expect(usuariosController.criarUsuarioAdmin).not.toHaveBeenCalled();
    });

    it('mantém a criação disponível para ADMIN autenticado', async () => {
        authModel.buscarUsuarioSessao.mockResolvedValue({ id_usuario: 1, tipo: 'ADMIN', versao_sessao: 0 });
        const token = jwt.sign({ id_usuario: 1, tipo: 'ALUNO', sv: 0 }, process.env.JWT_SECRET);
        const response = await request(app)
            .post('/api/admin/usuarios')
            .set('Authorization', `Bearer ${token}`)
            .send(payload);

        expect(response.status).toBe(201);
        expect(response.body.tipo).toBe('PROFESSOR');
        expect(authModel.buscarUsuarioSessao).toHaveBeenCalledWith(1);
        expect(usuariosController.criarUsuarioAdmin).toHaveBeenCalledTimes(1);
    });

    it('protege métricas para ADMIN: anônimo 401, ALUNO 403 e ADMIN 200', async () => {
        expect((await request(app).get('/api/admin/metrics')).status).toBe(401);

        authModel.buscarUsuarioSessao.mockResolvedValue({ id_usuario: 2, tipo: 'ALUNO', versao_sessao: 0 });
        const aluno = jwt.sign({ id_usuario: 2, sv: 0 }, process.env.JWT_SECRET);
        expect((await request(app).get('/api/admin/metrics').set('Authorization', `Bearer ${aluno}`)).status).toBe(403);

        authModel.buscarUsuarioSessao.mockResolvedValue({ id_usuario: 1, tipo: 'ADMIN', versao_sessao: 0 });
        const admin = jwt.sign({ id_usuario: 1, sv: 0 }, process.env.JWT_SECRET);
        const response = await request(app).get('/api/admin/metrics').set('Authorization', `Bearer ${admin}`);
        expect(response.status).toBe(200);
        expect(healthController.metrics).toHaveBeenCalledTimes(1);
    });
});
