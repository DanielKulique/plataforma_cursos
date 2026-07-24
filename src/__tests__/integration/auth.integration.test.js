/**
 * Testes de Integração - Fluxo de Autenticação
 * 
 * Testa o fluxo completo de autenticação:
 * - Registro de usuário
 * - Login
 * - Recuperação de sessão
 * - Verificação de e-mail
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const {
    initTestPool,
    clearDatabase,
    seedBasicData,
    closeTestPool,
    getTestPassword
} = require('./setup');
const { app } = require('../../../index');
const applicationDb = require('../../config/database');

let authToken = null;
let testUsers = null;
let pool = null;
const testPassword = getTestPassword();

describe('Testes de Integração - Autenticação', () => {
    beforeAll(async () => {
        pool = await initTestPool();
    });

    afterAll(async () => {
        await closeTestPool();
        await applicationDb.end();
    });

    describe('POST /api/usuarios - política de cadastro público', () => {
        beforeEach(clearDatabase);

        it('o primeiro cadastro em banco vazio deve criar exclusivamente ALUNO', async () => {
            const response = await request(app)
                .post('/api/usuarios')
                .send({
                    nome_completo: 'Cadastro Público Integração',
                    cpf: '44444444444',
                    email: 'cadastro.publico@teste.com',
                    senha: testPassword
                });

            expect(response.status).toBe(201);
            expect(response.body.tipo).toBe('ALUNO');

            const [rows] = await pool.query('SELECT tipo FROM Usuarios ORDER BY id_usuario');
            expect(rows.map((row) => row.tipo)).toEqual(['ALUNO']);
        });

        it.each(['ADMIN', 'PROFESSOR'])('deve rejeitar tentativa de criar %s', async (tipo) => {
            const response = await request(app)
                .post('/api/usuarios')
                .send({
                    nome_completo: `Tentativa ${tipo}`,
                    cpf: tipo === 'ADMIN' ? '55555555555' : '66666666666',
                    email: `tentativa.${tipo.toLowerCase()}@teste.com`,
                    senha: testPassword,
                    tipo
                });

            expect(response.status).toBe(400);
        });

        it('duas requisições simultâneas não devem criar administradores ou professores', async () => {
            const cadastros = [
                { nome_completo: 'Aluno Concorrente A', cpf: '77777777777', email: 'concorrente.a@teste.com', senha: testPassword },
                { nome_completo: 'Aluno Concorrente B', cpf: '88888888888', email: 'concorrente.b@teste.com', senha: testPassword }
            ];

            const responses = await Promise.all(cadastros.map((dados) => (
                request(app).post('/api/usuarios').send(dados)
            )));

            expect(responses.map((response) => response.status)).toEqual([201, 201]);
            expect(responses.map((response) => response.body.tipo)).toEqual(['ALUNO', 'ALUNO']);

            const [privileged] = await pool.query("SELECT id_usuario FROM Usuarios WHERE tipo IN ('ADMIN', 'PROFESSOR')");
            expect(privileged).toHaveLength(0);
        });
    });

    describe('POST /api/auth/login', () => {
        beforeEach(async () => {
            await clearDatabase();
            await seedBasicData();
        });

        it('deve autenticar usuário ADMIN com sucesso', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'admin@teste.com',
                    senha: testPassword
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('token');
            expect(response.body).toHaveProperty('usuario');
            expect(response.body.usuario.tipo).toBe('ADMIN');
            expect(response.body.usuario.email).toBe('admin@teste.com');

            authToken = response.body.token;
        });

        it('deve autenticar usuário PROFESSOR com sucesso', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'professor@teste.com',
                    senha: testPassword
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('token');
            expect(response.body.usuario.tipo).toBe('PROFESSOR');
        });

        it('deve autenticar usuário ALUNO com sucesso', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'aluno@teste.com',
                    senha: testPassword
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('token');
            expect(response.body.usuario.tipo).toBe('ALUNO');
        });

        it('deve retornar 401 para credenciais inválidas', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'admin@teste.com',
                    senha: 'SenhaErrada'
                });

            expect(response.status).toBe(401);
            expect(response.body).toHaveProperty('mensagem');
        });

        it('deve retornar 401 para usuário inexistente', async () => {
            const response = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'inexistente@teste.com',
                    senha: testPassword
                });

            expect(response.status).toBe(401);
        });
    });

    describe('GET /api/auth/me', () => {
        beforeEach(async () => {
            await clearDatabase();
            testUsers = await seedBasicData();
            const loginResponse = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'admin@teste.com',
                    senha: testPassword
                });
            authToken = loginResponse.body.token;
        });

        it('deve retornar dados do usuário autenticado', async () => {
            const response = await request(app)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('usuario');
            expect(response.body.usuario.email).toBe('admin@teste.com');
            expect(response.body.usuario.tipo).toBe('ADMIN');
        });

        it('deve retornar 401 sem token', async () => {
            const response = await request(app)
                .get('/api/auth/me');

            expect(response.status).toBe(401);
        });

        it('deve retornar 401 com token inválido', async () => {
            const response = await request(app)
                .get('/api/auth/me')
                .set('Authorization', 'Bearer token-invalido');

            expect(response.status).toBe(401);
        });

        it('deve retornar 401 para JWT expirado', async () => {
            const expiredToken = jwt.sign(
                { id_usuario: testUsers.admin.id_usuario, tipo: 'ADMIN' },
                process.env.JWT_SECRET,
                { expiresIn: -1 }
            );
            const response = await request(app)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${expiredToken}`);

            expect(response.status).toBe(401);
        });

        it('deve invalidar a sessão quando o usuário for removido após a emissão', async () => {
            await pool.query('DELETE FROM EmailVerificacoes WHERE email = ?', ['admin@teste.com']);
            await pool.query('DELETE FROM Usuarios WHERE id_usuario = ?', [testUsers.admin.id_usuario]);

            const response = await request(app)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(401);
            expect(response.body.mensagem).toBe('Sessão inválida');
        });

        it('deve usar o papel atual do banco após a emissão do token', async () => {
            await pool.query("UPDATE Usuarios SET tipo = 'ALUNO' WHERE id_usuario = ?", [testUsers.admin.id_usuario]);

            const response = await request(app)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.usuario.tipo).toBe('ALUNO');
        });
    });

    describe('POST /api/auth/enviar-codigo-verificacao', () => {
        beforeEach(async () => {
            await clearDatabase();
            await seedBasicData();
        });

        it('deve gerar código de verificação de e-mail', async () => {
            const response = await request(app)
                .post('/api/auth/enviar-codigo-verificacao')
                .send({
                    email: 'aluno@teste.com'
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('email');
            expect(response.body).not.toHaveProperty('codigo');
            expect(response.body).not.toHaveProperty('codigo_debug');
        });
    });
});
