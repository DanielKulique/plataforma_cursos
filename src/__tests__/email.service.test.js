jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
const logger = require('../utils/logger');
const { enviarCodigoVerificacaoEmail } = require('../services/email.service');

// Mock do Resend
jest.mock('resend', () => ({
    Resend: jest.fn().mockImplementation(() => ({
        emails: {
            send: jest.fn().mockResolvedValue({ id: 'mock-email-id' })
        }
    }))
}));

describe('Email Service', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    describe('enviarCodigoVerificacaoEmail', () => {
        it('deve retornar modo debug quando RESEND_API_KEY não estiver configurada', async () => {
            delete process.env.RESEND_API_KEY;

            const result = await enviarCodigoVerificacaoEmail({
                to: 'test@example.com',
                codigo: '123456',
                expiraEm: '10 minutos'
            });

            expect(result).toEqual({
                enviado: false,
                modo: 'debug'
            });

            expect(logger.warn).toHaveBeenCalledWith('email.verificacao.nao_enviado', { reason: 'RESEND_NOT_CONFIGURED' });
            const logs = JSON.stringify(logger.warn.mock.calls);
            expect(logs).not.toContain('test@example.com');
            expect(logs).not.toContain('123456');
        });

        it('deve usar valores padrão quando MAIL_FROM e APP_NAME não estiverem configurados', async () => {
            delete process.env.RESEND_API_KEY;
            delete process.env.MAIL_FROM;
            delete process.env.APP_NAME;

            await enviarCodigoVerificacaoEmail({
                to: 'test@example.com',
                codigo: '123456',
                expiraEm: '10 minutos'
            });

            expect(logger.warn).toHaveBeenCalled();
        });

        it('deve enviar e-mail via Resend quando API key estiver configurada', async () => {
            process.env.RESEND_API_KEY = 're_test_key';
            process.env.MAIL_FROM = 'test@domain.com';
            process.env.APP_NAME = 'Test App';

            const { Resend } = require('resend');

            const result = await enviarCodigoVerificacaoEmail({
                to: 'test@example.com',
                codigo: '123456',
                expiraEm: '10 minutos'
            });

            expect(result).toEqual({
                enviado: true,
                modo: 'resend'
            });

            expect(Resend).toHaveBeenCalledWith('re_test_key');
        });

        it('deve chamar resend.emails.send com parâmetros corretos', async () => {
            process.env.RESEND_API_KEY = 're_test_key';
            process.env.MAIL_FROM = 'noreply@test.com';
            process.env.APP_NAME = 'Plataforma Teste';

            const { Resend } = require('resend');
            const mockSend = jest.fn().mockResolvedValue({ id: 'email-id' });

            Resend.mockImplementation(() => ({
                emails: {
                    send: mockSend
                }
            }));

            await enviarCodigoVerificacaoEmail({
                to: 'usuario@example.com',
                codigo: '654321',
                expiraEm: '10 minutos'
            });

            expect(mockSend).toHaveBeenCalledWith({
                from: 'noreply@test.com',
                to: 'usuario@example.com',
                subject: expect.stringContaining('Plataforma Teste'),
                html: expect.stringContaining('654321')
            });
        });

        it('deve incluir código no HTML do e-mail', async () => {
            process.env.RESEND_API_KEY = 're_test_key';

            const { Resend } = require('resend');
            const mockSend = jest.fn().mockResolvedValue({ id: 'email-id' });

            Resend.mockImplementation(() => ({
                emails: {
                    send: mockSend
                }
            }));

            await enviarCodigoVerificacaoEmail({
                to: 'test@example.com',
                codigo: '999888',
                expiraEm: '10 minutos'
            });

            const callArgs = mockSend.mock.calls[0][0];
            expect(callArgs.html).toContain('999888');
            expect(callArgs.html).toContain('font-size: 28px');
        });

        it('deve lidar com erro ao enviar e-mail', async () => {
            process.env.RESEND_API_KEY = 're_test_key';

            const { Resend } = require('resend');
            const mockSend = jest.fn().mockRejectedValue(new Error('API error'));

            Resend.mockImplementation(() => ({
                emails: {
                    send: mockSend
                }
            }));

            await expect(
                enviarCodigoVerificacaoEmail({
                    to: 'test@example.com',
                    codigo: '123456',
                    expiraEm: '10 minutos'
                })
            ).rejects.toThrow('API error');
        });
    });
});
