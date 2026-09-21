const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');

jest.mock('../../services/email.service', () => ({
    enviarCodigoVerificacaoEmail: jest.fn().mockResolvedValue({ enviado: true, modo: 'test' }),
    enviarRecuperacaoSenhaEmail: jest.fn().mockResolvedValue({ enviado: true, modo: 'test' })
}));

const emailService = require('../../services/email.service');
const { app } = require('../../../index');
const applicationDb = require('../../config/database');
const { SESSION_COOKIE_NAME } = require('../../config/session');
const {
    initTestPool,
    clearDatabase,
    seedBasicData,
    closeTestPool,
    getTestPassword
} = require('./setup');

let pool;
const testPassword = getTestPassword();

async function authenticatedAgent(email = 'aluno@teste.com', password = testPassword) {
    const agent = request.agent(app);
    const login = await agent.post('/api/auth/login').send({ email, senha: password });
    expect(login.status).toBe(200);
    return { agent, login, csrf: login.body.csrf_token };
}

describe('segurança do MVP com cookie, CSRF e recuperação', () => {
    beforeAll(async () => {
        pool = await initTestPool();
    });

    beforeEach(async () => {
        await clearDatabase();
        await seedBasicData();
        jest.clearAllMocks();
    });

    afterAll(async () => {
        await closeTestPool();
        await applicationDb.end();
    });

    it('autentica por cookie HttpOnly, exige CSRF e invalida a sessão no logout', async () => {
        const first = await authenticatedAgent();
        const second = await authenticatedAgent();
        const cookie = first.login.headers['set-cookie'].join(';');
        expect(cookie).toContain(`${SESSION_COOKIE_NAME}=`);
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('SameSite=Lax');
        expect(cookie).toContain('Path=/');

        expect((await first.agent.get('/api/auth/me')).status).toBe(200);
        expect((await first.agent.post('/api/auth/logout')).status).toBe(403);
        expect((await first.agent.post('/api/auth/logout').set('X-CSRF-Token', 'token-invalido')).status).toBe(403);
        expect((await first.agent.post('/api/auth/logout').set('X-CSRF-Token', second.csrf)).status).toBe(403);
        expect((await first.agent.post('/api/auth/logout').set('X-CSRF-Token', first.csrf)).status).toBe(204);
        expect((await first.agent.get('/api/auth/me')).status).toBe(401);
    });

    it('recusa cookie expirado', async () => {
        const token = jwt.sign(
            { id_usuario: 3, tipo: 'ALUNO', csrf: 'csrf-expirado', sv: 0 },
            process.env.JWT_SECRET,
            { expiresIn: -1 }
        );
        const response = await request(app)
            .get('/api/auth/me')
            .set('Cookie', `${SESSION_COOKIE_NAME}=${token}`);
        expect(response.status).toBe(401);
    });

    it('mantém solicitação indistinguível e redefine a senha uma única vez', async () => {
        const existente = await request(app)
            .post('/api/auth/recuperar-senha')
            .send({ email: 'aluno@teste.com' });
        const inexistente = await request(app)
            .post('/api/auth/recuperar-senha')
            .send({ email: 'ninguem@example.test' });
        expect(existente.status).toBe(202);
        expect(inexistente.status).toBe(202);
        expect(existente.body).toEqual(inexistente.body);
        expect(emailService.enviarRecuperacaoSenhaEmail).toHaveBeenCalledTimes(1);

        const recoveryToken = emailService.enviarRecuperacaoSenhaEmail.mock.calls[0][0].token;
        expect((await request(app).post('/api/auth/redefinir-senha').send({
            token: recoveryToken,
            nova_senha: 'fraca'
        })).status).toBe(400);
        expect((await request(app).post('/api/auth/redefinir-senha').send({
            token: crypto.randomBytes(32).toString('base64url'),
            nova_senha: 'NovaSenha@456'
        })).status).toBe(400);
        expect((await request(app).post('/api/auth/redefinir-senha').send({
            token: recoveryToken,
            nova_senha: 'NovaSenha@456'
        })).status).toBe(200);
        expect((await request(app).post('/api/auth/redefinir-senha').send({
            token: recoveryToken,
            nova_senha: 'OutraSenha@789'
        })).status).toBe(400);

        expect((await request(app).post('/api/auth/login').send({
            email: 'aluno@teste.com', senha: testPassword
        })).status).toBe(401);
        expect((await request(app).post('/api/auth/login').send({
            email: 'aluno@teste.com', senha: 'NovaSenha@456'
        })).status).toBe(200);
    });

    it('recusa token de recuperação expirado', async () => {
        await request(app).post('/api/auth/recuperar-senha').send({ email: 'aluno@teste.com' });
        const recoveryToken = emailService.enviarRecuperacaoSenhaEmail.mock.calls[0][0].token;
        const tokenHash = crypto.createHash('sha256').update(recoveryToken).digest('hex');
        await pool.query(
            'UPDATE PasswordResetTokens SET expira_em = ? WHERE token_hash = ?',
            [new Date(Date.now() - 60_000), tokenHash]
        );
        const response = await request(app).post('/api/auth/redefinir-senha').send({
            token: recoveryToken,
            nova_senha: 'NovaSenha@456'
        });
        expect(response.status).toBe(400);
    });

    it('desliga completamente o detector e informa a capability', async () => {
        const previous = process.env.DETECTOR_ENABLED;
        process.env.DETECTOR_ENABLED = 'false';
        try {
            const session = await authenticatedAgent();
            const capabilities = await session.agent.get('/api/capabilities');
            expect(capabilities.status).toBe(200);
            expect(capabilities.body.features.detector).toEqual({ enabled: false, experimental: true });

            const detector = await session.agent
                .post('/api/analises/contextual')
                .set('X-CSRF-Token', session.csrf)
                .send({});
            expect(detector.status).toBe(503);
            expect(detector.body.codigo).toBe('RECURSO_DESABILITADO');
        } finally {
            if (previous === undefined) delete process.env.DETECTOR_ENABLED;
            else process.env.DETECTOR_ENABLED = previous;
        }
    });
});
