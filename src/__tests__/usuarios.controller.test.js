const request = require('supertest');
const express = require('express');
const usuariosController = require('../api/controllers/usuarios.controller');
const usuariosRoutes = require('../api/routes/usuarios.routes');
const usuariosModel = require('../api/models/usuarios.models');
const emailService = require('../services/email.service');

jest.mock('../api/models/usuarios.models');
jest.mock('../services/email.service');
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
        emailService.emailDeliveryEnabled.mockReturnValue(true);
        emailService.publicRegistrationRequiresEmailVerification.mockReturnValue(true);
        emailService.enviarCodigoVerificacaoEmail.mockResolvedValue({ enviado: true, modo: 'resend' });
    });

    describe('POST /api/usuarios', () => {
        const cadastroValido = (sufixo = '1') => ({
            nome_completo: `Aluno Teste ${sufixo}`,
            cpf: `1234567890${sufixo}`.slice(-11),
            email: `aluno${sufixo}@example.com`,
            senha: 'Senha@123'
        });

        it('deve criar ALUNO mesmo quando o banco está vazio', async () => {
            usuariosModel.criarAlunoComVerificacao.mockImplementation(async (dados) => ({
                usuario: { id_usuario: 1, ...dados, tipo: 'ALUNO', senha: undefined },
                verificacao: { codigo: '123456', expira_em: new Date('2026-09-07T18:00:00Z') }
            }));

            const response = await request(app).post('/api/usuarios').send(cadastroValido('1'));

            expect(response.status).toBe(201);
            expect(response.body.tipo).toBe('ALUNO');
            expect(usuariosModel.criarAlunoComVerificacao).toHaveBeenCalledWith(expect.objectContaining({ email: 'aluno1@example.com' }));
            expect(response.body.verificacao).toMatchObject({ estado: 'PENDENTE', email_enviado: true });
            expect(usuariosModel.count).toBeUndefined();
        });

        it('falha antes de criar usuário quando a entrega de e-mail está desabilitada', async () => {
            emailService.emailDeliveryEnabled.mockReturnValue(false);

            const response = await request(app).post('/api/usuarios').send(cadastroValido('8'));

            expect(response.status).toBe(503);
            expect(response.body).toEqual(expect.objectContaining({
                error: 'Cadastro temporariamente indisponível.'
            }));
            expect(usuariosModel.criarAlunoComVerificacao).not.toHaveBeenCalled();
            expect(emailService.enviarCodigoVerificacaoEmail).not.toHaveBeenCalled();
        });

        it('cria ALUNO verificado sem código quando a verificação pública está desabilitada', async () => {
            emailService.emailDeliveryEnabled.mockReturnValue(false);
            emailService.publicRegistrationRequiresEmailVerification.mockReturnValue(false);
            usuariosModel.criarAlunoComVerificacao.mockImplementation(async (dados) => ({
                usuario: { id_usuario: 8, ...dados, tipo: 'ALUNO', senha: undefined },
                verificacao: { codigo: null, expira_em: null, verificado: true }
            }));

            const response = await request(app).post('/api/usuarios').send(cadastroValido('8'));

            expect(response.status).toBe(201);
            expect(response.body.verificacao).toEqual({
                estado: 'VERIFICADO', email_enviado: false, expira_em: null
            });
            expect(usuariosModel.criarAlunoComVerificacao).toHaveBeenCalledWith(
                expect.objectContaining({ email: 'aluno8@example.com' }),
                true
            );
            expect(emailService.enviarCodigoVerificacaoEmail).not.toHaveBeenCalled();
        });

        it('expõe somente a disponibilidade pública do cadastro', async () => {
            emailService.emailDeliveryEnabled.mockReturnValue(false);
            const response = await request(app).get('/api/usuarios/cadastro-status');
            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                disponivel: false,
                mensagem: 'Novos cadastros estão temporariamente indisponíveis.'
            });
        });

        it('mantém cadastro disponível sem entrega quando verificação não é exigida', async () => {
            emailService.emailDeliveryEnabled.mockReturnValue(false);
            emailService.publicRegistrationRequiresEmailVerification.mockReturnValue(false);
            const response = await request(app).get('/api/usuarios/cadastro-status');
            expect(response.status).toBe(200);
            expect(response.body).toEqual({ disponivel: true });
        });

        it.each([['ADMIN', '4'], ['PROFESSOR', '5']])('deve rejeitar papel %s no cadastro público', async (tipo, sufixo) => {
            const response = await request(app).post('/api/usuarios').send({ ...cadastroValido(sufixo), tipo });

            expect(response.status).toBe(400);
            expect(usuariosModel.criarAlunoComVerificacao).not.toHaveBeenCalled();
        });

        it('duas requisições simultâneas devem criar somente alunos', async () => {
            let id = 0;
            usuariosModel.criarAlunoComVerificacao.mockImplementation(async (dados) => ({
                usuario: { id_usuario: ++id, ...dados, tipo: 'ALUNO', senha: undefined },
                verificacao: { codigo: '123456', expira_em: new Date('2026-09-07T18:00:00Z') }
            }));

            const responses = await Promise.all([
                request(app).post('/api/usuarios').send(cadastroValido('2')),
                request(app).post('/api/usuarios').send(cadastroValido('3'))
            ]);

            expect(responses.map((response) => response.status)).toEqual([201, 201]);
            expect(responses.map((response) => response.body.tipo)).toEqual(['ALUNO', 'ALUNO']);
            expect(usuariosModel.criarAlunoComVerificacao).toHaveBeenCalledTimes(2);
        });

        it('mantém cadastro pendente e recuperável quando o provedor falha', async () => {
            usuariosModel.criarAlunoComVerificacao.mockResolvedValue({
                usuario: { id_usuario: 9, email: 'aluno9@example.com', tipo: 'ALUNO' },
                verificacao: { codigo: '654321', expira_em: new Date('2026-09-07T18:00:00Z') }
            });
            emailService.enviarCodigoVerificacaoEmail.mockRejectedValue(
                Object.assign(new Error('falha'), { code: 'EMAIL_PROVIDER_ERROR' })
            );

            const response = await request(app).post('/api/usuarios').send(cadastroValido('9'));

            expect(response.status).toBe(201);
            expect(response.body.verificacao).toMatchObject({ estado: 'PENDENTE', email_enviado: false });
            expect(usuariosModel.criarAlunoComVerificacao).toHaveBeenCalledTimes(1);
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

            usuariosModel.buscarTodosUsuarios.mockResolvedValue({ items: usuariosMock, total: 2 });

            const response = await request(app).get('/api/usuarios');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ items: usuariosMock, page: 1, limit: 50, total: 2 });
        });

        it('deve retornar erro 500 quando houver falha no servidor', async () => {
            usuariosModel.buscarTodosUsuarios.mockRejectedValue(new Error('Erro no banco'));

            const response = await request(app).get('/api/usuarios');

            expect(response.status).toBe(500);
        });

        it('aplica página, limita limit máximo e aceita página vazia com total', async () => {
            usuariosModel.buscarTodosUsuarios.mockResolvedValue({ items: [], total: 237 });
            const response = await request(app).get('/api/usuarios?page=3&limit=999999');
            expect(response.status).toBe(200);
            expect(usuariosModel.buscarTodosUsuarios).toHaveBeenCalledWith({ page: 3, limit: 100, offset: 200 });
            expect(response.body).toEqual({ items: [], page: 3, limit: 100, total: 237 });
        });

        it('rejeita paginação inválida', async () => {
            const response = await request(app).get('/api/usuarios?page=0');
            expect(response.status).toBe(400);
            expect(response.body.code).toBe('PAGINACAO_INVALIDA');
            expect(usuariosModel.buscarTodosUsuarios).not.toHaveBeenCalled();
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
