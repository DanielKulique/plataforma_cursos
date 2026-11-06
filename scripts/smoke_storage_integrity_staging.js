'use strict';

require('./lib/disposable-smoke').assertDisposableSmoke();

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { PDFDocument } = require('pdf-lib');
const db = require('../src/config/database');
const storage = require('../src/api/services/private-storage.service');
const { reconcile } = require('../src/api/services/storage-reconciliation.service');
const { obterDiretorioMateriais } = require('../src/config/material-storage');
const { obterDiretorioCertificados } = require('../src/config/certificate-storage');

async function samplePdf(text) {
    const document = await PDFDocument.create();
    document.addPage().drawText(text);
    return Buffer.from(await document.save());
}

async function main() {
    const mode = process.argv[2];
    assert(['prepare', 'verify', 'cleanup'].includes(mode));
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const credentials = require('dotenv').parse(Buffer.concat(chunks));
    const base = process.env.APP_BASE_URL.replace(/\/$/, '');
    const authorization = `Basic ${Buffer.from(`${credentials.BASIC_AUTH_USER}:${credentials.BASIC_AUTH_PASSWORD}`).toString('base64')}`;
    async function call(route, session, method = 'GET', body, expected = 200) {
        const headers = { Authorization: authorization };
        if (session) { headers.Cookie = session.cookie; if (method !== 'GET') headers['X-CSRF-Token'] = session.csrf; }
        if (body && !(body instanceof FormData)) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
        const response = await fetch(`${base}${route}`, { method, headers, body });
        assert.equal(response.status, expected, `${method} ${route}: ${response.status}`);
        return response;
    }
    const response = await call('/api/auth/login', null, 'POST', { email: credentials.ADMIN_EMAIL, senha: credentials.ADMIN_PASSWORD });
    const login = await response.json();
    const admin = { cookie: response.headers.get('set-cookie').split(';')[0], csrf: login.csrf_token };
    const root = obterDiretorioMateriais();
    // Report/state live in stdout and DB fixtures; no secret or metadata sidecar in managed storage.
    if (mode === 'prepare') {
        const baseline = await reconcile(db);
        console.log(JSON.stringify({ phase: 'FIRST_DRY_RUN', report: baseline }));
        const [[professor]] = await db.query("SELECT id_usuario FROM Usuarios WHERE tipo = 'PROFESSOR' ORDER BY id_usuario LIMIT 1");
        const curso = await (await call('/api/cursos', admin, 'POST', { nome_curso: 'Goal 07 storage fixture', descricao: 'Smoke descartável Goal 07', carga_horaria: 20 }, 201)).json();
        const turma = await (await call('/api/turmas', admin, 'POST', { id_curso: curso.id_curso, id_professor: professor.id_usuario, nome_turma: `Goal 07 storage fixture ${crypto.randomUUID()}`, data_inicio: '2026-09-01', status: 'ABERTA' }, 201)).json();
        async function upload(route, method, text, status) {
            const data = new FormData();
            data.append('titulo', 'Goal 07 fixture PDF'); data.append('ordem', '1');
            data.append('arquivo', new Blob([await samplePdf(text)], { type: 'application/pdf' }), 'goal07-fixture.pdf');
            return (await (await call(route, admin, method, data, status)).json()).conteudo;
        }
        const content = await upload(`/api/turmas/${turma.id_turma}/conteudos/pdf`, 'POST', 'Goal07-original', 201);
        const first = Buffer.from(await (await call(`/api/conteudos/${content.id_conteudo}/material`, admin)).arrayBuffer());
        assert.equal(first.subarray(0, 5).toString(), '%PDF-');
        await upload(`/api/conteudos/${content.id_conteudo}/pdf`, 'PUT', 'Goal07-replacement', 200);
        const [rows] = await db.query("SELECT * FROM ArquivosMateriais WHERE storage_name IN (SELECT storage_name FROM ArquivosMateriais WHERE original_name = 'goal07-fixture.pdf') ORDER BY id_arquivo_material");
        const own = rows.slice(-2);
        assert.deepEqual(own.map(r => r.status), ['RETIDO', 'ATIVO']);
        for (const row of own) assert.equal((await storage.hashFile(root, row.storage_name)).sha256, row.sha256);
        const second = Buffer.from(await (await call(`/api/conteudos/${content.id_conteudo}/material`, admin)).arrayBuffer());
        assert.equal(crypto.createHash('sha256').update(second).digest('hex'), own[1].sha256);
        const orphan = await storage.stage(root, Buffer.from('%PDF-Goal07-controlled-orphan'), 'materials');
        await storage.publish(root, orphan, 'materials');
        const dry = await reconcile(db);
        assert(dry.entries.some(e => e.name === orphan.storage_name && e.classification === 'ORPHAN'));
        const missingBytes = Buffer.from('%PDF-Goal07-controlled-missing');
        const missing = await storage.stage(root, missingBytes, 'materials');
        await storage.publish(root, missing, 'materials');
        const [missingRow] = await db.query(
            `INSERT INTO ArquivosMateriais (storage_name, original_name, mime_type, size_bytes, sha256, id_usuario_upload, status, retido_em)
             VALUES (?, 'goal07-missing-fixture.pdf', 'application/pdf', ?, ?, ?, 'RETIDO', NOW())`,
            [missing.storage_name, missing.size_bytes, missing.sha256, login.usuario.id_usuario]
        );
        await fs.promises.unlink(path.join(root, missing.storage_name));
        const missingDry = await reconcile(db);
        assert(missingDry.entries.some(e => e.name === missing.storage_name && e.classification === 'MISSING'));
        const [[missingPreserved]] = await db.query('SELECT sha256 FROM ArquivosMateriais WHERE id_arquivo_material = ?', [missingRow.insertId]);
        assert.equal(missingPreserved.sha256, missing.sha256);
        // Restore only our fixture from the bytes just generated; no production recovery logic.
        const restored = await storage.stage(root, missingBytes, 'materials', missing.storage_name);
        await storage.publish(root, restored, 'materials');
        console.log(JSON.stringify({ phase: 'MISSING_FIXTURE_VERIFIED', id: missingRow.insertId, name: missing.storage_name, metadataPreserved: true, fixtureRestored: true }));
        const [certs] = await db.query('SELECT id_certificado, storage_name, sha256, status FROM Certificados ORDER BY id_certificado');
        assert(certs.some(c => c.status === 'ATIVO')); assert(certs.some(c => c.status === 'REVOGADO'));
        for (const cert of certs) assert.equal((await storage.hashFile(obterDiretorioCertificados(), cert.storage_name)).sha256, cert.sha256);
        console.log(JSON.stringify({ phase: 'PREPARED', turmaId: turma.id_turma, cursoId: curso.id_curso, contentId: content.id_conteudo,
            materials: own.map(r => ({ id: r.id_arquivo_material, name: r.storage_name, sha256: r.sha256, status: r.status })), orphan: orphan.storage_name,
            certificates: certs.map(c => ({ id: c.id_certificado, name: c.storage_name, sha256: c.sha256, status: c.status })), dryRunCounts: dry.counts }));
    } else {
        const [turmas] = await db.query("SELECT id_turma, id_curso FROM Turmas WHERE nome_turma LIKE 'Goal 07 storage fixture %'");
        assert.equal(turmas.length, 1, 'Esperada exatamente uma turma fixture conhecida');
        const [conteudos] = await db.query('SELECT id_conteudo, id_arquivo_material FROM Conteudos WHERE id_turma = ?', [turmas[0].id_turma]);
        assert.equal(conteudos.length, 1);
        const bytes = Buffer.from(await (await call(`/api/conteudos/${conteudos[0].id_conteudo}/material`, admin)).arrayBuffer());
        const [[asset]] = await db.query('SELECT * FROM ArquivosMateriais WHERE id_arquivo_material = ?', [conteudos[0].id_arquivo_material]);
        assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), asset.sha256);
        const [rows] = await db.query("SELECT storage_name, sha256, status FROM ArquivosMateriais WHERE original_name = 'goal07-fixture.pdf'");
        assert.deepEqual(rows.map(r => r.status).sort(), ['ATIVO', 'RETIDO']);
        for (const row of rows) assert.equal((await storage.hashFile(root, row.storage_name)).sha256, row.sha256);
        const [certs] = await db.query('SELECT storage_name, sha256 FROM Certificados');
        for (const cert of certs) assert.equal((await storage.hashFile(obterDiretorioCertificados(), cert.storage_name)).sha256, cert.sha256);
        const dry = await reconcile(db);
        console.log(JSON.stringify({ phase: 'RESTART_VERIFIED', materials: rows.length, certificates: certs.length, counts: dry.counts }));
        if (mode === 'cleanup') {
            await call(`/api/conteudos/${conteudos[0].id_conteudo}`, admin, 'DELETE');
            await call(`/api/turmas/${turmas[0].id_turma}`, admin, 'DELETE', undefined, 204);
            await call(`/api/cursos/${turmas[0].id_curso}`, admin, 'DELETE', undefined, 204);
            const [remaining] = await db.query("SELECT status FROM ArquivosMateriais WHERE original_name = 'goal07-fixture.pdf'");
            assert(remaining.every(row => row.status === 'RETIDO'));
            console.log('FIXTURE_CLEANUP_OK: academic fixture removed; both PDF versions retained under normal policy.');
        }
    }
}
main().catch(error => { console.error(`STORAGE_SMOKE_FAILED: ${error.code || error.message}`); process.exitCode = 1; }).finally(() => db.end());
