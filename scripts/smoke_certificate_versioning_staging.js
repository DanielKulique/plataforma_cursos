'use strict';

require('./lib/disposable-smoke').assertDisposableSmoke();

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const dotenv = require('dotenv');
const db = require('../src/config/database');
const storage = require('../src/api/services/certificate-storage.service');
const { assertCertificateLegacyIntegrity } = require('./certificate_migration_preflight');

async function main() {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const credentials = dotenv.parse(Buffer.concat(chunks));
    const base = String(process.env.STAGING_BASE_URL || process.env.APP_BASE_URL).replace(/\/$/, '');
    const authorization = `Basic ${Buffer.from(`${credentials.BASIC_AUTH_USER}:${credentials.BASIC_AUTH_PASSWORD}`).toString('base64')}`;
    async function call(route, session, method = 'GET', body, expected = 200) {
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
        assert([].concat(expected).includes(response.status), `${method} ${route}: recebido ${response.status}, esperado ${expected}`);
        return response;
    }
    async function login(email, senha, tipo) {
        const response = await call('/api/auth/login', null, 'POST', { email, senha });
        const data = await response.json();
        assert.equal(data.usuario.tipo, tipo);
        return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: data.csrf_token, user: data.usuario };
    }
    async function upload(bytes) {
        const body = new FormData();
        body.append('arquivo', new Blob([bytes], { type: 'application/pdf' }), 'certificado.pdf');
        return (await call('/api/public/certificados/validar-arquivo', null, 'POST', body)).json();
    }
    const professor = await login(credentials.PROFESSOR_EMAIL, credentials.DEMO_PASSWORD, 'PROFESSOR');
    const aluno = await login(credentials.ALUNO_EMAIL, credentials.DEMO_PASSWORD, 'ALUNO');
    const admin = await login(credentials.ADMIN_EMAIL, credentials.ADMIN_PASSWORD, 'ADMIN');
    await assertCertificateLegacyIntegrity(db);
    const [baseline] = await db.query('SELECT * FROM Certificados ORDER BY id_certificado');
    let turmaId;
    if (process.env.CERTIFICATE_VERSION_SMOKE_MODE === 'verify') {
        const [[turma]] = await db.query("SELECT id_turma FROM Turmas WHERE nome_turma LIKE 'Smoke Goal 03 %' ORDER BY id_turma DESC LIMIT 1");
        assert(turma, 'Cenário persistente ausente');
        turmaId = turma.id_turma;
    } else {
        const nonce = Date.now();
        const [curso] = await db.query("INSERT INTO Cursos (nome_curso, descricao, carga_horaria) VALUES (?, 'Cenário persistente de versionamento', 10)", [`Certificação Goal 03 ${nonce}`]);
        const [turma] = await db.query("INSERT INTO Turmas (id_curso, id_professor, nome_turma, data_inicio, status) VALUES (?, ?, ?, CURRENT_DATE, 'ABERTA')", [curso.insertId, professor.user.id_usuario, `Smoke Goal 03 ${nonce}`]);
        turmaId = turma.insertId;
        const matricula = (await (await call('/api/matriculas', aluno, 'POST', { id_turma: turmaId }, 201)).json()).matricula;
        await call(`/api/turmas/${turmaId}/conteudos`, professor, 'POST', { titulo: 'Conteúdo de certificação', tipo: 'TEXTO', corpo: 'Cenário Goal 03', ordem: 1 }, 201);
        const [[conteudo]] = await db.query('SELECT id_conteudo FROM Conteudos WHERE id_turma = ?', [turmaId]);
        await call(`/api/conteudos/${conteudo.id_conteudo}/progresso`, aluno, 'PUT', { status: 'CONCLUIDO' });
        const prova = (await (await call(`/api/turmas/${turmaId}/questionarios`, professor, 'POST', {
            titulo: 'Prova final de certificação', tipo: 'PROVA', prova_final: true, descricao: 'Smoke Goal 03'
        }, 201)).json()).questionario;
        const pergunta = await (await call(`/api/questionarios/${prova.id_questionario}/perguntas`, professor, 'POST', {
            texto_pergunta: 'Confirma a conclusão?', tipo_pergunta: 'MULTIPLA_ESCOLHA', ordem: 1, pontos: 1,
            opcoes: [{ texto_opcao: 'Sim', ordem: 1, correta: true }, { texto_opcao: 'Não', ordem: 2, correta: false }]
        }, 201)).json();
        const [[opcao]] = await db.query('SELECT id_opcao FROM Q_Opcoes WHERE id_pergunta = ? AND correta = 1', [pergunta.id_pergunta]);
        await call(`/api/questionarios/${prova.id_questionario}/submissoes`, aluno, 'POST', {
            submission_id: crypto.randomUUID(), respostas: [{ id_pergunta: pergunta.id_pergunta, id_opcao: opcao.id_opcao }]
        });
        const v1 = (await (await call(`/api/certificados/matriculas/${matricula.id_matricula}/emitir`, professor, 'POST', undefined, 200)).json()).certificado;
        assert.equal(v1.versao, 1); assert.equal(v1.status, 'ATIVO');
        assert.equal((await (await call(`/api/public/certificados/${v1.codigo_publico}`)).json()).resultado, 'VALIDO');
        console.log('A/B OK: emissão inicial v1 e código autêntico.');
        const route = `/api/certificados/${v1.id_certificado}/reemitir`;
        await call(route, professor, 'POST', { motivo: 'Tentativa docente' }, 403);
        await call(route, aluno, 'POST', { motivo: 'Tentativa discente' }, 403);
        const [a, b] = await Promise.all([
            call(route, admin, 'POST', { motivo: 'Atualização administrativa autorizada do documento' }, [201, 409]),
            call(route, admin, 'POST', { motivo: 'Atualização administrativa autorizada do documento' }, [201, 409])
        ]);
        assert.deepEqual([a.status, b.status].sort(), [201, 409]);
        await call(route, admin, 'POST', { motivo: 'Retry da versão anterior' }, 409);
        console.log('C/I OK: ADMIN reemite; concorrente e retry recebem 409.');
    }
    const [rows] = await db.query('SELECT * FROM Certificados WHERE id_turma = ? ORDER BY versao', [turmaId]);
    assert.deepEqual(rows.map(r => [r.versao, r.status]), [[1, 'REVOGADO'], [2, 'ATIVO']]);
    assert.equal(rows[1].id_certificado_anterior, rows[0].id_certificado);
    for (const field of ['codigo_publico', 'storage_name', 'sha256']) assert.notEqual(rows[0][field], rows[1][field]);
    for (const [i, row] of rows.entries()) {
        const response = await call(`/api/certificados/${row.id_certificado}/pdf?download=1`, aluno);
        const bytes = Buffer.from(await response.arrayBuffer());
        assert.equal(storage.calcularSha256(bytes), row.sha256);
        assert.deepEqual(bytes, fs.readFileSync(storage.resolverCaminhoCertificado(row.storage_name)));
        const publico = await (await call(`/api/public/certificados/${row.codigo_publico}`)).json();
        assert.equal(publico.resultado, i === 0 ? 'REVOGADO' : 'VALIDO');
        assert(!/cpf|email|snapshot|storage|sha256/i.test(JSON.stringify(publico)));
        assert.equal((await upload(bytes)).resultado, i === 0 ? 'REVOGADO' : 'AUTENTICO');
        assert.equal((await upload(Buffer.concat([bytes, Buffer.from('\n% alterado')]))).resultado, 'NAO_VALIDADO');
    }
    const historico = await (await call(`/api/certificados/${rows[1].id_certificado}/historico`, admin)).json();
    assert.deepEqual(historico.certificados.map(c => c.versao), [2, 1]);
    const [conflicts] = await db.query("SELECT id_aluno, id_turma FROM Certificados WHERE status = 'ATIVO' GROUP BY id_aluno, id_turma HAVING COUNT(*) > 1");
    assert.equal(conflicts.length, 0);
    const [after] = await db.query('SELECT * FROM Certificados ORDER BY id_certificado');
    assert.deepEqual(after.filter(row => baseline.some(old => old.id_certificado === row.id_certificado)), baseline);
    await assertCertificateLegacyIntegrity(db);
    console.log('D/E/F/G/H OK: código e upload por versão, adulteração recusada, downloads históricos do aluno.');
    console.log(JSON.stringify({ status: 'CERTIFICATE_VERSIONING_SMOKE_OK', mode: process.env.CERTIFICATE_VERSION_SMOKE_MODE || 'issue', turmaId,
        versions: rows.map(r => ({ id: r.id_certificado, versao: r.versao, status: r.status, codigo: r.codigo_publico, sha256: r.sha256 })), baselinePreserved: baseline.length }));
}

main().catch(error => {
    console.error(`CERTIFICATE_VERSIONING_SMOKE_FAILED: ${error.code || error.message}`);
    process.exitCode = 1;
}).finally(() => db.end());
