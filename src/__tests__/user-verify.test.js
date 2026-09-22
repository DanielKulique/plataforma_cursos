jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const {
    assertTarget,
    listUnverifiedUsers,
    verifyUserByEmail
} = require('../../scripts/user_verify');

const env = {
    NODE_ENV: 'development',
    APP_ENV: 'development',
    DB_HOST: '127.0.0.1',
    DB_PORT: '33307',
    DB_USER: 'app',
    DB_PASSWORD: 'db-password',
    DB_NAME: 'plataforma_cursos_dev',
    DB_ENVIRONMENT_IDENTITY: 'plataforma_cursos_dev'
};

function account(overrides = {}) {
    return {
        id_usuario: 41,
        nome_completo: 'Conta Pendente',
        email: 'pendente@example.test',
        tipo: 'ALUNO',
        senha: 'hash-original',
        data_cadastro: new Date('2026-09-22T13:16:56Z'),
        verificado: 0,
        codigo: '123456',
        expira_em: new Date('2026-09-22T13:26:56Z'),
        ...overrides
    };
}

function fakeConnection({ found = true, alreadyVerified = false } = {}) {
    const before = account(alreadyVerified ? { verificado: 1, codigo: null, expira_em: null } : {});
    return {
        beginTransaction: jest.fn().mockResolvedValue(),
        commit: jest.fn().mockResolvedValue(),
        rollback: jest.fn().mockResolvedValue(),
        end: jest.fn().mockResolvedValue(),
        query: jest.fn(async (sql) => {
            if (sql.startsWith('SELECT DATABASE()')) return [[{
                database_name: env.DB_NAME, version: '8.4.6', hostname: 'db', port: 3306
            }]];
            if (sql.includes('FROM environment_identity')) return [[{
                identity_key: env.DB_ENVIRONMENT_IDENTITY, database_name: env.DB_NAME
            }]];
            if (sql.includes('GET_LOCK')) return [[{ adquirido: 1 }]];
            if (sql.includes('LEFT JOIN EmailVerificacoes') && sql.includes('WHERE u.email =')) {
                return [found ? [before] : []];
            }
            if (sql.includes('LEFT JOIN EmailVerificacoes') && sql.includes('COALESCE')) {
                return [[before]];
            }
            if (sql.includes('INSERT INTO EmailVerificacoes')) return [{ affectedRows: 1 }];
            if (sql.includes('JOIN EmailVerificacoes') && sql.includes('WHERE u.id_usuario')) {
                return [[account({ verificado: 1, codigo: null, expira_em: null })]];
            }
            if (sql.includes('RELEASE_LOCK')) return [[{ liberado: 1 }]];
            throw new Error(`Query inesperada: ${sql}`);
        })
    };
}

describe('verificação administrativa de usuário', () => {
    it('exige autorização explícita para escrita em produção', () => {
        const production = {
            ...env,
            NODE_ENV: 'production',
            APP_ENV: 'production',
            DB_HOST: 'db',
            DB_PORT: '3306',
            DB_NAME: 'plataforma_cursos',
            DB_ENVIRONMENT_IDENTITY: 'plataforma_cursos_prod'
        };
        expect(() => assertTarget(production, { write: true }))
            .toThrow('ALLOW_PRODUCTION_USER_VERIFY=I_UNDERSTAND');
        expect(() => assertTarget({
            ...production,
            ALLOW_PRODUCTION_USER_VERIFY: 'I_UNDERSTAND'
        }, { write: true })).not.toThrow();
    });

    it('lista somente campos seguros de contas não verificadas', async () => {
        const connection = fakeConnection();
        const users = await listUnverifiedUsers({ env, createConnection: async () => connection });
        expect(users).toEqual([expect.objectContaining({
            id_usuario: 41,
            email: 'pendente@example.test',
            verificado: false
        })]);
        expect(users[0]).not.toHaveProperty('senha');
        expect(users[0]).not.toHaveProperty('codigo');
    });

    it('verifica a conta, invalida o código e preserva senha e papel', async () => {
        const connection = fakeConnection();
        const audit = { info: jest.fn(), error: jest.fn() };
        const result = await verifyUserByEmail({
            email: ' PENDENTE@example.test ', env, createConnection: async () => connection, audit
        });
        expect(result).toEqual(expect.objectContaining({ verificado: true, alterado: true, tipo: 'ALUNO' }));
        const update = connection.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO EmailVerificacoes'));
        expect(update[0]).toContain('codigo = NULL');
        expect(update[1]).toEqual(['pendente@example.test']);
        expect(connection.commit).toHaveBeenCalledTimes(1);
        expect(audit.info).toHaveBeenCalledWith('user.verificacao.administrativa', {
            userId: 41, role: 'ALUNO', changed: true
        });
    });

    it('falha com rollback para e-mail inexistente', async () => {
        const connection = fakeConnection({ found: false });
        await expect(verifyUserByEmail({
            email: 'ausente@example.test', env, createConnection: async () => connection,
            audit: { info: jest.fn(), error: jest.fn() }
        })).rejects.toMatchObject({ code: 'USUARIO_NAO_ENCONTRADO' });
        expect(connection.rollback).toHaveBeenCalledTimes(1);
        expect(connection.commit).not.toHaveBeenCalled();
    });

    it('é idempotente para conta já verificada', async () => {
        const connection = fakeConnection({ alreadyVerified: true });
        await expect(verifyUserByEmail({
            email: 'pendente@example.test', env, createConnection: async () => connection,
            audit: { info: jest.fn(), error: jest.fn() }
        })).resolves.toEqual(expect.objectContaining({ verificado: true, alterado: false }));
    });
});
