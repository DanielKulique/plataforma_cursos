const { test, expect } = require('@playwright/test');

const payload = '<script>window.__AUDIT_XSS__=true</script>';

async function login(page, email) {
    await page.route('https://**/*', (route) => route.abort());
    await page.goto('/login.html');
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha').fill('E2e-only-password-42!');
    const response = page.waitForResponse((item) => item.url().endsWith('/api/auth/login'));
    await page.getByRole('button', { name: 'Entrar' }).click();
    expect((await response).status()).toBe(200);
    const destination = email.startsWith('professor.') ? '/professor.html' : '/sala-virtual.html';
    await page.waitForURL((url) => url.pathname === destination, { waitUntil: 'load' });
}

test('@full question text containing a script renders literally for the learner', async ({ browser }) => {
    const teacherContext = await browser.newContext();
    const studentContext = await browser.newContext();
    try {
        const teacher = await teacherContext.newPage();
        await login(teacher, 'professor.e2e@example.test');
        const csrf = (await (await teacher.request.get('/api/auth/csrf')).json()).csrf_token;
        const headers = { 'X-CSRF-Token': csrf };
        const created = await teacher.request.post('/api/turmas/1/questionarios', {
            headers,
            data: { titulo: 'XSS audit exercise', tipo: 'EXERCICIO', ativo: true }
        });
        expect(created.status()).toBe(201);
        const assessmentId = (await created.json()).questionario.id_questionario;
        const question = await teacher.request.post(`/api/questionarios/${assessmentId}/perguntas`, {
            headers,
            data: {
                texto_pergunta: payload,
                tipo_pergunta: 'MULTIPLA_ESCOLHA',
                ordem: 1,
                pontos: 1,
                opcoes: [
                    { texto_opcao: 'A', ordem: 1, correta: true },
                    { texto_opcao: 'B', ordem: 2, correta: false }
                ]
            }
        });
        expect(question.status()).toBe(201);

        const student = await studentContext.newPage();
        await login(student, 'aluno.e2e@example.test');
        await student.goto(`/questionario.html?id_turma=1&id_questionario=${assessmentId}&tipo=exercicio`);
        await expect(student.locator('#lista-questoes')).toContainText(payload);
        expect(await student.locator('#lista-questoes script').count()).toBe(0);
        expect(await student.evaluate(() => window.__AUDIT_XSS__)).toBeUndefined();
    } finally {
        await Promise.all([teacherContext.close(), studentContext.close()]);
    }
});
