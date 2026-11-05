const { test, expect } = require('@playwright/test');

test.use({ trace: 'off' });

const password = 'E2e-only-password-42!';
const protectedPages = [
    {
        roles: ['ALUNO'],
        paths: [
            '/sala-virtual.html', '/sala-aula.html?id_turma=1', '/sala-aulas.html?id_turma=1',
            '/sala-aula-detalhe.html?id_turma=1&id_aula=1', '/sala-avaliacoes.html?id_turma=1',
            '/sala-progresso.html?id_turma=1', '/meus-certificados.html?id_turma=1'
        ]
    },
    { roles: ['PROFESSOR'], paths: ['/professor.html'] },
    {
        roles: ['PROFESSOR', 'ADMIN'],
        paths: [
            '/professor-turma.html?id_turma=1', '/professor-turma-aulas.html?id_turma=1',
            '/professor-turma-avaliacoes.html?id_turma=1', '/professor-turma-certificados.html?id_turma=1'
        ]
    },
    { roles: ['ADMIN'], paths: ['/admin.html'] }
];
const users = {
    ALUNO: 'aluno.e2e@example.test',
    PROFESSOR: 'professor.e2e@example.test',
    ADMIN: 'admin.e2e@example.test'
};

async function login(page, email) {
    await page.goto('/login.html');
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha').fill(password);
    const response = page.waitForResponse((item) => item.url().endsWith('/api/auth/login'));
    await page.getByRole('button', { name: 'Entrar' }).click();
    expect((await response).status()).toBe(200);
    const destination = email.startsWith('aluno.') ? 'sala-virtual' : email.startsWith('professor.') ? 'professor.html' : 'admin.html';
    await expect(page).toHaveURL(new RegExp(destination));
    await page.waitForLoadState('load');
    await expect(page.locator('body')).toHaveAttribute('data-session-state', email.split('.')[0]);
}

test('@full private learner, teacher and admin pages enforce the role matrix in browser navigation', async ({ browser }) => {
    test.setTimeout(90_000);
    const roleCases = [
        ['PUBLIC', null], ['ALUNO', users.ALUNO], ['PROFESSOR', users.PROFESSOR], ['ADMIN', users.ADMIN]
    ];

    for (const [role, email] of roleCases) {
        const context = await browser.newContext();
        await context.route('https://**/*', (route) => route.abort());
        if (email) {
            const loginPage = await context.newPage();
            await login(loginPage, email);
            await loginPage.close();
        }

        for (const group of protectedPages) {
            for (const path of group.paths) await test.step(`${role} ${path}`, async () => {
                // Each matrix cell starts in a fresh document. Reusing the page
                // races pending course loads and redirects from the previous cell.
                const page = await context.newPage();
                // Session checks may redirect before this document finishes loading.
                // Observe its commit, then await the asserted final destination below.
                await page.goto(path, { waitUntil: 'commit' });
                const allowed = group.roles.includes(role);
                if (role === 'PUBLIC') {
                    await expect(page).toHaveURL(/login\.html\?motivo=auth/);
                } else if (allowed) {
                    await expect(page).toHaveURL(new RegExp(path.split('?')[0].replaceAll('.', '\\.')));
                    await expect(page.locator('body')).toHaveAttribute('data-session-state', role.toLowerCase());
                } else {
                    await expect(page).toHaveURL(/index\.html\?motivo=nao_autorizado/);
                }
                await page.waitForLoadState('load');
                if (role === 'PUBLIC') await expect(page.getByLabel('E-mail')).toBeVisible();
                await page.close();
            });
        }
        await context.close();
    }
});
