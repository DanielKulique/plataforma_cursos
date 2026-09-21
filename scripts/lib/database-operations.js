'use strict';

const mysql = require('mysql2/promise');
const {
    assertDatabaseConnectionEnvironment,
    databaseClientConfig,
    describeDatabaseTarget
} = require('../../src/config/database-connection');
const { assertDatabaseIdentity } = require('../../src/config/database-identity');

async function openVerifiedConnection({
    env = process.env,
    createConnection = mysql.createConnection,
    additions = {}
} = {}) {
    const target = assertDatabaseConnectionEnvironment(env);
    const connection = await createConnection(databaseClientConfig(env, additions));
    try {
        await assertDatabaseIdentity(connection, target);
        return connection;
    } catch (error) {
        await connection.end().catch(() => undefined);
        throw error;
    }
}

async function assertVerifiedPool(pool, env = process.env) {
    const target = assertDatabaseConnectionEnvironment(env);
    await assertDatabaseIdentity(pool, target);
    return target;
}

function printDatabaseTarget(env = process.env, output = console) {
    output.log(JSON.stringify(describeDatabaseTarget(env), null, 2));
}

module.exports = { assertVerifiedPool, openVerifiedConnection, printDatabaseTarget };
