'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const dotenv = require('dotenv');
const db = require('../src/config/database');
const storage = require('../src/api/services/certificate-storage.service');
const { obterDiretorioCertificados } = require('../src/config/certificate-storage');

async function main() {
    assert.equal(process.env.APP_ENV, 'staging');
    assert(/staging|demo/i.test(process.env.DB_NAME), 'Banco de staging obrigatório.');
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const credentials = dotenv.parse(Buffer.concat(chunks));
    const base = String(process.env.STAGING_BASE_URL || process.env.APP_BASE_URL).replace(/\/$/, '');
    assert(base.startsWith('https://'));
    const authorization = `Basic ${Buffer.from(`${credentials.BASIC_AUTH_USER}:${credentials.BASIC_AUTH_PASSWORD}`).toString('base64')}`;
    async function call(route, session, method = 'GET', body, expected = 200) {
        const headers = { Authorization: authorization };
        if (session) {
            headers.Cookie = session.cookie;
            if (method !== 'GET') headers['X-CSRF-Token'] = session.csrf;
        }
        if (body) headers['Content-Type'] = 'application/json';
        const response = await fetch(`${base}${route}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
        assert.equal(response.status, expected, `${method} ${route}: ${response.status}`);
        return response;
    }
    async function login(email, senha) {
        const response = await call('/api/auth/login', null, 'POST', { email, senha });
        const data = await response.json();
        return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: data.csrf_token, user: data.usuario };
    }
    let cursoId;
    let turmaId;
    let matriculaId;
    try {
        const professor = await login(credentials.PROFESSOR_EMAIL, credentials.DEMO_PASSWORD);
        const aluno = await login(credentials.ALUNO_EMAIL, credentials.DEMO_PASSWORD);
        const admin = await login(credentials.ADMIN_EMAIL, credentials.ADMIN_PASSWORD);
        const nonce = Date.now();
        const [curso] = await db.query("INSERT INTO Cursos (nome_curso, descricao, carga_horaria) VALUES (?, 'Smoke descartável Goal 02', 10)", [`Smoke conclusão ${nonce}`]);
        cursoId = curso.insertId;
        const [turma] = await db.query("INSERT INTO Turmas (id_curso, id_professor, nome_turma, data_inicio, status) VALUES (?, ?, ?, CURRENT_DATE, 'ABERTA')", [cursoId, professor.user.id_usuario, `Smoke Goal 02 ${nonce}`]);
        turmaId = turma.insertId;
        const matricula = await (await call('/api/matriculas', aluno, 'POST', { id_turma: turmaId }, 201)).json();
        matriculaId = matricula.matricula.id_matricula;
        async function adicionar(ordem) {
            await call(`/api/turmas/${turmaId}/conteudos`, professor, 'POST', {
                titulo: `Conteúdo ${ordem}`, tipo: 'TEXTO', corpo: 'Conteúdo de smoke', ordem
            }, 201);
            const [[row]] = await db.query('SELECT id_conteudo FROM Conteudos WHERE id_turma = ? AND ordem = ?', [turmaId, ordem]);
            return row.id_conteudo;
        }
        async function concluir(id) {
            await call(`/api/conteudos/${id}/progresso`, aluno, 'PUT', { status: 'CONCLUIDO' });
        }
        const materiais = [];
        for (let ordem = 1; ordem <= 8; ordem++) materiais.push(await adicionar(ordem));
        async function avaliacao(tipo, provaFinal = false) {
            const result = await (await call(`/api/turmas/${turmaId}/questionarios`, professor, 'POST', {
                titulo: `${tipo} ${crypto.randomUUID()}`, tipo, prova_final: provaFinal, descricao: 'Smoke acadêmico'
            }, 201)).json();
            const id = result.questionario.id_questionario;
            const perguntas = [];
            for (const [ordem, pontos] of [749.9, 0.1, 250].entries()) {
                const pergunta = await (await call(`/api/questionarios/${id}/perguntas`, professor, 'POST', {
                    texto_pergunta: `Questão ${ordem}`, tipo_pergunta: 'MULTIPLA_ESCOLHA', ordem, pontos,
                    opcoes: [{ texto_opcao: 'Correta', ordem: 1, correta: true }, { texto_opcao: 'Incorreta', ordem: 2, correta: false }]
                }, 201)).json();
                const [opcoes] = await db.query('SELECT id_opcao, correta FROM Q_Opcoes WHERE id_pergunta = ?', [pergunta.id_pergunta]);
                perguntas.push({ id: pergunta.id_pergunta, certa: opcoes.find(o => o.correta).id_opcao, errada: opcoes.find(o => !o.correta).id_opcao });
            }
            return { id, perguntas };
        }
        async function submeter(q, acertos, session = aluno, expected = 200) {
            return (await call(`/api/questionarios/${q.id}/submissoes`, session, 'POST', {
                submission_id: crypto.randomUUID(),
                respostas: q.perguntas.map((p, i) => ({ id_pergunta: p.id, id_opcao: i < acertos ? p.certa : p.errada }))
            }, expected)).json();
        }
        async function situacao() {
            const [[row]] = await db.query('SELECT status_aprovacao, nota_final FROM Matriculas WHERE id_matricula = ?', [matriculaId]);
            return row;
        }
        const exercicioA = await avaliacao('EXERCICIO');
        const exercicioB = await avaliacao('EXERCICIO');
        const prova = await avaliacao('PROVA', true);
        const outroAluno = await login(credentials.UNENROLLED_EMAIL, credentials.DEMO_PASSWORD);
        await call('/api/matriculas', outroAluno, 'POST', { id_turma: turmaId }, 201);
        await submeter(exercicioA, 3, outroAluno);
        await submeter(prova, 3, outroAluno, 409);
        for (const id of materiais.slice(0, 5)) await concluir(id);
        await submeter(exercicioA, 0); await submeter(exercicioA, 1); await submeter(exercicioB, 0);
        const meta = await (await call(`/api/turmas/${turmaId}/questionarios`, aluno)).json();
        assert.equal(meta.questionarios[0].requisitos.trilha_realizada, 7);
        assert.equal(meta.questionarios[0].requisitos.total_trilha, 10);
        await call(`/api/turmas/${turmaId}/questionarios/disponivel?tipo=PROVA&id_questionario=${prova.id}`, aluno, 'GET', undefined, 409);
        await submeter(prova, 3, aluno, 409);
        console.log('CASO A OK: 7/10 bloqueia leitura/submissão; exercícios repetidos e outro aluno não interferem.');
        await concluir(materiais[5]);
        await call(`/api/turmas/${turmaId}/questionarios/disponivel?tipo=PROVA&id_questionario=${prova.id}`, aluno);
        console.log('CASO B OK: 8/10 libera prova final.');
        assert.equal((await submeter(prova, 1)).resultado.percentual, 74.99);
        assert.equal((await situacao()).status_aprovacao, 'CURSANDO');
        console.log('CASO C OK: 74.99 mantém CURSANDO, sem reprovação, com retry.');
        assert.equal((await submeter(prova, 2)).resultado.percentual, 75);
        assert.equal((await situacao()).status_aprovacao, 'CURSANDO');
        console.log('CASO D OK: 75 satisfaz prova; conteúdos pendentes impedem aprovação.');
        for (const id of materiais.slice(6)) await concluir(id);
        assert.equal((await situacao()).status_aprovacao, 'APROVADO');
        assert.equal((await situacao()).nota_final, null);
        console.log('CASO E OK: último conteúdo aprova automaticamente, sem nota/clique do professor.');
        const novo = await adicionar(9);
        const storageDir = obterDiretorioCertificados();
        const filesBefore = fs.readdirSync(storageDir).sort();
        const bloqueado = await (await call(`/api/certificados/matriculas/${matriculaId}/emitir`, professor, 'POST', undefined, 409)).json();
        assert.equal(bloqueado.code, 'CONTEUDOS_PENDENTES');
        const [[count]] = await db.query('SELECT COUNT(*) AS total FROM Certificados WHERE id_turma = ?', [turmaId]);
        assert.equal(count.total, 0);
        assert.deepEqual(fs.readdirSync(storageDir).sort(), filesBefore);
        await concluir(novo);
        await call(`/api/turmas/${turmaId}`, admin, 'PATCH', { status: 'ENCERRADA' });
        const emitido = await (await call(`/api/certificados/matriculas/${matriculaId}/emitir`, professor, 'POST', undefined, 201)).json();
        const download = await call(`/api/certificados/${emitido.certificado.id_certificado}/pdf?download=1`, aluno);
        const bytes = Buffer.from(await download.arrayBuffer());
        assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
        const [[registro]] = await db.query('SELECT sha256 FROM Certificados WHERE id_certificado = ?', [emitido.certificado.id_certificado]);
        assert.equal(storage.calcularSha256(bytes), registro.sha256);
        const publico = await (await call(`/api/public/certificados/${emitido.certificado.codigo_publico}`)).json();
        assert.equal(publico.resultado, 'VALIDO');
        console.log('CASO F OK: certificado revalida estrutura, emite em ENCERRADA; download/hash/validação pública preservados.');
    } finally {
        if (turmaId) {
            const [certificados] = await db.query('SELECT storage_name FROM Certificados WHERE id_turma = ?', [turmaId]);
            for (const certificado of certificados) await storage.removerArquivo(certificado.storage_name);
            await db.query('DELETE FROM Certificados WHERE id_turma = ?', [turmaId]);
            await db.query('DELETE p FROM ConteudosProgresso p INNER JOIN Conteudos c ON c.id_conteudo = p.id_conteudo WHERE c.id_turma = ?', [turmaId]);
            await db.query('DELETE FROM Turmas WHERE id_turma = ?', [turmaId]);
        }
        if (cursoId) await db.query('DELETE FROM Cursos WHERE id_curso = ?', [cursoId]);
        console.log('CLEANUP OK: cenário descartável removido; dados demo preservados.');
    }
}

main().catch(error => {
    console.error(`ACADEMIC_COMPLETION_SMOKE_FAILED: ${error.message}`);
    process.exitCode = 1;
}).finally(() => db.end());
