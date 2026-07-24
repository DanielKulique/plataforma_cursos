const db = require('../config/database');
const matriculaModel = require('../api/models/matricula.models');

jest.mock('../config/database', () => ({ getConnection: jest.fn(), query: jest.fn() }));

function createConnection(queryImplementation) {
    return {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(queryImplementation),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn()
    };
}

describe('modelo transacional de matrícula', () => {
    beforeEach(() => jest.clearAllMocks());

    it('cria matrícula sob bloqueio da turma', async () => {
        const connection = createConnection(async (sql) => {
            if (sql.includes('FROM Turmas')) return [[{ id_turma: 7, status: 'ABERTA' }]];
            if (sql.includes('FROM Matriculas')) return [[]];
            if (sql.includes('INSERT INTO Matriculas')) return [{ insertId: 15, affectedRows: 1 }];
            throw new Error(`SQL inesperado: ${sql}`);
        });
        db.getConnection.mockResolvedValue(connection);

        await expect(matriculaModel.matricularAluno(3, 7)).resolves.toMatchObject({
            id_matricula: 15, id_aluno: 3, id_turma: 7, reativada: false
        });
        expect(connection.query.mock.calls[0][0]).toContain('FOR UPDATE');
        expect(connection.commit).toHaveBeenCalledTimes(1);
        expect(connection.rollback).not.toHaveBeenCalled();
        expect(connection.release).toHaveBeenCalledTimes(1);
    });

    it('reativa a mesma linha cancelada e reinicia avaliação e progresso', async () => {
        const connection = createConnection(async (sql) => {
            if (sql.includes('FROM Turmas')) return [[{ id_turma: 7, status: 'ABERTA' }]];
            if (sql.includes('FROM Matriculas')) return [[{ id_matricula: 21, status_aprovacao: 'CANCELADO' }]];
            if (sql.includes('DELETE progresso')) return [{ affectedRows: 2 }];
            if (sql.includes('UPDATE Matriculas')) return [{ affectedRows: 1 }];
            throw new Error(`SQL inesperado: ${sql}`);
        });
        db.getConnection.mockResolvedValue(connection);

        const result = await matriculaModel.matricularAluno(3, 7);

        expect(result).toMatchObject({ id_matricula: 21, reativada: true, nota_final: null, progresso_percentual: 0 });
        const updateSql = connection.query.mock.calls.find(([sql]) => sql.includes('UPDATE Matriculas'))[0];
        expect(updateSql).toContain("status_aprovacao = 'CURSANDO'");
        expect(updateSql).toContain('nota_final = NULL');
        expect(updateSql).toContain('progresso_percentual = 0');
        expect(connection.query.mock.calls.some(([sql]) => sql.includes('DELETE progresso'))).toBe(true);
        expect(connection.commit).toHaveBeenCalledTimes(1);
    });

    it.each([
        [[], 'TURMA_NAO_ENCONTRADA', 404],
        [[{ id_turma: 7, status: 'FECHADA' }], 'TURMA_NAO_ABERTA', 403],
        [[{ id_turma: 7, status: 'ENCERRADA' }], 'TURMA_NAO_ABERTA', 403]
    ])('recusa turma ausente ou não aberta', async (classes, code, status) => {
        const connection = createConnection(async () => [classes]);
        db.getConnection.mockResolvedValue(connection);

        await expect(matriculaModel.matricularAluno(3, 7)).rejects.toMatchObject({ code, status });
        expect(connection.rollback).toHaveBeenCalledTimes(1);
        expect(connection.commit).not.toHaveBeenCalled();
    });

    it('recusa matrícula ativa já existente', async () => {
        const connection = createConnection(async (sql) => {
            if (sql.includes('FROM Turmas')) return [[{ id_turma: 7, status: 'ABERTA' }]];
            return [[{ id_matricula: 21, status_aprovacao: 'CURSANDO' }]];
        });
        db.getConnection.mockResolvedValue(connection);

        await expect(matriculaModel.matricularAluno(3, 7)).rejects.toMatchObject({
            code: 'MATRICULA_DUPLICADA', status: 409
        });
        expect(connection.rollback).toHaveBeenCalledTimes(1);
    });

    it('traduz violação do índice único para conflito', async () => {
        const duplicate = Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
        const connection = createConnection(async (sql) => {
            if (sql.includes('FROM Turmas')) return [[{ id_turma: 7, status: 'ABERTA' }]];
            if (sql.includes('FROM Matriculas')) return [[]];
            throw duplicate;
        });
        db.getConnection.mockResolvedValue(connection);

        await expect(matriculaModel.matricularAluno(3, 7)).rejects.toMatchObject({
            code: 'MATRICULA_DUPLICADA', status: 409
        });
    });
});
