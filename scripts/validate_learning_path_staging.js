'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { firefox } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const { PDFDocument } = require('pdf-lib');

async function main() {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const credentials = dotenv.parse(Buffer.concat(chunks));
    const baseURL = process.env.STAGING_BASE_URL;
    assert(baseURL?.startsWith('https://'));
    const output = path.resolve(process.env.LEARNING_SCREENSHOTS_DIR || 'docs/screenshots/jornada-aulas-2026-09-05');
    fs.mkdirSync(output, { recursive: true });
    const browser = await firefox.launch({ headless: true });
    const contexts = [];
    const results = [];
    const confirmation = process.argv.includes('--confirm');
    async function login(role, email, senha) {
        const context = await browser.newContext({ baseURL, httpCredentials: {
            username: credentials.BASIC_AUTH_USER, password: credentials.BASIC_AUTH_PASSWORD
        }, viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
        contexts.push(context);
        const res = await context.request.post('/api/auth/login', { data: { email, senha } });
        assert.equal(res.status(), 200, `Login ${role}`);
        const body = await res.json();
        assert.equal(body.usuario.tipo, role);
        return { context, csrf: body.csrf_token, user: body.usuario };
    }
    async function json(session, url) {
        const res = await session.context.request.get(url);
        assert.equal(res.status(), 200, url);
        return res.json();
    }
    async function capture(page, name) {
        await page.evaluate(() => {
            document.querySelectorAll('#status-usuario').forEach((el) => { el.textContent = 'Pessoa de demonstração'; });
        });
        await page.evaluate(() => scrollTo(0, 0));
        await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: !name.includes('autoria') });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow ${name}`);
    }
    try {
        const aluno = await login('ALUNO', credentials.ALUNO_EMAIL, credentials.DEMO_PASSWORD);
        const professor = await login('PROFESSOR', credentials.PROFESSOR_EMAIL, credentials.DEMO_PASSWORD);
        const admin = await login('ADMIN', credentials.ADMIN_EMAIL, credentials.ADMIN_PASSWORD);
        const room = await json(aluno, '/api/matriculas/minha-sala');
        const turma = room.turmas.find((item) => item.nome_turma === 'Jornada por Aulas — Demo 2026-09-05');
        assert(turma, 'Demonstração ausente');
        const id = turma.id_turma;
        const estrutura = await json(aluno, `/api/turmas/${id}/conteudos`);
        assert.equal(estrutura.modulos.length, 3);
        const avaliacoes = (await json(aluno, `/api/turmas/${id}/questionarios`)).questionarios;
        assert.equal(avaliacoes.filter((q) => q.tipo === 'EXERCICIO' && q.id_modulo).length, 2);
        assert.equal(avaliacoes.filter((q) => q.tipo === 'PROVA' && !q.id_modulo).length, 1);
        const pdf = estrutura.conteudos.find((item) => item.tipo === 'PDF');
        // Exercise actual private PDF upload using the existing material strategy.
        const doc = await PDFDocument.create();
        doc.addPage().drawText('Jornada por aulas - material privado de demonstracao');
        const bytes = Buffer.from(await doc.save());
        if (!confirmation) {
        const upload = await professor.context.request.put(`/api/conteudos/${pdf.id_conteudo}/pdf`, {
            headers: { 'X-CSRF-Token': professor.csrf },
            multipart: { arquivo: { name: 'jornada-integridade.pdf', mimeType: 'application/pdf', buffer: bytes } }
        });
        assert.equal(upload.status(), 200, 'Upload PDF');
        }
        const material = await aluno.context.request.get(`/api/conteudos/${pdf.id_conteudo}/material`);
        assert.equal(material.status(), 200);
        if (!confirmation) assert(Buffer.from(await material.body()).equals(bytes));
        else assert.match(material.headers()['content-type'], /application\/pdf/);
        results.push('PDF privado enviado pelo professor e lido pelo aluno autorizado');
        const alheio = await login('PROFESSOR', 'professor.alheio.demo@example.test', credentials.DEMO_PASSWORD);
        assert.equal((await alheio.context.request.patch(`/api/modulos/${estrutura.modulos[0].id_modulo}`, {
            headers: { 'X-CSRF-Token': alheio.csrf }, data: { titulo: 'Não autorizado' }
        })).status(), 403);
        const semMatricula = await login('ALUNO', credentials.UNENROLLED_EMAIL, credentials.DEMO_PASSWORD);
        assert.equal((await semMatricula.context.request.get(`/api/turmas/${id}/questionarios`)).status(), 403);
        assert.equal((await semMatricula.context.request.get(`/api/conteudos/${pdf.id_conteudo}/material`)).status(), 403);
        results.push('Professor alheio e aluno sem matrícula permanecem bloqueados');
        for (const width of [1440, 390]) {
            const page = await aluno.context.newPage();
            const errors = [];
            page.on('pageerror', (error) => errors.push(error.message));
            await page.setViewportSize({ width, height: 1000 });
            await page.goto(`/sala-aula.html?id_turma=${id}`);
            await page.locator('.lesson-toggle').first().waitFor();
            assert.equal(await page.locator('.lesson-toggle').count(), 3);
            await capture(page, `aluno-${width}`);
            const first = estrutura.modulos[0].id_modulo;
            if (await page.locator(`#aula-${first}`).getAttribute('aria-expanded') !== 'true') await page.locator(`#aula-${first}`).click();
            const texto = estrutura.conteudos.find((c) => c.tipo === 'TEXTO' && c.id_modulo === first);
            await page.locator(`#conteudo-${texto.id_conteudo}`).click();
            await page.locator('#conteudo-texto-container:not([hidden])').waitFor();
            assert.equal(await page.locator(`.lesson-panel #visualizador-integrado`).count(), 1);
            if (await page.locator('#btn-marcar-concluido').isEnabled()) {
                await page.locator('#btn-marcar-concluido').click();
                await page.waitForFunction(() => document.querySelector('#btn-marcar-concluido').textContent === 'Conteúdo concluído');
            }
            await capture(page, `aluno-texto-${width}`);
            await page.locator('#btn-fechar-texto').click();
            assert.equal(await page.evaluate(() => document.activeElement.id), `conteudo-${texto.id_conteudo}`);
            for (const tipo of ['VIDEO', 'PDF', 'ATIVIDADE']) {
                const item = estrutura.conteudos.find((c) => c.tipo === tipo);
                const toggle = page.locator(`#aula-${item.id_modulo}`);
                if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
                await page.locator(`#conteudo-${item.id_conteudo}`).click();
                const viewer = page.locator(tipo === 'VIDEO' ? '#player-video-container' : '#conteudo-texto-container');
                await viewer.waitFor({ state: 'visible' });
                assert.equal(await page.locator(`#aula-painel-${item.id_modulo} #visualizador-integrado`).count(), 1);
                if (tipo === 'VIDEO') assert.match(await page.locator('#video-player').getAttribute('src'), /^https:\/\/www\.youtube-nocookie\.com\/embed\//);
                if (tipo === 'PDF') assert.equal(await page.locator('#conteudo-corpo a').getAttribute('href'), `${baseURL}/api/conteudos/${item.id_conteudo}/material`);
                if (tipo === 'ATIVIDADE') assert.match(await page.locator('#conteudo-corpo').innerText(), /Escolha uma fonte/);
                await page.locator(tipo === 'VIDEO' ? '#btn-fechar-video' : '#btn-fechar-texto').click();
            }
            const antes = await page.locator('.lesson-meta').allTextContents();
            await page.locator('.lesson-filters summary').click();
            await page.locator('#busca-conteudo').fill('não existe este material');
            assert.deepEqual(await page.locator('.lesson-meta').allTextContents(), antes);
            await page.locator('#busca-conteudo').fill('');
            await page.locator('.lesson-filters summary').click();
            await page.locator('.lesson-toggle').nth(1).focus();
            if (await page.locator('.lesson-toggle').nth(1).getAttribute('aria-expanded') === 'true') await page.keyboard.press('Enter');
            await page.keyboard.press('Enter');
            assert.equal(await page.locator('.lesson-toggle[aria-expanded="true"]').count(), 1);
            const exercicio = page.locator('.lesson-panel:not([hidden]) a[href*="questionario.html"]');
            await exercicio.click();
            await page.locator('.question-item').first().waitFor();
            assert.match(await page.locator('#contexto-questionario').innerText(), /Aula 2/);
            await capture(page, `aluno-exercicio-${width}`);
            if (width === 1440 && !confirmation) {
                await page.locator('.question-item input').first().check();
                await page.locator('#btn-finalizar-questionario').click();
                await page.waitForFunction(() => document.querySelector('#lista-historico').textContent.includes('%'));
            }
            await page.locator('#link-voltar-sala').click();
            await page.locator('.lesson-toggle[aria-expanded="true"]').waitFor();
            assert.match(await page.locator('.lesson-toggle[aria-expanded="true"]').innerText(), /Aula 2/);
            await page.locator('#lista-avaliacoes-finais a').click();
            await page.locator('.question-item').first().waitFor();
            assert.match(await page.locator('#contexto-questionario').innerText(), /Avaliação final/);
            assert.deepEqual(errors, []);
            await page.close();
        }
        results.push('Aluno desktop/mobile: accordion, foco, filtros, conclusão real, exercício da aula e prova final');
        for (const [role, session] of [['professor', professor], ['admin', admin]]) {
            const page = await session.context.newPage();
            await page.goto(`/professor-turma.html?id_turma=${id}`);
            await page.locator('.teacher-module').first().waitFor();
            assert.equal(await page.locator('.teacher-module').count(), 3);
            assert((await page.locator('.teacher-module__copy').first().boundingBox()).width > 300, 'Título da aula comprimido');
            assert.equal(await page.locator('.teacher-module').first().getByRole('button', { name: 'Adicionar conteúdo', exact: true }).isEnabled(), true);
            await capture(page, `${role}-1440`);
            await page.locator('.teacher-module').nth(1).getByRole('button', { name: 'Adicionar questionário', exact: true }).click();
            assert.equal(await page.locator('#questionario-modulo').inputValue(), String(estrutura.modulos[1].id_modulo));
            assert.equal(await page.locator('#questionario-ordem').isEnabled(), true);
            await page.locator('#questionario-ordem').scrollIntoViewIfNeeded();
            await capture(page, `${role}-autoria-1440`);
            await page.keyboard.press('Escape');
            await page.setViewportSize({ width: 390, height: 1000 });
            await capture(page, `${role}-390`);
            await page.close();
        }
        results.push('Professor e ADMIN: estrutura por aulas, autoria contextual e responsividade');
        const report = { turma: id, url: `${baseURL}/sala-aula.html?id_turma=${id}`, resultados: results, verificado_em: new Date().toISOString(), pdf_conteudo: pdf.id_conteudo };
        fs.writeFileSync(path.join(output, 'validacao.json'), JSON.stringify(report, null, 2) + '\n');
        console.log(JSON.stringify(report));
    } finally {
        for (const context of contexts) await context.close();
        await browser.close();
    }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
