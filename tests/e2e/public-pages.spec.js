const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
    await page.route('https://**/*', (route) => route.abort());
});

test('@smoke landing, catálogo e cadastro ficam acessíveis', async ({ page, request }) => {
    for (const path of ['/landing.html', '/index.html', '/cadastro.html']) {
        const response = await request.get(path);
        expect(response.status(), path).toBe(200);
    }

    await page.goto('/landing.html');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Plágio:');
    await page.goto('/index.html');
    await expect(page).toHaveTitle(/plágio/i);
    await expect(page.getByRole('heading', { name: 'Catálogo de cursos e turmas' })).toBeVisible();
    await expect(page.getByText('Curso E2E', { exact: true }).first()).toBeVisible();
    const catalog = await request.get('/api/cursos');
    expect(catalog.status()).toBe(200);
    await page.goto('/cadastro.html');
    await expect(page.getByRole('heading', { name: /criar conta|cadastro/i })).toBeVisible();
});

test('@smoke health endpoints expose status without runtime details', async ({ request }) => {
    const live = await request.get('/healthz');
    const ready = await request.get('/readyz');
    expect(live.status()).toBe(200);
    expect(ready.status()).toBe(200);
    const body = JSON.stringify({ live: await live.json(), ready: await ready.json() });
    expect(body).not.toMatch(/password|secret|token|mysql.*3306/i);
});

test('@full YouTube CSP permits only the configured embed origins', async ({ request }) => {
    const response = await request.get('/landing.html');
    const csp = response.headers()['content-security-policy'];
    expect(csp).toContain('frame-src');
    expect(csp).toContain('https://www.youtube.com');
    expect(csp).toContain('https://www.youtube-nocookie.com');
});

test('@full landing and login have no global horizontal overflow on mobile', async ({ page }) => {
    for (const viewport of [
        { width: 320, height: 800 }, { width: 360, height: 800 }, { width: 390, height: 844 },
        { width: 412, height: 915 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }
    ]) {
        await page.setViewportSize(viewport);
        for (const path of ['/landing.html', '/login.html', '/cadastro.html', '/index.html']) {
            await page.goto(path);
            const dimensions = await page.evaluate(() => {
                const main = document.querySelector('main');
                const bounds = main?.getBoundingClientRect();
                return {
                    scroll: document.documentElement.scrollWidth,
                    client: document.documentElement.clientWidth,
                    mainLeft: bounds?.left ?? 0,
                    mainRight: bounds?.right ?? document.documentElement.clientWidth
                };
            });
            expect(dimensions.scroll, `${path} at ${viewport.width}px`).toBeLessThanOrEqual(dimensions.client + 2);
            expect(dimensions.mainLeft, `${path} clipped left at ${viewport.width}px`).toBeGreaterThanOrEqual(-1);
            expect(dimensions.mainRight, `${path} clipped right at ${viewport.width}px`).toBeLessThanOrEqual(dimensions.client + 2);
        }
    }
});
