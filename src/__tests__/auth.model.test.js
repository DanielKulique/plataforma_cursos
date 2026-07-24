const db = require('../config/database');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

jest.mock('../config/database', () => ({ query: jest.fn() }));
jest.mock('bcrypt', () => ({ compare: jest.fn() }));

const authModel = require('../api/models/auth.models');

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
            .rejects.toMatchObject({ status: 403 });
    });

    it('gera e persiste um código de verificação sem incluí-lo em logs', async () => {
        jest.spyOn(crypto, 'randomInt').mockReturnValueOnce(42);
        db.query
            .mockResolvedValueOnce([[{ id_usuario: 7, email: 'aluno@example.test' }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        const resultado = await authModel.enviarCodigoVerificacaoPorEmail('aluno@example.test');

        expect(resultado.codigo).toBe('000042');
        expect(db.query.mock.calls[1][1][1]).toBe('000042');
    });

    it('recusa geração de código para usuário inexistente', async () => {
        db.query.mockResolvedValueOnce([[]]);
        await expect(authModel.enviarCodigoVerificacaoPorEmail('ausente@example.test'))
            .rejects.toMatchObject({ status: 404 });
    });

    it('valida estados ausente, confirmado, expirado, incorreto e correto do código', async () => {
        db.query.mockResolvedValueOnce([[]]);
        await expect(authModel.verificarCodigoEmail('a@example.test', '123456'))
            .rejects.toMatchObject({ status: 404 });

        db.query.mockResolvedValueOnce([[{ codigo: '123456', verificado: 1, expira_em: new Date(Date.now() + 60000) }]]);
        await expect(authModel.verificarCodigoEmail('a@example.test', '123456'))
            .resolves.toEqual({ jaVerificado: true });

        db.query.mockResolvedValueOnce([[{ codigo: '123456', verificado: 0, expira_em: new Date(Date.now() - 60000) }]]);
        await expect(authModel.verificarCodigoEmail('a@example.test', '123456'))
            .rejects.toMatchObject({ status: 400, message: expect.stringContaining('expirado') });

        db.query.mockResolvedValueOnce([[{ codigo: '123456', verificado: 0, expira_em: new Date(Date.now() + 60000) }]]);
        await expect(authModel.verificarCodigoEmail('a@example.test', '654321'))
            .rejects.toMatchObject({ status: 400, message: 'Código inválido.' });

        db.query
            .mockResolvedValueOnce([[{ codigo: '123456', verificado: 0, expira_em: new Date(Date.now() + 60000) }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);
        await expect(authModel.verificarCodigoEmail('a@example.test', '123456'))
            .resolves.toEqual({ verificado: true });
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
