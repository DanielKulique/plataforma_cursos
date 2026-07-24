const request = require('supertest');
const express = require('express');
const cursosController = require('../api/controllers/cursos.controller');
const cursosRoutes = require('../api/routes/cursos.routes');
const cursosModel = require('../api/models/cursos.models');

jest.mock('../api/models/cursos.models');
jest.mock('../middlewares/checkAuth.middleware', () => (req, res, next) => next());
jest.mock('../middlewares/checkRole.middleware', () => (role) => (req, res, next) => next());

const app = express();
app.use(express.json());
app.use('/api/cursos', cursosRoutes);

describe('Cursos Controller', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/cursos', () => {
        it('deve retornar lista de cursos com sucesso', async () => {
            const cursosMock = [
                {
                    id_curso: 1,
                    nome_curso: 'Curso de JavaScript',
                    descricao: 'Aprenda JavaScript',
                    carga_horaria: 40
                },
                {
                    id_curso: 2,
                    nome_curso: 'Curso de Python',
                    descricao: 'Aprenda Python',
                    carga_horaria: 60
                }
            ];

            cursosModel.buscarCursos.mockResolvedValue(cursosMock);

            const response = await request(app).get('/api/cursos');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(cursosMock);
            expect(cursosModel.buscarCursos).toHaveBeenCalledTimes(1);
        });

        it('deve retornar erro 500 quando houver falha no servidor', async () => {
            cursosModel.buscarCursos.mockRejectedValue(new Error('Erro no banco'));

            const response = await request(app).get('/api/cursos');

            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('message');
        });
    });

    describe('GET /api/cursos/:id', () => {
        it('deve retornar curso por ID com sucesso', async () => {
            const cursoMock = {
                id_curso: 1,
                nome_curso: 'Curso de JavaScript',
                descricao: 'Aprenda JavaScript',
                carga_horaria: 40
            };

            cursosModel.buscarCursoPorId.mockResolvedValue(cursoMock);

            const response = await request(app).get('/api/cursos/1');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(cursoMock);
        });

        it('deve retornar erro 404 quando curso não for encontrado', async () => {
            cursosModel.buscarCursoPorId.mockRejectedValue(Object.assign(new Error('Curso não encontrado.'), { status: 404 }));

            const response = await request(app).get('/api/cursos/999');

            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('message', 'Curso não encontrado.');
        });
    });

    describe('POST /api/cursos', () => {
        it('deve criar curso com sucesso', async () => {
            const novoCursoMock = {
                id_curso: 1,
                nome_curso: 'Novo Curso',
                descricao: 'Descrição do curso',
                carga_horaria: 40
            };

            cursosModel.criarCurso.mockResolvedValue(novoCursoMock);

            const response = await request(app)
                .post('/api/cursos')
                .send({
                    nome_curso: 'Novo Curso',
                    descricao: 'Descrição do curso',
                    carga_horaria: 40
                });

            expect(response.status).toBe(201);
            expect(response.body).toEqual(novoCursoMock);
        });

        it('deve retornar erro 400 quando dados forem inválidos', async () => {
            const response = await request(app)
                .post('/api/cursos')
                .send({
                    nome_curso: '' // Nome vazio
                });

            expect(response.status).toBe(400);
        });
    });

    describe('PUT /api/cursos/:id', () => {
        it('deve atualizar curso com sucesso', async () => {
            cursosModel.atualizarCurso.mockResolvedValue({
                id_curso: 1,
                nome_curso: 'Curso Atualizado',
                descricao: null,
                carga_horaria: 50
            });

            const response = await request(app)
                .put('/api/cursos/1')
                .send({
                    nome_curso: 'Curso Atualizado',
                    carga_horaria: 50
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('id_curso', 1);
        });

        it('deve retornar erro 404 quando curso não for encontrado para atualizar', async () => {
            cursosModel.atualizarCurso.mockRejectedValue(
                Object.assign(new Error('Curso não encontrado.'), { status: 404 })
            );

            const response = await request(app)
                .put('/api/cursos/999')
                .send({
                    nome_curso: 'Curso Inexistente',
                    descricao: 'Não existe',
                    carga_horaria: 10
                });

            expect(response.status).toBe(404);
        });
    });

    describe('DELETE /api/cursos/:id', () => {
        it('deve deletar curso com sucesso', async () => {
            cursosModel.deletarCurso.mockResolvedValue(undefined);

            const response = await request(app).delete('/api/cursos/1');

            expect(response.status).toBe(204);
        });

        it('deve retornar erro 404 quando curso não for encontrado para deletar', async () => {
            cursosModel.deletarCurso.mockRejectedValue(Object.assign(new Error('Curso não encontrado.'), { status: 404 }));

            const response = await request(app).delete('/api/cursos/999');

            expect(response.status).toBe(404);
        });
    });
});
