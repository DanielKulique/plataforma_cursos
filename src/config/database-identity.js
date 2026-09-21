'use strict';

function identityError(message, facts) {
    const error = new Error(`Identidade do banco recusada: ${message}`);
    error.code = 'DATABASE_IDENTITY_MISMATCH';
    if (facts) error.databaseFacts = facts;
    return error;
}

async function inspectDatabaseServer(connection) {
    const [[row]] = await connection.query(
        'SELECT DATABASE() AS database_name, VERSION() AS version, @@hostname AS hostname, @@port AS port'
    );
    const facts = {
        database: row?.database_name === null ? null : String(row?.database_name || ''),
        version: String(row?.version || ''),
        hostname: String(row?.hostname || ''),
        port: Number(row?.port)
    };
    if (!/^8[.]4(?:[.-]|$)/.test(facts.version)) {
        throw identityError(`VERSION() deve identificar MySQL 8.4; recebido ${facts.version || 'vazio'}.`, facts);
    }
    if (!facts.hostname) throw identityError('@@hostname retornou vazio.', facts);
    if (facts.port !== 3306) {
        throw identityError(`@@port deve ser 3306 dentro da instância; recebido ${facts.port}.`, facts);
    }
    return facts;
}

async function readPersistentIdentity(connection) {
    let rows;
    try {
        [rows] = await connection.query(
            `SELECT identity_key, database_name
             FROM environment_identity
             WHERE singleton_id = 1`
        );
    } catch (error) {
        if (error.code === 'ER_NO_SUCH_TABLE') {
            throw identityError('o marcador persistente environment_identity não existe.');
        }
        throw error;
    }
    if (rows.length !== 1) {
        throw identityError('o marcador persistente deve conter exatamente a linha singleton_id=1.');
    }
    return {
        identity: String(rows[0].identity_key || ''),
        database: String(rows[0].database_name || '')
    };
}

async function assertDatabaseIdentity(connection, expected) {
    const facts = await inspectDatabaseServer(connection);
    if (facts.database !== expected.database) {
        throw identityError(
            `SELECT DATABASE() retornou ${facts.database || 'NULL'}; esperado ${expected.database}.`,
            facts
        );
    }
    const marker = await readPersistentIdentity(connection);
    if (marker.identity !== expected.identity || marker.database !== expected.database) {
        throw identityError(
            `marcador ${marker.identity || 'vazio'}/${marker.database || 'vazio'}; `
            + `esperado ${expected.identity}/${expected.database}.`,
            facts
        );
    }
    return { ...facts, identity: marker.identity };
}

async function initializeDatabaseIdentity(connection, expected) {
    await connection.query(
        `INSERT INTO environment_identity (singleton_id, identity_key, database_name)
         VALUES (1, ?, ?)`,
        [expected.identity, expected.database]
    );
    return assertDatabaseIdentity(connection, expected);
}

module.exports = {
    assertDatabaseIdentity,
    identityError,
    initializeDatabaseIdentity,
    inspectDatabaseServer,
    readPersistentIdentity
};
