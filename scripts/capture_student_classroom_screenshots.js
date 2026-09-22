'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

const playwrightModule = process.env.PLAYWRIGHT_MODULE_PATH || 'playwright';
const { firefox } = require(playwrightModule);

const VIEWPORTS = Object.freeze({
    desktop: { width: 1440, height: 1000 },
    mobile: { width: 412, height: 915 }
});

function readCredentials() {
    assert.equal(process.env.SCREENSHOT_CREDENTIALS_STDIN, '1',
        'Use SCREENSHOT_CREDENTIALS_STDIN=1 e envie as credenciais pela entrada padrão.');
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
        if (normalized.includes('telefone') || normalized.includes('celular')) {
            return [key, '(00) 00000-0000'];
        }
        if (normalized.includes('endereco') || normalized.includes('logradouro')) {
            return [key, 'Endereço omitido'];
        }
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
        const secrets = values.filter((value) => String(value || '').length >= 8).map(String);
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        for (const node of nodes) {
            let text = node.nodeValue;
            for (const [pattern, replacement] of replacements) text = text.replace(pattern, replacement);
            for (const secret of secrets) text = text.split(secret).join('[dado omitido]');
            node.nodeValue = text;
        }
        document.querySelectorAll('input').forEach((input) => {
            if (input.type === 'password') input.value = '';
            if (input.type === 'email' && input.value) input.value = 'usuario.exemplo@example.test';
        });
    }, credentialValues);
}

async function waitForStablePage(page) {
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => document.body?.dataset.sessionState !== 'loading', null,
        { timeout: 15_000 }).catch(() => undefined);
    await page.waitForFunction(() => ![...document.querySelectorAll('[aria-busy="true"]')]
        .some((element) => element.offsetParent !== null), null,
    { timeout: 15_000 }).catch(() => undefined);
    await page.evaluate(async () => {
        const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
        for (let y = 0; y < document.documentElement.scrollHeight; y += window.innerHeight) {
            window.scrollTo(0, y);
            await delay(40);
        }
        window.scrollTo(0, 0);
        if (document.fonts?.ready) await document.fonts.ready;
        await Promise.race([
            Promise.all([...document.images].filter((image) => !image.complete).map((image) =>
                new Promise((resolve) => {
                    image.addEventListener('load', resolve, { once: true });
                    image.addEventListener('error', resolve, { once: true });
                }))),
            delay(2_000)
        ]);
    });
    await page.waitForTimeout(300);
}

async function login(context, baseUrl, email, password) {
    const response = await context.request.post(`${baseUrl}/api/auth/login`, {
        data: { email, senha: password }
    });
    const payload = await response.json().catch(() => ({}));
    assert(response.ok(), `Login do aluno falhou com HTTP ${response.status()}.`);
    assert.equal(payload.usuario?.tipo, 'ALUNO', 'A conta usada na captura não é de aluno.');
}

async function discoverDemoClass(context, baseUrl) {
    const response = await context.request.get(`${baseUrl}/api/matriculas/minha-sala`);
    assert(response.ok(), `Falha ao consultar turmas: HTTP ${response.status()}.`);
    const payload = await response.json();
    const turma = (payload.turmas || []).find((item) => item.nome_turma === 'Turma Demo Staging')
        || payload.turmas?.[0];
    assert(turma?.id_turma, 'Nenhuma turma foi encontrada para o aluno demo.');
    return Number(turma.id_turma);
}

function classroomStates(classId) {
    const classroom = `/sala-aula.html?id_turma=${classId}`;
    return [
        {
            name: '01-sala-de-aula-visao-geral',
            label: 'Sala de aula — visão geral e todos os materiais',
            route: classroom,
            verify: async (page) => {
                await page.locator('#lista-conteudos .module-item').first().waitFor();
                assert((await page.locator('#lista-conteudos .module-item').count()) >= 5,
                    'A visão geral deve exibir ao menos cinco materiais publicados.');
                await page.getByRole('link', { name: 'Ir para prova' }).waitFor();
                await page.getByRole('link', { name: 'Ir para exercícios' }).waitFor();
            }
        },
        {
            name: '02-conteudo-textual-aberto',
            label: 'Conteúdo textual aberto',
            route: classroom,
            prepare: async (page) => page.getByRole('button', { name: /Abrir conteúdo: Boas-vindas/i }).click(),
            verify: async (page) => {
                await page.locator('#conteudo-texto-container:not([hidden])').waitFor();
                await page.getByText('Este ambiente contém somente dados fictícios').waitFor();
            }
        },
        {
            name: '03-video-aula-aberta',
            label: 'Videoaula aberta no player',
            route: classroom,
            prepare: async (page) => page.getByRole('button', { name: /Abrir conteúdo: Vídeo introdutório/i }).click(),
            verify: async (page) => {
                await page.locator('#player-video-container:not([hidden])').waitFor();
                assert((await page.locator('#video-player').getAttribute('src'))?.includes('youtube-nocookie.com/embed'));
            }
        },
        {
            name: '04-pdfs-disponiveis',
            label: 'Filtro de PDFs disponíveis',
            route: classroom,
            prepare: async (page) => page.locator('[data-filtro="pdf"]').click(),
            verify: async (page) => {
                await page.getByRole('button', { name: /Abrir conteúdo: Guia fictício de integridade/i }).waitFor();
                assert((await page.locator('#lista-conteudos .module-item').count()) >= 1,
                    'O filtro deve exibir ao menos um PDF.');
            }
        },
        {
            name: '05-atividade-aberta',
            label: 'Atividade de reflexão aberta',
            route: classroom,
            prepare: async (page) => {
                await page.locator('[data-filtro="atividade"]').click();
                await page.getByRole('button', { name: /Abrir conteúdo: Atividade de reflexão/i }).click();
            },
            verify: async (page) => {
                await page.locator('#conteudo-texto-container:not([hidden])').waitFor();
                await page.getByText('Registre três práticas').waitFor();
            }
        },
        {
            name: '06-questionario-exercicio',
            label: 'Questionário de exercício com questões e alternativas',
            route: `/questionario.html?tipo=exercicio&id_turma=${classId}`,
            verify: async (page) => {
                await page.locator('#lista-questoes .question-item').first().waitFor();
                assert((await page.locator('#lista-questoes .question-item').count()) >= 2,
                    'O exercício deve exibir suas questões.');
                await page.getByText('Questionário demonstrativo', { exact: true }).first().waitFor();
            }
        },
        {
            name: '07-questionario-prova',
            label: 'Prova com questões e alternativas',
            route: `/questionario.html?tipo=prova&id_turma=${classId}`,
            verify: async (page) => {
                await page.locator('#lista-questoes .question-item').first().waitFor();
                assert((await page.locator('#lista-questoes .question-item').count()) >= 2,
                    'A prova deve exibir suas questões.');
                await page.getByText('Prova demonstrativa', { exact: true }).first().waitFor();
            }
        }
    ];
}

async function captureState(context, baseUrl, outputRoot, viewportName, state, credentialValues) {
    const page = await context.newPage();
    const browserErrors = [];
    page.on('pageerror', (error) => browserErrors.push(error.message));
    try {
        const response = await page.goto(`${baseUrl}${state.route}`, {
            waitUntil: 'domcontentloaded', timeout: 30_000
        });
        assert(response && response.status() < 500,
            `${state.route} respondeu HTTP ${response?.status() || 'desconhecido'}.`);
        await waitForStablePage(page);
        if (state.prepare) {
            await state.prepare(page);
            await waitForStablePage(page);
        }
        try {
            await state.verify(page);
        } catch (error) {
            const diagnostics = await page.evaluate(async () => {
                const room = await fetch('/api/matriculas/minha-sala')
                    .then(async (response) => {
                        const raw = await response.text();
                        let payload;
                        try {
                            payload = JSON.parse(raw);
                        } catch (parseError) {
                            return {
                                error: parseError.message,
                                status: response.status,
                                contentType: response.headers.get('content-type'),
                                contentEncoding: response.headers.get('content-encoding'),
                                firstCodes: [...raw.slice(0, 16)].map((character) => character.charCodeAt(0))
                            };
                        }
                        return {
                            keys: Object.keys(payload),
                            classes: (payload.turmas || []).map((item) => ({
                                id: item.id_turma,
                                name: item.nome_turma,
                                keys: Object.keys(item)
                            }))
                        };
                    })
                    .catch((fetchError) => ({ error: fetchError.message }));
                return {
                    sessionState: document.body?.dataset.sessionState || null,
                    classroomMessage: document.querySelector('#mensagem-sala-aula')?.textContent?.trim() || null,
                    questionnaireMessage: document.querySelector('#mensagem-questionario')?.textContent?.trim() || null,
                    contentItems: document.querySelectorAll('#lista-conteudos .module-item').length,
                    questionItems: document.querySelectorAll('#lista-questoes .question-item').length,
                    room
                };
            });
            throw new Error(`${error.message} Diagnóstico: ${JSON.stringify(diagnostics)}. Erros: ${JSON.stringify(browserErrors)}.`, { cause: error });
        }
        await redactRenderedPage(page, credentialValues);
        await page.addStyleTag({
            content: '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'
        });
        await page.evaluate(() => window.scrollTo(0, 0));
        const relativeFile = path.join(viewportName, `${state.name}.png`);
        const absoluteFile = path.join(outputRoot, relativeFile);
        await page.screenshot({ path: absoluteFile, fullPage: true, animations: 'disabled' });
        const dimensions = await page.evaluate(() => ({
            width: document.documentElement.scrollWidth,
            height: document.documentElement.scrollHeight
        }));
        return {
            viewport: viewportName,
            name: state.name,
            label: state.label,
            route: state.route,
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

async function main() {
    const credentials = await readCredentials();
    const baseUrl = String(process.env.STAGING_BASE_URL || '').replace(/\/$/, '');
    assert(baseUrl.startsWith('https://'), 'STAGING_BASE_URL deve usar HTTPS.');
    const outputRoot = path.resolve(process.argv[2]
        || 'docs/screenshots/visao-aluno-conteudos-2026-09-05');
    fs.mkdirSync(outputRoot, { recursive: true });

    const browser = await firefox.launch({ headless: true });
    const manifest = [];
    try {
        for (const [viewportName, viewport] of Object.entries(VIEWPORTS)) {
            fs.mkdirSync(path.join(outputRoot, viewportName), { recursive: true });
            const context = await browser.newContext({
                viewport,
                deviceScaleFactor: 1,
                baseURL: baseUrl,
                httpCredentials: {
                    username: requireCredential(credentials, 'BASIC_AUTH_USER'),
                    password: requireCredential(credentials, 'BASIC_AUTH_PASSWORD')
                },
                colorScheme: 'light',
                reducedMotion: 'reduce',
                locale: 'pt-BR',
                timezoneId: 'America/Sao_Paulo'
            });
            await context.addInitScript(() => localStorage.setItem('autoria-theme', 'light'));
            await login(context, baseUrl,
                requireCredential(credentials, 'ALUNO_EMAIL'),
                requireCredential(credentials, 'DEMO_PASSWORD'));
            const classId = await discoverDemoClass(context, baseUrl);
            await installPrivacyRedaction(context);
            for (const state of classroomStates(classId)) {
                const result = await captureState(context, baseUrl, outputRoot,
                    viewportName, state, Object.values(credentials));
                manifest.push(result);
                process.stdout.write(`CAPTURED ${result.file}\n`);
            }
            await context.close();
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

    const byName = new Map();
    for (const item of manifest) {
        if (!byName.has(item.name)) byName.set(item.name, {});
        byName.get(item.name)[item.viewport] = item;
    }
    const lines = [
        '# Sala de aula — visão do aluno',
        '',
        `Capturas verificadas no staging HTTPS em ${capturedAt}.`,
        `Total: **${manifest.length} screenshots** (desktop e celular).`,
        '',
        'Painéis-resumo: [desktop](contato-desktop.png) · [celular](contato-mobile.png).',
        '',
        '| Estado da interface | Desktop | Celular |',
        '| --- | --- | --- |'
    ];
    for (const variants of byName.values()) {
        const reference = variants.desktop || variants.mobile;
        lines.push(`| ${reference.label} | [abrir](desktop/${path.basename(variants.desktop.file)}) | [abrir](mobile/${path.basename(variants.mobile.file)}) |`);
    }
    lines.push('',
        'As capturas mostram somente dados fictícios. Identificadores pessoais retornados pelas APIs foram anonimizados antes da renderização.',
        'Nenhuma senha, cookie ou token foi gravado nos arquivos.', '');
    fs.writeFileSync(path.join(outputRoot, 'README.md'), lines.join('\n'), { mode: 0o644 });

    assert.equal(manifest.length, 14, 'Quantidade inesperada de capturas.');
    assert.equal(manifest.filter((item) => item.browserErrors.length).length, 0,
        'Uma ou mais interfaces emitiram erros no navegador.');
    assert.equal(manifest.filter((item) => item.finalUrl.includes('/login.html')).length, 0,
        'Uma ou mais interfaces redirecionaram para o login.');
    process.stdout.write(`STUDENT_CLASSROOM_SCREENSHOTS_OK total=${manifest.length} output=${outputRoot}\n`);
}

main().catch((error) => {
    console.error(`STUDENT_CLASSROOM_SCREENSHOTS_FAILED: ${error.stack || error.message}`);
    process.exitCode = 1;
});
