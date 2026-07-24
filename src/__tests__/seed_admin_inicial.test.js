jest.mock('bcrypt', () => ({ hash: jest.fn().mockResolvedValue('hash-seguro') }));

const { criarAdminInicial, readConfiguration } = require('../../scripts/seed_admin_inicial');

const validEnv = {
    DB_HOST: '127.0.0.1',
    DB_PORT: '3306',
    DB_USER: 'bootstrap_user',
    DB_PASSWORD: 'senha-banco-teste',
    DB_NAME: 'banco_descartavel',
    INITIAL_ADMIN_NOME: 'Administrador Inicial',
    INITIAL_ADMIN_CPF: '12345678901',
    INITIAL_ADMIN_EMAIL: 'admin@example.test',
    INITIAL_ADMIN_TELEFONE: '11999999999',
    INITIAL_ADMIN_PASSWORD: 'Senha@123'
};

function fakeConnection({ sameAdmin = [], admins = [], insertId = 10 } = {}) {
    return {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        end: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(async (sql) => {
            if (sql.includes('GET_LOCK')) return [[{ adquirido: 1 }]];
            if (sql.includes('(email = ? OR cpf = ?)')) return [sameAdmin];
            if (sql.includes("tipo = 'ADMIN' LIMIT 1")) return [admins];
            if (sql.includes('INSERT INTO Usuarios')) return [{ affectedRows: 1, insertId }];
            if (sql.includes('RELEASE_LOCK')) return [[{ liberado: 1 }]];
            throw new Error(`Query inesperada no teste: ${sql}`);
        })
    };
}

function fakeOutput() {
    return { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

describe('bootstrap do administrador inicial', () => {
    it('falha claramente quando uma variável obrigatória está ausente', async () => {
        const createConnection = jest.fn();
        await expect(criarAdminInicial({ env: {}, createConnection, output: fakeOutput() }))
            .rejects.toThrow('Variável obrigatória ausente: DB_HOST');
        expect(createConnection).not.toHaveBeenCalled();
    });

    it('valida a força mínima da senha', () => {
        expect(() => readConfiguration({ ...validEnv, INITIAL_ADMIN_PASSWORD: 'fraca' }))
            .toThrow('INITIAL_ADMIN_PASSWORD deve ter ao menos 8 caracteres');
    });

    it('cria o administrador em transação sem imprimir credenciais', async () => {
        const connection = fakeConnection();
        const output = fakeOutput();
        const result = await criarAdminInicial({
            env: validEnv,
            createConnection: jest.fn().mockResolvedValue(connection),
            output
        });

        expect(result).toEqual({ sucesso: true, criado: true, idAdmin: 10 });
        expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
        expect(connection.commit).toHaveBeenCalledTimes(1);
        expect(connection.rollback).not.toHaveBeenCalled();
        const logs = JSON.stringify([
            ...output.info.mock.calls,
            ...output.warn.mock.calls,
            ...output.error.mock.calls
        ]);
        [validEnv.DB_PASSWORD, validEnv.INITIAL_ADMIN_PASSWORD, validEnv.INITIAL_ADMIN_EMAIL,
            validEnv.INITIAL_ADMIN_CPF, validEnv.INITIAL_ADMIN_TELEFONE]
            .forEach((sensitive) => expect(logs).not.toContain(sensitive));
    });

    it('é idempotente quando o mesmo administrador já existe', async () => {
        const connection = fakeConnection({ sameAdmin: [{ id_usuario: 7 }] });
        const result = await criarAdminInicial({
            env: validEnv,
            createConnection: jest.fn().mockResolvedValue(connection),
            output: fakeOutput()
        });

        expect(result).toEqual({ sucesso: true, criado: false, idAdmin: 7 });
        expect(connection.rollback).toHaveBeenCalledTimes(1);
        expect(connection.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO Usuarios'))).toBe(false);
    });

    it('não cria outro administrador quando já existe um', async () => {
        const connection = fakeConnection({ admins: [{ id_usuario: 3 }] });
        const result = await criarAdminInicial({
            env: validEnv,
            createConnection: jest.fn().mockResolvedValue(connection),
            output: fakeOutput()
        });

        expect(result).toEqual({ sucesso: true, criado: false, idAdmin: 3 });
        expect(connection.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO Usuarios'))).toBe(false);
    });
});
