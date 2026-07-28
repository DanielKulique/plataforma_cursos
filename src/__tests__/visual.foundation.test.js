const fs = require('fs');
const path = require('path');
const request = require('supertest');

jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
const { app } = require('../../index');

const publicDir = path.join(__dirname, '..', 'public');
const cssDir = path.join(publicDir, 'css');
const tokensSource = fs.readFileSync(path.join(cssDir, 'tokens.css'), 'utf8');
const baseSource = fs.readFileSync(path.join(cssDir, 'base.css'), 'utf8');
const legacySource = fs.readFileSync(path.join(cssDir, 'style.css'), 'utf8');

function token(name) {
    const match = tokensSource.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})\\s*;`, 'i'));
    if (!match) throw new Error(`Token hexadecimal ausente: --${name}`);
    return match[1];
}

function luminance(hex) {
    const channels = hex.slice(1).match(/.{2}/g).map((value) => parseInt(value, 16) / 255);
    return channels
        .map((value) => (value <= 0.04045
            ? value / 12.92
            : ((value + 0.055) / 1.055) ** 2.4))
        .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrast(first, second) {
    const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
}

describe('Goal Visual 1 - fundação visual', () => {
    it('carrega a fundação antes das camadas incrementais em todas as onze páginas', () => {
        const pages = fs.readdirSync(publicDir).filter((file) => file.endsWith('.html'));
        const incrementalPages = new Set([
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
        ]);
        expect(pages).toHaveLength(11);

        pages.forEach((page) => {
            const html = fs.readFileSync(path.join(publicDir, page), 'utf8');
            const localStyles = [...html.matchAll(/<link\s+rel="stylesheet"\s+href="(\/css\/[^"]+)">/g)]
                .map((match) => match[1]);
            const expectedStyles = [
                '/css/tokens.css',
                '/css/base.css',
                '/css/style.css'
            ];

            if (incrementalPages.has(page)) {
                expectedStyles.push(
                    '/css/components.css',
                    '/css/layouts.css',
                    '/css/responsive.css',
                    '/css/utilities.css'
                );
            }

            expect(localStyles).toEqual(expectedStyles);
        });
    });

    it('expõe os grupos de tokens semânticos aprovados sem cadeia de imports', () => {
        [
            'color-background',
            'color-surface',
            'color-surface-elevated',
            'color-text',
            'color-text-secondary',
            'color-border',
            'color-action',
            'color-action-hover',
            'color-success',
            'color-warning',
            'color-error',
            'color-info',
            'color-focus',
            'shadow-sm',
            'radius-sm',
            'space-1',
            'content-width',
            'duration-normal'
        ].forEach((name) => expect(tokensSource).toContain(`--${name}:`));

        expect(tokensSource).not.toMatch(/@import/i);
        expect(baseSource).not.toMatch(/@import/i);
        expect(legacySource).not.toMatch(/@import/i);
        expect(tokensSource).not.toContain(':root:not(.dark-mode)');
        expect(legacySource).not.toContain(':root:not(.dark-mode)');
        expect(tokensSource).toContain('body:not(.dark-mode)');
    });

    it.each([
        ['light-text', 'light-surface', 4.5],
        ['light-text-secondary', 'light-surface', 4.5],
        ['light-text-tertiary', 'light-surface', 4.5],
        ['light-text-muted', 'light-surface', 4.5],
        ['light-action-text', 'light-action', 4.5],
        ['light-accent', 'light-surface', 4.5],
        ['light-success', 'light-surface', 4.5],
        ['light-warning', 'light-surface', 4.5],
        ['light-error', 'light-surface', 4.5],
        ['light-info', 'light-surface', 4.5],
        ['light-border-strong', 'light-surface', 3],
        ['light-focus', 'light-background', 3],
        ['dark-text', 'dark-background', 4.5],
        ['dark-text-secondary', 'dark-background', 4.5],
        ['dark-text-tertiary', 'dark-background', 4.5],
        ['dark-text-muted', 'dark-background', 4.5],
        ['dark-action-text', 'dark-action', 4.5],
        ['dark-accent', 'dark-background', 4.5],
        ['dark-success', 'dark-background', 4.5],
        ['dark-warning', 'dark-background', 4.5],
        ['dark-error', 'dark-background', 4.5],
        ['dark-info', 'dark-background', 4.5],
        ['dark-border-strong', 'dark-surface', 3],
        ['dark-focus', 'dark-background', 3],
        ['hero-text', 'hero-start', 4.5],
        ['hero-text', 'hero-end', 4.5]
    ])('mantém contraste de %s sobre %s em pelo menos %s:1', (foreground, background, minimum) => {
        expect(contrast(token(`palette-${foreground}`), token(`palette-${background}`)))
            .toBeGreaterThanOrEqual(minimum);
    });

    it('mantém a escala tipográfica e espacial aprovada', () => {
        ['12', '14', '16', '18', '24', '32', '48']
            .forEach((size) => expect(tokensSource).toContain(`--font-size-${size}:`));
        ['1', '2', '3', '4', '6', '8', '12', '16']
            .forEach((space) => expect(tokensSource).toContain(`--space-${space}:`));
        expect(tokensSource).toContain('--font-family-sans: "Sora"');
        expect(tokensSource).toContain('--font-family-display: "DM Serif Display"');
        expect(tokensSource).toContain('--font-family-mono: "JetBrains Mono"');
    });

    it('fornece foco global de três pixels e movimento reduzido', () => {
        expect(baseSource).toMatch(/:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--color-focus\)/s);
        expect(baseSource).toContain('@media (prefers-reduced-motion: reduce)');
        expect(baseSource).toMatch(/animation-duration:\s*0\.01ms !important/);
        expect(baseSource).toMatch(/transition-duration:\s*0\.01ms !important/);
        expect(baseSource).toMatch(/scroll-behavior:\s*auto !important/);
    });

    it('usa tokens semânticos diretamente, sem aliases legados', () => {
        expect(legacySource).toContain('var(--color-background)');
        expect(legacySource).toContain('var(--color-text)');
        expect(legacySource).toContain('var(--color-text-tertiary)');
        expect(legacySource).toContain('var(--color-action)');
        expect(legacySource).toContain('var(--duration-normal) var(--ease-standard)');
        expect(tokensSource).not.toMatch(/--(?:bg|white|muted|purple|ease)\s*:/);
        expect(legacySource).not.toMatch(/var\(--(?:bg|white|muted|purple|ease)\)/);
    });

    it('serve os novos arquivos CSS pela aplicação sem alterar a CSP', async () => {
        for (const file of ['tokens.css', 'base.css']) {
            const response = await request(app).get(`/css/${file}`);
            expect(response.status).toBe(200);
            expect(response.headers['content-type']).toMatch(/text\/css/);
            expect(response.headers['content-security-policy']).toContain("script-src 'self'");
            expect(response.headers['content-security-policy']).not.toMatch(/script-src[^;]*'unsafe-inline'/);
        }
    });
});
