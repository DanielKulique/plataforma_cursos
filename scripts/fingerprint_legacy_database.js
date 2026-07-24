'use strict';

const crypto = require('crypto');
const path = require('path');
const mysql = require('mysql2/promise');
const { LEGACY_DATABASE, assertLegacyDatabaseReadOnly } = require('./test_database_safety');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true, quiet: true });
assertLegacyDatabaseReadOnly({ DB_NAME: LEGACY_DATABASE });

const config = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: LEGACY_DATABASE
};

function quoteIdentifier(value) {
    return `\`${String(value).replaceAll('`', '``')}\``;
}

async function fingerprintLegacyDatabase() {
    const connection = await mysql.createConnection(config);
    try {
        await connection.query('SET SESSION TRANSACTION READ ONLY');
        await connection.query('START TRANSACTION READ ONLY');

        const [columns] = await connection.query(
            `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY, EXTRA
             FROM INFORMATION_SCHEMA.COLUMNS
             WHERE TABLE_SCHEMA = ?
             ORDER BY TABLE_NAME, ORDINAL_POSITION`,
            [LEGACY_DATABASE]
        );
        const tables = [...new Set(columns.map((column) => column.TABLE_NAME))].sort();
        const rowCounts = {};
        const checksums = {};
        for (const table of tables) {
            const [countRows] = await connection.query(`SELECT COUNT(*) AS total FROM ${quoteIdentifier(table)}`);
            const [checksumRows] = await connection.query(`CHECKSUM TABLE ${quoteIdentifier(table)} EXTENDED`);
            rowCounts[table] = Number(countRows[0].total);
            checksums[table] = checksumRows[0].Checksum === null ? null : String(checksumRows[0].Checksum);
        }

        const fingerprint = crypto.createHash('sha256')
            .update(JSON.stringify({ columns, rowCounts, checksums }))
            .digest('hex');
        console.log(JSON.stringify({ database: LEGACY_DATABASE, tableCount: tables.length, rowCounts, fingerprint }, null, 2));
        await connection.rollback();
    } finally {
        await connection.rollback().catch(() => undefined);
        await connection.end();
    }
}

fingerprintLegacyDatabase().catch((error) => {
    console.error(`Falha na auditoria somente leitura de ${LEGACY_DATABASE}: ${error.message}`);
    process.exitCode = 1;
});
