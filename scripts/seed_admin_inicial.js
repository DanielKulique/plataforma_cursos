/**
 * Bootstrap explícito do primeiro administrador.
 * Uso: npm run admin:bootstrap
 */
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const logger = require('../src/utils/logger');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const LOCK_NAME = 'plataforma_cursos_admin_bootstrap';
const ADDITIONAL_ADMIN_CONFIRMATION = 'I_UNDERSTAND_CREATE_ANOTHER_ADMIN';

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
    const config = {
        db: {
            host: required(env, 'DB_HOST'),
            port: Number(env.DB_PORT || 3306),
            user: required(env, 'DB_USER'),
            password: required(env, 'DB_PASSWORD'),
            database: required(env, 'DB_NAME')
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

    if (!Number.isInteger(config.db.port) || config.db.port < 1 || config.db.port > 65535) {
        throw new Error('DB_PORT deve ser uma porta TCP válida.');
    }
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
        const [lockRows] = await connection.query('SELECT GET_LOCK(?, 10) AS adquirido', [LOCK_NAME]);
        lockAcquired = Number(lockRows?.[0]?.adquirido) === 1;
        if (!lockAcquired) throw new Error('Não foi possível obter exclusividade para o bootstrap administrativo.');

        await connection.beginTransaction();
        transactionStarted = true;

        const [sameAdmin] = await connection.query(
            "SELECT id_usuario FROM Usuarios WHERE tipo = 'ADMIN' AND (email = ? OR cpf = ?) LIMIT 1 FOR UPDATE",
            [config.admin.email, config.admin.cpf]
        );
        if (sameAdmin.length > 0) {
            await connection.rollback();
            transactionStarted = false;
            output.info('admin.bootstrap.idempotente', { userId: sameAdmin[0].id_usuario });
            return { sucesso: true, criado: false, idAdmin: sameAdmin[0].id_usuario };
        }

        const [admins] = await connection.query(
            "SELECT id_usuario FROM Usuarios WHERE tipo = 'ADMIN' LIMIT 1 FOR UPDATE"
        );
        if (admins.length > 0 && !config.allowAdditional) {
            await connection.rollback();
            transactionStarted = false;
            output.info('admin.bootstrap.ja_existente', { userId: admins[0].id_usuario });
            return { sucesso: true, criado: false, idAdmin: admins[0].id_usuario };
        }

        const passwordHash = await bcrypt.hash(config.admin.senha, 10);
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
        output.error('admin.bootstrap.falhou', { error });
        throw error;
    } finally {
        if (connection && lockAcquired) {
            await connection.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]).catch(() => undefined);
        }
        if (connection) await connection.end();
    }
}

if (require.main === module) {
    const { assertDevelopmentDatabase } = require('./test_database_safety');
    assertDevelopmentDatabase(process.env);
    criarAdminInicial()
        .then((result) => {
            process.exitCode = result.sucesso ? 0 : 1;
        })
        .catch(() => {
            process.exitCode = 1;
        });
}

module.exports = {
    ADDITIONAL_ADMIN_CONFIRMATION,
    criarAdminInicial,
    readConfiguration,
    validatePassword
};
