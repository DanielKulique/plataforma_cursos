const db = require('../config/database');
const matriculaModel = require('../api/models/matricula.models');

jest.mock('../config/database', () => ({ getConnection: jest.fn(), query: jest.fn() }));

function createConnection(queryImplementation) {
    return {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn((sql, params) => sql.startsWith('SELECT id_turma FROM Matriculas WHERE id_matricula') || sql === 'SELECT * FROM Turmas WHERE id_turma = ? FOR UPDATE'
            ? Promise.resolve([[{ id_turma: 7 }]]) : queryImplementation(sql, params)),
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
            if (sql.includes('SELECT m.status_aprovacao, m.ciclo_atual')) return [[{ status_aprovacao: 'CURSANDO', ciclo_atual: 1, prova_final_aprovada: 0 }]];
            if (sql.includes('FROM Matriculas')) return [[]];
            if (sql.includes('INSERT INTO Matriculas')) return [{ insertId: 15, affectedRows: 1 }];
            if (sql.includes('SELECT COUNT(c.id_conteudo)')) return [[{ total: 0, concluidos: 0 }]];
            if (sql.includes('FROM Questionarios')) return [[{ status_aprovacao: 'CURSANDO', ciclo_atual: 1, prova_final_aprovada: 0 }]];
            if (sql.includes('FROM Certificados')) return [[]];
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
            if (sql.includes('SELECT m.status_aprovacao, m.ciclo_atual')) return [[{ status_aprovacao: 'CURSANDO', ciclo_atual: 5, prova_final_aprovada: 0 }]];
            if (sql.includes('FROM Matriculas')) return [[{ id_matricula: 21, status_aprovacao: 'CANCELADO', ciclo_atual: 4 }]];
            if (sql.includes('DELETE progresso')) return [{ affectedRows: 2 }];
            if (sql.includes('UPDATE Matriculas')) return [{ affectedRows: 1 }];
            if (sql.includes('SELECT COUNT(c.id_conteudo)')) return [[{ total: 0, concluidos: 0 }]];
            if (sql.includes('FROM Questionarios')) return [[{ status_aprovacao: 'CURSANDO', ciclo_atual: 5, prova_final_aprovada: 0 }]];
            if (sql.includes('FROM Certificados')) return [[]];
            throw new Error(`SQL inesperado: ${sql}`);
        });
        db.getConnection.mockResolvedValue(connection);

        const result = await matriculaModel.matricularAluno(3, 7);

        expect(result).toMatchObject({ id_matricula: 21, reativada: true, nota_final: null, progresso_percentual: 0, ciclo_atual: 5 });
        const updateSql = connection.query.mock.calls.find(([sql]) => sql.includes('UPDATE Matriculas'))[0];
        expect(updateSql).toContain("status_aprovacao = 'CURSANDO'");
        expect(updateSql).toContain('nota_final = NULL');
        expect(updateSql).toContain('progresso_percentual = 0');
        expect(updateSql).toContain('ciclo_atual = ciclo_atual + 1');
        expect(updateSql).toContain("status_aprovacao = 'CANCELADO'");
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

describe('resultado final é a fonte da situação e nota', () => {
    beforeEach(() => jest.clearAllMocks());
    it.each([
        [80, 50, 'REPROVADO', null, null],
        [80, 74.99, 'APROVADO', 7.5, 'RESULTADO_FINAL_IMUTAVEL'],
        [80, 75, 'CURSANDO', 7.5, 'RESULTADO_FINAL_IMUTAVEL'],
        [80, null, 'REPROVADO', 5, 'PROVA_FINAL_PENDENTE'],
        [80, 75, 'APROVADO', 7.5, 'RESULTADO_FINAL_IMUTAVEL'],
        [80, 75, 'APROVADO', null, null]
    ])('progresso=%i resultado=%s status=%s nota=%s', async (concluidos, percentual, status, nota, erro) => {
        const connection = createConnection(async sql => {
            if (sql.includes('SELECT m.id_matricula')) return [[{id_matricula:1,id_aluno:3,id_turma:7,nota_final:null,status_aprovacao:'CURSANDO'}]];
            if (sql.includes('FROM Questionarios')) return [[{status_aprovacao:'CURSANDO',prova_final_aprovada:percentual >= 75,prova_final_tentada:percentual != null,prova_final_percentual:percentual}]];
            if (sql.includes('FROM Conteudos')) return [[{total:100,concluidos}]];
            if (sql.includes('FROM Certificados')) return [[]];
            if (sql.includes('UPDATE Matriculas')) return [{affectedRows:1}];
            throw new Error(`SQL inesperado: ${sql}`);
        });
        db.getConnection.mockResolvedValue(connection);
        const promise = matriculaModel.atualizarMatricula(1,{status_aprovacao:status,nota_final:nota},{id_usuario:1,tipo:'ADMIN'});
        if (erro) {await expect(promise).rejects.toMatchObject({code:erro,status:409});expect(connection.commit).not.toHaveBeenCalled();}
        else await expect(promise).resolves.toEqual({affectedRows:1});
    });
});

describe('máquina de estados da matrícula', () => {
    beforeEach(() => jest.clearAllMocks());

    it.each(['CURSANDO', 'APROVADO', 'REPROVADO'])(
        'recusa CANCELADO → %s pelo PATCH acadêmico', async (status) => {
            const connection = createConnection(async (sql) => {
                if (sql.includes('SELECT m.id_matricula')) return [[{
                    id_matricula: 1, id_aluno: 3, id_turma: 7, nota_final: null,
                    status_aprovacao: 'CANCELADO', ciclo_atual: 2
                }]];
                throw new Error(`SQL inesperado: ${sql}`);
            });
            db.getConnection.mockResolvedValue(connection);

            await expect(matriculaModel.atualizarMatricula(1, { status_aprovacao: status }, { id_usuario: 1, tipo: 'ADMIN' }))
                .rejects.toMatchObject({ code: 'REMATRICULA_OBRIGATORIA', status: 409 });
            expect(connection.commit).not.toHaveBeenCalled();
            expect(connection.rollback).toHaveBeenCalledTimes(1);
        }
    );
});

test('migration e imagem de staging incluem o ciclo acadêmico e seu smoke', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const migration = fs.readFileSync(path.join(__dirname, '../../mysql/migrations/010_enrollment_cycles.sql'), 'utf8');
    const dockerfile = fs.readFileSync(path.join(__dirname, '../../Dockerfile'), 'utf8');
    expect(migration).toContain('enrollment_cycle_orphan_invalid');
    expect(migration).toContain('ciclo_atual');
    expect(migration).toContain('ciclo_matricula');
    expect(migration).toContain('idx_tentativas_ciclo_atual');
    expect(dockerfile).toContain('scripts/smoke_enrollment_lifecycle_staging.js');
});
