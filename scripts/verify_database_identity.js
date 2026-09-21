#!/usr/bin/env node
'use strict';

const path = require('path');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');
const {
    assertDatabaseConnectionEnvironment,
    databaseClientConfig,
    describeDatabaseTarget
} = require('../src/config/database-connection');
const { assertDatabaseIdentity } = require('../src/config/database-identity');
const { loadEnvironment } = require('../src/config/loadEnvironment');

async function verifyDatabaseIdentity({ env = process.env, createConnection = mysql.createConnection } = {}) {
    const target = assertDatabaseConnectionEnvironment(env);
    const connection = await createConnection(databaseClientConfig(env));
    try {
        return await assertDatabaseIdentity(connection, target);
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
    const declared = describeDatabaseTarget(process.env);
    const facts = await verifyDatabaseIdentity();
    console.log(JSON.stringify({ declared, observed: facts }, null, 2));
}

if (require.main === module) {
    main().catch((error) => {
        console.error(`DATABASE_IDENTITY_FAILED: ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = { verifyDatabaseIdentity };
