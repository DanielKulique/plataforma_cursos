'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

async function readCredentials() {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return dotenv.parse(Buffer.concat(chunks));
}

async function main() {
    const credentials = await readCredentials();
    const baseURL = String(process.env.STAGING_BASE_URL || '').replace(/\/$/, '');
    assert.match(baseURL, /^https:\/\//, 'STAGING_BASE_URL HTTPS obrigatório.');
    for (const name of [
        'BASIC_AUTH_USER', 'BASIC_AUTH_PASSWORD', 'ADMIN_EMAIL', 'ADMIN_PASSWORD',
        'PROFESSOR_EMAIL', 'ALUNO_EMAIL', 'DEMO_PASSWORD'
    ]) assert(credentials[name], `Credencial ausente: ${name}`);

    const output = path.resolve(process.env.IA_SCREENSHOTS_DIR || 'docs/screenshots/goal13-staging');
    fs.mkdirSync(output, { recursive: true });
    const browser = await chromium.launch({ headless: true });
    const contexts = [];
    const evidence = [];
    const basic = {
        username: credentials.BASIC_AUTH_USER,
        password: credentials.BASIC_AUTH_PASSWORD
    };

    async function session(role, email, password) {
        const context = await browser.newContext({
            baseURL,
            httpCredentials: basic,
            reducedMotion: 'reduce'
        });
        contexts.push(context);
        const response = await context.request.post('/api/auth/login', { data: { email, senha: password } });
        assert.equal(response.status(), 200, `Login ${role}`);
        const body = await response.json();
        assert.equal(body.usuario?.tipo, role, `Papel inesperado no login ${role}`);
        return { context, user: body.usuario };
    }

    async function json(sessionRef, route) {
        const response = await sessionRef.context.request.get(route);
        assert.equal(response.status(), 200, `GET ${route}`);
        return response.json();
    }

    async function stable(page) {
        await page.waitForLoadState('domcontentloaded');
        await page.waitForFunction(() => document.body?.dataset.sessionState !== 'loading', null, { timeout: 15_000 });
        await page.waitForFunction(() => ![...document.querySelectorAll('[aria-busy="true"]')]
            .some((element) => element.offsetParent !== null), null, { timeout: 15_000 }).catch(() => undefined);
        await page.evaluate(() => document.fonts?.ready);
    }

    async function inspect(sessionRef, route, viewport, screenshotName = '') {
        const page = await sessionRef.context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.setViewportSize(viewport);
        const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
        assert(response && response.status() < 400, `${route}: HTTP ${response?.status()}`);
        await stable(page);
        await page.waitForFunction(() => {
            const title = document.querySelector('h1')?.textContent?.trim();
            return title && !/^Carregando/i.test(title);
        }, null, { timeout: 15_000 }).catch(() => undefined);
        const result = await page.evaluate(() => ({
            title: document.querySelector('h1')?.textContent?.trim(),
            width: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
            sessionState: document.body?.dataset.sessionState,
            message: document.querySelector('.ui-message')?.textContent?.trim() || null,
            courseLink: document.querySelector('#link-aulas')?.getAttribute('href') || null,
            current: document.querySelector('.section-navigation [aria-current="page"]')?.textContent?.trim() || null,
            breadcrumb: [...document.querySelectorAll('.academic-breadcrumbs li')].map((item) => item.textContent.trim())
        }));
        assert.deepEqual(errors, [], `${route}: ${errors.join('; ')}`);
        assert(result.title && !/^Carregando/i.test(result.title), `${route}: h1 não resolvido ${JSON.stringify(result)}`);
        assert(result.scrollWidth <= result.width + 1, `${route}: overflow ${result.scrollWidth}/${result.width}`);
        if (screenshotName) await page.screenshot({ path: path.join(output, `${screenshotName}.png`), fullPage: true });
        evidence.push({ route, viewport: viewport.width, ...result });
        return page;
    }

    const desktop = { width: 1440, height: 1000 };
    const tablet = { width: 768, height: 1024 };
    const mobile = { width: 360, height: 800 };

    try {
        const student = await session('ALUNO', credentials.ALUNO_EMAIL, credentials.DEMO_PASSWORD);
        const professor = await session('PROFESSOR', credentials.PROFESSOR_EMAIL, credentials.DEMO_PASSWORD);
        const admin = await session('ADMIN', credentials.ADMIN_EMAIL, credentials.ADMIN_PASSWORD);

        const room = await json(student, '/api/matriculas/minha-sala');
        let classId;
        let structure;
        for (const candidate of room.turmas || []) {
            const candidateStructure = await json(student, `/api/turmas/${candidate.id_turma}/conteudos`);
            if ((candidateStructure.modulos || []).length) {
                classId = Number(candidate.id_turma);
                structure = candidateStructure;
                break;
            }
        }
        assert(classId && structure, 'Turma modular do aluno demo não encontrada.');
        const lessonId = Number(structure.modulos?.[0]?.id_modulo);
        assert(lessonId, 'Aula demo não encontrada.');
        const pdf = (structure.conteudos || []).find((item) => item.tipo === 'PDF');
        assert(pdf?.id_modulo, 'PDF demo não encontrado.');

        const roomPage = await inspect(student, '/sala-virtual.html', desktop, '01-sala-virtual-desktop');
        assert.equal(await roomPage.locator('#lista-meus-certificados').count(), 0, 'Sala Virtual expandiu certificados.');
        assert(await roomPage.getByRole('link', { name: /Continuar curso/i }).count() >= 1);
        await roomPage.close();

        const hub = await inspect(student, `/sala-aula.html?id_turma=${classId}`, desktop, '02-curso-hub-desktop');
        for (const id of ['link-aulas', 'link-avaliacoes', 'link-progresso', 'link-certificado']) {
            assert.match(await hub.locator(`#${id}`).getAttribute('href'), new RegExp(`id_turma=${classId}`));
        }
        await hub.locator('#link-aulas').click();
        await hub.waitForURL(new RegExp(`/sala-aulas\\.html\\?id_turma=${classId}`));
        await stable(hub);
        await hub.reload();
        await stable(hub);
        assert.match(hub.url(), new RegExp(`/sala-aulas\\.html\\?id_turma=${classId}`));
        await hub.locator(`a[href*="sala-aula-detalhe.html"]`).first().click();
        await hub.waitForURL(/sala-aula-detalhe\.html/);
        await stable(hub);
        await hub.goBack();
        await stable(hub);
        assert.match(hub.url(), /sala-aulas\.html\?id_turma=/, 'Voltar do browser perdeu a área Aulas.');
        await hub.close();

        for (const [route, shot, viewport] of [
            [`/sala-aulas.html?id_turma=${classId}`, '03-aulas-aluno-tablet', tablet],
            [`/sala-aula-detalhe.html?id_turma=${classId}&id_aula=${lessonId}`, '04-aula-aluno-desktop', desktop],
            [`/sala-avaliacoes.html?id_turma=${classId}`, '05-avaliacoes-aluno-desktop', desktop],
            [`/sala-progresso.html?id_turma=${classId}`, '06-progresso-aluno-mobile', mobile],
            [`/meus-certificados.html?id_turma=${classId}`, '07-certificados-aluno-desktop', desktop],
            [`/sala-aula.html?id_turma=${classId}`, '08-curso-hub-mobile', mobile]
        ]) (await inspect(student, route, viewport, shot)).close();

        const pdfPage = await inspect(student, `/sala-aula-detalhe.html?id_turma=${classId}&id_aula=${pdf.id_modulo}`, desktop);
        await pdfPage.locator('.module-item-action', { hasText: pdf.titulo }).click();
        const protectedLink = pdfPage.locator(`#corpo-conteudo a[href*="/api/conteudos/${pdf.id_conteudo}/material"]`);
        await protectedLink.waitFor();
        assert.equal(await protectedLink.getAttribute('href'), `${baseURL}/api/conteudos/${pdf.id_conteudo}/material`);
        const privatePdf = await student.context.request.get(`/api/conteudos/${pdf.id_conteudo}/material`);
        assert.equal(privatePdf.status(), 200, 'PDF privado negado ao aluno autorizado.');
        assert.match(privatePdf.headers()['content-type'] || '', /application\/pdf/);
        const anonymous = await browser.newContext({ baseURL, httpCredentials: basic });
        contexts.push(anonymous);
        assert.equal((await anonymous.request.get(`/api/conteudos/${pdf.id_conteudo}/material`)).status(), 401);
        await pdfPage.close();

        const invalid = await student.context.newPage();
        await invalid.goto('/meus-certificados.html?id_turma=invalida');
        await invalid.waitForURL(/sala-virtual\.html\?motivo=turma_invalida/);
        await invalid.close();
        const missing = await inspect(student, `/sala-aula-detalhe.html?id_turma=${classId}&id_aula=999999999`, desktop);
        await missing.waitForFunction(() => /não existe/i.test(document.querySelector('#mensagem-aula')?.textContent || ''));
        assert.match(await missing.locator('#mensagem-aula').textContent(), /não existe/i);
        await missing.close();

        const professorClasses = await json(professor, `/api/turmas/professor/${professor.user.id_usuario}`);
        let teacherClassId;
        let teacherStructure;
        let assessments;
        const candidates = [...(professorClasses.turmas || [])].sort((left, right) =>
            Number(right.id_turma === classId) - Number(left.id_turma === classId));
        for (const candidate of candidates) {
            const candidateStructure = await json(professor, `/api/turmas/${candidate.id_turma}/conteudos`);
            const candidateAssessments = await json(professor, `/api/turmas/${candidate.id_turma}/questionarios`);
            if ((candidateStructure.modulos || []).length && (candidateAssessments.questionarios || []).length) {
                teacherClassId = Number(candidate.id_turma);
                teacherStructure = candidateStructure;
                assessments = candidateAssessments;
                break;
            }
        }
        assert(teacherClassId && teacherStructure && assessments, 'Turma modular do professor demo não encontrada.');
        const teacherLessonId = Number(teacherStructure.modulos?.[0]?.id_modulo);
        assert(teacherLessonId, 'Aula do professor demo não encontrada.');
        const assessmentId = Number(assessments.questionarios?.[0]?.id_questionario);
        assert(assessmentId, 'Avaliação do professor demo não encontrada.');

        const teacherHub = await inspect(professor, `/professor-turma.html?id_turma=${teacherClassId}`, desktop, '09-painel-professor-desktop');
        for (const id of ['lista-alunos', 'lista-conteudos', 'lista-perguntas']) assert.equal(await teacherHub.locator(`#${id}`).count(), 0);
        await teacherHub.reload();
        await stable(teacherHub);
        await teacherHub.close();
        for (const [route, shot, viewport] of [
            [`/professor-turma-alunos.html?id_turma=${teacherClassId}`, '10-alunos-professor-mobile', mobile],
            [`/professor-turma-aulas.html?id_turma=${teacherClassId}`, '11-aulas-professor-desktop', desktop],
            [`/professor-turma-aula.html?id_turma=${teacherClassId}&id_aula=${teacherLessonId}`, '12-aula-professor-desktop', desktop],
            [`/professor-turma-avaliacoes.html?id_turma=${teacherClassId}`, '13-avaliacoes-professor-mobile', mobile],
            [`/professor-turma-avaliacao.html?id_turma=${teacherClassId}&id_questionario=${assessmentId}`, '14-avaliacao-professor-desktop', desktop],
            [`/professor-turma-certificados.html?id_turma=${teacherClassId}`, '15-certificados-professor-desktop', desktop]
        ]) (await inspect(professor, route, viewport, shot)).close();

        const assessmentList = await inspect(professor, `/professor-turma-avaliacoes.html?id_turma=${teacherClassId}`, desktop);
        assert.equal(await assessmentList.locator('#lista-perguntas').count(), 0, 'Lista de avaliações expandiu perguntas.');
        await assessmentList.close();
        const assessmentDetail = await inspect(professor, `/professor-turma-avaliacao.html?id_turma=${teacherClassId}&id_questionario=${assessmentId}`, desktop);
        assert.equal(await assessmentDetail.locator('#lista-perguntas').count(), 1, 'Detalhe da avaliação não contém perguntas.');
        await assessmentDetail.close();

        const studentAuthoring = await student.context.newPage();
        await studentAuthoring.goto(`/professor-turma.html?id_turma=${teacherClassId}`);
        await studentAuthoring.waitForURL(/index\.html\?motivo=nao_autorizado/);
        await studentAuthoring.close();

        for (const route of [
            `/professor-turma.html?id_turma=${teacherClassId}`,
            `/professor-turma-alunos.html?id_turma=${teacherClassId}`,
            `/professor-turma-aulas.html?id_turma=${teacherClassId}`,
            `/professor-turma-avaliacoes.html?id_turma=${teacherClassId}`,
            `/professor-turma-certificados.html?id_turma=${teacherClassId}`
        ]) (await inspect(admin, route, desktop, route.includes('professor-turma.html') ? '16-painel-admin-desktop' : '')).close();

        const report = {
            status: 'INFORMATION_ARCHITECTURE_STAGING_SMOKE_OK',
            base_url: baseURL,
            verified_at: new Date().toISOString(),
            pages: evidence
        };
        fs.writeFileSync(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
        console.log(`${report.status} pages=${evidence.length}`);
    } finally {
        for (const context of contexts) await context.close().catch(() => undefined);
        await browser.close();
    }
}

main().catch((error) => {
    console.error(`INFORMATION_ARCHITECTURE_STAGING_SMOKE_FAILED: ${error.message}`);
    process.exitCode = 1;
});
