'use strict';

const path = require('path');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const { assertCanonicalSchema, listTables } = require('./schema_contract');
const {
    assertDatabaseConnectionEnvironment,
    databaseClientConfig,
    describeDatabaseTarget
} = require('../src/config/database-connection');
const {
    assertDatabaseIdentity,
    initializeDatabaseIdentity,
    inspectDatabaseServer
} = require('../src/config/database-identity');
const { loadEnvironment } = require('../src/config/loadEnvironment');

const CONFIRMATION = 'I_UNDERSTAND_REGISTER_EXISTING_DATABASE';
const IDENTITY_DDL = `CREATE TABLE environment_identity (
  singleton_id TINYINT UNSIGNED NOT NULL,
  identity_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  database_name VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (singleton_id),
  UNIQUE KEY uk_environment_identity_key (identity_key),
  CONSTRAINT chk_environment_identity_singleton CHECK (singleton_id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

async function registerDatabaseIdentity({
    env = process.env,
    createConnection = mysql.createConnection,
    output = console
} = {}) {
    const target = assertDatabaseConnectionEnvironment(env);
    if (env.ALLOW_DATABASE_IDENTITY_REGISTRATION !== CONFIRMATION) {
        throw new Error(`Defina ALLOW_DATABASE_IDENTITY_REGISTRATION=${CONFIRMATION} após conferir o alvo.`);
    }
    const connection = await createConnection(databaseClientConfig(env));
    try {
        await inspectDatabaseServer(connection);
        const tables = await listTables(connection, target.database);
        if (tables.includes('environment_identity')) {
            const facts = await assertDatabaseIdentity(connection, target);
            output.log(`Identidade já registrada e válida em ${facts.database}.`);
            return { changed: false, facts };
        }
        await assertCanonicalSchema(connection, target.database, { allowMissingEnvironmentIdentity: true });
        await connection.query(IDENTITY_DDL);
        const facts = await initializeDatabaseIdentity(connection, target);
        output.log(`Identidade ${target.identity} registrada em ${target.database}.`);
        return { changed: true, facts };
    } finally {
        await connection.end();
    }
}

async function main() {
    const root = path.join(__dirname, '..');
    if (process.env.NODE_ENV === 'test') loadEnvironment('test', root);
    else if (process.env.NODE_ENV === 'production') {
        dotenv.config({ path: path.join(root, '.env'), override: false, quiet: true });
    } else loadEnvironment('development', root);
    console.log(JSON.stringify(describeDatabaseTarget(process.env), null, 2));
    await registerDatabaseIdentity();
}

if (require.main === module) {
    main().catch((error) => {
        console.error(`Falha ao registrar identidade: ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = { CONFIRMATION, IDENTITY_DDL, registerDatabaseIdentity };
