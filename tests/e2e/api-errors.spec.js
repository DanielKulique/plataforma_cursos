const { test, expect } = require('@playwright/test');

test.use({ trace: 'off' });

const password = 'E2e-only-password-42!';
const errorBody = {
    message: 'INTERNAL_TEST_SENTINEL database password and stack trace',
    stack: 'INTERNAL_TEST_STACK at /srv/private/database.js:42'
};
const cases = [
    [400, 'Dados inválidos na requisição.', 'Não foi possível carregar seus certificados.'],
    [401, 'redirect'],
    [403, 'Você não tem permissão para esta ação.', 'Não foi possível carregar seus certificados.'],
    [404, 'Recurso não encontrado.', 'Não foi possível carregar seus certificados.'],
    [409, 'A operação entrou em conflito com o estado atual.', 'Não foi possível carregar seus certificados.'],
    [422, 'Os dados enviados não passaram na validação.', 'Não foi possível carregar seus certificados.'],
    [429, 'Muitas solicitações. Aguarde e tente novamente.', 'Não foi possível carregar seus certificados.'],
    [500, 'O servidor não conseguiu concluir a solicitação.', 'Não foi possível carregar seus certificados.'],
    [503, 'Serviço temporariamente indisponível.', 'Seus certificados estão temporariamente indisponíveis.']
];

async function login(page) {
    await page.goto('/login.html');
    await page.getByLabel('E-mail').fill('aluno.e2e@example.test');
    await page.getByLabel('Senha').fill(password);
    const response = page.waitForResponse((item) => item.url().endsWith('/api/auth/login'));
    await page.getByRole('button', { name: 'Entrar' }).click();
    expect((await response).status()).toBe(200);
}

test('@full API errors stay safe and a certificate-list failure leaves the course screen usable', async ({ browser }) => {
    for (const [status, statusMessage, listMessage] of cases) {
        const context = await browser.newContext();
        const page = await context.newPage();
        const uncaught = [];
        page.on('pageerror', (error) => uncaught.push(error.message));
        await page.route('https://**/*', (route) => route.abort());
        await page.route('**/api/certificados/meus', (route) => route.fulfill({
            status,
            contentType: 'application/json',
            body: JSON.stringify(errorBody)
        }));
        await login(page);
        await page.goto('/meus-certificados.html?id_turma=1');

        if (status === 401) {
            await expect(page).toHaveURL(/login\.html\?motivo=auth/);
        } else {
            await expect(page.getByRole('heading', { name: /Certificado/ })).toBeVisible();
            await expect(page.getByRole('navigation', { name: 'Áreas do curso' })).toBeVisible();
            await expect(page.locator('#lista-certificados')).toContainText(listMessage);
            await expect(page.locator('#mensagem-certificados')).toContainText(statusMessage);
            const visibleText = await page.locator('body').innerText();
            expect(visibleText).not.toContain('INTERNAL_TEST_SENTINEL');
            expect(visibleText).not.toContain('INTERNAL_TEST_STACK');
            expect(visibleText).not.toMatch(/at \/srv\/private\//);
        }
        expect(uncaught).toEqual([]);
        await context.close();
    }
});
