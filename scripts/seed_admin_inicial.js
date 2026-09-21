/**
 * Bootstrap explícito do primeiro administrador.
 * Uso: npm run admin:bootstrap
 */
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const logger = require('../src/utils/logger');
const { assertDatabaseConnectionEnvironment } = require('../src/config/database-connection');
const { assertDatabaseIdentity } = require('../src/config/database-identity');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const LOCK_NAME = 'plataforma_cursos_admin_bootstrap';
const ADDITIONAL_ADMIN_CONFIRMATION = 'I_UNDERSTAND_CREATE_ANOTHER_ADMIN';
const PRODUCTION_BOOTSTRAP_CONFIRMATION = 'I_UNDERSTAND';

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
    if (!valid) {
        throw new Error('INITIAL_ADMIN_PASSWORD deve ter ao menos 8 caracteres, maiúscula, minúscula, número e símbolo.');
    }
}

function readConfiguration(env = process.env) {
    const database = assertDatabaseConnectionEnvironment(env);
    const config = {
        db: {
            host: database.host,
            port: database.port,
            user: database.user,
            password: database.password,
            database: database.database
        },
        admin: {
            nome: required(env, 'INITIAL_ADMIN_NOME'),
            cpf: required(env, 'INITIAL_ADMIN_CPF'),
            email: required(env, 'INITIAL_ADMIN_EMAIL'),
            telefone: required(env, 'INITIAL_ADMIN_TELEFONE'),
            senha: required(env, 'INITIAL_ADMIN_PASSWORD')
        },
        allowAdditional: env.INITIAL_ADMIN_ALLOW_ADDITIONAL === ADDITIONAL_ADMIN_CONFIRMATION
    };

    if (config.admin.nome.length < 3) throw new Error('INITIAL_ADMIN_NOME deve ter ao menos 3 caracteres.');
    if (!/^(?!([0-9])\1{10}$)\d{11}$/.test(config.admin.cpf)) {
        throw new Error('INITIAL_ADMIN_CPF deve conter 11 dígitos não repetidos.');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.admin.email)) {
        throw new Error('INITIAL_ADMIN_EMAIL deve ser um e-mail válido.');
    }
    if (!/^\+?\d{10,15}$/.test(config.admin.telefone)) {
        throw new Error('INITIAL_ADMIN_TELEFONE deve conter de 10 a 15 dígitos, com + opcional.');
    }
    validatePassword(config.admin.senha);
    return config;
}

function assertAdminBootstrapTarget(env = process.env) {
    const database = String(env.DB_NAME || '').trim();
    if (env.NODE_ENV === 'production') {
        if (!database || database === 'site_cursos') {
            throw new Error('Banco de produção inválido para bootstrap administrativo.');
        }
        if (env.ALLOW_PRODUCTION_ADMIN_BOOTSTRAP !== PRODUCTION_BOOTSTRAP_CONFIRMATION) {
            throw new Error('Defina ALLOW_PRODUCTION_ADMIN_BOOTSTRAP=I_UNDERSTAND para o bootstrap em produção.');
        }
        return database;
    }

    const { assertDevelopmentDatabase } = require('./test_database_safety');
    return assertDevelopmentDatabase(env);
}

async function criarAdminInicial({
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
        if (!lockAcquired) throw new Error('Não foi possível obter exclusividade para o bootstrap administrativo.');

        await connection.beginTransaction();
        transactionStarted = true;

        const [sameAdmin] = await connection.query(
            'SELECT id_usuario, email, cpf, tipo FROM Usuarios WHERE (email = ? OR cpf = ?) FOR UPDATE',
            [config.admin.email, config.admin.cpf]
        );
        if (sameAdmin.length > 0) {
            if (sameAdmin.length !== 1 || sameAdmin[0].tipo !== 'ADMIN'
                || sameAdmin[0].email.toLowerCase() !== config.admin.email.toLowerCase()
                || sameAdmin[0].cpf !== config.admin.cpf) {
                throw new Error('Identidade inicial em conflito; não será promovida ou substituída.');
            }
            await connection.rollback();
            transactionStarted = false;
            output.info('admin.bootstrap.idempotente', { userId: sameAdmin[0].id_usuario });
            return { sucesso: true, criado: false, idAdmin: sameAdmin[0].id_usuario };
        }

        const [admins] = await connection.query(
            "SELECT id_usuario FROM Usuarios WHERE tipo = 'ADMIN' LIMIT 1 FOR UPDATE"
        );
        if (admins.length > 0 && !config.allowAdditional) {
            throw new Error('Outro administrador já existe; bootstrap inicial recusado.');
        }

        const passwordHash = await bcrypt.hash(config.admin.senha, 12);
        const [result] = await connection.query(
            `INSERT INTO Usuarios (nome_completo, cpf, email, senha, telefone, tipo)
             VALUES (?, ?, ?, ?, ?, 'ADMIN')`,
            [config.admin.nome, config.admin.cpf, config.admin.email, passwordHash, config.admin.telefone]
        );
        if (result.affectedRows !== 1) throw new Error('O banco não confirmou a criação do administrador.');

        await connection.commit();
        transactionStarted = false;
        output.info('admin.bootstrap.criado', { userId: result.insertId });
        return { sucesso: true, criado: true, idAdmin: result.insertId };
    } catch (error) {
        if (connection && transactionStarted) await connection.rollback();
        output.error('admin.bootstrap.falhou', { code: error.code || 'BOOTSTRAP_FAILED' });
        throw error;
    } finally {
        if (connection && lockAcquired) {
            await connection.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]).catch(() => undefined);
        }
        if (connection) await connection.end();
    }
}

async function main() {
    assertAdminBootstrapTarget(process.env);
    const env = { ...process.env };
    if (env.INITIAL_ADMIN_PASSWORD_FILE) {
        const fs = require('fs');
        const stat = fs.statSync(env.INITIAL_ADMIN_PASSWORD_FILE);
        if (!stat.isFile() || (stat.mode & 0o077)) throw new Error('Arquivo de senha deve ser privado (0600).');
        env.INITIAL_ADMIN_PASSWORD = fs.readFileSync(env.INITIAL_ADMIN_PASSWORD_FILE, 'utf8').replace(/\r?\n$/, '');
    } else if (!env.INITIAL_ADMIN_PASSWORD && process.stdin.isTTY) {
        const { Writable } = require('stream');
        const output = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
        const input = require('readline').createInterface({ input: process.stdin, output, terminal: true });
        process.stderr.write('Senha do administrador (entrada oculta): ');
        env.INITIAL_ADMIN_PASSWORD = await new Promise((resolve, reject) => {
            input.once('SIGINT', () => { input.close(); reject(new Error('Bootstrap cancelado.')); });
            input.question('', (password) => { input.close(); resolve(password); });
        });
        process.stderr.write('\n');
    }
    try { await criarAdminInicial({ env }); }
    finally { delete env.INITIAL_ADMIN_PASSWORD; }
}

if (require.main === module) main().catch((error) => {
    console.error(error.sql ? `Bootstrap recusado (${error.code}).` : error.message);
    process.exitCode = 1;
});

module.exports = {
    ADDITIONAL_ADMIN_CONFIRMATION,
    PRODUCTION_BOOTSTRAP_CONFIRMATION,
    assertAdminBootstrapTarget,
    criarAdminInicial,
    readConfiguration,
    validatePassword
};
