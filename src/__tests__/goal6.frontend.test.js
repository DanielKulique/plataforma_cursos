const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const cssDir = path.join(publicDir, 'css');
const jsDir = path.join(publicDir, 'js');
const pages = [
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
];
const expectedStyles = [
    '/css/tokens.css',
    '/css/base.css',
    '/css/style.css',
    '/css/components.css',
    '/css/layouts.css',
    '/css/responsive.css',
    '/css/utilities.css'
];

const readCss = (file) => fs.readFileSync(path.join(cssDir, file), 'utf8');
const readJs = (file) => fs.readFileSync(path.join(jsDir, file), 'utf8');
const css = {
    tokens: readCss('tokens.css'),
    base: readCss('base.css'),
    components: readCss('components.css'),
    layouts: readCss('layouts.css'),
    responsive: readCss('responsive.css'),
    utilities: readCss('utilities.css'),
    legacy: readCss('style.css')
};

function withoutComments(source) {
    return source.replace(/\/\*[\s\S]*?\*\//g, '');
}

function definitionCount(source, customProperty) {
    const escaped = customProperty.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return (source.match(new RegExp(`(?:^|[;{\\s])${escaped}\\s*:`, 'gm')) || []).length;
}

describe('Goal Visual 6 - consolidação do frontend', () => {
    it.each(pages)('%s usa a mesma cascata explícita e não contém código inline', (page) => {
        const html = fs.readFileSync(path.join(publicDir, page), 'utf8');
        const styles = [...html.matchAll(/<link\s+rel="stylesheet"\s+href="(\/css\/[^"]+)">/g)]
            .map((match) => match[1]);

        expect(styles).toEqual(expectedStyles);
        expect(new Set(styles).size).toBe(styles.length);
        expect(html).not.toMatch(/\sstyle\s*=/i);
        expect(html).not.toMatch(/\son[a-z]+\s*=/i);
        expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
        expect(html).not.toMatch(/<style\b/i);
    });

    it('elimina aliases e centraliza formas, tempos, larguras e breakpoints conceituais', () => {
        [
            '--bg',
            '--bg-2',
            '--bg-card',
            '--purple',
            '--pink',
            '--white',
            '--text',
            '--muted',
            '--border',
            '--r-sm',
            '--r-md',
            '--ease',
            '--success',
            '--warning',
            '--danger'
        ].forEach((token) => {
            expect(definitionCount(Object.values(css).join('\n'), token)).toBe(0);
            expect(Object.values(css).join('\n')).not.toContain(`var(${token})`);
        });
        expect(css.tokens).toContain('--breakpoint-compact: 40rem');
        expect(css.tokens).toContain('--breakpoint-navigation: 56.25rem');
        expect(css.tokens).toContain('--breakpoint-wide: 75rem');
        expect(css.tokens).toContain('--content-width: 75rem');
        expect(css.tokens).toContain('--duration-normal: 280ms');
        expect(css.tokens).toContain('--motion-organic-normal: 600ms');
    });

    it('mantém apenas as exceções documentadas de !important', () => {
        const sources = Object.entries(css)
            .map(([name, source]) => [name, withoutComments(source)]);
        const occurrences = sources.flatMap(([name, source]) =>
            [...source.matchAll(/!important/g)].map(() => name)
        );

        expect(occurrences).toHaveLength(6);
        expect(new Set(occurrences)).toEqual(new Set(['base']));
        expect(css.base).toMatch(/\[hidden\]\s*\{[\s\S]*?display:\s*none !important/);
        expect(css.base).toContain('@media (prefers-reduced-motion: reduce)');
    });

    it('remove a implementação obsoleta do verificador e duplicações críticas do legado', () => {
        [
            '.topbar',
            '.workspace',
            '.editor-col',
            '.det.focused',
            '.modal-overlay',
            '.shortcut-overlay',
            '--bg-panel',
            '--status-ok'
        ].forEach((legacyRule) => expect(css.legacy).not.toContain(legacyRule));
        expect(css.legacy).not.toMatch(/^\s*:root\s*\{/m);
        expect(css.legacy).not.toMatch(/^\s*\[hidden\]\s*\{/m);
        expect(css.legacy).not.toContain('@media(max-width:860px)');
        expect(css.legacy).not.toContain('@media(max-width:640px)');
        expect(css.components).toContain('.verificador-page .verifier-card');
        expect(css.layouts).toContain('.verificador-page .verifier-workspace');
        expect(css.responsive).toContain('.verificador-page .verifier-comparison-grid');
    });

    it('padroniza componentes compartilhados e estados sem utilitários excessivos', () => {
        [
            '.mobile-nav-toggle',
            '.status-message',
            '.academic-page .badge',
            '.academic-page .ui-state',
            '.academic-page .progress-bar-fill',
            '.admin-page .admin-table-scroll',
            '.admin-page .admin-dialog',
            '.verificador-page .verifier-tabs',
            '.verificador-dialog',
            '.modal-backdrop'
        ].forEach((selector) => expect(css.components).toContain(selector));
        expect(css.utilities).toContain('.is-scroll-locked');
        expect(css.utilities).not.toMatch(/\.flex\b|\.grid\b|\.mt-|\.p-/);
    });

    it('remove sinks e estilos visuais diretos, mantendo só percentuais dinâmicos documentados', () => {
        const scripts = fs.readdirSync(jsDir)
            .filter((file) => file.endsWith('.js'))
            .map((file) => readJs(file))
            .join('\n');
        const styleAccesses = [...scripts.matchAll(/\.style\b/g)];

        expect(scripts).not.toMatch(/\.innerHTML\s*=|insertAdjacentHTML|document\.write/);
        expect(scripts).not.toMatch(/createElement\(['"]style['"]\)/);
        expect(scripts).not.toMatch(/\.style\.(?:display|visibility|opacity|width|height|overflow)\b/);
        expect(styleAccesses).toHaveLength(2);
        expect(scripts.match(/style\.setProperty\('--progress-value'/g)).toHaveLength(2);
        expect(readJs('script.js')).toContain('course-icon--tone-');
        expect(readJs('modal.js')).toContain('textContent');
    });

    it('usa uma única classe de bloqueio de rolagem nos diálogos existentes', () => {
        const scroll = readJs('page-scroll.js');
        expect(scroll).toContain("classList.add('is-scroll-locked')");
        expect(scroll).toContain("classList.remove('is-scroll-locked')");
        expect(scroll).toContain('existing.count += 1');
        ['academic-dialog.js', 'admin-dialog.js', 'verificador.js', 'modal.js']
            .forEach((file) => expect(readJs(file)).toContain('lockPageScroll'));
    });

    it('concentra responsividade e preserva os breakpoints principais e exceções de altura', () => {
        expect(css.responsive).toContain('@media (max-width: 900px)');
        expect(css.responsive).toContain('@media (max-width: 640px)');
        expect(css.responsive).toContain('@media (max-height: 680px)');
        expect(css.responsive).toContain('@media (max-height: 600px)');
        expect(css.legacy).not.toMatch(/@media\s*\(max-width:\s*(?:1024|900|640)px\)/);
    });
});
