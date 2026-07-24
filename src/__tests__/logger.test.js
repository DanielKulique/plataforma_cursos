const logger = require('../utils/logger');

describe('logger com redaction', () => {
    it('remove segredos e dados pessoais sem alterar o objeto original', () => {
        const original = {
            senha: 'Segredo@123',
            token: 'eyJheader.eyJpayload.signature',
            usuario: {
                email: 'pessoa@example.com',
                cpf: '12345678901',
                telefone: '11999999999',
                id_usuario: 42
            }
        };

        const redacted = logger.redact(original);

        expect(redacted).toEqual({
            senha: logger.REDACTED,
            token: logger.REDACTED,
            usuario: logger.REDACTED
        });
        expect(original.senha).toBe('Segredo@123');
        expect(original.usuario.email).toBe('pessoa@example.com');
    });

    it('não escreve senha, token, código ou PII mesmo em estruturas aninhadas', () => {
        const consoleSpy = jest.spyOn(console, 'info').mockImplementation();
        logger.info('security.test', {
            requestId: 'request-1',
            body: {
                password: 'Senha@123',
                authorization: 'Bearer token-secreto',
                codigo: '123456',
                email: 'pessoa@example.com',
                cpf: '12345678901',
                telefone: '11999999999'
            }
        });

        const output = consoleSpy.mock.calls.flat().join(' ');
        ['Senha@123', 'token-secreto', '123456', 'pessoa@example.com', '12345678901', '11999999999']
            .forEach((sensitive) => expect(output).not.toContain(sensitive));
        expect(output).toContain('request-1');
        consoleSpy.mockRestore();
    });

    it('redige aliases de segredos e objetos completos de requisição ou usuário', () => {
        const redacted = logger.redact({
            accessToken: 'token-de-acesso',
            verification_code: '654321',
            full_name: 'Pessoa Teste',
            headers: { host: 'example.test', authorization: 'Bearer segredo' },
            user: { id_usuario: 9, email: 'pessoa@example.test' },
            actorId: 9,
            requestId: 'req-9'
        });

        expect(redacted).toEqual({
            accessToken: logger.REDACTED,
            verification_code: logger.REDACTED,
            full_name: logger.REDACTED,
            headers: logger.REDACTED,
            user: logger.REDACTED,
            actorId: 9,
            requestId: 'req-9'
        });
    });
});
