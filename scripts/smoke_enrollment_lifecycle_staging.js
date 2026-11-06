'use strict';

require('./lib/disposable-smoke').assertDisposableSmoke();

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const dotenv = require('dotenv');
const db = require('../src/config/database');
const { buscarRequisitos } = require('../src/api/services/academic-progress.service');

async function main() {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const credentials = dotenv.parse(Buffer.concat(chunks));
    const base = String(process.env.STAGING_BASE_URL || process.env.APP_BASE_URL).replace(/\/$/, '');
    const basic = `Basic ${Buffer.from(`${credentials.BASIC_AUTH_USER}:${credentials.BASIC_AUTH_PASSWORD}`).toString('base64')}`;

    async function call(route, session, method = 'GET', body, expected = 200) {
        const headers = { Authorization: basic };
        if (session) {
            headers.Cookie = session.cookie;
            if (method !== 'GET') headers['X-CSRF-Token'] = session.csrf;
        }
        if (body) headers['Content-Type'] = 'application/json';
        const response = await fetch(`${base}${route}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined
        });
        assert([].concat(expected).includes(response.status),
            `${method} ${route}: recebido ${response.status}, esperado ${expected}`);
        return response;
    }

    async function login(email, senha, tipo) {
        const response = await call('/api/auth/login', null, 'POST', { email, senha });
        const data = await response.json();
        assert.equal(data.usuario.tipo, tipo);
        return {
            cookie: response.headers.get('set-cookie').split(';')[0],
            csrf: data.csrf_token,
            user: data.usuario
        };
    }

    let cursoId;
    let turmaId;
    let certificateBaseline;
    try {
        const professor = await login(credentials.PROFESSOR_EMAIL, credentials.DEMO_PASSWORD, 'PROFESSOR');
        const aluno = await login(credentials.ALUNO_EMAIL, credentials.DEMO_PASSWORD, 'ALUNO');
        const admin = await login(credentials.ADMIN_EMAIL, credentials.ADMIN_PASSWORD, 'ADMIN');
        const nonce = Date.now();
        const [curso] = await db.query(
            "INSERT INTO Cursos (nome_curso,descricao,carga_horaria) VALUES (?,'Smoke descartável Goal 04',10)",
            [`Ciclos de matrícula ${nonce}`]
        );
        cursoId = curso.insertId;
        const [turma] = await db.query(
            `INSERT INTO Turmas (id_curso,id_professor,nome_turma,data_inicio,status)
             VALUES (?,?,?,CURRENT_DATE,'ABERTA')`,
            [cursoId, professor.user.id_usuario, `Smoke Goal 04 ${nonce}`]
        );
        turmaId = turma.insertId;

        const primeira = await (await call('/api/matriculas', aluno, 'POST', { id_turma: turmaId }, 201)).json();
        const matriculaId = primeira.matricula.id_matricula;
        assert.equal(primeira.matricula.ciclo_atual, 1);

        const conteudos = [];
        for (let ordem = 1; ordem <= 5; ordem += 1) {
            await call(`/api/turmas/${turmaId}/conteudos`, professor, 'POST', {
                titulo: `Conteúdo ${ordem}`, tipo: 'TEXTO', corpo: 'Smoke de rematrícula', ordem
            }, 201);
            const [[conteudo]] = await db.query(
                'SELECT id_conteudo FROM Conteudos WHERE id_turma = ? AND ordem = ?', [turmaId, ordem]
            );
            conteudos.push(conteudo.id_conteudo);
        }

        async function avaliacao(tipo, provaFinal, ordem) {
            const result = await (await call(`/api/turmas/${turmaId}/questionarios`, professor, 'POST', {
                titulo: `${tipo} ${crypto.randomUUID()}`, descricao: 'Smoke Goal 04', tipo,
                prova_final: provaFinal, ordem
            }, 201)).json();
            const pergunta = await (await call(`/api/questionarios/${result.questionario.id_questionario}/perguntas`,
                professor, 'POST', {
                    texto_pergunta: 'Questão do ciclo', tipo_pergunta: 'MULTIPLA_ESCOLHA', ordem: 1,
                    pontos: 1,
                    opcoes: [
                        { texto_opcao: 'Correta', ordem: 1, correta: true },
                        { texto_opcao: 'Incorreta', ordem: 2, correta: false }
                    ]
                }, 201)).json();
            const [[opcao]] = await db.query(
                'SELECT id_opcao FROM Q_Opcoes WHERE id_pergunta = ? AND correta = 1',
                [pergunta.id_pergunta]
            );
            return { id: result.questionario.id_questionario, pergunta: pergunta.id_pergunta, opcao: opcao.id_opcao };
        }

        const exercicio = await avaliacao('EXERCICIO', false, 1);
        const prova = await avaliacao('PROVA', true, 2);
        async function concluir(idConteudo) {
            await call(`/api/conteudos/${idConteudo}/progresso`, aluno, 'PUT', { status: 'CONCLUIDO' });
        }
        async function submeter(questionario, submissionId, expected = 200) {
            return (await call(`/api/questionarios/${questionario.id}/submissoes`, aluno, 'POST', {
                submission_id: submissionId,
                respostas: [{ id_pergunta: questionario.pergunta, id_opcao: questionario.opcao }]
            }, expected)).json();
        }

        for (const idConteudo of conteudos.slice(0, 4)) await concluir(idConteudo);
        const chaveExercicio = crypto.randomUUID();
        await submeter(exercicio, chaveExercicio);
        let requisitos = await buscarRequisitos(db, aluno.user.id_usuario, turmaId);
        assert.equal(requisitos.progresso_para_prova, 80);
        assert.equal(requisitos.prova_liberada, true);
        await submeter(prova, crypto.randomUUID());
        const [historicoAntes] = await db.query(
            `SELECT id_tentativa,ciclo_matricula,percentual,finalizada_em
             FROM Q_Tentativas WHERE id_usuario = ? AND id_turma = ? ORDER BY id_tentativa`,
            [aluno.user.id_usuario, turmaId]
        );
        assert.equal(historicoAntes.length, 2);
        assert(historicoAntes.every((item) => item.ciclo_matricula === 1));
        [certificateBaseline] = await db.query('SELECT * FROM Certificados WHERE id_turma=?', [turmaId]);
        assert.equal(certificateBaseline.length, 1);
        console.log('CICLO 1 OK: 80%, exercício e prova registrados no ciclo 1.');

        await call(`/api/certificados/${certificateBaseline[0].id_certificado}/revogar`, admin, 'POST',
            { motivo: 'Revogação autorizada no laboratório descartável de rematrícula' });
        [certificateBaseline] = await db.query('SELECT * FROM Certificados WHERE id_turma=?', [turmaId]);
        assert.equal(certificateBaseline[0].status, 'REVOGADO');
        await call(`/api/matriculas/${matriculaId}`, aluno, 'DELETE');
        for (const actor of [professor, admin]) {
            const bypass = await (await call(`/api/matriculas/${matriculaId}`, actor, 'PATCH',
                { status_aprovacao: 'CURSANDO' }, 409)).json();
            assert.equal(bypass.code, 'REMATRICULA_OBRIGATORIA');
        }

        const concorrentes = await Promise.all([1, 2].map(() => call(
            '/api/matriculas', aluno, 'POST', { id_turma: turmaId }, [200, 409]
        )));
        assert.deepEqual(concorrentes.map((response) => response.status).sort(), [200, 409]);
        const [[matricula]] = await db.query(
            `SELECT id_matricula,status_aprovacao,nota_final,progresso_percentual,ciclo_atual
             FROM Matriculas WHERE id_matricula = ?`, [matriculaId]
        );
        assert.equal(matricula.ciclo_atual, 2);
        assert.equal(matricula.status_aprovacao, 'APROVADO');
        assert.equal(matricula.nota_final, null);
        assert.equal(matricula.progresso_percentual, 0);
        requisitos = await buscarRequisitos(db, aluno.user.id_usuario, turmaId);
        assert.equal(requisitos.exercicios_realizados, 0);
        assert.equal(requisitos.prova_final_aprovada, true);
        assert.equal(requisitos.prova_liberada, false);
        await submeter(prova, crypto.randomUUID(), 409);

        const historicoApi = await (await call('/api/questionarios/historico', aluno)).json();
        const historicoSmoke = historicoApi.tentativas.filter((item) => item.id_turma === turmaId);
        assert.equal(historicoSmoke.length, 2);
        assert(historicoSmoke.every((item) => item.ciclo_matricula === 1));
        await concluir(conteudos[0]);
        const novaTentativa = await submeter(exercicio, chaveExercicio);
        assert.equal(novaTentativa.resultado.reutilizada, false);
        requisitos = await buscarRequisitos(db, aluno.user.id_usuario, turmaId);
        assert.equal(requisitos.ciclo_atual, 2);
        assert.equal(requisitos.conteudos_concluidos, 1);
        assert.equal(requisitos.exercicios_realizados, 1);
        assert.equal(requisitos.prova_final_aprovada, true);
        assert.equal(requisitos.prova_liberada, false);

        assert.deepEqual((await db.query('SELECT * FROM Certificados WHERE id_turma=?', [turmaId]))[0], certificateBaseline);
        const [historicoDepois] = await db.query(
            `SELECT id_tentativa,ciclo_matricula,percentual,finalizada_em
             FROM Q_Tentativas WHERE id_usuario = ? AND id_turma = ? ORDER BY id_tentativa`,
            [aluno.user.id_usuario, turmaId]
        );
        assert.deepEqual(historicoDepois.slice(0, 2), historicoAntes);
        assert.equal(historicoDepois[2].ciclo_matricula, 2);
        console.log('CICLO 2 OK: conteúdo/exercícios reiniciados; aprovação, tentativa final e certificado preservados; nova prova bloqueada.');
        console.log(JSON.stringify({
            status: 'ENROLLMENT_LIFECYCLE_SMOKE_OK', matriculaId, cicloAtual: 2,
            tentativasPorCiclo: { ciclo1: 2, ciclo2: 1 }
        }));
    } finally {
        if (turmaId) {
            const storage = require('../src/api/services/certificate-storage.service');
            const [certificates] = await db.query('SELECT storage_name FROM Certificados WHERE id_turma=?', [turmaId]);
            for (const certificate of certificates) await storage.removerArquivo(certificate.storage_name);
            await db.query('DELETE FROM Certificados WHERE id_turma=?', [turmaId]);
            await db.query(
                `DELETE progresso FROM ConteudosProgresso progresso
                 INNER JOIN Conteudos conteudo ON conteudo.id_conteudo = progresso.id_conteudo
                 WHERE conteudo.id_turma = ?`, [turmaId]
            );
            await db.query('DELETE FROM Turmas WHERE id_turma = ?', [turmaId]);
        }
        if (cursoId) await db.query('DELETE FROM Cursos WHERE id_curso = ?', [cursoId]);
        console.log('CLEANUP OK: cenário Goal 04 removido; dados anteriores preservados.');
    }
}

main().catch((error) => {
    console.error(`ENROLLMENT_LIFECYCLE_SMOKE_FAILED: ${error.stack || error.message}`);
    process.exitCode = 1;
}).finally(() => db.end());
