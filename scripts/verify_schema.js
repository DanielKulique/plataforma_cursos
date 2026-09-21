'use strict';

const path = require('path');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const { loadEnvironment } = require('../src/config/loadEnvironment');
const { validateCanonicalSchema } = require('./schema_contract');
const { inspectMigrationStatus } = require('./lib/migration-runner');
const { assertDatabaseConnectionEnvironment, describeDatabaseTarget } = require('../src/config/database-connection');
const { assertDatabaseIdentity } = require('../src/config/database-identity');

const root = path.join(__dirname, '..');
const migrationsDir = path.join(root, 'mysql', 'migrations');

function parseArguments(argv) {
    const options = { json: false, allowMissingLedger: false };
    for (const argument of argv) {
        if (argument === '--json') options.json = true;
        else if (argument === '--allow-missing-ledger') options.allowMissingLedger = true;
        else throw new Error(`Argumento desconhecido: ${argument}`);
    }
    return options;
}

function formatValue(value) {
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
}

function printHuman(result) {
    console.log(`Schema validation: ${result.status === 'ok' ? 'OK' : 'FAILED'}`);
    console.log(
        `${result.tablesChecked} tabelas, ${result.columnsChecked} colunas, `
        + `${result.indexesChecked} índices e ${result.constraintsChecked} constraints verificados.`
    );
    for (const error of result.errors) {
        const location = [error.table, error.column || error.name].filter(Boolean).join('.');
        console.error(`\n${error.type}${location ? ` — ${location}` : ''}`);
        if ('expected' in error) console.error(`  esperado:   ${formatValue(error.expected)}`);
        if ('actual' in error) console.error(`  encontrado: ${formatValue(error.actual)}`);
        if (error.message) console.error(`  ${error.message}`);
    }
    for (const warning of result.warnings) console.warn(`\n${warning.type}: ${warning.message}`);
}

async function verifySchema({
    env = process.env,
    createConnection = mysql.createConnection,
    allowMissingLedger = false
} = {}) {
    const target = assertDatabaseConnectionEnvironment(env);
    const connection = await createConnection({
        host: target.host,
        port: target.port,
        user: target.user,
        password: target.password,
        database: target.database
    });
    try {
        await assertDatabaseIdentity(connection, target);
        const structural = await validateCanonicalSchema(connection, target.database, {
            allowMissingMigrationLedger: allowMissingLedger
        });
        const migration = await inspectMigrationStatus(connection, target.database, migrationsDir);
        const baselineWarnings = new Set(['LEDGER_MISSING', 'LEDGER_EMPTY_WITH_EXISTING_SCHEMA']);
        const migrationErrors = migration.errors.filter(
            (error) => !(allowMissingLedger && baselineWarnings.has(error.type))
        );
        const warnings = allowMissingLedger
            ? migration.errors.filter((error) => baselineWarnings.has(error.type))
            : [];
        const errors = [
            ...structural.errors,
            ...migrationErrors.map((error) => ({ ...error, category: 'MIGRATION_DRIFT' }))
        ];
        return {
            ...structural,
            status: errors.length ? 'error' : 'ok',
            errors,
            warnings,
            migration: {
                latestVersion: migration.migrations.at(-1)?.version || 0,
                applied: migration.ledger.length,
                pending: migration.statuses.filter((item) => item.state === 'PENDING').length,
                drift: migration.errors.length > 0
            }
        };
    } finally {
        await connection.end();
    }
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    if (process.env.NODE_ENV === 'production') {
        dotenv.config({ path: path.join(root, '.env'), override: false, quiet: true });
    } else {
        loadEnvironment(process.env.NODE_ENV === 'test' ? 'test' : 'development', root);
    }
    const target = describeDatabaseTarget(process.env);
    const result = await verifySchema({ allowMissingLedger: options.allowMissingLedger });
    if (options.json) console.log(JSON.stringify({ target, ...result }, null, 2));
    else {
        console.log(JSON.stringify(target, null, 2));
        printHuman(result);
    }
    if (result.status !== 'ok') process.exitCode = 1;
}

if (require.main === module) {
    main().catch((error) => {
        console.error(`Falha na validação do schema: ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = { formatValue, parseArguments, printHuman, verifySchema };
