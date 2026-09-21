'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: false, quiet: true });
const db = require('../src/config/database');
const { resolverCaminhoCertificado } = require('../src/api/services/certificate-storage.service');

async function verify() {
    const [rows] = await db.query('SELECT storage_name, sha256, tamanho_bytes FROM Certificados');
    for (const row of rows) {
        const file = resolverCaminhoCertificado(row.storage_name);
        const stat = await fs.promises.stat(file);
        if (!stat.isFile() || stat.size !== Number(row.tamanho_bytes)) throw new Error('Tamanho do PDF divergente.');
        const hash = crypto.createHash('sha256');
        for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
        if (hash.digest('hex') !== row.sha256) throw new Error('SHA-256 do PDF divergente.');
    }
    console.log(`CERTIFICATE_STORAGE_OK certificados=${rows.length}`);
}

verify().catch((error) => {
    console.error(`CERTIFICATE_STORAGE_FAILED: ${error.code || error.message}`);
    process.exitCode = 1;
}).finally(() => db.end());
