'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

const playwrightModule = process.env.PLAYWRIGHT_MODULE_PATH || 'playwright';
// O Playwright pode ser instalado temporariamente fora do projeto para não alterar
// as dependências de produção apenas por causa da documentação visual.
const { firefox } = require(playwrightModule);

const VIEWPORTS = Object.freeze({
    desktop: { width: 1440, height: 1000, deviceScaleFactor: 1 },
    mobile: { width: 412, height: 915, deviceScaleFactor: 1 }
});

function readCredentials() {
    assert.equal(process.env.SCREENSHOT_CREDENTIALS_STDIN, '1',
        'Use SCREENSHOT_CREDENTIALS_STDIN=1 e forneça as credenciais pela entrada padrão.');
    return new Promise((resolve, reject) => {
        const chunks = [];
        process.stdin.on('data', (chunk) => chunks.push(chunk));
        process.stdin.on('end', () => resolve(dotenv.parse(Buffer.concat(chunks))));
        process.stdin.on('error', reject);
    });
}

function requireCredential(credentials, name) {
    const value = String(credentials[name] || '').trim();
    assert(value, `Credencial ausente: ${name}.`);
    return value;
}

function sanitizeJson(value, parent = {}) {
    if (Array.isArray(value)) return value.map((item) => sanitizeJson(item, parent));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
        const normalized = key.toLowerCase();
        if (normalized.includes('email')) return [key, 'usuario.exemplo@example.test'];
        if (normalized.includes('cpf')) return [key, '000.000.000-00'];
        if (normalized.includes('telefone') || normalized.includes('celular')) return [key, '(00) 00000-0000'];
        if (normalized.includes('endereco') || normalized.includes('logradouro')) return [key, 'Endereço omitido'];
        if (typeof item === 'string' && ['aluno', 'aluno_nome', 'nome_aluno'].includes(normalized)) {
            return [key, 'Pessoa Aluna'];
        }
        if (typeof item === 'string' && ['professor', 'professor_nome', 'nome_professor'].includes(normalized)) {
            return [key, 'Pessoa Professora'];
        }
        if (normalized === 'nome_completo') {
            const role = String(value.tipo || value.role || parent.tipo || parent.role || '').toUpperCase();
            const label = role === 'ADMIN' ? 'Pessoa Administradora'
                : role === 'PROFESSOR' ? 'Pessoa Professora' : 'Pessoa Aluna';
            return [key, label];
        }
        return [key, sanitizeJson(item, value)];
    }));
}

async function installPrivacyRedaction(context) {
    await context.route('**/api/**', async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        const response = await route.fetch({
            headers: { ...route.request().headers(), 'accept-encoding': 'identity' }
        });
        const contentType = String(response.headers()['content-type'] || '');
        if (!contentType.includes('application/json')) return route.fulfill({ response });
        const payload = await response.json().catch(() => null);
        if (payload === null) return route.fulfill({ response });
        const headers = Object.fromEntries(Object.entries(response.headers()).filter(([name]) =>
            !['content-encoding', 'content-length', 'transfer-encoding'].includes(name.toLowerCase())));
        headers['content-type'] = 'application/json; charset=utf-8';
        return route.fulfill({
            status: response.status(),
            headers,
            body: JSON.stringify(sanitizeJson(payload))
        });
    });
}

async function redactRenderedPage(page, credentialValues) {
    await page.evaluate((values) => {
        const replacements = [
            [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, 'usuario.exemplo@example.test'],
            [/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '000.000.000-00'],
            [/\(?\d{2}\)?\s?\d{4,5}-?\d{4}\b/g, '(00) 00000-0000']
        ];
        const secrets = values
            .filter((value) => String(value || '').length >= 8)
            .map((value) => String(value));
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach((node) => {
            let text = node.nodeValue;
            replacements.forEach(([pattern, replacement]) => { text = text.replace(pattern, replacement); });
            secrets.forEach((secret) => { text = text.split(secret).join('[dado omitido]'); });
            node.nodeValue = text;
        });
        document.querySelectorAll('input').forEach((input) => {
            if (input.type === 'password') input.value = '';
            if (input.type === 'email' && input.value) input.value = 'usuario.exemplo@example.test';
        });
    }, credentialValues);
}

async function waitForStablePage(page) {
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => document.body?.dataset.sessionState !== 'loading', null, {
        timeout: 12_000
    }).catch(() => undefined);
    await page.waitForFunction(() => ![...document.querySelectorAll('[aria-busy="true"]')]
        .some((element) => element.offsetParent !== null), null, { timeout: 12_000 }).catch(() => undefined);
    await page.evaluate(async () => {
        const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
        for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight) {
            window.scrollTo(0, y);
            await delay(40);
        }
        window.scrollTo(0, 0);
        if (document.fonts?.ready) await document.fonts.ready;
        await Promise.race([
            Promise.all([...document.images]
                .filter((image) => !image.complete)
                .map((image) => new Promise((resolve) => {
                    image.addEventListener('load', resolve, { once: true });
                    image.addEventListener('error', resolve, { once: true });
                }))),
            delay(2_000)
        ]);
    }).catch(() => undefined);
    await page.waitForTimeout(350);
}

async function login(context, baseUrl, email, password, expectedRole) {
    const response = await context.request.post(`${baseUrl}/api/auth/login`, {
        data: { email, senha: password }
    });
    const payload = await response.json().catch(() => ({}));
    assert(response.ok(), `Login ${expectedRole} falhou com HTTP ${response.status()}.`);
    assert.equal(payload.usuario?.tipo, expectedRole, `Papel inesperado no login ${expectedRole}.`);
    return payload.usuario;
}

async function discoverDemoClass(context, baseUrl) {
    const response = await context.request.get(`${baseUrl}/api/matriculas/minha-sala`);
    assert(response.ok(), `Não foi possível descobrir a turma demo: HTTP ${response.status()}.`);
    const payload = await response.json();
    const turma = (payload.turmas || []).find((item) => item.nome_turma === 'Turma Demo Staging')
        || payload.turmas?.[0];
    assert(turma?.id_turma, 'Nenhuma turma disponível para as capturas acadêmicas.');
    return Number(turma.id_turma);
}

function publicSurfaces(certificateCode) {
    const surfaces = [
        ['01-publico-landing', '/landing.html'],
        ['02-publico-inicio', '/index.html'],
        ['03-publico-login', '/login.html'],
        ['04-publico-cadastro', '/cadastro.html'],
        ['05-publico-recuperar-senha', '/recuperar-senha.html'],
        ['06-publico-redefinir-senha-sem-token', '/redefinir-senha.html'],
        ['07-publico-confirmar-email', '/verificar-email.html'],
        ['08-institucional-sobre', '/sobre.html'],
        ['09-institucional-equipe', '/equipe.html'],
        ['10-institucional-parceiros', '/parceiros.html'],
        ['11-institucional-materiais', '/materiais.html'],
        ['12-institucional-cartilha', '/cartilha.html'],
        ['13-institucional-perguntas-frequentes', '/perguntas-frequentes.html'],
        ['14-certificados-validacao', '/certificados/validar']
    ];
    if (certificateCode) {
        surfaces.push([
            '15-certificados-resultado-revogado',
            `/certificados/validar/${encodeURIComponent(certificateCode)}`
        ]);
    }
    return surfaces.map(([name, route]) => ({ name, route, area: 'Público' }));
}

function studentSurfaces(turmaId) {
    return [
        { name: '20-aluno-inicio-e-catalogo', route: '/index.html' },
        { name: '21-aluno-sala-virtual-e-certificados', route: '/sala-virtual.html' },
        { name: '22-aluno-sala-de-aula', route: `/sala-aula.html?id_turma=${turmaId}` },
        { name: '23-aluno-questionario-exercicio', route: `/questionario.html?tipo=exercicio&id_turma=${turmaId}` },
        { name: '24-aluno-questionario-prova', route: `/questionario.html?tipo=prova&id_turma=${turmaId}` },
        { name: '25-aluno-verificador-contextual', route: '/verificador.html' }
    ].map((surface) => ({ ...surface, area: 'Aluno' }));
}

function teacherSurfaces(turmaId) {
    const classRoute = `/professor-turma.html?id_turma=${turmaId}`;
    return [
        { name: '30-professor-minhas-turmas', route: '/professor.html' },
        { name: '31-professor-gestao-da-turma', route: classRoute },
        {
            name: '32-professor-modal-editar-matricula', route: classRoute,
            prepare: async (page) => page.getByRole('button', { name: /Editar nota e situação acadêmica/i }).first().click()
        },
        { name: '33-professor-modal-novo-modulo', route: classRoute, prepare: async (page) => page.locator('#novo-modulo').click() },
        { name: '34-professor-modal-novo-conteudo', route: classRoute, prepare: async (page) => page.locator('#novo-conteudo').click() },
        { name: '35-professor-modal-novo-questionario', route: classRoute, prepare: async (page) => page.locator('#novo-questionario').click() }
    ].map((surface) => ({ ...surface, area: 'Professor' }));
}

function adminSurfaces(turmaId) {
    const waitAdmin = (page) => page.locator('#admin-root[aria-busy="false"]').waitFor({ timeout: 12_000 });
    return [
        { name: '40-admin-usuarios', route: '/admin.html' },
        {
            name: '41-admin-cursos', route: '/admin.html', prepare: async (page) => {
                await page.locator('#admin-tab-cursos').click();
                await waitAdmin(page);
            }
        },
        {
            name: '42-admin-turmas', route: '/admin.html', prepare: async (page) => {
                await page.locator('#admin-tab-turmas').click();
                await waitAdmin(page);
            }
        },
        { name: '43-admin-visao-da-turma', route: `/professor-turma.html?id_turma=${turmaId}` }
    ].map((surface) => ({ ...surface, area: 'Administrador' }));
}

async function captureSurface(context, baseUrl, outputRoot, viewportName, surface, credentialValues) {
    const page = await context.newPage();
    const browserErrors = [];
    page.on('pageerror', (error) => browserErrors.push(error.message));
    try {
        const response = await page.goto(`${baseUrl}${surface.route}`, {
            waitUntil: 'domcontentloaded',
            timeout: 30_000
        });
        assert(response && response.status() < 500,
            `${surface.route} respondeu HTTP ${response?.status() || 'desconhecido'}.`);
        await waitForStablePage(page);
        if (surface.prepare) {
            await surface.prepare(page);
            await waitForStablePage(page);
        }
        await redactRenderedPage(page, credentialValues);
        await page.addStyleTag({
            content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'
        });
        await page.evaluate(() => window.scrollTo(0, 0));
        const relativeFile = path.join(viewportName, `${surface.name}.png`);
        const absoluteFile = path.join(outputRoot, relativeFile);
        await page.screenshot({ path: absoluteFile, fullPage: true, animations: 'disabled' });
        const dimensions = await page.evaluate(() => ({
            width: document.documentElement.scrollWidth,
            height: document.documentElement.scrollHeight
        }));
        return {
            area: surface.area,
            viewport: viewportName,
            name: surface.name,
            route: surface.route,
            finalUrl: page.url().replace(baseUrl, ''),
            title: await page.title(),
            file: relativeFile,
            dimensions,
            browserErrors
        };
    } finally {
        await page.close();
    }
}

async function captureGroup(context, baseUrl, outputRoot, viewportName, surfaces, manifest, credentialValues) {
    for (const surface of surfaces) {
        const result = await captureSurface(
            context,
            baseUrl,
            outputRoot,
            viewportName,
            surface,
            credentialValues
        );
        manifest.push(result);
        process.stdout.write(`CAPTURED ${viewportName}/${surface.name}.png\n`);
    }
}

async function main() {
    const credentials = await readCredentials();
    const baseUrl = String(process.env.STAGING_BASE_URL || '').replace(/\/$/, '');
    assert(baseUrl.startsWith('https://'), 'STAGING_BASE_URL deve usar HTTPS.');
    const outputRoot = path.resolve(process.argv[2] || 'docs/screenshots/plataforma-completa');
    fs.mkdirSync(outputRoot, { recursive: true });

    const httpCredentials = {
        username: requireCredential(credentials, 'BASIC_AUTH_USER'),
        password: requireCredential(credentials, 'BASIC_AUTH_PASSWORD')
    };
    const credentialValues = Object.values(credentials);
    const accounts = {
        admin: {
            email: requireCredential(credentials, 'ADMIN_EMAIL'),
            password: requireCredential(credentials, 'ADMIN_PASSWORD'),
            role: 'ADMIN'
        },
        teacher: {
            email: requireCredential(credentials, 'PROFESSOR_EMAIL'),
            password: requireCredential(credentials, 'DEMO_PASSWORD'),
            role: 'PROFESSOR'
        },
        student: {
            email: requireCredential(credentials, 'ALUNO_EMAIL'),
            password: requireCredential(credentials, 'DEMO_PASSWORD'),
            role: 'ALUNO'
        }
    };
    const browser = await firefox.launch({ headless: true });
    const manifest = [];
    try {
        for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
            fs.mkdirSync(path.join(outputRoot, viewportName), { recursive: true });
            const options = {
                viewport: { width: viewport.width, height: viewport.height },
                deviceScaleFactor: viewport.deviceScaleFactor,
                baseURL: baseUrl,
                httpCredentials,
                colorScheme: 'light',
                reducedMotion: 'reduce',
                locale: 'pt-BR',
                timezoneId: 'America/Sao_Paulo'
            };

            const publicContext = await browser.newContext(options);
            await publicContext.addInitScript(() => localStorage.setItem('autoria-theme', 'light'));
            await installPrivacyRedaction(publicContext);
            await captureGroup(publicContext, baseUrl, outputRoot, viewportName,
                publicSurfaces(process.env.CERTIFICATE_SCREENSHOT_CODE), manifest, credentialValues);
            await publicContext.close();

            const studentContext = await browser.newContext(options);
            await studentContext.addInitScript(() => localStorage.setItem('autoria-theme', 'light'));
            await login(studentContext, baseUrl, accounts.student.email, accounts.student.password, accounts.student.role);
            await installPrivacyRedaction(studentContext);
            const turmaId = await discoverDemoClass(studentContext, baseUrl);
            await captureGroup(studentContext, baseUrl, outputRoot, viewportName,
                studentSurfaces(turmaId), manifest, credentialValues);
            await studentContext.close();

            const teacherContext = await browser.newContext(options);
            await teacherContext.addInitScript(() => localStorage.setItem('autoria-theme', 'light'));
            await login(teacherContext, baseUrl, accounts.teacher.email, accounts.teacher.password, accounts.teacher.role);
            await installPrivacyRedaction(teacherContext);
            await captureGroup(teacherContext, baseUrl, outputRoot, viewportName,
                teacherSurfaces(turmaId), manifest, credentialValues);
            await teacherContext.close();

            const adminContext = await browser.newContext(options);
            await adminContext.addInitScript(() => localStorage.setItem('autoria-theme', 'light'));
            await login(adminContext, baseUrl, accounts.admin.email, accounts.admin.password, accounts.admin.role);
            await installPrivacyRedaction(adminContext);
            await captureGroup(adminContext, baseUrl, outputRoot, viewportName,
                adminSurfaces(turmaId), manifest, credentialValues);
            await adminContext.close();
        }
    } finally {
        await browser.close();
    }

    const capturedAt = new Date().toISOString();
    fs.writeFileSync(path.join(outputRoot, 'manifest.json'), `${JSON.stringify({
        capturedAt,
        baseUrl,
        theme: 'light',
        total: manifest.length,
        screenshots: manifest
    }, null, 2)}\n`, { mode: 0o644 });

    const lines = [
        '# Prints da plataforma',
        '',
        `Capturas geradas em ${capturedAt}, no staging HTTPS, com tema claro.`,
        `Total: **${manifest.length} screenshots** (${manifest.filter((item) => item.viewport === 'desktop').length} desktop e ${manifest.filter((item) => item.viewport === 'mobile').length} mobile).`,
        '',
        '| Área | Interface | Desktop | Mobile |',
        '| --- | --- | --- | --- |'
    ];
    const byName = new Map();
    for (const item of manifest) {
        if (!byName.has(item.name)) byName.set(item.name, {});
        byName.get(item.name)[item.viewport] = item;
    }
    for (const [name, variants] of byName) {
        const reference = variants.desktop || variants.mobile;
        const label = reference.title || name;
        const desktop = variants.desktop ? `[abrir](desktop/${path.basename(variants.desktop.file)})` : '—';
        const mobile = variants.mobile ? `[abrir](mobile/${path.basename(variants.mobile.file)})` : '—';
        lines.push(`| ${reference.area} | ${label} | ${desktop} | ${mobile} |`);
    }
    lines.push(
        '',
        'Nomes pessoais, e-mails, CPF, telefone e endereço provenientes das APIs foram substituídos por dados sintéticos antes da captura.',
        'Os arquivos não contêm senhas, cookies ou tokens de sessão. Detalhes técnicos estão em `manifest.json`.',
        ''
    );
    fs.writeFileSync(path.join(outputRoot, 'README.md'), lines.join('\n'), { mode: 0o644 });

    const failures = manifest.filter((item) => item.finalUrl.includes('/login.html')
        && !item.route.includes('/login.html'));
    assert.equal(failures.length, 0, `${failures.length} captura(s) protegida(s) redirecionaram ao login.`);
    process.stdout.write(`SCREENSHOT_CAPTURE_OK total=${manifest.length} output=${outputRoot}\n`);
}

main().catch((error) => {
    console.error(`SCREENSHOT_CAPTURE_FAILED: ${error.message}`);
    process.exitCode = 1;
});
