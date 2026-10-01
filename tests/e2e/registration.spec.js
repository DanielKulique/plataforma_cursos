const { test, expect } = require('@playwright/test');

// This flow handles passwords and session cookies; do not persist its trace.
test.use({ trace: 'off' });

test('@smoke public registration with delivery disabled creates an immediately usable learner account', async ({ page }, testInfo) => {
    const email = `novo.aluno.${testInfo.project.name}.e2e@example.test`;
    const cpf = testInfo.project.name === 'chromium' ? '90000001005' : '90000001006';
    await page.route('https://**/*', (route) => route.abort());
    await page.goto('/cadastro.html');
    await page.getByLabel('Nome completo').fill('Novo Aluno E2E');
    await page.getByLabel('CPF (somente números)').fill(cpf);
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha', { exact: true }).fill('E2e-only-password-99!');
    await page.getByLabel('Repita sua senha').fill('E2e-only-password-99!');
    const createResponse = page.waitForResponse((response) => response.url().endsWith('/api/usuarios'));
    await page.getByRole('button', { name: 'Cadastrar' }).click();
    expect((await createResponse).status()).toBe(201);
    await expect(page.getByRole('status')).toContainText(/conta já está pronta para entrar/i);

    await page.goto('/login.html');
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha').fill('E2e-only-password-99!');
    const loginResponse = page.waitForResponse((response) => response.url().endsWith('/api/auth/login'));
    await page.getByRole('button', { name: 'Entrar' }).click();
    expect((await loginResponse).status()).toBe(200);
    await expect(page).toHaveURL(/sala-virtual\.html$/);
});
