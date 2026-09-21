'use strict';

const path = require('path');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const { loadEnvironment } = require('../src/config/loadEnvironment');
const { assertCanonicalWritableDatabase, LEGACY_DATABASE } = require('./test_database_safety');
const {
    assertDatabaseConnectionEnvironment,
    describeDatabaseTarget
} = require('../src/config/database-connection');
const { assertDatabaseIdentity } = require('../src/config/database-identity');
const { inspectMigrationStatus, listApplicationTables, runMigrations } = require('./lib/migration-runner');

const root = path.join(__dirname, '..');
const migrationsDir = path.join(root, 'mysql', 'migrations');
const bootstrapSchemaPath = path.join(root, 'mysql', 'schema.sql');

function loadMigrationEnvironment() {
    const requestedEnvironment = process.env.NODE_ENV;
    if (requestedEnvironment === 'production') {
        dotenv.config({ path: path.join(root, '.env'), override: false, quiet: true });
        process.env.NODE_ENV = 'production';
        assertDatabaseConnectionEnvironment(process.env);
    } else {
        loadEnvironment(requestedEnvironment === 'test' ? 'test' : 'development', root);
    }
}

function assertMigrationTarget(env, { requireWriteAuthorization = true } = {}) {
    const target = assertDatabaseConnectionEnvironment(env);
    if (env.NODE_ENV === 'production') {
        const database = String(env.DB_NAME || '').trim();
        if (!database || database === LEGACY_DATABASE) throw new Error('Banco de produção inválido para migration.');
        if (requireWriteAuthorization && env.ALLOW_PRODUCTION_MIGRATIONS !== 'I_UNDERSTAND') {
            throw new Error('Defina ALLOW_PRODUCTION_MIGRATIONS=I_UNDERSTAND para aplicar migrations em produção.');
        }
        return target.database;
    }
    return assertCanonicalWritableDatabase(env);
}

function parseArguments(argv) {
    const options = { baselineVersion: null, status: false, json: false };
    for (const argument of argv) {
        if (argument === '--status') options.status = true;
        else if (argument === '--json') options.json = true;
        else if (argument.startsWith('--baseline-existing=')) {
            const raw = argument.slice('--baseline-existing='.length);
            if (!/^\d+$/.test(raw)) throw new Error('--baseline-existing exige uma versão inteira.');
            options.baselineVersion = Number(raw);
        } else throw new Error(`Argumento desconhecido: ${argument}`);
    }
    if (options.status && options.baselineVersion !== null) {
        throw new Error('--status não pode ser combinado com --baseline-existing.');
    }
    return options;
}

function humanStatus(result) {
    for (const item of result.statuses) {
        const version = String(item.version).padStart(3, '0');
        console.log(`${version} ${item.state.replaceAll('_', ' ')}`);
    }
    for (const error of result.errors) {
        if (error.type === 'CHECKSUM_MISMATCH') {
            console.error(
                `${String(error.version).padStart(3, '0')} CHECKSUM_MISMATCH ${error.filename}\n`
                + `  esperado:   ${error.expectedChecksum}\n  encontrado: ${error.actualChecksum}`
            );
        } else {
            console.error(`${error.type}: ${error.message || JSON.stringify(error)}`);
        }
    }
}

async function migrationStatus({ env = process.env, createConnection = mysql.createConnection } = {}) {
    assertMigrationTarget(env, { requireWriteAuthorization: false });
    const target = assertDatabaseConnectionEnvironment(env);
    const connection = await createConnection({
        host: target.host,
        port: target.port,
        user: target.user,
        password: target.password,
        database: target.database
    });
    try {
        const tables = await listApplicationTables(connection, target.database);
        if (tables.length) await assertDatabaseIdentity(connection, target);
        return await inspectMigrationStatus(connection, target.database, migrationsDir);
    } finally {
        await connection.end();
    }
}

async function migrate({
    env = process.env,
    createConnection = mysql.createConnection,
    baselineVersion = null,
    output = console
} = {}) {
    assertMigrationTarget(env);
    const target = assertDatabaseConnectionEnvironment(env);
    return runMigrations({
        target,
        migrationsDir,
        bootstrapSchemaPath,
        baselineVersion,
        createConnection,
        output
    });
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    loadMigrationEnvironment();
    const target = describeDatabaseTarget(process.env);
    if (options.status) {
        const result = await migrationStatus();
        if (options.json) console.log(JSON.stringify({ target, ...result }, null, 2));
        else {
            console.log(JSON.stringify(target, null, 2));
            humanStatus(result);
        }
        if (result.errors.length) process.exitCode = 1;
        return;
    }

    const output = options.json ? { log() {}, error() {} } : console;
    if (!options.json) console.log(JSON.stringify(target, null, 2));
    const result = await migrate({ baselineVersion: options.baselineVersion, output });
    if (options.json) console.log(JSON.stringify({ target, ...result }, null, 2));
    else if (result.noOp) console.log(`Migrations: NO-OP (versão ${String(result.latestVersion).padStart(3, '0')}).`);
    else console.log(`Migrations aplicadas: ${result.applied.map((item) => String(item.version).padStart(3, '0')).join(', ')}.`);
}

if (require.main === module) {
    main().catch((error) => {
        console.error(`${error.code || 'MIGRATION_FAILED'}: ${error.message}`);
        if (error.details && Object.keys(error.details).length) console.error(JSON.stringify(error.details, null, 2));
        process.exitCode = 1;
    });
}

module.exports = {
    assertMigrationTarget,
    humanStatus,
    loadMigrationEnvironment,
    migrate,
    migrationStatus,
    parseArguments
};
