'use strict';

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { loadEnvironment } = require('../src/config/loadEnvironment');
const { assertDatabaseConnectionEnvironment } = require('../src/config/database-connection');
const { assertDatabaseIdentity } = require('../src/config/database-identity');
const { CONTRACT_PATH, readSchemaMetadata } = require('./schema_contract');
const { discoverMigrations, ensureLedger } = require('./lib/migration-runner');

const root = path.join(__dirname, '..');

async function generate() {
    loadEnvironment('test', root);
    const target = assertDatabaseConnectionEnvironment(process.env);
    if (target.host !== '127.0.0.1' || target.port !== 33307 || target.database !== 'plataforma_cursos_test') {
        throw new Error('Contrato só pode ser capturado do MySQL Docker descartável em 127.0.0.1:33307.');
    }
    const connection = await mysql.createConnection({
        host: target.host,
        port: target.port,
        user: target.user,
        password: target.password,
        database: target.database
    });
    try {
        await assertDatabaseIdentity(connection, target);
        await ensureLedger(connection);
        const migrations = discoverMigrations(path.join(root, 'mysql', 'migrations'));
        const contract = {
            expectedVersion: migrations.at(-1)?.version || 0,
            generatedFrom: 'mysql/schema.sql + migrations on disposable MySQL 8.4',
            tables: await readSchemaMetadata(connection, target.database)
        };
        fs.writeFileSync(CONTRACT_PATH, `${JSON.stringify(contract, null, 2)}\n`, 'utf8');
        console.log(`Contrato gravado em ${path.relative(root, CONTRACT_PATH)} (${Object.keys(contract.tables).length} tabelas).`);
    } finally {
        await connection.end();
    }
}

generate().catch((error) => {
    console.error(`Falha ao gerar contrato: ${error.message}`);
    process.exitCode = 1;
});
