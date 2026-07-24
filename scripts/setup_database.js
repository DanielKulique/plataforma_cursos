'use strict';

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const {
    DEVELOPMENT_DATABASE,
    TEST_DATABASE,
    assertDevelopmentDatabase,
    assertTestDatabaseIsDisposable
} = require('./test_database_safety');
const { listTables, assertCanonicalSchema } = require('./schema_contract');
const { loadEnvironment } = require('../src/config/loadEnvironment');

const mode = process.argv[2];
if (!['dev', 'test'].includes(mode)) {
    throw new Error('Uso: node scripts/setup_database.js <dev|test>');
}

const root = path.join(__dirname, '..');
const envFile = mode === 'test' ? '.env.test' : '.env';
loadEnvironment(mode, root);

const database = mode === 'test'
    ? assertTestDatabaseIsDisposable(process.env)
    : assertDevelopmentDatabase(process.env);
const expectedDatabase = mode === 'test' ? TEST_DATABASE : DEVELOPMENT_DATABASE;
if (database !== expectedDatabase) throw new Error('Banco-alvo inesperado.');

const baseConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true
};

function quoteIdentifier(value) {
    return `\`${String(value).replaceAll('`', '``')}\``;
}

function printManualInstructions() {
    const host = process.env.DB_HOST || 'localhost';
    const port = Number(process.env.DB_PORT || 3306);
    const user = process.env.DB_USER || '<usuario_mysql>';
    console.error('Comandos manuais equivalentes (não alteram o banco legado):');
    const databaseCommand = mode === 'test'
        ? `DROP DATABASE IF EXISTS ${quoteIdentifier(database)}; CREATE DATABASE ${quoteIdentifier(database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
        : `CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`;
    console.error(`mysql -h ${host} -P ${port} -u ${user} -p -e "${databaseCommand}"`);
    console.error(`mysql -h ${host} -P ${port} -u ${user} -p ${database} < mysql/schema.sql`);
}

async function setupDatabase() {
    if (!baseConfig.user || baseConfig.password === undefined) {
        throw new Error(`Configure DB_USER e DB_PASSWORD em ${envFile} antes de preparar o banco.`);
    }

    const schema = fs.readFileSync(path.join(root, 'mysql', 'schema.sql'), 'utf8');
    let serverConnection;
    let databaseConnection;

    try {
        serverConnection = await mysql.createConnection(baseConfig);

        if (mode === 'test') {
            await serverConnection.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(database)}`);
        }
        await serverConnection.query(
            `CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
        );

        databaseConnection = await mysql.createConnection({ ...baseConfig, database });
        const tables = await listTables(databaseConnection, database);

        if (mode === 'dev' && tables.length > 0) {
            await assertCanonicalSchema(databaseConnection, database);
            console.log(`Banco ${database} já possui o schema canônico; nenhuma alteração foi aplicada.`);
            return;
        }

        if (tables.length > 0) {
            throw new Error(`O banco ${database} deveria estar vazio antes da aplicação do schema.`);
        }

        await databaseConnection.query(schema);
        const verified = await assertCanonicalSchema(databaseConnection, database);
        console.log(`Schema canônico aplicado em ${database} (${verified.tables} tabelas verificadas).`);
    } catch (error) {
        if (['ER_DBACCESS_DENIED_ERROR', 'ER_ACCESS_DENIED_ERROR', 'ER_TABLEACCESS_DENIED_ERROR'].includes(error.code)) {
            printManualInstructions();
        }
        throw error;
    } finally {
        if (databaseConnection) await databaseConnection.end();
        if (serverConnection) await serverConnection.end();
    }
}

setupDatabase().catch((error) => {
    console.error(`Falha ao preparar ${database}: ${error.message}`);
    process.exitCode = 1;
});
