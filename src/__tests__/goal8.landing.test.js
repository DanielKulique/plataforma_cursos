const fs = require('fs');
const path = require('path');
const request = require('supertest');

jest.mock('../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));

const { app } = require('../../index');
const { setupMenu } = require('../public/js/landing');

const publicDir = path.join(__dirname, '..', 'public');
const landingPath = path.join(publicDir, 'landing.html');
const landingCssPath = path.join(publicDir, 'css', 'landing', 'landing.css');
const landingResponsivePath = path.join(
    publicDir,
    'css',
    'landing',
    'landing-responsive.css'
);
const landingScriptPath = path.join(publicDir, 'js', 'landing.js');
const landingAssetPath = path.join(
    publicDir,
    'assets',
    'landing',
    'logo-plagio.webp'
);

const html = fs.readFileSync(landingPath, 'utf8');
const css = fs.readFileSync(landingCssPath, 'utf8');
const responsiveCss = fs.readFileSync(landingResponsivePath, 'utf8');
const script = fs.readFileSync(landingScriptPath, 'utf8');

function classList(initial = []) {
    const values = new Set(initial);
    return {
        add: (...names) => names.forEach((name) => values.add(name)),
        remove: (...names) => names.forEach((name) => values.delete(name)),
        contains: (name) => values.has(name),
        toggle(name, force) {
            if (force === true) values.add(name);
            else if (force === false) values.delete(name);
            else if (values.has(name)) values.delete(name);
            else values.add(name);
            return values.has(name);
        }
    };
}

function interactiveElement() {
    const listeners = new Map();
    const attributes = new Map();
    const label = { textContent: 'Abrir menu' };
    const element = {
        hidden: false,
        classList: classList(),
        focus: jest.fn(),
        addEventListener(type, handler) {
            listeners.set(type, handler);
        },
        dispatch(type, event = {}) {
            listeners.get(type)?.({
                target: element,
                preventDefault: jest.fn(),
                ...event
            });
        },
        setAttribute(name, value) {
            attributes.set(name, String(value));
        },
        getAttribute(name) {
            return attributes.get(name);
        },
        querySelector(selector) {
            return selector === '.landing-sr-only' ? label : null;
        },
        contains(target) {
            return target === element;
        }
    };
    return { element, label };
}

function menuFixture(mobile = true) {
    const documentListeners = new Map();
    const body = { classList: classList(['landing-page']) };
    const toggle = interactiveElement();
    const navigation = interactiveElement();
    const mediaListeners = new Map();
    const mobileQuery = {
        matches: mobile,
        addEventListener(type, handler) {
            mediaListeners.set(type, handler);
        }
    };
    const documentRef = {
        body,
        getElementById(id) {
            if (id === 'landing-nav-toggle') return toggle.element;
            if (id === 'landing-navigation') return navigation.element;
            return null;
        },
        addEventListener(type, handler) {
            documentListeners.set(type, handler);
        },
        dispatch(type, event) {
            documentListeners.get(type)?.(event);
        }
    };
    const windowRef = {
        matchMedia: jest.fn(() => mobileQuery)
    };

    return {
        body,
        documentRef,
        mobileQuery,
        navigation,
        toggle,
        windowRef
    };
}

function externalAnchors(source) {
    return [...source.matchAll(/<a\b[^>]*href="https:\/\/[^"]+"[^>]*>/g)]
        .map((match) => match[0]);
}

function hexToLuminance(hex) {
    const values = hex.slice(1).match(/.{2}/g)
        .map((value) => parseInt(value, 16) / 255)
        .map((value) => (
            value <= 0.04045
                ? value / 12.92
                : ((value + 0.055) / 1.055) ** 2.4
        ));
    return values.reduce(
        (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index],
        0
    );
}

function contrast(first, second) {
    const values = [hexToLuminance(first), hexToLuminance(second)]
        .sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
}

describe('Goal Visual 8 - landing institucional isolada', () => {
    it('cria somente a cascata e os assets exclusivos da landing', () => {
        expect(html).toContain('<body class="landing-page"');
        expect(html).toContain('href="/css/landing/landing.css"');
        expect(html).toContain('href="/css/landing/landing-responsive.css"');
        expect(html).toContain('src="/js/landing.js"');
        expect(html).toContain('src="/assets/landing/logo-plagio.webp"');
        expect(html).not.toContain('/css/tokens.css');
        expect(html).not.toContain('/css/components.css');
        expect(fs.existsSync(landingAssetPath)).toBe(true);
        expect(fs.statSync(landingAssetPath).size).toBeLessThan(50 * 1024);
    });

    it('externaliza a imagem e elimina código ou estilos inline', () => {
        expect(html).not.toMatch(/data:image/i);
        expect(html).not.toMatch(/<style\b/i);
        expect(html).not.toMatch(/\sstyle\s*=/i);
        expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
        expect(html).not.toMatch(/\son[a-z]+\s*=/i);
        expect(html).not.toMatch(/javascript:/i);
        expect(script).not.toMatch(
            /\.innerHTML\s*=|outerHTML|insertAdjacentHTML|document\.write/
        );
        expect(script).not.toMatch(
            /\.style\b|setAttribute\([^)]*style/
        );
    });

    it('usa classes e tokens prefixados sem seletores genéricos conflitantes', () => {
        expect(css).not.toMatch(
            /\.(?:nav|hero|card|roots|branch|tree)(?![a-z0-9_-])/i
        );
        expect(`${css}\n${responsiveCss}`).not.toMatch(
            /--(?:bg|paper|accent|bark|pine|amber)(?![a-z0-9_-])/
        );

        const customProperties = [
            ...`${css}\n${responsiveCss}`.matchAll(/^\s*(--[a-z0-9_-]+)\s*:/gim)
        ].map((match) => match[1]);
        expect(customProperties.length).toBeGreaterThan(10);
        customProperties.forEach((name) => {
            expect(name.startsWith('--landing-')).toBe(true);
        });

        [
            'index.html',
            'login.html',
            'cadastro.html',
            'verificar-email.html',
            'sala-virtual.html',
            'sala-aula.html',
            'questionario.html',
            'professor.html',
            'professor-turma.html',
            'admin.html',
            'verificador.html'
        ].forEach((page) => {
            const source = fs.readFileSync(path.join(publicDir, page), 'utf8');
            expect(source).not.toContain('/css/landing/');
            expect(source).not.toContain('/js/landing.js');
            expect(source).not.toContain('landing-page');
        });
    });

    it('mantém um h1, hierarquia, conteúdo alternativo e decoração oculta', () => {
        expect(html.match(/<h1\b/g)).toHaveLength(1);
        expect(html.match(/<h2\b/g)?.length).toBeGreaterThanOrEqual(7);
        expect(html).not.toMatch(/<h[3-6]\b/);
        expect(html).toContain('alt="Plágio: não copie essa ideia"');
        expect(html).toMatch(
            /class="landing-tree__svg"[\s\S]*?aria-hidden="true"[\s\S]*?focusable="false"/
        );
        expect(html).toMatch(
            /class="landing-roots__art" aria-hidden="true"/
        );
        expect(html).toContain('href="#landing-main"');
        expect(html).toContain('id="landing-main"');
    });

    it('configura rotas reais e protege todos os links externos', () => {
        expect(html).not.toMatch(/href=["']#["']/);
        ['/index.html', '/login.html', '/cadastro.html']
            .forEach((route) => expect(html).toContain(`href="${route}"`));
        expect(html).toContain('href="#projeto"');
        expect(html).toContain('href="#conteudo"');
        expect(html).toContain('href="#instituicao"');
        expect(html).toContain(
            'href="https://falandodeplagio.wixsite.com/eplagio"'
        );

        const external = externalAnchors(html);
        expect(external.length).toBeGreaterThanOrEqual(7);
        external.forEach((anchor) => {
            expect(anchor).toContain('target="_blank"');
            expect(anchor).toContain('rel="noopener noreferrer"');
        });
    });

    it('expõe menu móvel com estado, Escape e restauração de foco', () => {
        const fixture = menuFixture(true);
        const controller = setupMenu(fixture.documentRef, fixture.windowRef);

        expect(fixture.navigation.element.hidden).toBe(true);
        expect(fixture.toggle.element.getAttribute('aria-expanded')).toBe('false');

        fixture.toggle.element.dispatch('click');
        expect(controller.isOpen()).toBe(true);
        expect(fixture.navigation.element.hidden).toBe(false);
        expect(fixture.toggle.element.getAttribute('aria-expanded')).toBe('true');
        expect(fixture.toggle.label.textContent).toBe('Fechar menu');
        expect(fixture.body.classList.contains('landing-menu-open')).toBe(true);

        const preventDefault = jest.fn();
        fixture.documentRef.dispatch('keydown', {
            key: 'Escape',
            preventDefault
        });
        expect(preventDefault).toHaveBeenCalledTimes(1);
        expect(controller.isOpen()).toBe(false);
        expect(fixture.navigation.element.hidden).toBe(true);
        expect(fixture.toggle.element.focus).toHaveBeenCalledTimes(1);
        expect(fixture.body.classList.contains('landing-menu-open')).toBe(false);
    });

    it('mantém o menu disponível no desktop mesmo com JavaScript', () => {
        const fixture = menuFixture(false);
        const controller = setupMenu(fixture.documentRef, fixture.windowRef);
        controller.setOpen(true);

        expect(controller.isOpen()).toBe(false);
        expect(fixture.navigation.element.hidden).toBe(false);
        expect(fixture.toggle.element.getAttribute('aria-expanded')).toBe('false');
    });

    it('preserva movimento reduzido e evita trabalho contínuo no scroll', () => {
        expect(responsiveCss).toContain('@media (prefers-reduced-motion: reduce)');
        expect(responsiveCss).toContain('animation-duration: 0.01ms');
        expect(responsiveCss).toContain('transition-duration: 0.01ms');
        expect(script).toContain('IntersectionObserver');
        expect(script).toContain('requestAnimationFrame');
        expect(script).toContain("{ passive: true }");
        expect(script.match(/addEventListener\('scroll'/g)).toHaveLength(1);
        expect(script).toContain('if (framePending) return');
    });

    it('define responsividade, tela baixa, foco e contraste mínimo AA', () => {
        expect(responsiveCss).toContain('@media (max-width: 900px)');
        expect(responsiveCss).toContain('@media (max-width: 640px)');
        expect(responsiveCss).toContain('@media (max-height: 600px)');
        expect(css).toMatch(/:focus-visible\s*\{[\s\S]*?outline:\s*3px/);
        expect(css).toContain('overflow-x: clip');
        expect(responsiveCss).toContain('max-height: calc(100dvh');
        expect(contrast('#2b2118', '#fbf7ec')).toBeGreaterThanOrEqual(4.5);
        expect(contrast('#5a4e40', '#fbf7ec')).toBeGreaterThanOrEqual(4.5);
        expect(contrast('#fbf7ec', '#1f3a2b')).toBeGreaterThanOrEqual(4.5);
        expect(contrast('#f1ead9', '#0d0804')).toBeGreaterThanOrEqual(4.5);
    });

    it('serve HTML, CSS, JavaScript e imagem sob a CSP existente', async () => {
        const resources = [
            ['/landing.html', /text\/html/],
            ['/css/landing/landing.css', /text\/css/],
            ['/css/landing/landing-responsive.css', /text\/css/],
            ['/js/landing.js', /javascript/],
            ['/assets/landing/logo-plagio.webp', /image\/webp/]
        ];

        for (const [url, contentType] of resources) {
            const response = await request(app).get(url);
            expect(response.status).toBe(200);
            expect(response.headers['content-type']).toMatch(contentType);
            expect(response.headers['content-security-policy'])
                .toContain("script-src 'self'");
            expect(response.headers['content-security-policy'])
                .not.toMatch(/script-src[^;]*'unsafe-inline'/);
            expect(response.headers['content-security-policy'])
                .toContain("object-src 'none'");
        }
    });

    it('usa fallbacks locais sem adicionar carregamento de fonte externa', () => {
        expect(html).not.toContain('fonts.googleapis.com');
        expect(html).not.toContain('fonts.gstatic.com');
        expect(css).toContain('font-family: Georgia, "Times New Roman", serif');
        expect(css).toContain('font-family: Arial, Helvetica, sans-serif');
        expect(css).not.toMatch(/@font-face|@import/i);
    });
});
