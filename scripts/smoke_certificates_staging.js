'use strict';

require('./lib/disposable-smoke').assertDisposableSmoke();

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { PDFDocument } = require('pdf-lib');
const db = require('../src/config/database');

async function main() {
    let credentials = process.env;
    if (process.env.SMOKE_CREDENTIALS_STDIN === '1') {
        const chunks = [];
        for await (const chunk of process.stdin) chunks.push(chunk);
        credentials = dotenv.parse(Buffer.concat(chunks));
    }
    const base = String(process.env.STAGING_BASE_URL || '').replace(/\/$/, '');
    const mode = process.env.CERTIFICATE_SMOKE_MODE || 'issue';
    assert(['issue', 'verify', 'revoke'].includes(mode), 'Modo de smoke inválido.');
    const authorization = `Basic ${Buffer.from(
        `${credentials.BASIC_AUTH_USER}:${credentials.BASIC_AUTH_PASSWORD}`
    ).toString('base64')}`;

    async function call(route, { session, method = 'GET', body } = {}, expected = 200) {
        const headers = { Authorization: authorization };
        if (session) {
            headers.Cookie = session.cookie;
            if (method !== 'GET') headers['X-CSRF-Token'] = session.csrf;
        }
        if (body && !(body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
            body = JSON.stringify(body);
        }
        const response = await fetch(`${base}${route}`, { method, headers, body });
        assert([].concat(expected).includes(response.status),
            `${method} ${route}: esperado ${expected}, recebido ${response.status}`);
        return response;
    }

    async function login(email, password, role) {
        const response = await call('/api/auth/login', {
            method: 'POST', body: { email, senha: password }
        });
        const data = await response.json();
        assert.equal(data.usuario?.tipo, role);
        const cookie = response.headers.get('set-cookie')?.split(';')[0];
        assert(cookie && data.csrf_token, 'Sessão incompleta.');
        return { cookie, csrf: data.csrf_token, user: data.usuario };
    }

    async function upload(bytes) {
        const body = new FormData();
        body.append('arquivo', new Blob([bytes], { type: 'application/pdf' }), 'certificado.pdf');
        return (await call('/api/public/certificados/validar-arquivo', { method: 'POST', body })).json();
    }

    const page = await call('/certificados/validar');
    assert((await page.text()).includes('form-validar-arquivo'), 'Validador público ausente.');
    const studentEmail = process.env.CERTIFICATE_SMOKE_STUDENT_EMAIL || credentials.ALUNO_EMAIL;
    const student = await login(studentEmail, credentials.DEMO_PASSWORD, 'ALUNO');
    let certificate;

    if (mode === 'issue') {
        const professor = await login(credentials.PROFESSOR_EMAIL, credentials.DEMO_PASSWORD, 'PROFESSOR');
        let room = await (await call('/api/matriculas/minha-sala', { session: student })).json();
        let turma = room.turmas.find((item) => item.nome_turma === 'Turma Demo Staging');
        if (!turma && studentEmail === credentials.UNENROLLED_EMAIL) {
            const professorClasses = await (await call(
                `/api/turmas/professor/${professor.user.id_usuario}`,
                { session: professor }
            )).json();
            const target = (professorClasses.turmas || professorClasses)
                .find((item) => item.nome_turma === 'Turma Demo Staging');
            assert(target?.id_turma, 'Turma de demonstração não encontrada para matrícula.');
            await call('/api/matriculas', {
                session: student,
                method: 'POST',
                body: { id_turma: target.id_turma }
            }, [200, 201]);
            room = await (await call('/api/matriculas/minha-sala', { session: student })).json();
            turma = room.turmas.find((item) => item.nome_turma === 'Turma Demo Staging');
        }
        assert(turma, 'Turma de demonstração não encontrada.');
        let roster = await (await call(`/api/matriculas/turma/${turma.id_turma}`, { session: professor })).json();
        let enrollment = roster.matriculas.find((item) => Number(item.id_aluno) === Number(student.user.id_usuario));
        if (enrollment?.status_aprovacao !== 'APROVADO' && studentEmail === credentials.UNENROLLED_EMAIL) {
            const structure = await (await call(`/api/turmas/${turma.id_turma}/conteudos`, { session: student })).json();
            for (const content of structure.conteudos.slice(0, Math.ceil(structure.conteudos.length * 0.8))) {
                await call(`/api/conteudos/${content.id_conteudo}/progresso`, { session: student, method: 'PUT', body: { status: 'CONCLUIDO' } });
            }
            const exam = (await (await call(`/api/turmas/${turma.id_turma}/questionarios/disponivel?tipo=PROVA`, { session: student })).json()).questionario;
            const respostas = [];
            for (const question of exam.perguntas) {
                const [[option]] = await db.query('SELECT id_opcao FROM Q_Opcoes WHERE id_pergunta=? AND correta=1 ORDER BY ordem LIMIT 1', [question.id_pergunta]);
                assert(option, 'Fixture de prova sem opção correta.');
                respostas.push({ id_pergunta: question.id_pergunta, id_opcao: option.id_opcao });
            }
            await call(`/api/questionarios/${exam.id_questionario}/submissoes`, { session: student, method: 'POST', body: { submission_id: crypto.randomUUID(), respostas } });
            roster = await (await call(`/api/matriculas/turma/${turma.id_turma}`, { session: professor })).json();
            enrollment = roster.matriculas.find((item) => Number(item.id_aluno) === Number(student.user.id_usuario));
        }
        assert.equal(enrollment?.status_aprovacao, 'APROVADO', 'Aluno demo precisa estar aprovado.');
        const route = `/api/certificados/matriculas/${enrollment.id_matricula}/emitir`;
        await call(route, { method: 'POST' }, 401);
        await call(route, { method: 'POST', session: student }, 403);
        const emitted = await (await call(route, { method: 'POST', session: professor }, [200, 201])).json();
        certificate = emitted.certificado;
        assert.equal(certificate.status, 'ATIVO', 'A demo já está revogada; use outra matrícula explicitamente.');
        const repeated = await (await call(route, { method: 'POST', session: professor })).json();
        assert.equal(repeated.certificado.id_certificado, certificate.id_certificado);
        assert.equal(repeated.reutilizado, true);
    } else {
        assert(process.env.CERTIFICATE_SMOKE_CODE, 'Informe CERTIFICATE_SMOKE_CODE.');
        const own = await (await call('/api/certificados/meus', { session: student })).json();
        certificate = own.certificados.find((item) => item.codigo_publico === process.env.CERTIFICATE_SMOKE_CODE);
        assert(certificate, 'Certificado persistente não encontrado na conta do aluno.');
    }

    const download = await call(`/api/certificados/${certificate.id_certificado}/pdf?download=1`, { session: student });
    assert(download.headers.get('content-type').includes('application/pdf'));
    assert(download.headers.get('content-disposition').startsWith('attachment;'));
    assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
    const bytes = Buffer.from(await download.arrayBuffer());
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), 2, 'O certificado institucional deve possuir duas páginas.');
    if (process.env.CERTIFICATE_SMOKE_OUTPUT_PDF) {
        const outputPath = path.resolve(process.env.CERTIFICATE_SMOKE_OUTPUT_PDF);
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, bytes, { mode: 0o600 });
    }
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    if (process.env.CERTIFICATE_SMOKE_SHA256) assert.equal(sha256, process.env.CERTIFICATE_SMOKE_SHA256);

    const outsiderEmail = studentEmail === credentials.UNENROLLED_EMAIL
        ? credentials.ALUNO_EMAIL
        : credentials.UNENROLLED_EMAIL;
    const outsider = await login(outsiderEmail, credentials.DEMO_PASSWORD, 'ALUNO');
    await call(`/api/certificados/${certificate.id_certificado}/pdf`, { session: outsider }, 403);
    await call(`/api/certificados/${certificate.id_certificado}/pdf`, {}, 401);
    await call(`/certificados/validar/${certificate.codigo_publico}`);
    const publicResult = await (await call(`/api/public/certificados/${certificate.codigo_publico}`)).json();
    assert.deepEqual(Object.keys(publicResult.certificado).sort(),
        ['codigo', 'versao', 'aluno', 'curso', 'turma', 'carga_horaria', 'emitido_em'].sort());
    assert.equal(publicResult.resultado, certificate.status === 'REVOGADO' ? 'REVOGADO' : 'VALIDO');
    assert.equal((await upload(bytes)).resultado, certificate.status === 'REVOGADO' ? 'REVOGADO' : 'AUTENTICO');
    assert.equal((await upload(Buffer.concat([bytes, Buffer.from('\n% alteração de teste')]))).resultado, 'NAO_VALIDADO');

    if (mode === 'revoke') {
        const admin = await login(credentials.ADMIN_EMAIL, credentials.ADMIN_PASSWORD, 'ADMIN');
        const revoked = await (await call(`/api/certificados/${certificate.id_certificado}/revogar`, {
            session: admin, method: 'POST', body: { motivo: 'Revogação controlada no smoke de certificados do staging.' }
        })).json();
        assert.equal(revoked.certificado.status, 'REVOGADO');
        assert.equal((await (await call(`/api/public/certificados/${certificate.codigo_publico}`)).json()).resultado, 'REVOGADO');
        assert.equal((await upload(bytes)).resultado, 'REVOGADO');
    }

    console.log(JSON.stringify({
        status: 'CERTIFICATE_SMOKE_OK', mode, id: certificate.id_certificado,
        code: certificate.codigo_publico, sha256, bytes: bytes.length,
        verified_at: new Date().toISOString()
    }));
}

main().catch((error) => {
    console.error(`CERTIFICATE_SMOKE_FAILED: ${error.message}`);
    process.exitCode = 1;
}).finally(() => db.end());
