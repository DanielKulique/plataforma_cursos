const fs = require('fs');
const path = require('path');
const request = require('supertest');
const SecurityUtils = require('../public/js/security-utils');

jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
const { app } = require('../../index');

class FakeText {
    constructor(text) { this.nodeType = 3; this.textContent = String(text); }
}

class FakeElement {
    constructor(tagName) {
        this.nodeType = 1;
        this.tagName = String(tagName).toUpperCase();
        this.children = [];
        this.dataset = {};
        this.attributes = {};
    }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = [...nodes]; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    set className(value) { this.attributes.class = String(value); }
    set tabIndex(value) { this.attributes.tabindex = String(value); }
}

const fakeDocument = {
    createElement: (tag) => new FakeElement(tag),
    createTextNode: (text) => new FakeText(text)
};

function flattenText(node) {
    if (node.nodeType === 3) return node.textContent;
    return node.children.map(flattenText).join(node.tagName === 'BR' ? '\n' : '');
}

function collectTags(node, tags = []) {
    if (node.nodeType === 1 && node.tagName !== 'ROOT') tags.push(node.tagName);
    if (node.children) node.children.forEach((child) => collectTags(child, tags));
    return tags;
}

describe('proteções XSS do frontend', () => {
    it.each([
        '<img src=x onerror="globalThis.pwned=true">',
        '<svg onload="globalThis.pwned=true"></svg>',
        '<div onmouseover="globalThis.pwned=true">evento</div>',
        '<scr<script>ipt>alert(1)</scr</script>ipt>'
    ])('renderiza payload como texto, nunca como elemento: %s', (payload) => {
        const root = new FakeElement('root');
        SecurityUtils.renderHighlightedText(root, payload, [{ id: 1, lvl: 'red', txt: payload }], fakeDocument);

        expect(flattenText(root)).toBe(payload);
        expect(collectTags(root)).toEqual(['MARK']);
    });

    it('preserva destaques e texto fora deles', () => {
        const root = new FakeElement('root');
        SecurityUtils.renderHighlightedText(root, 'Antes trecho depois', [{ id: 9, lvl: 'amber', txt: 'trecho' }], fakeDocument);

        expect(flattenText(root)).toBe('Antes trecho depois');
        expect(collectTags(root)).toContain('MARK');
        expect(root.children[1].dataset.id).toBe('9');
        expect(root.children[1].attributes.class).toBe('hl-amber');
    });

    it('aceita somente URLs internas ou origens externas explicitamente permitidas', () => {
        expect(SecurityUtils.toSafeUrl('/material.pdf', { baseUrl: 'https://curso.example' })).toBe('https://curso.example/material.pdf');
        expect(SecurityUtils.toSafeUrl('https://www.youtube.com/embed/video', { baseUrl: 'https://curso.example' }))
            .toBe('https://www.youtube.com/embed/video');
        expect(SecurityUtils.toSafeUrl('javascript:alert(1)', { baseUrl: 'https://curso.example' })).toBeNull();
        expect(SecurityUtils.toSafeUrl('data:text/html,<script>alert(1)</script>', { baseUrl: 'https://curso.example' })).toBeNull();
        expect(SecurityUtils.toSafeUrl('https://evil.example/payload', { baseUrl: 'https://curso.example' })).toBeNull();
    });

    it('não mantém sinks dinâmicos ou handlers inline nos arquivos corrigidos', () => {
        const files = [
            'public/js/verificador.js',
            'public/js/professor-turma.js',
            'public/js/sala-virtual.js',
            'public/js/sala-aula.js',
            'public/js/questionario.js',
            'public/js/questionario-disponibilidade.js',
            'public/js/professor.js',
            'public/js/admin.js',
            'public/js/admin-dialog.js',
            'public/js/session-ui.js'
        ];
        files.forEach((relative) => {
            const source = fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
            expect(source).not.toMatch(/\.innerHTML\s*=/);
            expect(source).not.toMatch(/\bonclick\s*=/i);
        });
    });

    it('não interpola dados de cursos ou turmas em innerHTML na página inicial', () => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/script.js'), 'utf8');
        expect(source).not.toMatch(/innerHTML\s*=\s*`[^`]*\$\{/);
        expect(source).toContain('workload.textContent = curso.carga_horaria === null');
        expect(source).toContain("`⏱ ${String(curso.carga_horaria ?? '')}h`");
    });

    it('um nome malicioso de aluno é atribuído por textContent na página do professor', () => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/professor-turma.js'), 'utf8');
        expect(source).toContain("cell.textContent = String(valor ?? '')");
        expect(source).toContain("editar.addEventListener('click', () => abrirModal(aluno, editar))");
        expect(source).not.toMatch(/row\.innerHTML|onclick=/i);
    });

    it('carrega páginas principais com CSP bloqueante e sem script inline', async () => {
        const pages = fs.readdirSync(path.join(__dirname, '..', 'public'))
            .filter((file) => file.endsWith('.html'))
            .map((file) => `/${file}`);

        for (const page of pages) {
            const response = await request(app).get(page);
            expect(response.status).toBe(200);
            const csp = response.headers['content-security-policy'];
            expect(csp).toContain("script-src 'self'");
            expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
            expect(csp).toContain("object-src 'none'");
            expect(csp).toContain("base-uri 'self'");
            expect(csp).toContain("frame-ancestors 'self'");

            expect(response.text).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
            expect(response.text).not.toMatch(/\son[a-z]+\s*=/i);
        }
    });

    it('mantém limite de payload e cabeçalhos de endurecimento HTTP', async () => {
        const response = await request(app)
            .post('/api/usuarios')
            .set('Content-Type', 'application/json')
            .send({ preenchimento: 'x'.repeat(300 * 1024) });

        expect(response.status).toBe(413);
        expect(response.headers).not.toHaveProperty('x-powered-by');
        expect(response.headers['x-content-type-options']).toBe('nosniff');
        expect(response.headers['content-security-policy']).toContain("script-src 'self'");
    });
});
