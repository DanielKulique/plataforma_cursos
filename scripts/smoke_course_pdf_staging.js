'use strict';

require('./lib/disposable-smoke').assertDisposableSmoke();

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const { PDFDocument } = require('pdf-lib');
const db = require('../src/config/database');
const privateStorage = require('../src/api/services/private-storage.service');
const { obterDiretorioMateriais, obterLimitePdfBytes } = require('../src/config/material-storage');
const { obterDiretorioCertificados } = require('../src/config/certificate-storage');

async function main() {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const credentials = require('dotenv').parse(Buffer.concat(chunks));
    const base = `http://app:${process.env.APP_PORT || 3000}`;

    async function call(route, { session, method = 'GET', body, expected = 200 } = {}) {
        const headers = {};
        if (session) {
            headers.Cookie = session.cookie;
            if (method !== 'GET') headers['X-CSRF-Token'] = session.csrf;
        }
        if (body && !(body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
            body = JSON.stringify(body);
        }
        const response = await fetch(`${base}${route}`, { method, headers, body });
        assert.equal(response.status, expected, `${method} ${route}: ${response.status}`);
        return response;
    }

    const login = await call('/api/auth/login', {
        method: 'POST',
        body: { email: credentials.ADMIN_EMAIL, senha: credentials.ADMIN_PASSWORD }
    });
    const auth = await login.json();
    const admin = { cookie: login.headers.get('set-cookie').split(';')[0], csrf: auth.csrf_token };
    const [[turma]] = await db.query(
        "SELECT id_turma FROM Turmas WHERE status = 'ABERTA' ORDER BY id_turma LIMIT 1"
    );
    assert(turma, 'Turma aberta não encontrada.');
    const [[ordem]] = await db.query(
        'SELECT COALESCE(MAX(ordem), 0) + 1 AS proxima FROM Conteudos WHERE id_turma = ?',
        [turma.id_turma]
    );
    const root = obterDiretorioMateriais();
    const document = await PDFDocument.create();
    document.addPage().drawText('Goal 12 staging');
    const valid = Buffer.from(await document.save());

    async function upload(buffer, filename, order, expected) {
        const form = new FormData();
        form.append('titulo', `Goal 12 fixture ${crypto.randomUUID()}`);
        form.append('ordem', String(order));
        form.append('arquivo', new Blob([buffer], { type: 'application/pdf' }), filename);
        return call(`/api/turmas/${turma.id_turma}/conteudos/pdf`, {
            session: admin, method: 'POST', body: form, expected
        });
    }

    let contentId;
    try {
        const created = await (await upload(valid, 'goal12.pdf', ordem.proxima, 201)).json();
        contentId = created.conteudo.id_conteudo;
        const download = await call(`/api/conteudos/${contentId}/material`, { session: admin });
        assert.match(download.headers.get('content-type'), /^application\/pdf/);
        assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
        assert.deepEqual(Buffer.from(await download.arrayBuffer()), valid);
        const [[material]] = await db.query(
            'SELECT storage_name, sha256 FROM ArquivosMateriais WHERE id_arquivo_material = ?',
            [created.conteudo.id_arquivo_material]
        );
        assert.equal(material.sha256, crypto.createHash('sha256').update(valid).digest('hex'));
        await privateStorage.safeFile(root, material.storage_name);
        const names = fs.readdirSync(root).sort();
        await upload(Buffer.from('%PDF-1.4\nstartxref\n0\n%%EOF\n'), 'truncado.pdf', Number(ordem.proxima) + 1, 422);
        await upload(Buffer.alloc(obterLimitePdfBytes() + 1, 32), 'grande.pdf', Number(ordem.proxima) + 2, 413);
        await upload(valid, '../escape.pdf', Number(ordem.proxima) + 3, 422);
        const wrongXref = Buffer.from(valid.toString('latin1').replace(
            /startxref\s+\d+\s+%%EOF/, 'startxref\n0\n%%EOF'
        ), 'latin1');
        await upload(wrongXref, 'xref.pdf', Number(ordem.proxima) + 4, 422);
        assert.deepEqual(fs.readdirSync(root).sort(), names);

        const [[certificate]] = await db.query(
            "SELECT id_certificado, storage_name FROM Certificados WHERE status = 'ATIVO' ORDER BY id_certificado LIMIT 1"
        );
        assert(certificate, 'Certificado ativo não encontrado.');
        const privatePdf = await call(`/api/certificados/${certificate.id_certificado}/pdf`, { session: admin });
        const certBytes = Buffer.from(await privatePdf.arrayBuffer());
        assert.match(privatePdf.headers.get('content-type'), /^application\/pdf/);
        const { file } = await privateStorage.safeFile(obterDiretorioCertificados(), certificate.storage_name);
        assert.deepEqual(certBytes, fs.readFileSync(file));
        const form = new FormData();
        form.append('arquivo', new Blob([certBytes], { type: 'application/pdf' }), 'certificado.pdf');
        const checked = await (await call('/api/public/certificados/validar-arquivo', {
            method: 'POST', body: form
        })).json();
        assert.equal(checked.resultado, 'AUTENTICO');
        console.log('GOAL12_STAGING_SMOKE_OK valid, malformed, wrong xref, oversized, filename, material download, certificate download/hash');
    } finally {
        if (contentId) {
            await call(`/api/conteudos/${contentId}`, { session: admin, method: 'DELETE' });
        }
    }
}

main().then(() => db.end(), async error => {
    console.error(error.message);
    await db.end();
    process.exitCode = 1;
});
