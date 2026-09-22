jest.mock('bcrypt', () => ({ hash: jest.fn().mockResolvedValue('hash-seguro') }));

const {
    criarUsuarioPrivilegiado,
    readConfiguration,
    assertUserBootstrapTarget
} = require('../../scripts/seed_admin_inicial');

const validEnv = {
    DB_HOST: '127.0.0.1',
    DB_PORT: '33307',
    DB_USER: 'bootstrap_user',
    DB_PASSWORD: 'senha-banco-teste',
    DB_NAME: 'plataforma_cursos_dev',
    DB_ENVIRONMENT_IDENTITY: 'plataforma_cursos_dev',
    BOOTSTRAP_USER_NAME: 'Daniel Kulique',
    BOOTSTRAP_USER_EMAIL: 'daniel@example.test',
    BOOTSTRAP_USER_ROLE: 'ADMIN',
    BOOTSTRAP_USER_PASSWORD: 'Senha@123'
};

function metadata() {
    return [[{
        database_name: 'plataforma_cursos_dev', version: '8.4.6', hostname: 'platform-db', port: 3306
    }]];
}

function fakeConnection({ sameIdentity = [], insertId = 10 } = {}) {
    return {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        end: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(async (sql) => {
            if (sql.startsWith('SELECT DATABASE()')) return metadata();
            if (sql.includes('FROM environment_identity')) return [[{
                identity_key: 'plataforma_cursos_dev', database_name: 'plataforma_cursos_dev'
            }]];
            if (sql.includes('GET_LOCK')) return [[{ adquirido: 1 }]];
            if (sql.includes('FROM Usuarios WHERE')) return [sameIdentity];
            if (sql.includes('INSERT INTO Usuarios')) return [{ affectedRows: 1, insertId }];
            if (sql.includes('INSERT INTO EmailVerificacoes')) return [{ affectedRows: 1 }];
            if (sql.includes('RELEASE_LOCK')) return [[{ liberado: 1 }]];
            throw new Error(`Query inesperada no teste: ${sql}`);
        })
    };
}

function fakeOutput() {
    return { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
}

describe('bootstrap de usuário privilegiado', () => {
    it('exige confirmação explícita no ambiente de produção', () => {
        expect(() => assertUserBootstrapTarget({
            NODE_ENV: 'production', DB_NAME: 'plataforma_cursos'
        })).toThrow('ALLOW_PRODUCTION_USER_BOOTSTRAP=I_UNDERSTAND');
        expect(assertUserBootstrapTarget({
            NODE_ENV: 'production', DB_NAME: 'plataforma_cursos',
            ALLOW_PRODUCTION_USER_BOOTSTRAP: 'I_UNDERSTAND'
        })).toBe('plataforma_cursos');
    });

    it('aceita ADMIN e PROFESSOR sem inventar CPF ou telefone', () => {
        expect(readConfiguration(validEnv).user).toMatchObject({ tipo: 'ADMIN', cpf: null, telefone: null });
        expect(readConfiguration({ ...validEnv, BOOTSTRAP_USER_ROLE: 'PROFESSOR' }).user.tipo).toBe('PROFESSOR');
        expect(() => readConfiguration({ ...validEnv, BOOTSTRAP_USER_ROLE: 'ALUNO' }))
            .toThrow('ADMIN ou PROFESSOR');
    });

    it('valida a força mínima da senha', () => {
        expect(() => readConfiguration({ ...validEnv, BOOTSTRAP_USER_PASSWORD: 'fraca' }))
            .toThrow('ao menos 8 caracteres');
    });

    it('cria e verifica o e-mail sem imprimir credenciais', async () => {
        const connection = fakeConnection();
        const output = fakeOutput();
        const result = await criarUsuarioPrivilegiado({
            env: validEnv, createConnection: jest.fn().mockResolvedValue(connection), output
        });
        expect(result).toEqual({ sucesso: true, criado: true, idUsuario: 10, tipo: 'ADMIN' });
        expect(connection.commit).toHaveBeenCalledTimes(1);
        expect(connection.query.mock.calls.some(([sql]) => sql.includes('EmailVerificacoes'))).toBe(true);
        const verificationCall = connection.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO EmailVerificacoes'));
        expect(verificationCall[0]).toContain('VALUES (?, NULL, 1, NULL)');
        expect(verificationCall[1]).toEqual([validEnv.BOOTSTRAP_USER_EMAIL]);
        const logs = JSON.stringify([...output.info.mock.calls, ...output.error.mock.calls]);
        [validEnv.DB_PASSWORD, validEnv.BOOTSTRAP_USER_PASSWORD, validEnv.BOOTSTRAP_USER_EMAIL]
            .forEach((sensitive) => expect(logs).not.toContain(sensitive));
    });

    it('é idempotente para o mesmo e-mail e perfil', async () => {
        const connection = fakeConnection({
            sameIdentity: [{ id_usuario: 7, tipo: 'ADMIN', email: validEnv.BOOTSTRAP_USER_EMAIL, cpf: null }]
        });
        const result = await criarUsuarioPrivilegiado({
            env: validEnv, createConnection: async () => connection, output: fakeOutput()
        });
        expect(result).toEqual({ sucesso: true, criado: false, idUsuario: 7, tipo: 'ADMIN' });
        expect(connection.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO Usuarios'))).toBe(false);
    });

    it.each(['ALUNO', 'PROFESSOR'])('recusa promover conta existente %s', async (tipo) => {
        const connection = fakeConnection({
            sameIdentity: [{ id_usuario: 7, tipo, email: validEnv.BOOTSTRAP_USER_EMAIL, cpf: null }]
        });
        await expect(criarUsuarioPrivilegiado({
            env: validEnv, createConnection: async () => connection, output: fakeOutput()
        })).rejects.toThrow('Identidade existente em conflito');
        expect(connection.commit).not.toHaveBeenCalled();
    });
});
