const express = require('express');
const request = require('supertest');

jest.mock('../middlewares/checkAuth.middleware', () => (req, res, next) => {
    req.user = { id_usuario: 1, tipo: 'ADMIN' };
    next();
});
jest.mock('../api/models/conteudos.models', () => ({
    buscarTurma: jest.fn().mockResolvedValue({ id_turma: 1, id_professor: 1 }),
    professorEhDaTurma: jest.fn().mockResolvedValue(true),
    alunoEstaMatriculado: jest.fn().mockResolvedValue(true),
    listarModulos: jest.fn().mockResolvedValue([]),
    listar: jest.fn().mockResolvedValue([]),
    criar: jest.fn(async (idTurma, dados) => ({ id_conteudo: 1, id_turma: Number(idTurma), ...dados })),
    atualizar: jest.fn().mockResolvedValue(true),
    remover: jest.fn().mockResolvedValue(true),
    buscarEscopo: jest.fn().mockResolvedValue({ id_turma: 1 }),
    registrarProgresso: jest.fn().mockResolvedValue({}),
    listarProgressoTurma: jest.fn().mockResolvedValue([])
}));

const model = require('../api/models/conteudos.models');
const routes = require('../api/routes/conteudos.routes');

const app = express();
app.use(express.json());
app.use('/api', routes);

describe('allowlist de URLs de conteúdo', () => {
    beforeEach(() => jest.clearAllMocks());

    it.each([
        'javascript:alert(1)',
        'data:text/html,<svg onload=alert(1)>',
        'https://evil.example/material'
    ])('rejeita URL não permitida: %s', async (url) => {
        const response = await request(app)
            .post('/api/turmas/1/conteudos')
            .send({ titulo: 'Conteúdo', tipo: 'LINK', ordem: 1, url });

        expect(response.status).toBe(400);
        expect(model.criar).not.toHaveBeenCalled();
    });

    it.each(['/material.pdf', 'https://www.youtube.com/embed/video'])('aceita URL permitida: %s', async (url) => {
        const response = await request(app)
            .post('/api/turmas/1/conteudos')
            .send({ titulo: 'Conteúdo', tipo: 'LINK', ordem: 1, url });

        expect(response.status).toBe(201);
        expect(model.criar).toHaveBeenCalled();
    });
});
