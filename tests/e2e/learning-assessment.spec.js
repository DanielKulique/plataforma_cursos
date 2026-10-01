const { test, expect } = require('@playwright/test');

test.use({ trace: 'off' });

test('@full learner completes lessons, sees final exam unlock at 80%, and cannot see the answer key', async ({ page }) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.goto('/login.html');
    await page.getByLabel('E-mail').fill('aluno.e2e@example.test');
    await page.getByLabel('Senha').fill('E2e-only-password-42!');
    const loginResponse = page.waitForResponse((response) => response.url().endsWith('/api/auth/login'));
    await page.getByRole('button', { name: 'Entrar' }).click();
    expect((await loginResponse).status()).toBe(200);
    await expect(page).toHaveURL(/sala-virtual\.html$/);

    await page.goto('/sala-aula-detalhe.html?id_turma=1&id_aula=1');
    await expect(page.getByRole('heading', { name: 'Módulo E2E' })).toBeVisible();
    for (let index = 1; index <= 3; index += 1) {
        const started = page.waitForResponse((response) => /\/api\/conteudos\/\d+\/progresso$/.test(response.url())
            && response.request().method() === 'PUT');
        await page.getByRole('button', { name: new RegExp(`Conteúdo E2E ${index}`) }).click();
        expect((await started).status()).toBe(200);
        const completed = page.waitForResponse((response) => /\/api\/conteudos\/\d+\/progresso$/.test(response.url())
            && response.request().method() === 'PUT');
        await page.getByRole('button', { name: 'Marcar como concluído' }).click();
        const progressResponse = await completed;
        expect(progressResponse.status()).toBe(200);
        expect((await progressResponse.json()).status).toBe('CONCLUIDO');
    }

    const afterThree = await page.evaluate(async () => (await fetch('/api/turmas/1/questionarios')).json());
    expect(afterThree.questionarios.find((item) => item.prova_final).bloqueada, JSON.stringify(afterThree)).toBe(true);

    await page.goto('/sala-avaliacoes.html?id_turma=1');
    const lockedExam = page.locator('#lista-provas a[aria-disabled="true"]');
    await expect(lockedExam).toBeVisible();
    await expect(lockedExam).not.toHaveAttribute('href', /./);

    await page.goto('/sala-aula-detalhe.html?id_turma=1&id_aula=1');
    await expect(page.getByRole('heading', { name: 'Módulo E2E' })).toBeVisible();
    const started = page.waitForResponse((response) => /\/api\/conteudos\/\d+\/progresso$/.test(response.url())
        && response.request().method() === 'PUT');
    await page.getByRole('button', { name: /Conteúdo E2E 4/ }).click();
    expect((await started).status()).toBe(200);
    const completed = page.waitForResponse((response) => /\/api\/conteudos\/\d+\/progresso$/.test(response.url())
        && response.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Marcar como concluído' }).click();
    const progressResponse = await completed;
    expect(progressResponse.status()).toBe(200);
    expect((await progressResponse.json()).status).toBe('CONCLUIDO');

    await page.goto('/sala-avaliacoes.html?id_turma=1');
    const afterFour = await page.evaluate(async () => (await fetch('/api/turmas/1/questionarios')).json());
    expect(afterFour.questionarios.find((item) => item.prova_final).bloqueada, JSON.stringify(afterFour)).toBe(false);
    const startExam = page.locator('#lista-provas a').filter({ hasText: 'Iniciar' });
    await expect(startExam).toHaveAttribute('href', /questionario\.html/);
    const examLink = await startExam.getAttribute('href');
    const assessmentResponse = page.waitForResponse((response) => response.url().includes('/questionarios/disponivel'));
    await page.goto(examLink);
    await expect(page.locator('legend').first()).toContainText('Qual é o ambiente desta turma?');
    const examPayload = await assessmentResponse;
    expect(examPayload.status()).toBe(200);
    expect(JSON.stringify(await examPayload.json())).not.toMatch(/"correta"\s*:/i);
});
