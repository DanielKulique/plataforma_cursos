const request = require('supertest');
const express = require('express');
const authController = require('../api/controllers/auth.controller');
const authRoutes = require('../api/routes/auth.routes');
const authModel = require('../api/models/auth.models');
const jwt = require('jsonwebtoken');
const checkAuth = require('../middlewares/checkAuth.middleware');
const {
    enviarCodigoVerificacaoEmail,
    enviarRecuperacaoSenhaEmail
} = require('../services/email.service');

// Mock dos módulos
jest.mock('../api/models/auth.models');
jest.mock('../services/email.service');
jest.mock('jsonwebtoken');
jest.mock('../middlewares/checkAuth.middleware', () => (req, res, next) => {
    req.user = {
        id_usuario: 1,
        nome_completo: 'Test User',
        email: 'test@example.com',
        telefone: '11999999999',
        tipo: 'ALUNO'
    };
    next();
});

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

describe('Auth Controller', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /api/auth/login', () => {
        it('deve autenticar por cookie HttpOnly sem expor o JWT no corpo', async () => {
            const usuarioMock = {
                id_usuario: 1,
                nome_completo: 'Test User',
                email: 'test@example.com',
                tipo: 'ALUNO'
            };

            authModel.login.mockResolvedValue(usuarioMock);
            jwt.sign.mockReturnValue('fake-token');

            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'test@example.com',
                    senha: 'senha123'
                });

            expect(response.status).toBe(200);
            expect(response.body).not.toHaveProperty('token');
            expect(response.body).toHaveProperty('csrf_token');
            expect(response.headers['set-cookie'][0]).toContain('plataforma_session=fake-token');
            expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
            expect(response.body).toHaveProperty('usuario');
            expect(response.body.usuario.nome_completo).toBe('Test User');
        });

        it('deve retornar erro 401 quando credenciais forem inválidas', async () => {
            authModel.login.mockRejectedValue({
                message: 'Email ou senha inválidos',
                status: 401
            });

            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'invalido@example.com',
                    senha: 'senhaerrada'
                });

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('mensagem', 'Email ou senha inválidos');
        });

        it('não expõe mensagem técnica de falha inesperada', async () => {
            authModel.login.mockRejectedValue(new Error('SQL connection refused at internal-host'));

            const response = await request(app)
                .post('/api/auth/login')
                .send({ email: 'test@example.com', senha: 'senha123' });

            expect(response.status).toBe(500);
            expect(response.body.mensagem).toBe('Não foi possível entrar agora.');
            expect(JSON.stringify(response.body)).not.toContain('internal-host');
        });
    });

    describe('GET /api/auth/me', () => {
        it('deve retornar dados do usuário autenticado', async () => {
            const usuarioMock = {
                id_usuario: 1,
                nome_completo: 'Test User',
                email: 'test@example.com',
                tipo: 'ALUNO'
            };

            const response = await request(app)
                .get('/api/auth/me')
                .set('Authorization', 'Bearer valid-token');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('usuario');
            expect(response.body.usuario).toEqual(expect.objectContaining(usuarioMock));
            expect(authModel.buscarUsuarioPorId).not.toHaveBeenCalled();
        });

        it('deve responder com os dados autoritativos fornecidos pelo middleware', async () => {
            const response = await request(app).get('/api/auth/me');

            expect(response.status).toBe(200);
            expect(response.body.usuario.tipo).toBe('ALUNO');
            expect(response.body.usuario.nome_completo).toBe('Test User');
        });
    });

    describe('POST /api/auth/verificar-codigo-email', () => {
        it('deve retornar sucesso quando código for válido', async () => {
            authModel.verificarCodigoEmail.mockResolvedValue({
                jaVerificado: false
            });

            const response = await request(app)
                .post('/api/auth/verificar-codigo-email')
                .send({
                    email: 'test@example.com',
                    codigo: '123456'
                });

            expect(response.status).toBe(200);
        });

        it('deve retornar erro quando código for inválido', async () => {
            authModel.verificarCodigoEmail.mockRejectedValue({
                message: 'Código inválido ou expirado',
                status: 400
            });

            const response = await request(app)
                .post('/api/auth/verificar-codigo-email')
                .send({
                    email: 'test@example.com',
                    codigo: 'codigoerrado'
                });

            expect(response.status).toBe(400);
        });
    });

    describe('POST /api/auth/enviar-codigo-verificacao', () => {
        it('não expõe o código quando o envio está em modo debug', async () => {
            authModel.enviarCodigoVerificacaoPorEmail.mockResolvedValue({
                enviar: true,
                email: 'test@example.com',
                codigo: '123456',
                expira_em: new Date('2026-07-22T12:00:00Z')
            });
            enviarCodigoVerificacaoEmail.mockResolvedValue({ enviado: false, modo: 'debug' });

            const response = await request(app)
                .post('/api/auth/enviar-codigo-verificacao')
                .send({ email: 'test@example.com' });

            expect(response.status).toBe(202);
            expect(response.body).not.toHaveProperty('codigo');
            expect(response.body).not.toHaveProperty('codigo_debug');
            expect(JSON.stringify(response.body)).not.toContain('123456');
        });
    });

    describe('POST /api/auth/recuperar-senha', () => {
        it('mantém a resposta indistinguível entre conta ausente e falha do provedor', async () => {
            authModel.criarTokenRecuperacao.mockResolvedValueOnce(null);
            const contaAusente = await request(app)
                .post('/api/auth/recuperar-senha')
                .send({ email: 'ausente@example.test' });

            authModel.criarTokenRecuperacao.mockResolvedValueOnce({
                email: 'existente@example.test',
                token: 'token-secreto',
                expira_em: new Date('2026-09-08T14:00:00Z')
            });
            enviarRecuperacaoSenhaEmail.mockRejectedValueOnce(new Error('provider unavailable'));
            const provedorIndisponivel = await request(app)
                .post('/api/auth/recuperar-senha')
                .send({ email: 'existente@example.test' });

            expect(contaAusente.status).toBe(202);
            expect(provedorIndisponivel.status).toBe(202);
            expect(provedorIndisponivel.body).toEqual(contaAusente.body);
            expect(JSON.stringify(provedorIndisponivel.body)).not.toContain('provider unavailable');
        });
    });
});
