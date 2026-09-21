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
const {
    assertDatabaseConnectionEnvironment,
    describeDatabaseTarget
} = require('../src/config/database-connection');
const {
    assertDatabaseIdentity,
    initializeDatabaseIdentity,
    inspectDatabaseServer
} = require('../src/config/database-identity');

const root = path.join(__dirname, '..');

function quoteIdentifier(value) {
    return `\`${String(value).replaceAll('`', '``')}\``;
}

function configurationForMode(mode, env) {
    if (!['dev', 'test'].includes(mode)) {
        throw new Error('Uso: node scripts/setup_database.js <dev|test>');
    }
    const connection = assertDatabaseConnectionEnvironment(env);
    const database = mode === 'test'
        ? assertTestDatabaseIsDisposable(env)
        : assertDevelopmentDatabase(env);
    const expectedDatabase = mode === 'test' ? TEST_DATABASE : DEVELOPMENT_DATABASE;
    if (database !== expectedDatabase || connection.database !== database) {
        throw new Error('Banco-alvo inesperado.');
    }
    return connection;
}

async function databaseExists(serverConnection, database) {
    const [[row]] = await serverConnection.query(
        `SELECT COUNT(*) AS total
         FROM INFORMATION_SCHEMA.SCHEMATA
         WHERE SCHEMA_NAME = ?`,
        [database]
    );
    return Number(row.total) === 1;
}

async function setupDatabase({
    mode,
    env = process.env,
    createConnection = mysql.createConnection,
    schema = fs.readFileSync(path.join(root, 'mysql', 'schema.sql'), 'utf8'),
    output = console
} = {}) {
    const target = configurationForMode(mode, env);
    const baseConfig = {
        host: target.host,
        port: target.port,
        user: target.user,
        password: target.password,
        multipleStatements: true
    };
    let serverConnection;
    let databaseConnection;

    try {
        serverConnection = await createConnection(baseConfig);
        await inspectDatabaseServer(serverConnection);

        const exists = await databaseExists(serverConnection, target.database);
        if (exists) {
            databaseConnection = await createConnection({ ...baseConfig, database: target.database });
            const tables = await listTables(databaseConnection, target.database);
            if (tables.length > 0) await assertDatabaseIdentity(databaseConnection, target);

            if (mode === 'dev' && tables.length > 0) {
                await assertCanonicalSchema(databaseConnection, target.database, { allowMissingMigrationLedger: true });
                output.log(`Banco ${target.database} já possui identidade e schema canônicos; nenhuma alteração foi aplicada.`);
                return { changed: false, database: target.database };
            }
            await databaseConnection.end();
            databaseConnection = undefined;
        }

        if (mode === 'test' && exists) {
            await serverConnection.query(`DROP DATABASE ${quoteIdentifier(target.database)}`);
        }
        await serverConnection.query(
            `CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(target.database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
        );

        databaseConnection = await createConnection({ ...baseConfig, database: target.database });
        const tables = await listTables(databaseConnection, target.database);
        if (tables.length > 0) {
            throw new Error(`O banco ${target.database} deveria estar vazio antes da aplicação do schema.`);
        }
        await databaseConnection.query(schema);
        await initializeDatabaseIdentity(databaseConnection, target);
        const verified = await assertCanonicalSchema(
            databaseConnection,
            target.database,
            { allowMissingMigrationLedger: true }
        );
        output.log(`Schema canônico aplicado em ${target.database} (${verified.tablesChecked} tabelas verificadas).`);
        return { changed: true, database: target.database };
    } finally {
        if (databaseConnection) await databaseConnection.end();
        if (serverConnection) await serverConnection.end();
    }
}

async function main() {
    const mode = process.argv[2];
    loadEnvironment(mode, root);
    console.log(JSON.stringify(describeDatabaseTarget(process.env), null, 2));
    await setupDatabase({ mode });
}

if (require.main === module) {
    main().catch((error) => {
        console.error(`Falha ao preparar o banco: ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = { configurationForMode, databaseExists, setupDatabase };
