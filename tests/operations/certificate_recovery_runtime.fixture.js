'use strict';

// Mounted read-only into /app. Application code/dependencies come from the image.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PDFDocument } = require('pdf-lib');
const mysql = require('mysql2');

assert.deepEqual(process.argv.slice(2), ['--allow-lab-apply'], 'Explicit lab APPLY authorization required.');
assert.equal(process.env.NODE_ENV, 'test');
assert.equal(process.env.DB_HOST, 'db');
assert.equal(process.env.DB_NAME, 'plataforma_cursos_test');
assert.equal(process.env.DB_ENVIRONMENT_IDENTITY, 'plataforma_cursos_test');
assert.notEqual(process.getuid(), 0, 'Use the image default unprivileged user.');
const db = require('./src/config/database');
const certificates = require('./src/api/services/certificate.service');
const storageRoot = process.env.CERTIFICATE_STORAGE_DIR;

async function snapshot() {
    const [tables] = await db.query('SHOW FULL TABLES WHERE Table_type = \'BASE TABLE\'');
    const data = {};
    for (const table of tables.map(row => Object.values(row)[0]).sort()) {
        const [rows] = await db.query(`SELECT * FROM ${mysql.escapeId(table)}`);
        data[table] = rows.map(row => JSON.stringify(row)).sort();
    }
    const files = {};
    for (const name of fs.readdirSync(storageRoot, { recursive: true }).sort()) {
        const file = path.join(storageRoot, name);
        if (fs.statSync(file).isFile()) files[name] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    }
    return { data, files };
}

function reconcile(...args) {
    const run = spawnSync('npm', ['run', 'academic:reconcile-certificates', '--', ...args], {
        cwd: '/app', encoding: 'utf8', timeout: 30_000, env: process.env
    });
    assert.equal(run.status, 0, `${run.error || ''}\n${run.stdout}\n${run.stderr}`);
    const report = run.stdout.split('\n').find(line => line.startsWith('{"mode":'));
    assert.ok(report, 'The packaged npm command must produce its JSON report.');
    return JSON.parse(report);
}

async function seed() {
    const [[empty]] = await db.query('SELECT (SELECT COUNT(*) FROM Usuarios) + (SELECT COUNT(*) FROM Certificados) AS n');
    assert.equal(Number(empty.n), 0, 'Refuse to seed a nonempty lab.');
    const users = [];
    for (const [i, role] of ['PROFESSOR', 'ALUNO', 'ALUNO', 'ALUNO', 'ALUNO', 'ALUNO'].entries()) {
        const [user] = await db.query('INSERT INTO Usuarios (nome_completo,email,senha,tipo) VALUES (?,?,?,?)',
            [`Synthetic lab ${i}`, `lab${i}@example.test`, 'not-a-usable-login-hash', role]);
        users.push(user.insertId);
    }
    const [course] = await db.query("INSERT INTO Cursos (nome_curso,carga_horaria) VALUES ('Synthetic recovery lab',4)");
    const [group] = await db.query("INSERT INTO Turmas (id_curso,id_professor,nome_turma,data_inicio) VALUES (?,?,'Synthetic recovery lab',CURRENT_DATE)", [course.insertId, users[0]]);
    const [exam] = await db.query("INSERT INTO Questionarios (id_curso,id_turma,titulo,descricao,tipo,prova_final) VALUES (?,?,'Final lab','Synthetic','PROVA',1)", [course.insertId, group.insertId]);
    // Existing rules allow recovery from a finalized passing exam without rewriting progress.
    await db.query("INSERT INTO Conteudos (id_turma,titulo,tipo,ordem) VALUES (?,'Untouched content','TEXTO',1)", [group.insertId]);
    for (const [i, student] of users.slice(1).entries()) {
        await db.query('INSERT INTO Matriculas (id_aluno,id_turma,status_aprovacao) VALUES (?,?,?)',
            [student, group.insertId, i === 0 || i === 4 ? 'CURSANDO' : 'APROVADO']);
        await db.query('INSERT INTO Q_Tentativas (id_questionario,id_usuario,id_turma,total_perguntas,percentual,chave_idempotencia,finalizada_em) VALUES (?,?,?,1,?,?,NOW())',
            [exam.insertId, student, group.insertId, [75, 100, 100, 100, 74.99][i], crypto.randomUUID()]);
    }
    // Real PDFs for an active and a revoked certificate, both present before reconciliation.
    for (const student of users.slice(3, 5)) {
        const result = await certificates.emitirCertificadoAutomaticamente(student, group.insertId);
        assert.ok(result.certificado);
        assert.equal(result.reutilizado, false);
    }
    await db.query("UPDATE Certificados SET status='REVOGADO',revogado_em=NOW(),id_usuario_revogador=?,motivo_revogacao='Synthetic lab revocation' WHERE id_aluno=?", [users[0], users[4]]);
    await db.query("UPDATE Matriculas SET status_aprovacao='CURSANDO' WHERE id_aluno IN (?,?)", [users[3], users[4]]);
    return { users, classId: group.insertId };
}

async function main() {
    const fixture = await seed();
    const before = await snapshot();
    const dryRun = reconcile('--dry-run');
    assert.deepEqual(dryRun, { mode: 'DRY_RUN', analisadas: 4, aprovacoes_pendentes: 3,
        certificados_previstos: 2, aprovacoes_corrigidas: 0, certificados_novos: 0, emissao_pendente: 0 });
    assert.deepEqual(await snapshot(), before, 'Explicit dry-run must preserve every table and stored file.');
    assert.deepEqual(reconcile(), dryRun, 'Default invocation must remain dry-run.');
    assert.deepEqual(await snapshot(), before, 'Default dry-run must preserve every table and stored file.');

    const apply = reconcile('--apply');
    assert.deepEqual(apply, { ...dryRun, mode: 'APPLY', aprovacoes_corrigidas: 3, certificados_novos: 2 });
    const after = await snapshot();
    const [rows] = await db.query('SELECT * FROM Certificados ORDER BY id_certificado');
    assert.equal(rows.length, 4);
    const existingIds = new Set(before.data.Certificados.map(row => JSON.parse(row).id_certificado));
    assert.deepEqual(rows.filter(row => existingIds.has(row.id_certificado)).map(row => JSON.stringify(row)).sort(), before.data.Certificados);
    for (const [name, hash] of Object.entries(before.files)) assert.equal(after.files[name], hash, 'Existing PDF bytes must be preserved.');
    for (const row of rows) {
        const buffer = fs.readFileSync(path.join(storageRoot, row.storage_name));
        assert.equal(crypto.createHash('sha256').update(buffer).digest('hex'), row.sha256);
        assert.equal(buffer.length, Number(row.tamanho_bytes));
        assert.equal((await PDFDocument.load(buffer)).getPageCount(), 2);
    }
    const [enrollments] = await db.query('SELECT id_aluno,status_aprovacao,progresso_percentual FROM Matriculas ORDER BY id_aluno');
    assert.deepEqual(enrollments.map(row => row.status_aprovacao), ['APROVADO', 'APROVADO', 'APROVADO', 'APROVADO', 'CURSANDO']);
    assert.ok(enrollments.every(row => row.progresso_percentual === 0));
    assert.ok(!rows.some(row => row.id_aluno === fixture.users[5]), '74.99 must not issue a certificate.');
    // Only approval status may change in existing enrollments; academic history stays intact.
    assert.deepEqual(after.data.Matriculas.map(row => ({ ...JSON.parse(row), status_aprovacao: null })),
        before.data.Matriculas.map(row => ({ ...JSON.parse(row), status_aprovacao: null })));
    for (const table of Object.keys(before.data).filter(name => !['Matriculas', 'Certificados'].includes(name))) {
        assert.deepEqual(after.data[table], before.data[table], `${table} must remain unchanged.`);
    }
    const secondApply = reconcile('--apply');
    assert.deepEqual(secondApply, { mode: 'APPLY', analisadas: 0, aprovacoes_pendentes: 0,
        certificados_previstos: 0, aprovacoes_corrigidas: 0, certificados_novos: 0, emissao_pendente: 0 });
    assert.deepEqual(await snapshot(), after, 'Second APPLY must preserve every table and stored file.');
    console.log(JSON.stringify({ result: 'PASS', dry_run: dryRun, apply, second_apply: secondApply,
        existing_certificates_preserved: 2, valid_pdfs: 4, all_tables_compared: Object.keys(before.data).length,
        default_dry_run_unchanged: true, explicit_dry_run_unchanged: true, idempotent: true }));
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.end());
