'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const playwrightPath = process.env.PLAYWRIGHT_MODULE_PATH || 'playwright';
const { chromium } = require(playwrightPath);
const baseUrl = process.env.VISUAL_BASE_URL || 'http://127.0.0.1:3000';
const password = process.env.VISUAL_TEST_PASSWORD;
assert(password, 'Defina VISUAL_TEST_PASSWORD.');

const output = path.join(__dirname, '..', 'docs', 'screenshots', 'goal13');
fs.mkdirSync(output, { recursive: true });

async function login(context, email, role) {
    const response = await context.request.post(`${baseUrl}/api/auth/login`, {
        data: { email, senha: password }
    });
    const payload = await response.json().catch(() => ({}));
    assert(response.ok(), `Login ${role} falhou: HTTP ${response.status()}.`);
    assert.equal(payload.usuario?.tipo, role);
    return payload.usuario;
}

async function stable(page) {
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => document.body?.dataset.sessionState !== 'loading', null, { timeout: 12_000 });
    await page.waitForFunction(() => ![...document.querySelectorAll('[aria-busy="true"]')]
        .some((element) => element.offsetParent !== null), null, { timeout: 12_000 }).catch(() => undefined);
    await page.evaluate(() => document.fonts?.ready);
}

async function capture(context, name, route, viewport) {
    const page = await context.newPage();
    await page.setViewportSize(viewport);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const response = await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
    assert(response && response.status() < 400, `${route}: HTTP ${response?.status()}.`);
    await stable(page);
    const h1 = await page.locator('h1').first().textContent();
    assert(h1?.trim(), `${route}: intenção principal sem h1.`);
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    assert(dimensions.scrollWidth <= dimensions.width + 1, `${route}: overflow ${dimensions.scrollWidth}/${dimensions.width}.`);
    assert.deepEqual(errors, [], `${route}: ${errors.join('; ')}`);
    await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
    await page.close();
    return { name, route, h1: h1.trim(), ...dimensions };
}

async function main() {
    const browser = await chromium.launch({ headless: true });
    const desktop = { width: 1440, height: 1000 };
    const tablet = { width: 768, height: 1024 };
    const mobile = { width: 360, height: 800 };
    const report = [];
    try {
        const student = await browser.newContext();
        await login(student, 'aluno.matriculado@example.test', 'ALUNO');
        const room = await student.request.get(`${baseUrl}/api/matriculas/minha-sala`).then((response) => response.json());
        const classId = Number(room.turmas?.[0]?.id_turma);
        assert(classId, 'Turma do aluno não encontrada.');
        const content = await student.request.get(`${baseUrl}/api/turmas/${classId}/conteudos`).then((response) => response.json());
        const lessonId = Number(content.modulos?.[0]?.id_modulo);
        assert(lessonId, 'Aula do aluno não encontrada.');
        report.push(await capture(student, '01-sala-virtual-desktop', '/sala-virtual.html', desktop));
        report.push(await capture(student, '02-curso-hub-desktop', `/sala-aula.html?id_turma=${classId}`, desktop));
        report.push(await capture(student, '03-aulas-aluno-tablet', `/sala-aulas.html?id_turma=${classId}`, tablet));
        report.push(await capture(student, '04-aula-detalhe-desktop', `/sala-aula-detalhe.html?id_turma=${classId}&id_aula=${lessonId}`, desktop));
        report.push(await capture(student, '05-avaliacoes-aluno-desktop', `/sala-avaliacoes.html?id_turma=${classId}`, desktop));
        report.push(await capture(student, '06-certificados-aluno-desktop', `/meus-certificados.html?id_turma=${classId}`, desktop));
        report.push(await capture(student, '07-curso-hub-mobile', `/sala-aula.html?id_turma=${classId}`, mobile));
        await student.close();

        const teacher = await browser.newContext();
        const teacherUser = await login(teacher, 'professor.canonico@example.test', 'PROFESSOR');
        const classes = await teacher.request.get(`${baseUrl}/api/turmas/professor/${teacherUser.id_usuario}`).then((response) => response.json());
        const teacherClass = Number(classes.turmas?.[0]?.id_turma || classId);
        const assessments = await teacher.request.get(`${baseUrl}/api/turmas/${teacherClass}/questionarios`).then((response) => response.json());
        const assessmentId = Number(assessments.questionarios?.[0]?.id_questionario);
        assert(assessmentId, 'Avaliação do professor não encontrada.');
        report.push(await capture(teacher, '08-painel-professor-desktop', `/professor-turma.html?id_turma=${teacherClass}`, desktop));
        report.push(await capture(teacher, '09-alunos-professor-mobile', `/professor-turma-alunos.html?id_turma=${teacherClass}`, mobile));
        report.push(await capture(teacher, '10-aulas-professor-desktop', `/professor-turma-aulas.html?id_turma=${teacherClass}`, desktop));
        report.push(await capture(teacher, '11-avaliacoes-professor-desktop', `/professor-turma-avaliacoes.html?id_turma=${teacherClass}`, desktop));
        report.push(await capture(teacher, '12-avaliacao-detalhe-desktop', `/professor-turma-avaliacao.html?id_turma=${teacherClass}&id_questionario=${assessmentId}`, desktop));
        report.push(await capture(teacher, '13-avaliacoes-professor-mobile', `/professor-turma-avaliacoes.html?id_turma=${teacherClass}`, mobile));
        await teacher.close();
    } finally {
        await browser.close();
    }
    fs.writeFileSync(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Capturas concluídas: ${report.length}.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
