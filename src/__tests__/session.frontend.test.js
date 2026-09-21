const fs = require('fs');
const path = require('path');

const publicPath = (...parts) => path.join(__dirname, '..', 'public', ...parts);

function loadAuth({ fetchImpl }) {
    const source = fs.readFileSync(publicPath('js', 'auth.js'), 'utf8')
        .replace(/\bexport\s+/g, '');
    const window = { location: { href: '' } };
    const factory = new Function(
        'fetch',
        'window',
        `${source}\nreturn { getCurrentUser, getRedirectByRole, clearToken, requireRole };`
    );
    return factory(fetchImpl, window);
}

class FakeElement {
    constructor(tagName, ownerDocument) {
        this.tagName = String(tagName).toUpperCase();
        this.ownerDocument = ownerDocument;
        this.children = [];
        this.dataset = {};
        this.attributes = {};
        this.hidden = true;
        this.textContent = '';
        this.href = '';
        this.listeners = {};
    }

    set id(value) {
        this._id = String(value);
        this.ownerDocument.elements.set(this._id, this);
    }

    get id() { return this._id; }
    set className(value) { this.attributes.class = String(value); }
    get className() { return this.attributes.class || ''; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    append(...children) { this.children.push(...children); }
    addEventListener(type, listener) { this.listeners[type] = listener; }
    insertAdjacentElement(_position, element) { this.children.push(element); }
    focus() { this.focused = true; }
    contains(target) { return target === this || this.children.some((child) => child.contains?.(target)); }
}

function createDocument(ids = []) {
    const document = {
        elements: new Map(),
        privateControls: [],
        listeners: {},
        createElement(tag) { return new FakeElement(tag, document); },
        getElementById(id) { return document.elements.get(id) || null; },
        querySelectorAll(selector) {
            return selector === '[data-session-private]' ? document.privateControls : [];
        },
        addEventListener(type, listener) { document.listeners[type] = listener; }
    };
    document.body = document.createElement('body');
    document.body.hidden = false;
    ids.forEach((id) => {
        const element = document.createElement(id === 'link-login' || id === 'link-sala' ? 'a' : 'div');
        element.id = id;
    });
    return document;
}

function loadSessionUI({ document, window, auth }) {
    const source = fs.readFileSync(publicPath('js', 'session-ui.js'), 'utf8')
        .replace(/^import[\s\S]*?from '\.\/auth\.js';\n/m, '')
        .replace(/\bexport\s+/g, '');
    const factory = new Function(
        'clearToken',
        'getCapabilities',
        'getCurrentUser',
        'getRedirectByRole',
        'endSession',
        'document',
        'window',
        `${source}\nreturn { initSessionUI, getRoleArea };`
    );
    return factory(
        auth.clearToken,
        auth.getCapabilities || jest.fn().mockResolvedValue({ features: { detector: { enabled: false } } }),
        auth.getCurrentUser,
        auth.getRedirectByRole,
        auth.endSession || jest.fn().mockResolvedValue(undefined),
        document,
        window
    );
}

describe('sessão autoritativa do frontend', () => {
    it('compartilha uma única consulta a /api/auth/me por página', async () => {
        const user = { id_usuario: 7, nome_completo: 'Ana Aluna', tipo: 'ALUNO' };
        const fetchImpl = jest.fn(async () => ({
            ok: true,
            status: 200,
            json: async () => ({ usuario: user })
        }));
        const auth = loadAuth({ fetchImpl });

        const [first, second] = await Promise.all([auth.getCurrentUser(), auth.getCurrentUser()]);
        const third = await auth.getCurrentUser();

        expect(first).toEqual(user);
        expect(second).toEqual(user);
        expect(third).toEqual(user);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(fetchImpl).toHaveBeenCalledWith('/api/auth/me', expect.any(Object));
    });

    it.each([401, 403, 404])('trata a sessão por cookie como inválida quando /me responde %i', async (status) => {
        const auth = loadAuth({
            fetchImpl: jest.fn(async () => ({ ok: false, status, json: async () => ({}) }))
        });

        await expect(auth.getCurrentUser()).resolves.toBeNull();
    });

    it('preserva a possibilidade de nova validação após erro temporário', async () => {
        const auth = loadAuth({
            fetchImpl: jest.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }))
        });

        await expect(auth.getCurrentUser()).rejects.toThrow('Erro ao carregar sessão.');
    });

    it('redireciona ADMIN para o painel administrativo real', () => {
        const auth = loadAuth({ fetchImpl: jest.fn() });
        expect(auth.getRedirectByRole('ADMIN')).toBe('/admin.html');
    });
});

describe('estados visuais centralizados', () => {
    const ids = [
        'status-usuario', 'aviso-acesso', 'link-login', 'link-sala',
        'avatar', 'badge-role', 'btn-continuar'
    ];

    it('mostra somente ações públicas para visitante', async () => {
        const document = createDocument(ids);
        const window = { location: { href: '' } };
        const ui = loadSessionUI({
            document,
            window,
            auth: {
                clearToken: jest.fn(),
                getCurrentUser: jest.fn().mockResolvedValue(null),
                getRedirectByRole: jest.fn(),
                getCapabilities: jest.fn()
            }
        });

        const result = await ui.initSessionUI();

        expect(result.state).toBe('anonymous');
        expect(document.body.dataset.sessionState).toBe('anonymous');
        expect(document.getElementById('link-login').hidden).toBe(false);
        expect(document.getElementById('avatar').hidden).toBe(true);
        expect(document.getElementById('aviso-acesso').hidden).toBe(false);
    });

    it.each([
        ['ALUNO', 'aluno', 'Aluno', '/sala-virtual.html'],
        ['PROFESSOR', 'professor', 'Professor', '/professor.html'],
        ['ADMIN', 'admin', 'Administrador', '/admin.html']
    ])('mostra navegação e menu coerentes para %s', async (tipo, state, label, areaUrl) => {
        const document = createDocument(ids);
        const privateAdmin = document.createElement('a');
        privateAdmin.dataset.sessionRoles = 'ADMIN';
        document.privateControls.push(privateAdmin);
        const window = { location: { href: '' } };
        const user = { id_usuario: 3, nome_completo: 'João Pedro Almeida', tipo };
        const clearToken = jest.fn();
        const ui = loadSessionUI({
            document,
            window,
            auth: {
                clearToken,
                endSession: clearToken,
                getCurrentUser: jest.fn().mockResolvedValue(user),
                getRedirectByRole: jest.fn(),
                getCapabilities: jest.fn().mockResolvedValue({ features: { detector: { enabled: false } } })
            }
        });

        const result = await ui.initSessionUI();

        expect(result).toEqual({
            state: 'authenticated',
            user,
            capabilities: { features: { detector: { enabled: false } } }
        });
        expect(document.body.dataset.sessionState).toBe(state);
        expect(document.getElementById('aviso-acesso').hidden).toBe(true);
        expect(document.getElementById('avatar').hidden).toBe(false);
        expect(document.getElementById('avatar').attributes['aria-haspopup']).toBe('menu');
        expect(document.getElementById('avatar-menu-area').href).toBe(areaUrl);
        expect(document.getElementById('avatar-menu-name').textContent).toBe('João Pedro Almeida');
        expect(document.getElementById('avatar-menu-role').textContent).toBe(label);
        expect(document.getElementById('avatar-menu-logout').textContent).toBe('Sair');
        expect(privateAdmin.hidden).toBe(tipo !== 'ADMIN');

        if (tipo === 'ALUNO') {
            await document.getElementById('avatar-menu-logout').listeners.click();
            expect(clearToken).toHaveBeenCalledTimes(1);
            expect(window.location.href).toBe('/index.html');
        }
    });

    it('envia página protegida sem sessão ao login', async () => {
        const document = createDocument(ids);
        const window = { location: { href: '' } };
        const ui = loadSessionUI({
            document,
            window,
            auth: {
                clearToken: jest.fn(),
                getCurrentUser: jest.fn().mockResolvedValue(null),
                getRedirectByRole: jest.fn(),
                getCapabilities: jest.fn()
            }
        });

        const result = await ui.initSessionUI({ requiredRoles: ['ALUNO'] });

        expect(result.state).toBe('anonymous');
        expect(document.body.dataset.sessionState).toBe('anonymous');
        expect(document.getElementById('avatar').hidden).toBe(true);
        expect(window.location.href).toBe('/login.html?motivo=auth');
    });

    it('não revela a página quando o papel atual não é autorizado', async () => {
        const document = createDocument(ids);
        const window = { location: { href: '' } };
        const user = { id_usuario: 4, nome_completo: 'Paula Professora', tipo: 'PROFESSOR' };
        const ui = loadSessionUI({
            document,
            window,
            auth: {
                clearToken: jest.fn(),
                getCurrentUser: jest.fn().mockResolvedValue(user),
                getRedirectByRole: jest.fn(),
                getCapabilities: jest.fn()
            }
        });

        const result = await ui.initSessionUI({ requiredRoles: ['ADMIN'] });

        expect(result.state).toBe('unauthorized');
        expect(document.body.dataset.sessionState).toBe('unauthorized');
        expect(document.getElementById('avatar').hidden).toBe(true);
        expect(window.location.href).toBe('/index.html?motivo=nao_autorizado');
    });

    it('mantém componentes privados ocultos até a sessão ser resolvida', () => {
        const pages = [
            'admin.html', 'professor.html', 'professor-turma.html',
            'sala-virtual.html', 'sala-aula.html', 'questionario.html'
        ];
        pages.forEach((page) => {
            const html = fs.readFileSync(publicPath(page), 'utf8');
            expect(html).toMatch(/<body[^>]*data-session-state="loading"[^>]*data-session-protected/);
        });
    });

    it('remove notificações e dados simulados das páginas do Goal 1', () => {
        const html = fs.readFileSync(publicPath('index.html'), 'utf8');
        const sala = fs.readFileSync(publicPath('js', 'sala-virtual.js'), 'utf8');
        const allPages = fs.readdirSync(publicPath()).filter((file) => file.endsWith('.html'));

        expect(html).not.toMatch(/Acesso rápido|Atividade recente/);
        expect(sala).not.toMatch(/MOCK_|modoTeste|demo=1|Módulo 1: Boas-vindas/);
        allPages.forEach((page) => {
            const source = fs.readFileSync(publicPath(page), 'utf8');
            expect(source).not.toMatch(/nav-bell|id="btn-logout"/);
        });
    });

    it('conecta os cards de curso ao filtro real de turmas', () => {
        const source = fs.readFileSync(publicPath('js', 'script.js'), 'utf8');
        expect(source).toContain("item.addEventListener('click', () => selecionarCurso(courseId))");
        expect(source).toContain("item.setAttribute('aria-pressed'");
        expect(source).toContain('turmasDisponiveis.filter((turma) => String(turma.id_curso) === cursoSelecionado)');
        expect(source).not.toMatch(/course-item[^\n]*onclick/i);
    });

    it('atualiza o catálogo após matrícula sem perder o filtro e ignora cancelamentos', () => {
        const source = fs.readFileSync(publicPath('js', 'script.js'), 'utf8');
        expect(source).toContain(".filter((matricula) => matricula.status_aprovacao !== 'CANCELADO')");
        expect(source).toContain('turmasDisponiveis = await getTurmas();');
        expect(source).toContain('renderizarTurmasFiltradas();');
        expect(source).toContain("const statusAberto = statusText === 'ABERTA'");
        expect(source).toContain("ABERTA: '● Inscrições abertas'");
    });

    it('permite que o catálogo filtrado encolha sem overflow em telas móveis', () => {
        const css = fs.readFileSync(publicPath('css', 'style.css'), 'utf8');
        const responsiveCss = fs.readFileSync(publicPath('css', 'responsive.css'), 'utf8');

        expect(css).toMatch(/\.grid-2\s*\{[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
        expect(css).toMatch(/\.grid-3\s*\{[^}]*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
        expect(css).toMatch(/\.grid-2\s*>\s*\*,\s*\.grid-3\s*>\s*\*\s*\{\s*min-width:\s*0/s);
        expect(css).toMatch(/\.card\s*\{[^}]*min-width:\s*0/s);
        expect(responsiveCss).toMatch(
            /@media\s*\(max-width:\s*900px\)[\s\S]*?\.public-home\s+\.catalog-section\s+\.grid-2\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/
        );
    });

    it('não introduz sinks XSS no controlador visual da sessão', () => {
        const source = fs.readFileSync(publicPath('js', 'session-ui.js'), 'utf8');
        expect(source).not.toMatch(/\.innerHTML\s*=/);
        expect(source).not.toMatch(/\bonclick\s*=/i);
        expect(source).toContain('textContent');
        expect(source).toContain('addEventListener');
    });
});
