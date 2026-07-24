const request = require('supertest');
const express = require('express');
const usuariosController = require('../api/controllers/usuarios.controller');
const usuariosRoutes = require('../api/routes/usuarios.routes');
const usuariosModel = require('../api/models/usuarios.models');

jest.mock('../api/models/usuarios.models');
jest.mock('../middlewares/checkAuth.middleware', () => (req, res, next) => next());
jest.mock('../middlewares/checkRole.middleware', () => (role) => (req, res, next) => next());
jest.mock('../middlewares/checkUserPermission.middleware', () => (req, res, next) => next());
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const app = express();
app.use(express.json());
app.use('/api/usuarios', usuariosRoutes);

describe('Usuarios Controller', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /api/usuarios', () => {
        const cadastroValido = (sufixo = '1') => ({
            nome_completo: `Aluno Teste ${sufixo}`,
            cpf: `1234567890${sufixo}`.slice(-11),
            email: `aluno${sufixo}@example.com`,
            senha: 'Senha@123'
        });

        it('deve criar ALUNO mesmo quando o banco está vazio', async () => {
            usuariosModel.criarUsuario.mockImplementation(async (dados) => ({ id_usuario: 1, ...dados, senha: undefined }));

            const response = await request(app).post('/api/usuarios').send(cadastroValido('1'));

            expect(response.status).toBe(201);
            expect(response.body.tipo).toBe('ALUNO');
            expect(usuariosModel.criarUsuario).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'ALUNO' }));
            expect(usuariosModel.count).toBeUndefined();
        });

        it.each([['ADMIN', '4'], ['PROFESSOR', '5']])('deve rejeitar papel %s no cadastro público', async (tipo, sufixo) => {
            const response = await request(app).post('/api/usuarios').send({ ...cadastroValido(sufixo), tipo });

            expect(response.status).toBe(400);
            expect(usuariosModel.criarUsuario).not.toHaveBeenCalled();
        });

        it('duas requisições simultâneas devem criar somente alunos', async () => {
            let id = 0;
            usuariosModel.criarUsuario.mockImplementation(async (dados) => ({ id_usuario: ++id, ...dados, senha: undefined }));

            const responses = await Promise.all([
                request(app).post('/api/usuarios').send(cadastroValido('2')),
                request(app).post('/api/usuarios').send(cadastroValido('3'))
            ]);

            expect(responses.map((response) => response.status)).toEqual([201, 201]);
            expect(responses.map((response) => response.body.tipo)).toEqual(['ALUNO', 'ALUNO']);
            expect(usuariosModel.criarUsuario.mock.calls.every(([dados]) => dados.tipo === 'ALUNO')).toBe(true);
        });
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
            usuariosModel.buscarUsuarioPorId.mockRejectedValue(Object.assign(new Error('Usuário não encontrado.'), { status: 404 }));

            const response = await request(app).get('/api/usuarios/999');

            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('message', 'Usuário não encontrado.');
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
            usuariosModel.atualizarUsuario.mockRejectedValue(
                Object.assign(new Error('Usuário não encontrado.'), { status: 404 })
            );

            const response = await request(app)
                .patch('/api/usuarios/999')
                .set('Authorization', 'Bearer valid-token')
                .send({
                    nome_completo: 'Nome Inexistente'
                });

            expect(response.status).toBe(404);
        });
    });

    describe('DELETE /api/usuarios/:id', () => {
        it('deve deletar usuário com sucesso', async () => {
            usuariosModel.deletarUsuario.mockResolvedValue(undefined);

            const response = await request(app).delete('/api/usuarios/1');

            expect(response.status).toBe(204);
        });

        it('deve retornar erro 404 quando usuário não for encontrado', async () => {
            usuariosModel.deletarUsuario.mockRejectedValue(Object.assign(new Error('Usuário não encontrado.'), { status: 404 }));

            const response = await request(app).delete('/api/usuarios/999');

            expect(response.status).toBe(404);
        });
    });
});
