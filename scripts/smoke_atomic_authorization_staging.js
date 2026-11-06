'use strict';

require('./lib/disposable-smoke').assertDisposableSmoke();
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dotenv = require('dotenv');
const { firefox } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

async function main() {
    const base = process.env.STAGING_BASE_URL;
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const credentials = dotenv.parse(Buffer.concat(chunks));
    for (const name of ['BASIC_AUTH_USER', 'BASIC_AUTH_PASSWORD', 'ADMIN_EMAIL', 'ADMIN_PASSWORD', 'PROFESSOR_EMAIL', 'DEMO_PASSWORD']) {
        assert(credentials[name], `Credencial ausente: ${name}`);
    }
    const output = process.env.SMOKE_OUTPUT_DIR || '.deployments/atomic-academic-authorization/browser';
    fs.mkdirSync(output, { recursive: true });
    const browser = await firefox.launch({ headless: true, ...(process.env.FIREFOX_EXECUTABLE ? { executablePath: process.env.FIREFOX_EXECUTABLE } : {}) });
    try {
        for (const [name, viewport] of [['desktop', { width: 1440, height: 1000 }], ['mobile', { width: 412, height: 915 }]]) {
            const contexts = [];
            async function session(email, senha) {
                const context = await browser.newContext({ baseURL: base, viewport,
                    httpCredentials: { username: credentials.BASIC_AUTH_USER, password: credentials.BASIC_AUTH_PASSWORD } });
                contexts.push(context);
                const response = await context.request.post('/api/auth/login', { data: { email, senha } });
                assert.equal(response.status(), 200, 'Login do smoke');
                const body = await response.json();
                return { context, user: body.usuario, csrf: body.csrf_token };
            }
            const admin = await session(credentials.ADMIN_EMAIL, credentials.ADMIN_PASSWORD);
            const a = await session(credentials.PROFESSOR_EMAIL, credentials.DEMO_PASSWORD);
            async function call(route, method, data, expected = 200) {
                const response = await admin.context.request.fetch(route, { method, data, headers: { 'X-CSRF-Token': admin.csrf } });
                assert.equal(response.status(), expected, `${method} ${route}`);
                return response.status() === 204 ? null : response.json();
            }
            let curso, turma, bUser;
            try {
                const nonce = crypto.randomUUID();
                const senhaB = `Aa1!${crypto.randomBytes(18).toString('hex')}`;
                bUser = await call('/api/admin/usuarios', 'POST', { nome_completo: 'Professor B Goal 06',
                    cpf: String(crypto.randomInt(10000000000, 99999999999)), email: `goal06-${nonce}@example.test`, senha: senhaB, tipo: 'PROFESSOR' }, 201);
                const b = await session(bUser.email, senhaB);
                curso = await call('/api/cursos', 'POST', { nome_curso: `Goal 06 ${nonce}`, descricao: 'Smoke descartável', carga_horaria: 10 }, 201);
                turma = await call('/api/turmas', 'POST', { nome_turma: `Goal 06 ${name} ${nonce}`, id_curso: curso.id_curso,
                    id_professor: a.user.id_usuario, data_inicio: '2026-09-01', status: 'FECHADA' }, 201);
                const route = `/professor-turma.html?id_turma=${turma.id_turma}`;
                const pageA = await a.context.newPage();
                await pageA.goto(route);
                async function preparar(page, titulo) {
                    await page.locator('#novo-conteudo').click();
                    await page.locator('#conteudo-tipo').selectOption('TEXTO');
                    await page.locator('#conteudo-titulo').fill(titulo);
                    await page.locator('#conteudo-corpo').fill('Texto descartável do smoke de autorização.');
                }
                async function salvar(page, expected) {
                    const resposta = page.waitForResponse(r => r.url().endsWith(`/api/turmas/${turma.id_turma}/conteudos`) && r.request().method() === 'POST');
                    await page.locator('#salvar-conteudo').click();
                    assert.equal((await resposta).status(), expected);
                    if (expected === 201) await page.waitForFunction(() =>
                        document.getElementById('form-conteudo').getAttribute('aria-busy') === 'false'
                        && !document.getElementById('modal-conteudo').open
                        && !document.getElementById('novo-conteudo').disabled);
                }
                await preparar(pageA, 'A autorizado'); await salvar(pageA, 201);
                await pageA.locator('#modal-conteudo').waitFor({ state: 'hidden' });
                await preparar(pageA, 'A obsoleto');
                await call(`/api/turmas/${turma.id_turma}`, 'PATCH', { id_professor: b.user.id_usuario });
                await salvar(pageA, 403);
                await pageA.waitForFunction(() => /permissão/i.test(document.getElementById('erro-modal-conteudo').textContent)
                    && document.getElementById('novo-conteudo').disabled && document.getElementById('salvar-conteudo').disabled);
                await pageA.locator('#erro-modal-conteudo').scrollIntoViewIfNeeded();
                assert(await pageA.locator('#erro-modal-conteudo').isVisible());
                assert.match(await pageA.locator('#erro-modal-conteudo').innerText(), /permissão/i);
                await pageA.screenshot({ path: path.join(output, `${name}-ownership.png`), fullPage: true });
                const pageB = await b.context.newPage(); await pageB.goto(route);
                await preparar(pageB, 'B autorizado'); await salvar(pageB, 201);
                await pageB.locator('#modal-conteudo').waitFor({ state: 'hidden' });
                await preparar(pageB, 'B após encerramento');
                await call(`/api/turmas/${turma.id_turma}`, 'PATCH', { status: 'ENCERRADA' });
                await salvar(pageB, 409);
                await pageB.waitForFunction(() => /Turma encerrada/.test(document.getElementById('mensagem-conteudos').textContent)
                    && document.getElementById('novo-conteudo').disabled && document.getElementById('salvar-conteudo').disabled);
                assert(await pageB.locator('#erro-modal-conteudo').isVisible());
                assert.match(await pageB.locator('#mensagem-conteudos').textContent(), /Turma encerrada/);
                await pageB.screenshot({ path: path.join(output, `${name}-encerrada.png`), fullPage: true });
                await call(`/api/turmas/${turma.id_turma}`, 'PATCH', { status: 'ABERTA' });
                await pageB.reload();
                await preparar(pageB, 'B após reabertura'); await salvar(pageB, 201);
                const final = await call(`/api/turmas/${turma.id_turma}/conteudos`, 'GET');
                assert.deepEqual(final.conteudos.map(c => c.titulo), ['A autorizado', 'B autorizado', 'B após reabertura']);
                console.log(`PASS ${name}: A cria; troca A→B; página aberta A recebe 403 e desabilita autoria; B cria; encerramento retorna 409 e read-only; reabertura permite B; banco/API contém somente 3 escritas autorizadas.`);
            } catch (error) {
                console.error(`SMOKE ${name}: ${error.message}`);
                for (const context of contexts) for (const page of context.pages()) {
                    console.error(await page.locator('#erro-modal-conteudo').evaluate(e => ({ text: e.textContent,
                        hidden: e.hidden, display: getComputedStyle(e).display, visibility: getComputedStyle(e).visibility,
                        modalOpen: document.getElementById('modal-conteudo').open })).catch(() => ({})));
                }
                throw error;
            } finally {
                if (turma) {
                    await call(`/api/turmas/${turma.id_turma}`, 'PATCH', { status: 'ABERTA' });
                    const body = await call(`/api/turmas/${turma.id_turma}/conteudos`, 'GET');
                    for (const item of body.conteudos) await call(`/api/conteudos/${item.id_conteudo}`, 'DELETE');
                    await call(`/api/turmas/${turma.id_turma}`, 'DELETE', undefined, 204);
                }
                if (curso) await call(`/api/cursos/${curso.id_curso}`, 'DELETE', undefined, 204);
                if (bUser) await call(`/api/usuarios/${bUser.id_usuario}`, 'DELETE', undefined, 204);
                for (const context of contexts) await context.close();
            }
        }
        console.log('ATOMIC_AUTHORIZATION_STAGING_SMOKE_OK');
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
