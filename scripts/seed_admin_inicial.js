/**
 * Bootstrap explícito de usuário privilegiado.
 * Uso: npm run user:bootstrap
 *
 * A CLI só recebe a senha por prompt oculto e a mantém em memória pelo tempo
 * necessário para gerar o hash bcrypt. CPF e telefone são opcionais para contas
 * privilegiadas criadas pelo terminal; os fluxos HTTP continuam com suas próprias
 * validações obrigatórias.
 */
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const logger = require('../src/utils/logger');
const { assertDatabaseConnectionEnvironment } = require('../src/config/database-connection');
const { assertDatabaseIdentity } = require('../src/config/database-identity');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const LOCK_NAME = 'plataforma_cursos_user_bootstrap';
const PRODUCTION_BOOTSTRAP_CONFIRMATION = 'I_UNDERSTAND';
const ROLES = new Set(['ADMIN', 'PROFESSOR']);

function required(env, key) {
    const value = String(env[key] || '').trim();
    if (!value) throw new Error(`Variável obrigatória ausente: ${key}`);
    return value;
}

function validatePassword(password) {
    const valid = password.length >= 8
        && /[A-Z]/.test(password)
        && /[a-z]/.test(password)
        && /\d/.test(password)
        && /[^A-Za-z0-9]/.test(password);
    if (!valid) throw new Error('A senha deve ter ao menos 8 caracteres, maiúscula, minúscula, número e símbolo.');
}

function readConfiguration(env = process.env) {
    const database = assertDatabaseConnectionEnvironment(env);
    const user = {
        nome: required(env, 'BOOTSTRAP_USER_NAME'),
        cpf: String(env.BOOTSTRAP_USER_CPF || '').trim() || null,
        email: required(env, 'BOOTSTRAP_USER_EMAIL').toLowerCase(),
        telefone: String(env.BOOTSTRAP_USER_PHONE || '').trim() || null,
        tipo: required(env, 'BOOTSTRAP_USER_ROLE').toUpperCase(),
        senha: required(env, 'BOOTSTRAP_USER_PASSWORD')
    };
    if (user.nome.length < 3) throw new Error('BOOTSTRAP_USER_NAME deve ter ao menos 3 caracteres.');
    if (user.cpf && !/^(?!([0-9])\1{10}$)\d{11}$/.test(user.cpf)) {
        throw new Error('BOOTSTRAP_USER_CPF deve conter 11 dígitos não repetidos.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) throw new Error('BOOTSTRAP_USER_EMAIL inválido.');
    if (user.telefone && !/^\+?\d{10,15}$/.test(user.telefone)) {
        throw new Error('BOOTSTRAP_USER_PHONE deve conter de 10 a 15 dígitos, com + opcional.');
    }
    if (!ROLES.has(user.tipo)) throw new Error('BOOTSTRAP_USER_ROLE deve ser ADMIN ou PROFESSOR.');
    validatePassword(user.senha);
    return {
        db: {
            host: database.host,
            port: database.port,
            user: database.user,
            password: database.password,
            database: database.database
        },
        user
    };
}

function assertUserBootstrapTarget(env = process.env) {
    const database = String(env.DB_NAME || '').trim();
    if (env.NODE_ENV === 'production') {
        if (!database || database === 'site_cursos') throw new Error('Banco de produção inválido para bootstrap de usuário.');
        if (env.ALLOW_PRODUCTION_USER_BOOTSTRAP !== PRODUCTION_BOOTSTRAP_CONFIRMATION) {
            throw new Error('Defina ALLOW_PRODUCTION_USER_BOOTSTRAP=I_UNDERSTAND para o bootstrap em produção.');
        }
        return database;
    }
    const { assertDevelopmentDatabase } = require('./test_database_safety');
    return assertDevelopmentDatabase(env);
}

async function criarUsuarioPrivilegiado({
    env = process.env,
    createConnection = mysql.createConnection,
    output = logger
} = {}) {
    let config;
    let connection;
    let lockAcquired = false;
    let transactionStarted = false;
    try {
        config = readConfiguration(env);
        connection = await createConnection(config.db);
        await assertDatabaseIdentity(connection, assertDatabaseConnectionEnvironment(env));
        const [lockRows] = await connection.query('SELECT GET_LOCK(?, 10) AS adquirido', [LOCK_NAME]);
        lockAcquired = Number(lockRows?.[0]?.adquirido) === 1;
        if (!lockAcquired) throw new Error('Não foi possível obter exclusividade para o bootstrap de usuário.');

        await connection.beginTransaction();
        transactionStarted = true;
        const params = [config.user.email];
        let identityWhere = 'email = ?';
        if (config.user.cpf) {
            identityWhere += ' OR cpf = ?';
            params.push(config.user.cpf);
        }
        const [sameIdentity] = await connection.query(
            `SELECT id_usuario, email, cpf, tipo FROM Usuarios WHERE (${identityWhere}) FOR UPDATE`,
            params
        );
        if (sameIdentity.length > 0) {
            const sameEmail = sameIdentity.find((row) => row.email.toLowerCase() === config.user.email);
            if (sameIdentity.length !== 1 || !sameEmail || sameEmail.tipo !== config.user.tipo
                || (config.user.cpf && sameEmail.cpf !== config.user.cpf)) {
                throw new Error('Identidade existente em conflito; não será promovida ou substituída.');
            }
            await connection.query(
                `INSERT INTO EmailVerificacoes (email, codigo, verificado, expira_em)
                 VALUES (?, NULL, 1, NULL)
                 ON DUPLICATE KEY UPDATE verificado = 1, codigo = NULL, expira_em = NULL`,
                [config.user.email]
            );
            await connection.commit();
            transactionStarted = false;
            output.info('user.bootstrap.idempotente', { userId: sameEmail.id_usuario, role: sameEmail.tipo });
            return { sucesso: true, criado: false, idUsuario: sameEmail.id_usuario, tipo: sameEmail.tipo };
        }

        const passwordHash = await bcrypt.hash(config.user.senha, 12);
        const [result] = await connection.query(
            `INSERT INTO Usuarios (nome_completo, cpf, email, senha, telefone, tipo)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [config.user.nome, config.user.cpf, config.user.email, passwordHash, config.user.telefone, config.user.tipo]
        );
        if (result.affectedRows !== 1) throw new Error('O banco não confirmou a criação do usuário.');
        await connection.query(
            `INSERT INTO EmailVerificacoes (email, codigo, verificado, expira_em)
             VALUES (?, NULL, 1, NULL)`,
            [config.user.email]
        );
        await connection.commit();
        transactionStarted = false;
        output.info('user.bootstrap.criado', { userId: result.insertId, role: config.user.tipo });
        return { sucesso: true, criado: true, idUsuario: result.insertId, tipo: config.user.tipo };
    } catch (error) {
        if (connection && transactionStarted) await connection.rollback();
        output.error('user.bootstrap.falhou', { code: error.code || 'BOOTSTRAP_FAILED' });
        throw error;
    } finally {
        if (connection && lockAcquired) await connection.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]).catch(() => undefined);
        if (connection) await connection.end();
    }
}

async function hiddenPassword(prompt) {
    if (!process.stdin.isTTY) throw new Error('A senha exige um terminal interativo (TTY).');
    const { Writable } = require('stream');
    const muted = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
    const input = require('readline').createInterface({ input: process.stdin, output: muted, terminal: true });
    process.stderr.write(prompt);
    try {
        return await new Promise((resolve, reject) => {
            input.once('SIGINT', () => reject(new Error('Bootstrap cancelado.')));
            input.question('', resolve);
        });
    } finally {
        input.close();
        process.stderr.write('\n');
    }
}

async function main() {
    assertUserBootstrapTarget(process.env);
    if (process.env.BOOTSTRAP_USER_PASSWORD) {
        throw new Error('Não forneça BOOTSTRAP_USER_PASSWORD por variável; use o prompt oculto.');
    }
    const password = await hiddenPassword('Senha (entrada oculta): ');
    const confirmation = await hiddenPassword('Confirmar senha (entrada oculta): ');
    if (password !== confirmation) throw new Error('As senhas não coincidem.');
    const env = { ...process.env, BOOTSTRAP_USER_PASSWORD: password };
    try {
        const result = await criarUsuarioPrivilegiado({ env });
        process.stdout.write(`Usuário ${result.criado ? 'criado' : 'já existente'} com perfil ${result.tipo}.\n`);
    } finally {
        delete env.BOOTSTRAP_USER_PASSWORD;
    }
}

if (require.main === module) main().catch((error) => {
    console.error(error.sql ? `Bootstrap recusado (${error.code}).` : error.message);
    process.exitCode = 1;
});

module.exports = {
    PRODUCTION_BOOTSTRAP_CONFIRMATION,
    assertUserBootstrapTarget,
    criarUsuarioPrivilegiado,
    hiddenPassword,
    readConfiguration,
    validatePassword
};
