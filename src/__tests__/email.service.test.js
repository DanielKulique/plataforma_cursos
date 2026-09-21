jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
const logger = require('../utils/logger');
const { enviarCodigoVerificacaoEmail } = require('../services/email.service');

// Mock do Resend
jest.mock('resend', () => ({
    Resend: jest.fn().mockImplementation(() => ({
        emails: {
            send: jest.fn().mockResolvedValue({ data: { id: 'mock-email-id' }, error: null, headers: null })
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

    afterEach(() => {
        jest.useRealTimers();
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

        it('deve permitir desabilitar entrega explicitamente no staging de produção', async () => {
            process.env.NODE_ENV = 'production';
            process.env.EMAIL_DELIVERY_ENABLED = 'false';
            delete process.env.RESEND_API_KEY;

            const result = await enviarCodigoVerificacaoEmail({
                to: 'demo@example.test',
                codigo: '123456'
            });

            expect(result).toEqual({ enviado: false, modo: 'disabled' });
            expect(logger.warn).toHaveBeenCalledWith(
                'email.verificacao.nao_enviado',
                { reason: 'EMAIL_DELIVERY_DISABLED' }
            );
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
            const mockSend = jest.fn().mockResolvedValue({ data: { id: 'email-id' }, error: null, headers: null });

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
            const mockSend = jest.fn().mockResolvedValue({ data: { id: 'email-id' }, error: null, headers: null });

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
            ).rejects.toMatchObject({ code: 'EMAIL_PROVIDER_ERROR', status: 503 });
        });

        it('trata erro retornado pelo SDK mesmo sem exceção', async () => {
            process.env.RESEND_API_KEY = 're_test_key';
            const { Resend } = require('resend');
            Resend.mockImplementation(() => ({
                emails: {
                    send: jest.fn().mockResolvedValue({
                        data: null,
                        error: { name: 'rate_limit_exceeded', statusCode: 429, message: 'quota' },
                        headers: null
                    })
                }
            }));

            await expect(enviarCodigoVerificacaoEmail({
                to: 'test@example.com',
                codigo: '123456'
            })).rejects.toMatchObject({ code: 'EMAIL_PROVIDER_ERROR', status: 503 });
            expect(logger.error).toHaveBeenCalledWith('email.verificacao.falhou', expect.objectContaining({
                reason: 'rate_limit_exceeded',
                statusCode: 429
            }));
        });

        it('trata timeout do provedor de forma explícita', async () => {
            jest.useFakeTimers();
            process.env.RESEND_API_KEY = 're_test_key';
            process.env.EMAIL_PROVIDER_TIMEOUT_MS = '1000';
            const { Resend } = require('resend');
            Resend.mockImplementation(() => ({
                emails: { send: jest.fn(() => new Promise(() => {})) }
            }));

            const envio = enviarCodigoVerificacaoEmail({
                to: 'test@example.com',
                codigo: '123456'
            });
            const expectativa = expect(envio).rejects.toMatchObject({
                code: 'EMAIL_PROVIDER_TIMEOUT',
                status: 503
            });
            await jest.advanceTimersByTimeAsync(1000);
            await expectativa;
        });
    });
});
