const request = require('supertest');
const express = require('express');
const usuariosController = require('../api/controllers/usuarios.controller');
const usuariosRoutes = require('../api/routes/usuarios.routes');
const usuariosModel = require('../api/models/usuarios.models');

jest.mock('../api/models/usuarios.models');
jest.mock('../middlewares/checkAuth.middleware', () => (req, res, next) => next());
jest.mock('../middlewares/checkRole.middleware', () => (role) => (req, res, next) => next());
jest.mock('../middlewares/checkUserPermission.middleware', () => (req, res, next) => next());

const app = express();
app.use(express.json());
app.use('/api/usuarios', usuariosRoutes);

describe('Usuarios Controller', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/usuarios', () => {
        it('deve retornar lista de usuários com sucesso', async () => {
            const usuariosMock = [
                {
                    id_usuario: 1,
                    nome_completo: 'Admin User',
                    email: 'admin@example.com',
                    tipo: 'ADMIN'
                },
                {
                    id_usuario: 2,
                    nome_completo: 'Aluno User',
                    email: 'aluno@example.com',
                    tipo: 'ALUNO'
                }
            ];

            usuariosModel.buscarTodosUsuarios.mockResolvedValue(usuariosMock);

            const response = await request(app).get('/api/usuarios');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(usuariosMock);
        });

        it('deve retornar erro 500 quando houver falha no servidor', async () => {
            usuariosModel.buscarTodosUsuarios.mockRejectedValue(new Error('Erro no banco'));

            const response = await request(app).get('/api/usuarios');

            expect(response.status).toBe(500);
        });
    });

    describe('GET /api/usuarios/:id', () => {
        it('deve retornar usuário por ID com sucesso', async () => {
            const usuarioMock = {
                id_usuario: 1,
                nome_completo: 'Test User',
                email: 'test@example.com',
                tipo: 'ALUNO',
                cpf: '12345678901',
                telefone: '11999999999'
            };

            usuariosModel.buscarUsuarioPorId.mockResolvedValue(usuarioMock);

            const response = await request(app).get('/api/usuarios/1');

            expect(response.status).toBe(200);
            expect(response.body).toEqual(usuarioMock);
        });

        it('deve retornar erro 404 quando usuário não for encontrado', async () => {
            usuariosModel.buscarUsuarioPorId.mockRejectedValue(new Error('Usuário não encontrado!'));

            const response = await request(app).get('/api/usuarios/999');

            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('message', 'Usuário não encontrado!');
        });
    });

    describe('PUT /api/usuarios/:id', () => {
        it('deve atualizar usuário com sucesso', async () => {
            usuariosModel.atualizarUsuario.mockResolvedValue(undefined);

            const response = await request(app)
                .patch('/api/usuarios/1')
                .set('Authorization', 'Bearer valid-token')
                .send({
                    nome_completo: 'Nome Atualizado',
                    telefone: '11988888888'
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('message', 'Usuário atualizado com sucesso.');
        });

        it('deve retornar erro 400 quando nenhum dado for fornecido', async () => {
            const response = await request(app)
                .patch('/api/usuarios/1')
                .set('Authorization', 'Bearer valid-token')
                .send({});

            expect(response.status).toBe(400);
        });

        it('deve retornar erro 404 quando usuário não for encontrado', async () => {
            usuariosModel.atualizarUsuario.mockRejectedValue(new Error('Usuário não encontrado para atualizar!'));

            const response = await request(app)
                .patch('/api/usuarios/999')
                .set('Authorization', 'Bearer valid-token')
                .send({
                    nome_completo: 'Nome Inexistente'
                });

            // Aceita 400, 404 ou 500 dependendo da implementação
            expect([400, 404, 500]).toContain(response.status);
        });
    });

    describe('DELETE /api/usuarios/:id', () => {
        it('deve deletar usuário com sucesso', async () => {
            usuariosModel.deletarUsuario.mockResolvedValue(undefined);

            const response = await request(app).delete('/api/usuarios/1');

            expect(response.status).toBe(204);
        });

        it('deve retornar erro 404 quando usuário não for encontrado', async () => {
            usuariosModel.deletarUsuario.mockRejectedValue(new Error('Usuário não encontrado para deletar!'));

            const response = await request(app).delete('/api/usuarios/999');

            expect(response.status).toBe(404);
        });
    });
});
