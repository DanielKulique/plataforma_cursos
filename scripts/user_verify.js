'use strict';

const path = require('node:path');
const mysql = require('mysql2/promise');
const { loadEnvironment } = require('../src/config/loadEnvironment');
const {
    assertDatabaseConnectionEnvironment,
    databaseClientConfig
} = require('../src/config/database-connection');
const { assertDatabaseIdentity } = require('../src/config/database-identity');
const { normalizarEmail } = require('../src/utils/identity');
const logger = require('../src/utils/logger');

const PRODUCTION_CONFIRMATION = 'I_UNDERSTAND';
const LOCK_NAME = 'plataforma_cursos_user_verify';

function assertTarget(env, { write = false } = {}) {
    const target = assertDatabaseConnectionEnvironment(env);
    if (env.NODE_ENV === 'production') {
        if (write && env.ALLOW_PRODUCTION_USER_VERIFY !== PRODUCTION_CONFIRMATION) {
            throw new Error('Defina ALLOW_PRODUCTION_USER_VERIFY=I_UNDERSTAND para verificar uma conta em produção.');
        }
        return target;
    }
    const { assertDevelopmentDatabase } = require('./test_database_safety');
    assertDevelopmentDatabase(env);
    return target;
}

function validateEmail(rawEmail) {
    const email = normalizarEmail(rawEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido.');
    return email;
}

function publicAccount(row) {
    return {
        id_usuario: row.id_usuario,
        nome_completo: row.nome_completo,
        email: row.email,
        tipo: row.tipo,
        verificado: Number(row.verificado) === 1,
        data_cadastro: row.data_cadastro
    };
}

async function listUnverifiedUsers({ env = process.env, createConnection = mysql.createConnection } = {}) {
    const target = assertTarget(env);
    const connection = await createConnection(databaseClientConfig(env));
    try {
        await assertDatabaseIdentity(connection, target);
        const [rows] = await connection.query(
            `SELECT u.id_usuario, u.nome_completo, u.email, u.tipo, u.data_cadastro,
                    COALESCE(ev.verificado, 0) AS verificado
             FROM Usuarios u
             LEFT JOIN EmailVerificacoes ev ON ev.email = u.email
             WHERE COALESCE(ev.verificado, 0) = 0
             ORDER BY u.email`
        );
        return rows.map(publicAccount);
    } finally {
        await connection.end();
    }
}

async function verifyUserByEmail({
    email: rawEmail,
    env = process.env,
    createConnection = mysql.createConnection,
    audit = logger
} = {}) {
    const email = validateEmail(rawEmail);
    const target = assertTarget(env, { write: true });
    const connection = await createConnection(databaseClientConfig(env));
    let locked = false;
    let transactionStarted = false;
    try {
        await assertDatabaseIdentity(connection, target);
        const [lockRows] = await connection.query('SELECT GET_LOCK(?, 10) AS adquirido', [LOCK_NAME]);
        locked = Number(lockRows?.[0]?.adquirido) === 1;
        if (!locked) throw new Error('Não foi possível obter exclusividade para verificar a conta.');

        await connection.beginTransaction();
        transactionStarted = true;
        const [rows] = await connection.query(
            `SELECT u.id_usuario, u.nome_completo, u.email, u.tipo, u.senha, u.data_cadastro,
                    ev.verificado, ev.codigo, ev.expira_em
             FROM Usuarios u
             LEFT JOIN EmailVerificacoes ev ON ev.email = u.email
             WHERE u.email = ?
             LIMIT 1
             FOR UPDATE`,
            [email]
        );
        if (rows.length === 0) {
            const error = new Error('Usuário não encontrado.');
            error.code = 'USUARIO_NAO_ENCONTRADO';
            throw error;
        }

        const before = rows[0];
        const changed = Number(before.verificado) !== 1 || before.codigo !== null || before.expira_em !== null;
        await connection.query(
            `INSERT INTO EmailVerificacoes (email, codigo, verificado, expira_em)
             VALUES (?, NULL, 1, NULL)
             ON DUPLICATE KEY UPDATE verificado = 1, codigo = NULL, expira_em = NULL`,
            [email]
        );
        const [afterRows] = await connection.query(
            `SELECT u.id_usuario, u.nome_completo, u.email, u.tipo, u.senha, u.data_cadastro,
                    ev.verificado, ev.codigo, ev.expira_em
             FROM Usuarios u
             JOIN EmailVerificacoes ev ON ev.email = u.email
             WHERE u.id_usuario = ?`,
            [before.id_usuario]
        );
        const after = afterRows[0];
        if (!after || Number(after.verificado) !== 1 || after.codigo !== null || after.expira_em !== null
            || after.senha !== before.senha || after.tipo !== before.tipo) {
            throw new Error('A verificação administrativa não preservou as invariantes da conta.');
        }

        await connection.commit();
        transactionStarted = false;
        audit.info('user.verificacao.administrativa', {
            userId: before.id_usuario,
            role: before.tipo,
            changed
        });
        return { ...publicAccount(after), alterado: changed };
    } catch (error) {
        if (transactionStarted) await connection.rollback();
        audit.error('user.verificacao.administrativa.falhou', { code: error.code || 'USER_VERIFY_FAILED' });
        throw error;
    } finally {
        if (locked) await connection.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]).catch(() => undefined);
        await connection.end();
    }
}

function printAccount(account, output = process.stdout) {
    output.write(`${JSON.stringify(account)}\n`);
}

async function main(argv = process.argv.slice(2)) {
    const mode = process.env.NODE_ENV === 'production'
        ? 'production'
        : process.env.NODE_ENV === 'test' ? 'test' : 'development';
    loadEnvironment(mode, path.join(__dirname, '..'));
    if (argv.length === 1 && argv[0] === '--list') {
        const users = await listUnverifiedUsers();
        users.forEach((user) => printAccount(user));
        if (users.length === 0) process.stdout.write('Nenhuma conta não verificada.\n');
        return;
    }
    if (argv.length !== 1) throw new Error('Uso: npm run user:verify -- email@exemplo.com (ou --list).');
    const email = validateEmail(argv[0]);
    const users = await listUnverifiedUsers();
    const account = users.find((user) => user.email === email);
    if (account) printAccount({ ...account, acao: 'VERIFICAR' });
    const result = await verifyUserByEmail({ email });
    printAccount(result);
}

if (require.main === module) main().catch((error) => {
    console.error(`${error.code || 'USER_VERIFY_FAILED'}: ${error.message}`);
    process.exitCode = 1;
});

module.exports = {
    PRODUCTION_CONFIRMATION,
    assertTarget,
    listUnverifiedUsers,
    validateEmail,
    verifyUserByEmail
};
