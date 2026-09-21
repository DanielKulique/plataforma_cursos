'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const dotenv = require('dotenv');
const { request } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

async function main() {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const credentials = dotenv.parse(Buffer.concat(chunks));
    const sessions = [];
    const baseURL = process.env.STAGING_BASE_URL;
    assert(baseURL?.startsWith('https://'));
    async function login(email, senha) {
        const context = await request.newContext({ baseURL, httpCredentials: { username: credentials.BASIC_AUTH_USER, password: credentials.BASIC_AUTH_PASSWORD } });
        sessions.push(context);
        const res = await context.post('/api/auth/login', { data: { email, senha } });
        assert.equal(res.status(), 200);
        const body = await res.json();
        return { context, csrf: body.csrf_token, usuario: body.usuario };
    }
    async function get(session, url) {
        const r = await session.context.get(url); assert.equal(r.status(), 200); return r.json();
    }
    try {
        const admin = await login(credentials.ADMIN_EMAIL, credentials.ADMIN_PASSWORD);
        const professor = await login(credentials.PROFESSOR_EMAIL, credentials.DEMO_PASSWORD);
        const aluno = await login(credentials.ALUNO_EMAIL, credentials.DEMO_PASSWORD);
        const sala = await get(aluno, '/api/matriculas/minha-sala');
        const origem = sala.turmas.find((t) => t.nome_turma === 'Jornada por Aulas — Demo 2026-09-05');
        assert(origem);
        const estrutura = await get(admin, `/api/turmas/${origem.id_turma}/conteudos`);
        const questoes = (await get(admin, `/api/turmas/${origem.id_turma}/questionarios`)).questionarios;
        const response = await admin.context.post(`/api/turmas/${origem.id_turma}/replicar`, {
            headers: { 'X-CSRF-Token': admin.csrf, 'Idempotency-Key': `learning-path-20260905-${origem.id_turma}` },
            data: { nome_turma: 'Jornada por Aulas — Réplica de validação', id_professor: professor.usuario.id_usuario, data_inicio: '2026-09-05', data_fim: '2027-01-02', status: 'FECHADA' }
        });
        assert([200, 201].includes(response.status()), `Replicação ${response.status()}`);
        const replica = (await response.json()).turma;
        const id = replica.id_turma;
        const copy = await get(admin, `/api/turmas/${id}/conteudos`);
        assert.deepEqual(copy.modulos.map((m) => [m.titulo, m.ordem]), estrutura.modulos.map((m) => [m.titulo, m.ordem]));
        assert.deepEqual(copy.conteudos.map((c) => [c.titulo, c.tipo, c.ordem, c.id_arquivo_material]), estrutura.conteudos.map((c) => [c.titulo, c.tipo, c.ordem, c.id_arquivo_material]));
        const quizzes = (await get(admin, `/api/turmas/${id}/questionarios`)).questionarios;
        assert.deepEqual(quizzes.map((q) => [q.titulo, q.tipo, q.ordem, q.total_perguntas]), questoes.map((q) => [q.titulo, q.tipo, q.ordem, q.total_perguntas]));
        for (const quiz of quizzes.filter((q) => q.id_modulo)) assert(copy.modulos.some((m) => m.id_modulo === quiz.id_modulo));
        assert(quizzes.find((q) => q.tipo === 'PROVA').id_modulo === null);
        const alunos = await get(admin, `/api/matriculas/turma/${id}`);
        assert.equal((alunos.matriculas || alunos.alunos || alunos).length, 0);
        assert.deepEqual((await get(admin, `/api/turmas/${id}/questionarios/resultados`)).resultados, []);
        const pdf = copy.conteudos.find((c) => c.id_arquivo_material);
        const material = await professor.context.get(`/api/conteudos/${pdf.id_conteudo}/material`);
        assert.equal(material.status(), 200);
        // Validate closed authorship then ended read-only on the fresh replica only.
        let res = await admin.context.patch(`/api/turmas/${id}`, { headers: { 'X-CSRF-Token': admin.csrf }, data: { status: 'FECHADA' } });
        assert.equal(res.status(), 200);
        res = await professor.context.patch(`/api/questionarios/${quizzes[0].id_questionario}`, { headers: { 'X-CSRF-Token': professor.csrf }, data: { ordem: quizzes[0].ordem } });
        assert.equal(res.status(), 200);
        res = await admin.context.patch(`/api/turmas/${id}`, { headers: { 'X-CSRF-Token': admin.csrf }, data: { status: 'ENCERRADA' } });
        assert.equal(res.status(), 200);
        for (const user of [admin, professor]) {
            res = await user.context.patch(`/api/questionarios/${quizzes[0].id_questionario}`, { headers: { 'X-CSRF-Token': user.csrf }, data: { ordem: 100 } });
            assert.equal(res.status(), 409);
        }
        const report = { origem: origem.id_turma, replica: id, resultados: ['Replicação preserva aulas, ordem, conteúdo, perguntas e vínculo opcional de avaliações', 'PDF privado permanece acessível na réplica', 'Réplica sem alunos nem tentativas/resultados', 'FECHADA permite autoria; ENCERRADA bloqueia ADMIN e professor'], verificado_em: new Date().toISOString() };
        fs.writeFileSync('docs/screenshots/jornada-aulas-2026-09-05/estrutura.json', JSON.stringify(report, null, 2) + '\n');
        console.log(JSON.stringify(report));
    } finally { for (const session of sessions) await session.dispose(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
