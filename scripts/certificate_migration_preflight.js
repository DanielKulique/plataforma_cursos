'use strict';

const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { resolverCaminhoCertificado } = require('../src/api/services/certificate-storage.service');

async function assertCertificateLegacyIntegrity(connection) {
    const [rows] = await connection.query('SELECT id_certificado, storage_name, sha256, tamanho_bytes FROM Certificados');
    for (const row of rows) {
        try {
            const bytes = await fs.readFile(resolverCaminhoCertificado(row.storage_name));
            if (bytes.length !== Number(row.tamanho_bytes)
                || crypto.createHash('sha256').update(bytes).digest('hex') !== row.sha256) {
                throw new Error('PDF divergente');
            }
        } catch {
            throw new Error(`Migration 009 interrompida: certificado ID ${Number(row.id_certificado)} com arquivo ausente ou integridade inválida. Histórico não corrigido.`);
        }
    }
    return rows.length;
}

module.exports = { assertCertificateLegacyIntegrity };
