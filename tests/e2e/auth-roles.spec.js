const { test, expect } = require('@playwright/test');

// Keep session-bearing traces disabled: the failure screenshot and assertion
// output are sufficient here and cannot contain the disposable auth cookie.
test.use({ trace: 'off' });

const TEST_PASSWORD = 'E2e-only-password-42!';
const accounts = [
    { email: 'aluno.e2e@example.test', route: '/sala-virtual.html', area: /sala virtual|turmas/i },
    { email: 'professor.e2e@example.test', route: '/professor.html', area: /professor|turmas/i },
    { email: 'admin.e2e@example.test', route: '/admin.html', area: /admin|painel/i }
];

test('@smoke login, sessão e área privada funcionam para os três perfis', async ({ browser }) => {
    for (const account of accounts) {
        const context = await browser.newContext({ baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:3400' });
        const page = await context.newPage();
        await page.route('https://**/*', (route) => route.abort());
        await page.goto('/login.html');
        await page.getByLabel('E-mail').fill(account.email);
        await page.getByLabel('Senha').fill(TEST_PASSWORD);
        const loginResponse = page.waitForResponse((response) => response.url().endsWith('/api/auth/login'));
        await page.getByRole('button', { name: 'Entrar' }).click();
        const response = await loginResponse;
        expect(response.status(), account.email).toBe(200);
        await expect(page).toHaveURL(new URL(account.route, page.url()).toString());
        await page.waitForLoadState('load');
        const role = account.email.split('.')[0];
        await expect(page.locator('body')).toHaveAttribute('data-session-state', role);

        const cookies = await context.cookies();
        const sessionCookie = cookies.find((cookie) => cookie.httpOnly);
        expect(sessionCookie, 'sessão deve usar cookie HttpOnly').toBeTruthy();
        expect(sessionCookie.sameSite).toBe('Lax');
        const session = await page.request.get('/api/auth/me');
        expect(session.status()).toBe(200);

        const protectedResponse = await page.goto(account.route, { waitUntil: 'commit' });
        expect(protectedResponse.status()).toBe(200);
        await expect(page.locator('body')).toHaveAttribute('data-session-state', role);
        await context.close();
    }
});

test('@smoke acesso a rota de admin sem sessão é barrado', async ({ request }) => {
    const response = await request.get('/api/admin/metrics');
    expect([401, 403]).toContain(response.status());
});

test('@full senha incorreta não cria sessão', async ({ page, context }) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.goto('/login.html');
    await page.getByLabel('E-mail').fill('aluno.e2e@example.test');
    await page.getByLabel('Senha').fill('wrong-e2e-password');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('alert')).toContainText(/inválid|falha/i);
    expect((await context.cookies()).some((cookie) => cookie.httpOnly)).toBe(false);
});

test('@full CSRF blocks missing token and permits logout with the session token', async ({ page }) => {
    await page.route('https://**/*', (route) => route.abort());
    await page.goto('/login.html');
    await page.getByLabel('E-mail').fill('aluno.e2e@example.test');
    await page.getByLabel('Senha').fill(TEST_PASSWORD);
    const loginResponse = page.waitForResponse((response) => response.url().endsWith('/api/auth/login'));
    await page.getByRole('button', { name: 'Entrar' }).click();
    expect((await loginResponse).status()).toBe(200);
    await expect(page).toHaveURL(/sala-virtual\.html$/);
    await page.waitForLoadState('load');
    await expect(page.locator('body')).toHaveAttribute('data-session-state', 'aluno');

    const rejectedStatus = await page.evaluate(async () => (
        await fetch('/api/auth/logout', { method: 'POST' })
    ).status);
    expect(rejectedStatus).toBe(403);
    const csrf = await page.evaluate(async () => {
        const response = await fetch('/api/auth/csrf');
        return response.json();
    });
    expect(csrf.csrf_token).toBeTruthy();
    const loggedOutStatus = await page.evaluate(async (token) => (
        await fetch('/api/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': token } })
    ).status, csrf.csrf_token);
    expect(loggedOutStatus).toBe(204);
    expect((await page.request.get('/api/auth/me')).status()).toBe(401);
});
