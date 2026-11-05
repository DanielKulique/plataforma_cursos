const { test, expect } = require('@playwright/test');

test.use({ trace: 'off' });

const password = 'E2e-only-password-42!';
const viewports = [
    { width: 320, height: 800 }, { width: 360, height: 800 }, { width: 390, height: 844 },
    { width: 412, height: 915 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }
];

async function login(page, email) {
    await page.goto('/login.html');
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha').fill(password);
    const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/auth/login'));
    await page.getByRole('button', { name: 'Entrar' }).click();
    expect((await responsePromise).status()).toBe(200);
    const destination = email.startsWith('aluno.') ? 'sala-virtual' : email.startsWith('professor.') ? 'professor.html' : 'admin.html';
    await expect(page).toHaveURL(new RegExp(destination));
    await page.waitForLoadState('load');
    await expect(page.locator('body')).toHaveAttribute('data-session-state', email.split('.')[0]);
}

async function expectNoHorizontalOverflow(page, path, viewport) {
    await page.goto(path);
    await expect(page.locator('body')).not.toHaveAttribute('data-session-state', 'loading');
    const width = await page.evaluate(() => {
        const main = document.querySelector('main');
        const bounds = main?.getBoundingClientRect();
        return {
            scroll: document.documentElement.scrollWidth,
            client: document.documentElement.clientWidth,
            mainLeft: bounds?.left ?? 0,
            mainRight: bounds?.right ?? document.documentElement.clientWidth
        };
    });
    expect(width.scroll, `${path} at ${viewport.width}px`).toBeLessThanOrEqual(width.client + 2);
    expect(width.mainLeft, `${path} clipped at the left edge at ${viewport.width}px`).toBeGreaterThanOrEqual(-1);
    expect(width.mainRight, `${path} clipped at the right edge at ${viewport.width}px`).toBeLessThanOrEqual(width.client + 2);
}

test('@full responsive learner, professor and admin screens fit six viewports', async ({ browser }) => {
    test.setTimeout(120_000);
    const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3400';
    const scenarios = [
        {
            email: 'aluno.e2e@example.test',
            pages: [
                '/sala-virtual.html', '/sala-aula.html?id_turma=1', '/sala-aulas.html?id_turma=1',
                '/sala-aula-detalhe.html?id_turma=1&id_aula=1', '/sala-avaliacoes.html?id_turma=1',
                '/sala-progresso.html?id_turma=1', '/meus-certificados.html?id_turma=1'
            ]
        },
        {
            email: 'professor.e2e@example.test',
            pages: [
                '/professor.html', '/professor-turma.html?id_turma=1',
                '/professor-turma-aulas.html?id_turma=1', '/professor-turma-avaliacoes.html?id_turma=1',
                '/professor-turma-certificados.html?id_turma=1'
            ]
        },
        { email: 'admin.e2e@example.test', pages: ['/admin.html'] }
    ];
    for (const scenario of scenarios) {
        const context = await browser.newContext({ baseURL, viewport: viewports[0] });
        const page = await context.newPage();
        await page.route('https://**/*', (route) => route.abort());
        await login(page, scenario.email);
        for (const viewport of viewports) {
            await page.setViewportSize(viewport);
            for (const path of scenario.pages) await expectNoHorizontalOverflow(page, path, viewport);
        }
        await context.close();
    }
});
