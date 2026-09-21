#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
// stdout desta CLI é exclusivamente JSON machine-readable.
console.info = console.error;
const db = require('../src/config/database');

async function main() {
    const database = String(process.env.DB_NAME || '').trim();
    if (!database) throw new Error('DB_NAME ausente.');
    const identity = await db.ensureDatabaseIdentity();
    const [[version]] = await db.query('SELECT VERSION() AS version');
    const [tables] = await db.query(`SELECT TABLE_NAME AS name FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`, [database]);
    const counts = {};
    for (const row of tables) {
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(row.name)) throw new Error('Nome de tabela inesperado.');
        const [[count]] = await db.query(`SELECT COUNT(*) AS total FROM \`${row.name}\``);
        counts[row.name] = Number(count.total);
    }
    const [materials] = await db.query(`SELECT a.id_arquivo_material, a.storage_name, a.size_bytes, a.sha256,
        a.status, a.criado_em, a.retido_em, a.purgado_em,
        (SELECT COUNT(*) FROM Conteudos c WHERE c.id_arquivo_material = a.id_arquivo_material) AS reference_count
        FROM ArquivosMateriais a ORDER BY a.id_arquivo_material`);
    const [certificates] = await db.query(`SELECT id_certificado, codigo_publico, versao, status, storage_name,
        tamanho_bytes, sha256, emitido_em, revogado_em FROM Certificados ORDER BY id_certificado`);
    const migrations = fs.readdirSync(path.join(__dirname, '..', 'mysql', 'migrations'))
        .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name)).sort();
    console.log(JSON.stringify({
        database_name: database,
        database_identity: identity.identity,
        mysql_version: version.version,
        latest_migration: migrations.at(-1) || null,
        table_counts: counts,
        materials,
        certificates
    }, null, 2));
}

main().catch((error) => {
    console.error(`BACKUP_METADATA_FAILED: ${error.code || error.message}`);
    process.exitCode = 1;
}).finally(() => db.end());
