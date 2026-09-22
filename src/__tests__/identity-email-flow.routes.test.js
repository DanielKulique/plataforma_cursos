const request = require('supertest');
const express = require('express');

jest.mock('../api/models/auth.models', () => ({
    enviarCodigoVerificacaoPorEmail: jest.fn().mockResolvedValue({ enviar: false }),
    verificarCodigoEmail: jest.fn().mockRejectedValue(
        Object.assign(new Error('Código inválido.'), { status: 400, code: 'CODIGO_INVALIDO' })
    )
}));
jest.mock('../services/email.service', () => ({
    emailDeliveryEnabled: jest.fn(() => true),
    enviarCodigoVerificacaoEmail: jest.fn(),
    enviarRecuperacaoSenhaEmail: jest.fn()
}));
jest.mock('../middlewares/checkAuth.middleware', () => (req, res, next) => next());
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

describe('rate limits do fluxo de verificação nas rotas reais', () => {
    const originalEnv = process.env;
    let app;

    beforeAll(() => {
        process.env = {
            ...originalEnv,
            NODE_ENV: 'test',
            EMAIL_VERIFICATION_RATE_LIMIT_WINDOW_MS: '60000',
            EMAIL_CODE_SEND_IP_RATE_LIMIT_MAX: '1',
            EMAIL_CODE_SEND_IDENTITY_RATE_LIMIT_MAX: '1',
            EMAIL_CODE_VERIFY_IP_RATE_LIMIT_MAX: '1',
            EMAIL_CODE_VERIFY_IDENTITY_RATE_LIMIT_MAX: '1'
        };
        jest.isolateModules(() => {
            const authRoutes = require('../api/routes/auth.routes');
            app = express();
            app.use(express.json());
            app.use('/api/auth', authRoutes);
        });
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    it('limita excesso de envio no endpoint montado', async () => {
        const primeira = await request(app)
            .post('/api/auth/enviar-codigo-verificacao')
            .send({ email: 'aluno@example.test' });
        const segunda = await request(app)
            .post('/api/auth/enviar-codigo-verificacao')
            .send({ email: 'aluno@example.test' });

        expect(primeira.status).toBe(202);
        expect(segunda.status).toBe(429);
    });

    it('limita excesso de tentativas no endpoint montado', async () => {
        const primeira = await request(app)
            .post('/api/auth/verificar-codigo-email')
            .send({ email: 'aluno@example.test', codigo: '000000' });
        const segunda = await request(app)
            .post('/api/auth/verificar-codigo-email')
            .send({ email: 'aluno@example.test', codigo: '000000' });

        expect(primeira.status).toBe(400);
        expect(segunda.status).toBe(429);
    });
});
