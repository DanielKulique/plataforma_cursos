const db = require('../config/database');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

jest.mock('../config/database', () => ({ query: jest.fn(), getConnection: jest.fn() }));
jest.mock('bcrypt', () => ({ compare: jest.fn() }));

const authModel = require('../api/models/auth.models');

function connectionMock() {
    return {
        query: jest.fn(),
        beginTransaction: jest.fn().mockResolvedValue(),
        commit: jest.fn().mockResolvedValue(),
        rollback: jest.fn().mockResolvedValue(),
        release: jest.fn()
    };
}

describe('modelo de autenticação', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('autentica usuário verificado e remove o hash da resposta', async () => {
        db.query
            .mockResolvedValueOnce([[{
                id_usuario: 7,
                nome_completo: 'Aluno Real',
                email: 'aluno@example.test',
                tipo: 'ALUNO',
                senha: 'hash-bcrypt'
            }]])
            .mockResolvedValueOnce([[{ verificado: 1 }]]);
        bcrypt.compare.mockResolvedValue(true);

        const usuario = await authModel.login('aluno@example.test', 'senha-recebida');

        expect(usuario).toEqual({
            id_usuario: 7,
            nome_completo: 'Aluno Real',
            email: 'aluno@example.test',
            tipo: 'ALUNO'
        });
        expect(bcrypt.compare).toHaveBeenCalledWith('senha-recebida', 'hash-bcrypt');
    });

    it('recusa usuário inexistente, senha incorreta e e-mail não confirmado', async () => {
        db.query.mockResolvedValueOnce([[]]);
        await expect(authModel.login('ausente@example.test', 'qualquer'))
            .rejects.toMatchObject({ status: 401 });

        db.query.mockResolvedValueOnce([[{ senha: 'hash' }]]);
        bcrypt.compare.mockResolvedValueOnce(false);
        await expect(authModel.login('aluno@example.test', 'incorreta'))
            .rejects.toMatchObject({ status: 401 });

        db.query
            .mockResolvedValueOnce([[{ senha: 'hash' }]])
            .mockResolvedValueOnce([[{ verificado: 0 }]]);
        bcrypt.compare.mockResolvedValueOnce(true);
        await expect(authModel.login('aluno@example.test', 'correta'))
            .rejects.toMatchObject({ status: 403, code: 'EMAIL_NAO_VERIFICADO' });

        db.query
            .mockResolvedValueOnce([[{ senha: 'hash', email: 'aluno@example.test' }]])
            .mockResolvedValueOnce([[]]);
        bcrypt.compare.mockResolvedValueOnce(true);
        await expect(authModel.login('aluno@example.test', 'correta'))
            .rejects.toMatchObject({ status: 403, code: 'EMAIL_NAO_VERIFICADO' });
    });

    it('gera e persiste um código de verificação sem incluí-lo em logs', async () => {
        jest.spyOn(crypto, 'randomInt').mockReturnValueOnce(42);
        const connection = connectionMock();
        connection.query
            .mockResolvedValueOnce([[{ id_usuario: 7, email: 'aluno@example.test' }]])
            .mockResolvedValueOnce([[{ verificado: 0 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);
        db.getConnection.mockResolvedValue(connection);

        const resultado = await authModel.enviarCodigoVerificacaoPorEmail('aluno@example.test');

        expect(resultado.codigo).toBe('000042');
        expect(connection.query.mock.calls[2][1][0]).toBe('000042');
        expect(connection.query.mock.calls[2][0]).not.toMatch(/SET\s+verificado\s*=\s*0/i);
        expect(connection.commit).toHaveBeenCalledTimes(1);
    });

    it('responde de forma indistinguível para usuário inexistente', async () => {
        const connection = connectionMock();
        connection.query.mockResolvedValueOnce([[]]);
        db.getConnection.mockResolvedValue(connection);

        await expect(authModel.enviarCodigoVerificacaoPorEmail('ausente@example.test'))
            .resolves.toEqual({ enviar: false, motivo: 'CONTA_INEXISTENTE' });
        expect(connection.commit).toHaveBeenCalledTimes(1);
    });

    it('não gera código nem desconfirma conta já verificada', async () => {
        const connection = connectionMock();
        connection.query
            .mockResolvedValueOnce([[{ id_usuario: 7, email: 'aluno@example.test' }]])
            .mockResolvedValueOnce([[{ verificado: 1 }]]);
        db.getConnection.mockResolvedValue(connection);

        await expect(authModel.enviarCodigoVerificacaoPorEmail(' ALUNO@EXAMPLE.TEST '))
            .resolves.toEqual({ enviar: false, jaVerificado: true });
        expect(connection.query).toHaveBeenCalledTimes(2);
        expect(connection.commit).toHaveBeenCalledTimes(1);
    });

    it('valida estados ausente, confirmado, expirado, incorreto e correto do código', async () => {
        let connection = connectionMock();
        connection.query.mockResolvedValueOnce([[]]);
        db.getConnection.mockResolvedValueOnce(connection);
        await expect(authModel.verificarCodigoEmail('a@example.test', '123456'))
            .rejects.toMatchObject({ status: 400, code: 'CODIGO_INVALIDO' });

        connection = connectionMock();
        connection.query.mockResolvedValueOnce([[{ codigo: '123456', verificado: 1, expira_em: new Date(Date.now() + 60000) }]]);
        db.getConnection.mockResolvedValueOnce(connection);
        await expect(authModel.verificarCodigoEmail('a@example.test', '123456'))
            .resolves.toEqual({ jaVerificado: true });

        connection = connectionMock();
        connection.query.mockResolvedValueOnce([[{ codigo: '123456', verificado: 1, expira_em: new Date(Date.now() + 60000) }]]);
        db.getConnection.mockResolvedValueOnce(connection);
        await expect(authModel.verificarCodigoEmail('a@example.test', '654321'))
            .rejects.toMatchObject({ status: 400, code: 'CODIGO_INVALIDO' });

        connection = connectionMock();
        connection.query.mockResolvedValueOnce([[{ codigo: '123456', verificado: 0, expira_em: new Date(Date.now() - 60000) }]]);
        db.getConnection.mockResolvedValueOnce(connection);
        await expect(authModel.verificarCodigoEmail('a@example.test', '123456'))
            .rejects.toMatchObject({ status: 400, message: expect.stringContaining('expirado') });

        connection = connectionMock();
        connection.query.mockResolvedValueOnce([[{ codigo: '123456', verificado: 0, expira_em: new Date(Date.now() + 60000) }]]);
        db.getConnection.mockResolvedValueOnce(connection);
        await expect(authModel.verificarCodigoEmail('a@example.test', '654321'))
            .rejects.toMatchObject({ status: 400, message: 'Código inválido.' });

        connection = connectionMock();
        connection.query
            .mockResolvedValueOnce([[{ codigo: '123456', verificado: 0, expira_em: new Date(Date.now() + 60000) }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);
        db.getConnection.mockResolvedValueOnce(connection);
        await expect(authModel.verificarCodigoEmail('a@example.test', '123456'))
            .resolves.toEqual({ verificado: true });
        expect(connection.commit).toHaveBeenCalledTimes(1);
    });

    it('busca somente dados seguros e sinaliza usuário removido', async () => {
        const seguro = { id_usuario: 7, nome_completo: 'Aluno', email: 'a@example.test', tipo: 'ALUNO' };
        db.query.mockResolvedValueOnce([[seguro]]);
        await expect(authModel.buscarUsuarioPorId(7)).resolves.toEqual(seguro);

        db.query.mockResolvedValueOnce([[]]);
        await expect(authModel.buscarUsuarioPorId(99)).rejects.toThrow('Usuário não encontrado');
        expect(db.query.mock.calls[0][0]).not.toContain('senha');
    });
});
