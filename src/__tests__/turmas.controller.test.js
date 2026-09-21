const request = require('supertest');
const express = require('express');
const turmasController = require('../api/controllers/turmas.controller');
const turmasRoutes = require('../api/routes/turmas.routes');
const turmasModel = require('../api/models/turmas.models');

jest.mock('../api/models/turmas.models');
jest.mock('../middlewares/checkAuth.middleware', () => (req, res, next) => {
    req.user = { id_usuario: 5, tipo: 'PROFESSOR' };
    next();
});
jest.mock('../middlewares/checkRole.middleware', () => (role) => (req, res, next) => next());
jest.mock('../middlewares/checkProfessorPermission.middleware', () => ({
    checkProfessorTurmaPermission: (req, res, next) => next(),
    checkProfessorMatriculaPermission: (req, res, next) => next(),
    checkProfessorPermission: (req, res, next) => next()
}));

const app = express();
app.use(express.json());
app.use('/api/turmas', turmasRoutes);

describe('Turmas Controller', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/turmas', () => {
        it('deve retornar lista de turmas com sucesso', async () => {
            const turmasMock = [
                {
                    id_turma: 1,
                    id_curso: 1,
                    id_professor: 2,
                    nome_turma: 'Turma A - 2026',
                    data_inicio: '2026-03-01',
                    status: 'ABERTA'
                },
                {
                    id_turma: 2,
                    id_curso: 1,
                    id_professor: 2,
                    nome_turma: 'Turma B - 2026',
                    data_inicio: '2026-04-01',
                    status: 'ABERTA'
                }
            ];

            turmasModel.buscarTodasTurmas.mockResolvedValue({ items: turmasMock, total: 2 });

            const response = await request(app).get('/api/turmas');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ items: turmasMock, page: 1, limit: 50, total: 2 });
        });

        it('limita paginação excessiva e calcula offset', async () => {
            turmasModel.buscarTodasTurmas.mockResolvedValue({ items: [], total: 101 });
            const response = await request(app).get('/api/turmas?page=2&limit=100000');
            expect(response.status).toBe(200);
            expect(turmasModel.buscarTodasTurmas).toHaveBeenCalledWith({ page: 2, limit: 100, offset: 100 });
            expect(response.body).toEqual({ items: [], page: 2, limit: 100, total: 101 });
        });

        it('deve retornar erro 500 quando houver falha no servidor', async () => {
            turmasModel.buscarTodasTurmas.mockRejectedValue(new Error('Erro no banco'));

            const response = await request(app).get('/api/turmas');

            expect(response.status).toBe(500);
        });
    });

    describe('GET /api/turmas/:id', () => {
        it('deve retornar turma por ID com sucesso', async () => {
            const turmaMock = {
                id_turma: 1,
                id_curso: 1,
                id_professor: 2,
                nome_turma: 'Turma A - 2026',
                data_inicio: '2026-03-01',
                status: 'ABERTA'
            };

            turmasModel.buscarTurmaPorId.mockResolvedValue(turmaMock);

            const response = await request(app).get('/api/turmas/1');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(turmaMock);
        });

        it('deve retornar erro 404 quando turma não for encontrada', async () => {
            turmasModel.buscarTurmaPorId.mockRejectedValue(Object.assign(new Error('Turma não encontrada.'), { status: 404 }));

            const response = await request(app).get('/api/turmas/999');

            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('message', 'Turma não encontrada.');
        });
    });

    describe('POST /api/turmas', () => {
        it('deve criar turma com sucesso', async () => {
            const novaTurmaMock = {
                id_turma: 1,
                id_curso: 1,
                id_professor: 2,
                nome_turma: 'Nova Turma',
                data_inicio: '2026-03-01',
                status: 'ABERTA'
            };

            turmasModel.criarTurma.mockResolvedValue(novaTurmaMock);

            const response = await request(app)
                .post('/api/turmas')
                .send({
                    id_curso: 1,
                    id_professor: 2,
                    nome_turma: 'Nova Turma',
                    data_inicio: '2026-03-01'
                });

            expect(response.status).toBe(201);
            expect(response.body).toEqual(novaTurmaMock);
        });

        it('deve retornar erro 409 quando nome da turma já existir', async () => {
            const erroDuplicidade = Object.assign(new Error('Já existe uma turma com esse nome.'), { status: 409 });
            turmasModel.criarTurma.mockRejectedValue(erroDuplicidade);

            const response = await request(app)
                .post('/api/turmas')
                .send({
                    id_curso: 1,
                    id_professor: 2,
                    nome_turma: 'Turma Existente',
                    data_inicio: '2026-03-01'
                });

            expect(response.status).toBe(409);
            expect(response.body).toHaveProperty('message', 'Já existe uma turma com esse nome.');
        });
    });

    describe('PATCH /api/turmas/:id', () => {
        it('deve atualizar turma com sucesso', async () => {
            turmasModel.atualizarTurma.mockResolvedValue(undefined);

            const response = await request(app)
                .patch('/api/turmas/1')
                .send({
                    status: 'FECHADA'
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('message', 'Turma atualizada com sucesso.');
        });

        it('deve retornar erro 400 quando nenhum dado for fornecido', async () => {
            const response = await request(app)
                .patch('/api/turmas/1')
                .send({});

            expect(response.status).toBe(400);
        });

        it('deve retornar erro 404 quando turma não for encontrada', async () => {
            turmasModel.atualizarTurma.mockRejectedValue(Object.assign(new Error('Turma não encontrada.'), { status: 404 }));

            const response = await request(app)
                .patch('/api/turmas/999')
                .send({
                    status: 'FECHADA'
                });

            expect(response.status).toBe(404);
        });
    });

    describe('DELETE /api/turmas/:id', () => {
        it('deve deletar turma com sucesso', async () => {
            turmasModel.deletarTurma.mockResolvedValue(undefined);

            const response = await request(app).delete('/api/turmas/1');

            expect(response.status).toBe(204);
        });

        it('deve retornar erro 404 quando turma não for encontrada', async () => {
            turmasModel.deletarTurma.mockRejectedValue(Object.assign(new Error('Turma não encontrada.'), { status: 404 }));

            const response = await request(app).delete('/api/turmas/999');

            expect(response.status).toBe(404);
        });
    });

    describe('GET /api/turmas/professor/:id', () => {
        it('deve retornar turmas do professor com sucesso', async () => {
            const turmasMock = [
                {
                    id_turma: 1,
                    nome_turma: 'Turma A',
                    id_professor: 5
                }
            ];

            turmasModel.buscarTurmasDoProfessor.mockResolvedValue(turmasMock);

            const response = await request(app)
                .get('/api/turmas/professor/5')
                .set('Authorization', 'Bearer valid-token');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('turmas');
        });

        it('deve retornar erro 403 quando ID não corresponder ao usuário logado', async () => {
            const response = await request(app)
                .get('/api/turmas/professor/999')
                .set('Authorization', 'Bearer valid-token');

            expect(response.status).toBe(403);
        });
    });
});
