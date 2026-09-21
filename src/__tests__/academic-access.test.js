const { lockTurmaParaMutacao, iniciarMutacaoRecurso } = require('../api/services/academic-access.service');
const professor = { id_usuario: 2, tipo: 'PROFESSOR' };
const admin = { id_usuario: 1, tipo: 'ADMIN' };

describe('autorização acadêmica na conexão transacional', () => {
    test.each([
        ['ABERTA', professor, 2, null], ['FECHADA', professor, 2, null],
        ['ABERTA', admin, 9, null], ['ENCERRADA', professor, 2, 409],
        ['ENCERRADA', admin, 2, 409], ['ABERTA', professor, 9, 403],
        ['ABERTA', { tipo: 'ALUNO', id_usuario: 2 }, 2, 403], ['ABERTA', null, 2, 401]
    ])('%s / %j / responsável %s', async (status, usuario, id_professor, erro) => {
        const connection = { query: jest.fn().mockResolvedValue([[{ id_turma: 7, status, id_professor }]]) };
        const promise = lockTurmaParaMutacao(connection, 7, usuario);
        if (erro) await expect(promise).rejects.toMatchObject({ status: erro });
        else await expect(promise).resolves.toMatchObject({ id_turma: 7 });
        expect(connection.query).toHaveBeenCalledWith(expect.stringMatching(/Turmas WHERE id_turma = \? FOR UPDATE/), [7]);
    });

    test('turma inexistente retorna 404', async () => {
        await expect(lockTurmaParaMutacao({ query: async () => [[]] }, 7, professor)).rejects.toMatchObject({ status: 404 });
    });

    test('descoberta antiga não autoriza professor após mudança committed', async () => {
        const connection = { beginTransaction: jest.fn(), query: jest.fn()
            .mockResolvedValueOnce([[{ id_conteudo: 4, id_turma: 7 }]])
            .mockResolvedValueOnce([[{ id_turma: 7, status: 'ABERTA', id_professor: 9 }]]) };
        await expect(iniciarMutacaoRecurso(connection, 'conteudo', 4, professor)).rejects.toMatchObject({ status: 403 });
        expect(connection.query).toHaveBeenCalledTimes(2);
        expect(connection.query.mock.invocationCallOrder[0]).toBeLessThan(connection.beginTransaction.mock.invocationCallOrder[0]);
    });

    test('revalida vínculo sob lock depois da descoberta e autorização', async () => {
        const connection = { beginTransaction: jest.fn(), query: jest.fn()
            .mockResolvedValueOnce([[{ id_conteudo: 4, id_turma: 7 }]])
            .mockResolvedValueOnce([[{ id_turma: 7, status: 'ABERTA', id_professor: 2 }]])
            .mockResolvedValueOnce([[]]) };
        await expect(iniciarMutacaoRecurso(connection, 'conteudo', 4, professor)).rejects.toMatchObject({ status: 404 });
        expect(connection.query).toHaveBeenLastCalledWith(expect.stringContaining('id_turma = ? FOR UPDATE'), [4, 7]);
    });
});
