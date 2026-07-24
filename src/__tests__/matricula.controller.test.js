const request = require('supertest');
const express = require('express');
const matriculaController = require('../api/controllers/matricula.controller');
const matriculaRoutes = require('../api/routes/matricula.routes');
const matriculaModel = require('../api/models/matricula.models');

jest.mock('../api/models/matricula.models');
jest.mock('../middlewares/checkAuth.middleware', () => (req, res, next) => {
    req.user = { id_usuario: 1, tipo: 'ALUNO' };
    next();
});
jest.mock('../middlewares/checkRole.middleware', () => (role) => (req, res, next) => next());
jest.mock('../middlewares/checkUserPermission.middleware', () => (req, res, next) => next());
jest.mock('../middlewares/checkProfessorPermission.middleware', () => ({
    checkProfessorTurmaPermission: (req, res, next) => next(),
    checkProfessorMatriculaPermission: (req, res, next) => next(),
    checkMatriculaReadPermission: (req, res, next) => next(),
    checkMatriculaCancelPermission: (req, res, next) => next()
}));

const app = express();
app.use(express.json());
app.use('/api/matriculas', matriculaRoutes);

describe('Matricula Controller', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        matriculaModel.turmaExiste.mockResolvedValue(true);
    });

    describe('POST /api/matriculas', () => {
        it('deve criar matrícula com sucesso', async () => {
            matriculaModel.matricularAluno.mockResolvedValue({
                id_matricula: 1,
                id_aluno: 1,
                id_turma: 5,
                status_aprovacao: 'CURSANDO',
                reativada: false
            });

            const response = await request(app)
                .post('/api/matriculas')
                .send({
                    id_turma: 5
                });

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('message', 'Matrícula realizada com sucesso!');
        });

        it('deve retornar erro 409 quando aluno já estiver matriculado', async () => {
            const error = new Error('Você já está matriculado nesta turma.');
            error.status = 409;
            error.code = 'MATRICULA_DUPLICADA';
            matriculaModel.matricularAluno.mockRejectedValue(error);

            const response = await request(app)
                .post('/api/matriculas')
                .send({
                    id_turma: 5
                });

            expect(response.status).toBe(409);
            expect(response.body).toMatchObject({
                message: 'Você já está matriculado nesta turma.',
                code: 'MATRICULA_DUPLICADA'
            });
        });

        it('deve reativar matrícula cancelada e retornar 200', async () => {
            matriculaModel.matricularAluno.mockResolvedValue({
                id_matricula: 8,
                id_aluno: 1,
                id_turma: 5,
                status_aprovacao: 'CURSANDO',
                progresso_percentual: 0,
                nota_final: null,
                reativada: true
            });

            const response = await request(app).post('/api/matriculas').send({ id_turma: 5 });

            expect(response.status).toBe(200);
            expect(response.body.message).toContain('reativada');
            expect(response.body.matricula).toMatchObject({ progresso_percentual: 0, nota_final: null });
        });

        it.each([
            [404, 'TURMA_NAO_ENCONTRADA', 'Turma não encontrada.'],
            [403, 'TURMA_NAO_ABERTA', 'Esta turma não está aberta para matrículas.']
        ])('preserva o status HTTP de domínio %i', async (status, code, message) => {
            const error = new Error(message);
            error.status = status;
            error.code = code;
            matriculaModel.matricularAluno.mockRejectedValue(error);

            const response = await request(app).post('/api/matriculas').send({ id_turma: 5 });

            expect(response.status).toBe(status);
            expect(response.body).toEqual({ message, code });
        });

        it('deve retornar 400 para id de turma inválido', async () => {
            const response = await request(app).post('/api/matriculas').send({ id_turma: 0 });

            expect(response.status).toBe(400);
            expect(matriculaModel.matricularAluno).not.toHaveBeenCalled();
        });
    });

    describe('GET /api/matriculas/aluno/:id', () => {
        it('deve retornar matrículas do aluno com sucesso', async () => {
            const matriculasMock = [
                {
                    id_matricula: 1,
                    id_aluno: 1,
                    id_turma: 5,
                    status_aprovacao: 'CURSANDO',
                    progresso_percentual: 50
                }
            ];

            matriculaModel.buscarMatriculaPorAluno.mockResolvedValue(matriculasMock);

            const response = await request(app).get('/api/matriculas/aluno/1');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(matriculasMock);
        });

        it('deve retornar coleção vazia com 200 quando não houver matrículas', async () => {
            matriculaModel.buscarMatriculaPorAluno.mockResolvedValue([]);

            const response = await request(app).get('/api/matriculas/aluno/1');

            expect(response.status).toBe(200);
            expect(response.body).toEqual([]);
        });
    });

    describe('GET /api/matriculas/minha-sala', () => {
        it('deve retornar sala virtual do aluno com sucesso', async () => {
            const salasMock = [
                {
                    id_turma: 5,
                    nome_turma: 'Turma A',
                    curso: { nome_curso: 'JavaScript' }
                }
            ];

            matriculaModel.buscarSalaVirtualDoAluno.mockResolvedValue(salasMock);

            const response = await request(app).get('/api/matriculas/minha-sala');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('total', 1);
            expect(response.body).toHaveProperty('turmas');
        });
    });

    describe('GET /api/matriculas/turma/:id_turma', () => {
        it('deve retornar matrículas da turma com sucesso', async () => {
            const matriculasMock = [
                {
                    id_matricula: 1,
                    id_aluno: 1,
                    nome_aluno: 'João Silva',
                    nota_final: 8.5
                },
                {
                    id_matricula: 2,
                    id_aluno: 2,
                    nome_aluno: 'Maria Santos',
                    nota_final: 9.0
                }
            ];

            matriculaModel.buscarMatriculaPorTurma.mockResolvedValue(matriculasMock);

            const response = await request(app).get('/api/matriculas/turma/5');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('matriculas');
        });

        it('deve retornar coleção vazia com 200 quando não houver matrículas na turma', async () => {
            matriculaModel.buscarMatriculaPorTurma.mockResolvedValue([]);

            const response = await request(app).get('/api/matriculas/turma/5');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ matriculas: [] });
        });

        it('deve retornar 404 quando a turma não existir', async () => {
            matriculaModel.turmaExiste.mockResolvedValue(false);

            const response = await request(app).get('/api/matriculas/turma/999');

            expect(response.status).toBe(404);
            expect(response.body).toEqual({ message: 'Turma não encontrada.' });
        });
    });

    describe('GET /api/matriculas/:id', () => {
        it('deve retornar matrícula por ID com sucesso', async () => {
            const matriculaMock = {
                id_matricula: 1,
                id_aluno: 1,
                id_turma: 5,
                status_aprovacao: 'APROVADO',
                nota_final: 8.5
            };

            matriculaModel.buscarMatriculaPorId.mockResolvedValue(matriculaMock);

            const response = await request(app).get('/api/matriculas/1');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(matriculaMock);
        });
    });

    describe('PATCH /api/matriculas/:id', () => {
        it('deve atualizar matrícula com sucesso', async () => {
            matriculaModel.atualizarMatricula.mockResolvedValue(undefined);

            const response = await request(app)
                .patch('/api/matriculas/1')
                .send({
                    nota_final: 9.0,
                    status_aprovacao: 'APROVADO'
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('message', 'Matrícula atualizada com sucesso!');
        });

        it('deve retornar erro 400 quando nenhum dado for fornecido', async () => {
            const response = await request(app)
                .patch('/api/matriculas/1')
                .send({});

            expect(response.status).toBe(400);
        });

        it('deve retornar erro 400 quando nota final for inválida', async () => {
            const response = await request(app)
                .patch('/api/matriculas/1')
                .send({
                    nota_final: 'invalido'
                });

            expect(response.status).toBe(400);
        });

        it.each([-0.1, 10.1, 11])('deve rejeitar nota fora da faixa: %s', async (nota) => {
            const response = await request(app)
                .patch('/api/matriculas/1')
                .send({ nota_final: nota });

            expect(response.status).toBe(400);
            expect(matriculaModel.atualizarMatricula).not.toHaveBeenCalled();
        });

        it('deve retornar erro 404 quando matrícula não for encontrada', async () => {
            matriculaModel.atualizarMatricula.mockRejectedValue(new Error('Matrícula não encontrada para atualizar!'));

            const response = await request(app)
                .patch('/api/matriculas/999')
                .send({
                    nota_final: 9.0
                });

            expect(response.status).toBe(404);
        });
    });

    describe('DELETE /api/matriculas/:id', () => {
        it('deve cancelar matrícula com sucesso', async () => {
            matriculaModel.cancelarMatricula.mockResolvedValue(undefined);

            const response = await request(app).delete('/api/matriculas/1');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('message', 'Matrícula cancelada com sucesso!');
        });

        it('deve retornar erro 404 quando matrícula não for encontrada', async () => {
            matriculaModel.cancelarMatricula.mockRejectedValue(new Error('Matrícula não encontrada para cancelar!'));

            const response = await request(app).delete('/api/matriculas/999');

            expect(response.status).toBe(404);
        });
    });
});
