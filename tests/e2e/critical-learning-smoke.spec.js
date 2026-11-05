const { test, expect } = require('@playwright/test');

test.use({ trace: 'retain-on-failure' });

test('@smoke landing, login, Sala Virtual, aula, avaliação e progresso', async ({ page }) => {
    await page.route('https://**/*', (route) => route.abort());
    const landing = await page.goto('/landing.html');
    expect(landing.headers()['content-security-policy']).toContain('https://www.youtube-nocookie.com');
    await expect(page.getByRole('heading').first()).toBeVisible();

    await page.goto('/login.html');
    await page.getByLabel('E-mail').fill('aluno.e2e@example.test');
    await page.getByLabel('Senha').fill('E2e-only-password-42!');
    const loginResponse = page.waitForResponse((response) => response.url().endsWith('/api/auth/login'));
    await page.getByRole('button', { name: 'Entrar' }).click();
    expect((await loginResponse).status()).toBe(200);
    await expect(page).toHaveURL(/sala-virtual\.html$/);
    await expect(page.getByRole('heading', { name: 'Sua trilha de estudos' })).toBeVisible();

    await page.goto('/sala-aula-detalhe.html?id_turma=1&id_aula=1');
    await expect(page.getByRole('heading', { name: 'Módulo E2E' })).toBeVisible();
    await page.getByRole('button', { name: /Conteúdo E2E 2/ }).click();
    await expect(page.locator('#video-player')).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    await expect.poll(async () => page.locator('#video-player').isVisible() || page.locator('#video-fallback').isVisible()).toBe(true);

    await page.goto('/sala-avaliacoes.html?id_turma=1');
    await expect(page.getByRole('heading', { name: 'Avaliações' })).toBeVisible();
    await expect(page.locator('#lista-provas')).toBeVisible();

    await page.goto('/sala-progresso.html?id_turma=1');
    await expect(page.getByRole('heading', { name: 'Meu progresso' })).toBeVisible();
    await expect(page.locator('#progress-bar')).toBeVisible();
});

test('@smoke a falha na API de certificados não derruba a Sala Virtual', async ({ page }) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.route('**/api/certificados/meus', (route) => route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Internal test failure', stack: 'private stack trace' })
    }));
    await page.goto('/login.html');
    await page.getByLabel('E-mail').fill('aluno.e2e@example.test');
    await page.getByLabel('Senha').fill('E2e-only-password-42!');
    const loginResponse = page.waitForResponse((response) => response.url().endsWith('/api/auth/login'));
    await page.getByRole('button', { name: 'Entrar' }).click();
    expect((await loginResponse).status()).toBe(200);

    await page.waitForURL(/sala-virtual\.html$/, { waitUntil: 'load' });
    await page.goto('/sala-virtual.html');
    await expect(page.getByText('Turma E2E Aberta')).toBeVisible();
    const failedSecondaryRequest = await page.evaluate(async () => {
        const response = await fetch('/api/certificados/meus');
        return response.status;
    });
    expect(failedSecondaryRequest).toBe(503);
    await expect(page.getByText('Turma E2E Aberta')).toBeVisible();
});
