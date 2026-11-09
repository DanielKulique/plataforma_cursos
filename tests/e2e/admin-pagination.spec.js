const { test, expect } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function fixture(mode) {
    const project = process.env.E2E_COMPOSE_PROJECT;
    if (!/^plataforma-cursos-e2e-\d+$/.test(project || '')) throw new Error('Disposable E2E project required.');
    execFileSync('docker', ['compose', '--project-name', project, '--file', 'compose.e2e.yaml',
        'exec', '-T', 'app', 'node', '-', mode], {
        input: fs.readFileSync(path.join(__dirname, 'fixtures/admin-pagination.js')), stdio: ['pipe', 'inherit', 'inherit']
    });
}

test.beforeAll(() => fixture('seed'));
test.afterAll(() => fixture('cleanup'));

async function login(page, email = 'admin.e2e@example.test') {
    await page.goto('/login.html');
    await page.getByLabel('E-mail', { exact: true }).fill(email);
    await page.getByLabel('Senha', { exact: true }).fill('E2e-only-password-42!');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await expect(page.locator('body')).toHaveAttribute('data-session-state', email.startsWith('admin') ? 'admin' : 'professor');
}

async function search(page, label, value) {
    const input = page.getByRole('searchbox', { name: label, exact: true });
    await input.fill(value);
    await input.press('Enter');
}

test('@full admin records beyond first 100 are searchable', async ({ page }) => {
    await login(page);
    const nav = page.getByRole('navigation', { name: 'Paginação de usuários', exact: true });
    await expect(nav).toContainText('125 registros');
    await search(page, 'Buscar usuários', 'Lab Paginação Professor 101');
    await expect(page.getByRole('row', { name: /Lab Paginação Professor 101/ })).toHaveCount(1);
    await expect(nav).toContainText('· 1 registro');
    await page.getByRole('button', { name: 'Editar usuário Lab Paginação Professor 101', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Editar usuário', exact: true });
    await dialog.getByLabel(/^Nome completo\s/).fill('Lab Paginação Professor 101 atualizado');
    await dialog.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByRole('row', { name: /101 atualizado/ })).toHaveCount(1);
    await page.getByLabel('Filtrar por', { exact: true }).selectOption('ADMIN');
    await expect(page.getByText('Nenhum resultado', { exact: true })).toBeVisible();
    await expect(nav).toContainText('0 registros');
    await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
    await page.getByLabel('Filtrar por', { exact: true }).selectOption('PROFESSOR');
    await expect(nav).toContainText('121 registros');
    const emails = [];
    for (let pageNumber = 1; pageNumber <= 5; pageNumber++) {
        await expect(nav).toContainText(`Página ${pageNumber} de 5`);
        emails.push(...await page.locator('.admin-table tbody tr td:nth-child(2)').allTextContents());
        if (pageNumber < 5) {
            const next = nav.getByRole('button', { name: 'Próxima página de usuários' });
            await next.focus();
            await next.press('Enter');
        }
    }
    expect(emails).toHaveLength(121);
    expect(new Set(emails).size).toBe(121);
    expect(emails).toContain('prof101@pagination.example.test');
    await expect(nav.getByRole('button', { name: 'Próxima página de usuários' })).toBeDisabled();
    await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
    await search(page, 'Buscar usuários', 'remove@pagination.example.test');
    await page.getByRole('button', { name: 'Excluir usuário Lab Paginação Usuário descartável', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Excluir usuário', exact: true }).click();
    await expect(page.getByText('Nenhum resultado', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
    await expect(nav).toContainText('124 registros');
});

test('@full admin classes and professor selection cover all pages', async ({ page }) => {
    await login(page);
    await page.getByRole('tab', { name: 'Turmas', exact: true }).click();
    const nav = page.getByRole('navigation', { name: 'Paginação de turmas', exact: true });
    await expect(nav).toContainText('125 registros');
    const names = [];
    for (let number = 1; number <= 5; number++) {
        await expect(nav).toContainText(`Página ${number} de 5`);
        names.push(...await page.locator('.admin-table tbody tr td:first-child').allTextContents());
        if (number < 5) await nav.getByRole('button', { name: 'Próxima página de turmas' }).click();
    }
    expect(names).toHaveLength(125);
    expect(new Set(names).size).toBe(125);
    expect(names).toContain('Lab Paginação Turma 101');
    await search(page, 'Buscar turmas', 'Lab Paginação Turma 101');
    await expect(nav).toContainText('Página 1 de 1 · 1 registro');
    await page.getByLabel('Filtrar por', { exact: true }).selectOption('ABERTA');
    await expect(page.getByText('Nenhum resultado', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
    await search(page, 'Buscar turmas', 'Lab Paginação Turma');
    await page.getByLabel('Filtrar por', { exact: true }).selectOption('ENCERRADA');
    await expect(nav).toContainText('41 registros');
    await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
    await search(page, 'Buscar turmas', 'Lab Paginação Professor 101');
    await expect(nav).toContainText('· 1 registro');
    await page.getByRole('button', { name: 'Editar turma Lab Paginação Turma 101', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'Editar turma', exact: true });
    await expect(dialog.getByLabel(/^Professor\s/).locator('option:checked')).toContainText('101');
    await expect(dialog.getByRole('navigation', { name: 'Paginação de professores' })).toContainText('121 registros');
    await expect(dialog.getByLabel(/^Professor\s/).locator('option:checked')).toContainText('101');
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Replicar estrutura da turma Lab Paginação Turma 101', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Replicar estrutura da turma', exact: true });
    await search(dialog, 'Buscar professores', 'prof101@pagination.example.test');
    await expect(dialog.getByRole('navigation', { name: 'Paginação de professores' })).toContainText('· 1 registro');
    await dialog.getByRole('button', { name: /Professor 101.*prof101@pagination.example.test/ }).click();
    await dialog.getByLabel(/^Professor responsável\s/).selectOption(
        await dialog.getByLabel(/^Professor responsável\s/).locator('option').last().getAttribute('value'));
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
    await page.getByRole('button', { name: 'Nova turma', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Criar turma', exact: true });
    const professors = dialog.getByRole('navigation', { name: 'Paginação de professores' });
    await expect(professors).toContainText('121 registros');
    await professors.getByRole('button', { name: 'Próxima página de professores' }).click();
    await expect(professors).toContainText('Página 2 de 5');
    await search(dialog, 'Buscar professores', 'prof101@pagination.example.test');
    await expect(professors).toContainText('Página 1 de 1 · 1 registro');
    const direct = dialog.getByRole('button', { name: /Professor 101.*prof101@pagination.example.test/ });
    await direct.focus(); await direct.press('Enter');
    await expect(direct).toHaveAttribute('aria-pressed', 'true');
    const select = dialog.getByLabel(/^Professor\s/);
    const id = await select.locator('option').last().getAttribute('value');
    await expect(select).toHaveValue(id);
    expect((await direct.boundingBox()).y).toBeGreaterThan((await dialog.getByRole('searchbox', { name: 'Buscar professores', exact: true }).boundingBox()).y);
    await dialog.getByLabel(/^Nome da turma\s/).fill('Lab Paginação Turma 999');
    await dialog.getByLabel(/^Curso\s/).selectOption({ label: 'Curso E2E' });
    await dialog.getByLabel(/^Data inicial\s/).fill('2010-01-01');
    await dialog.getByRole('button', { name: 'Criar turma', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(nav).toContainText('126 registros');
    for (let number = 2; number <= 6; number++) {
        await nav.getByRole('button', { name: 'Próxima página de turmas' }).click();
        await expect(nav).toContainText(`Página ${number} de 6`);
    }
    await expect(page.getByRole('row', { name: /Lab Paginação Turma 999/ })).toContainText('Professor 101');
    await page.getByRole('button', { name: 'Editar turma Lab Paginação Turma 999', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Editar turma', exact: true });
    await dialog.getByLabel(/^Nome da turma\s/).fill('Lab Paginação Turma 999 editada');
    await dialog.getByRole('button', { name: 'Salvar alterações' }).click();
    await expect(page.getByRole('row', { name: /Lab Paginação Turma 999 editada/ })).toHaveCount(1);
    await expect(nav).toContainText('Página 6 de 6');
    await page.getByRole('button', { name: 'Excluir turma Lab Paginação Turma 999 editada', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Excluir turma', exact: true }).click();
    await expect(nav).toContainText('Página 5 de 5 · 125 registros');
});

test('@full admin pagination loading errors empty states and mobile controls', async ({ page }, testInfo) => {
    await login(page);
    await page.route('**/api/admin/usuarios?**', route => route.fulfill({ status: 503, json: { message: 'Laboratório temporariamente indisponível' } }), { times: 1 });
    await search(page, 'Buscar usuários', 'Lab');
    await expect(page.getByRole('alert')).toContainText('Não foi possível');
    await expect(page.getByRole('alert')).not.toContainText('HTTP');
    await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Paginação de usuários' })).toBeVisible();
    await search(page, 'Buscar usuários', 'não-existe-pagination');
    await expect(page.getByText('Nenhum resultado', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route('**/api/admin/usuarios?**', async route => {
        const response = await route.fetch();
        await gate;
        await route.fulfill({ response });
    }, { times: 1 });
    await search(page, 'Buscar usuários', 'Lab');
    await expect(page.locator('#admin-panel-content')).toHaveAttribute('aria-busy', 'true');
    await page.getByRole('tab', { name: 'Turmas', exact: true }).click();
    await expect(page.getByRole('navigation', { name: 'Paginação de turmas' })).toBeVisible();
    release();
    await expect(page.getByRole('tab', { name: 'Turmas', exact: true })).toHaveAttribute('aria-selected', 'true');
    for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2)).toBe(true);
        const nav = page.getByRole('navigation', { name: 'Paginação de turmas' });
        const navBounds = await nav.boundingBox();
        for (const child of await nav.locator(':scope > *').all()) {
            const bounds = await child.boundingBox();
            expect(bounds.y + bounds.height).toBeLessThanOrEqual(navBounds.y + navBounds.height + 1);
        }
        for (const button of await nav.getByRole('button').all()) {
            await expect(button).toHaveCSS('min-block-size', '44px');
            // Firefox can report 43.99993896484375 for a CSS minimum of 44px.
            // Allow at most 0.01px of measurement rounding, keeping the CSS requirement.
            expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44 - 0.01);
        }
        await page.screenshot({ path: testInfo.outputPath(`admin-${width}.png`) });
    }
    await page.setViewportSize({ width: 320, height: 900 });
    await page.getByRole('button', { name: 'Nova turma', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Criar turma', exact: true });
    await page.route('**/api/admin/usuarios?**', route => route.fulfill({ status: 503, json: { message: 'Falha de laboratório' } }), { times: 1 });
    await search(dialog, 'Buscar professores', 'no-professor-pagination-result');
    await expect(dialog.getByRole('alert')).toContainText('Não foi possível carregar professores');
    await dialog.getByRole('button', { name: 'Tentar novamente professores', exact: true }).click();
    await expect(dialog.getByText('Nenhum professor encontrado.', { exact: true })).toBeVisible();
    await search(dialog, 'Buscar professores', 'prof101@pagination.example.test');
    await expect(dialog.getByRole('navigation', { name: 'Paginação de professores' })).toContainText('· 1 registro');
    const bounds = await dialog.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(322);
    await page.screenshot({ path: testInfo.outputPath('professor-320.png') });
    await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
});

test('@full admin pagination backend filters and authorization remain enforced', async ({ page, browser }) => {
    await login(page);
    for (const url of ['/api/admin/usuarios?q=%25', '/api/admin/usuarios?q=%27%20OR%201%3D1--', '/api/turmas?q=%25']) {
        const response = await page.request.get(url);
        expect(response.status()).toBe(200);
        expect((await response.json()).total).toBe(0);
    }
    expect((await page.request.get('/api/admin/usuarios?tipo=INVALIDO')).status()).toBe(400);
    expect((await page.request.get('/api/turmas?status=INVALIDO')).status()).toBe(400);
    const admin = (await (await page.request.get('/api/admin/usuarios?tipo=ADMIN')).json()).items[0];
    expect(await page.evaluate(async id => {
        const { authenticatedFetch } = await import('/js/auth.js');
        return (await authenticatedFetch('/api/turmas/1', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id_professor: id }) })).status;
    }, admin.id_usuario)).toBe(409);
    expect((await page.request.patch('/api/turmas/1', { data: { status: 'ABERTA' } })).status()).toBe(403);
    const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3400';
    const anonymous = await browser.newContext({ baseURL });
    expect((await anonymous.request.get('http://127.0.0.1:3400/api/admin/usuarios?page=2&tipo=PROFESSOR')).status()).toBe(401);
    await anonymous.close();
    const professor = await browser.newContext({ baseURL });
    const other = await professor.newPage();
    await login(other, 'professor.e2e@example.test');
    expect((await other.request.get('/api/admin/usuarios?page=2&tipo=PROFESSOR')).status()).toBe(403);
    await professor.close();
});
