#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const core = require('./lib/backup-core');
const privateStorage = require('../src/api/services/private-storage.service');
const { obterDiretorioMateriais } = require('../src/config/material-storage');
const { obterDiretorioCertificados } = require('../src/config/certificate-storage');
const { reconcile } = require('../src/api/services/storage-reconciliation.service');
const db = require('../src/config/database');

function mismatch(message) { throw Object.assign(new Error(message), { code: 'RESTORE_MISMATCH' }); }

async function verifyDatabase(manifest) {
    for (const [table, expected] of Object.entries(manifest.database.table_counts)) {
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(table)) mismatch('Tabela inválida no manifesto.');
        const [[row]] = await db.query(`SELECT COUNT(*) AS total FROM \`${table}\``);
        if (Number(row.total) !== Number(expected)) mismatch(`Contagem divergente: ${table}.`);
    }
    const [materials] = await db.query(`SELECT id_arquivo_material, storage_name, size_bytes, sha256, status,
        (SELECT COUNT(*) FROM Conteudos c WHERE c.id_arquivo_material = a.id_arquivo_material) AS reference_count
        FROM ArquivosMateriais a ORDER BY id_arquivo_material`);
    const [certificates] = await db.query(`SELECT id_certificado, codigo_publico, versao, status, storage_name,
        tamanho_bytes, sha256 FROM Certificados ORDER BY id_certificado`);
    const materialFields = ['id_arquivo_material', 'storage_name', 'size_bytes', 'sha256', 'status', 'reference_count'];
    const certificateFields = ['id_certificado', 'codigo_publico', 'versao', 'status', 'storage_name', 'tamanho_bytes', 'sha256'];
    const comparable = (rows, fields) => rows.map((row) => Object.fromEntries(fields.map((field) => [field, typeof row[field] === 'number' ? row[field] : String(row[field])])));
    if (JSON.stringify(comparable(materials, materialFields)) !== JSON.stringify(comparable(manifest.storage.materials.records, materialFields))) mismatch('Metadados de materiais divergiram.');
    if (JSON.stringify(comparable(certificates, certificateFields)) !== JSON.stringify(comparable(manifest.storage.certificates.records, certificateFields))) mismatch('Metadados de certificados divergiram.');
}

async function verifyStorageRecords(records, namespace, root) {
    const sizeField = namespace === 'certificates' ? 'tamanho_bytes' : 'size_bytes';
    const rootStat = await fs.promises.stat(root);
    if ((rootStat.mode & 0o777) !== 0o700) mismatch(`Diretório ${namespace} não está com modo 0700.`);
    for (const record of records) {
        if (namespace === 'materials' && record.status === 'PURGADO') continue;
        const actual = await privateStorage.hashFile(root, record.storage_name);
        if (actual.sha256 !== record.sha256 || actual.size !== Number(record[sizeField])) mismatch(`${namespace}:${record.storage_name} divergiu.`);
        if ((actual.stat.mode & 0o777) !== 0o600) mismatch(`${namespace}:${record.storage_name} não está com modo 0600.`);
        if (actual.stat.uid !== rootStat.uid || actual.stat.gid !== rootStat.gid) mismatch(`${namespace}:${record.storage_name} possui proprietário inesperado.`);
    }
}

async function main() {
    const backupDir = path.resolve(process.argv[2] || '');
    const verified = await core.verifyBackupDir(backupDir);
    await verifyDatabase(verified.manifest);
    await verifyStorageRecords(verified.manifest.storage.materials.records, 'materials', obterDiretorioMateriais());
    await verifyStorageRecords(verified.manifest.storage.certificates.records, 'certificates', obterDiretorioCertificados());
    const report = await reconcile(db, { apply: false });
    const unhealthy = new Set(['MISSING', 'HASH_MISMATCH', 'DIRECTORY_UNAVAILABLE', 'UNSAFE_PATH', 'LIFECYCLE_MISMATCH', 'ORPHAN', 'UNKNOWN', 'PURGED_RESIDUE']);
    const failures = report.entries.filter((entry) => unhealthy.has(entry.classification));
    if (failures.length) mismatch(`Reconciliador encontrou ${failures.length} inconsistência(s).`);
    console.log(JSON.stringify({
        status: 'RESTORE_VERIFIED', backup_id: verified.backup_id,
        tables: Object.keys(verified.manifest.database.table_counts).length,
        materials: verified.manifest.storage.materials.records.length,
        certificates: verified.manifest.storage.certificates.records.length,
        reconciliation: report.counts
    }));
}

main().catch((error) => {
    console.error(`RESTORE_VERIFY_FAILED: ${error.code || 'ERROR'}: ${error.message}`);
    process.exitCode = 1;
}).finally(() => db.end());
