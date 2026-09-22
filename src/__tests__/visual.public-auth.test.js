const fs = require('fs');
const path = require('path');
const request = require('supertest');

jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
const { app } = require('../../index');

const publicPath = (...parts) => path.join(__dirname, '..', 'public', ...parts);
const readPublic = (...parts) => fs.readFileSync(publicPath(...parts), 'utf8');

class FakeClassList {
    constructor() {
        this.values = new Set();
    }

    add(...values) {
        values.forEach((value) => this.values.add(value));
    }

    remove(...values) {
        values.forEach((value) => this.values.delete(value));
    }

    contains(value) {
        return this.values.has(value);
    }
}

class FakeElement {
    constructor(id = '', ownerDocument = null) {
        this.id = id;
        this.ownerDocument = ownerDocument;
        this.attributes = {};
        this.dataset = {};
        this.listeners = {};
        this.classList = new FakeClassList();
        this.textContent = '';
        this.value = '';
        this.hidden = true;
        this.disabled = false;
        this.parent = null;
        this.anchor = false;
    }

    setAttribute(name, value) {
        this.attributes[name] = String(value);
    }

    getAttribute(name) {
        return this.attributes[name] ?? null;
    }

    removeAttribute(name) {
        delete this.attributes[name];
    }

    addEventListener(type, listener) {
        if (!this.listeners[type]) this.listeners[type] = [];
        this.listeners[type].push(listener);
    }

    dispatch(type, event = {}) {
        return Promise.all(
            (this.listeners[type] || []).map((listener) => listener({ target: this, ...event }))
        );
    }

    closest(selector) {
        if (selector === 'nav') return this.parent?.isNav ? this.parent : null;
        if (selector === 'a[href]' && this.anchor) return this;
        return null;
    }

    contains(target) {
        return target === this || target?.parent === this;
    }

    focus() {
        this.focused = true;
        if (this.ownerDocument) this.ownerDocument.activeElement = this;
    }
}

function createDocument(elements, { readyState = 'loading' } = {}) {
    const listeners = {};
    const document = {
        readyState,
        activeElement: null,
        getElementById(id) {
            return elements[id] || null;
        },
        addEventListener(type, listener) {
            if (!listeners[type]) listeners[type] = [];
            listeners[type].push(listener);
        },
        async dispatch(type, event = {}) {
            return Promise.all((listeners[type] || []).map((listener) => listener(event)));
        }
    };
    Object.values(elements).forEach((element) => {
        element.ownerDocument = document;
    });
    return document;
}

function createField(value = '') {
    const field = new FakeElement();
    field.value = value;
    return field;
}

function createForm(fields, idleLabel) {
    const form = new FakeElement('form');
    const submit = new FakeElement('submit');
    submit.dataset.idleLabel = idleLabel;
    submit.textContent = idleLabel;
    form.querySelector = (selector) => (
        selector === 'button[type="submit"]' ? submit : null
    );
    Object.assign(form, fields);
    return { form, submit };
}

function response({ ok = true, status = ok ? 200 : 400, payload = {} } = {}) {
    return {
        ok,
        status,
        json: jest.fn().mockResolvedValue(payload)
    };
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function loadNavigation(document, window) {
    const source = readPublic('js', 'navigation.js').replace(/\bexport\s+/g, '');
    const factory = new Function(
        'document',
        'window',
        `${source}\nreturn { initMobileNavigation };`
    );
    return factory(document, window);
}

function loadLogin({ document, window, login }) {
    const source = readPublic('js', 'login.js').replace(/^import[^\n]+\n/, '');
    const factory = new Function(
        'document',
        'window',
        'login',
        'setToken',
        'getCurrentUser',
        'getRedirectByRole',
        `${source}\nreturn { exibirMensagem, setFormBusy };`
    );
    return factory(
        document,
        window,
        login,
        jest.fn(),
        jest.fn().mockResolvedValue(null),
        jest.fn(() => '/sala-virtual.html')
    );
}

function loadCadastro({ document, fetch, window = { location: { href: '', search: '' } } }) {
    const source = readPublic('js', 'cadastro.js');
    const factory = new Function(
        'document',
        'fetch',
        'window',
        'console',
        `${source}\nreturn { validarFormulario, setFormBusy };`
    );
    return factory(document, fetch, window, { warn: jest.fn() });
}

function loadVerification({
    document,
    fetch,
    window = { location: { href: '', search: '' } },
    setTimeout = jest.fn()
}) {
    const source = readPublic('js', 'verificar-email.js');
    const factory = new Function(
        'document',
        'fetch',
        'window',
        'setTimeout',
        `${source}\nreturn { setFormBusy };`
    );
    return factory(document, fetch, window, setTimeout);
}

describe('Goal Visual 2 - navegação pública', () => {
    function setupNavigation() {
        const nav = new FakeElement('site-nav');
        nav.isNav = true;
        const toggle = new FakeElement('mobile-nav-toggle');
        const menu = new FakeElement('primary-navigation');
        const link = new FakeElement('catalog-link');
        const outside = new FakeElement('outside');
        toggle.parent = nav;
        menu.parent = nav;
        link.parent = menu;
        link.anchor = true;
        nav.contains = (target) => [nav, toggle, menu, link].includes(target);

        const document = createDocument({
            'mobile-nav-toggle': toggle,
            'primary-navigation': menu
        });
        const mediaListeners = [];
        const window = {
            matchMedia: jest.fn(() => ({
                addEventListener: (_type, listener) => mediaListeners.push(listener)
            }))
        };
        const { initMobileNavigation } = loadNavigation(document, window);
        const controller = initMobileNavigation(document, window);
        return { controller, document, toggle, menu, link, outside, mediaListeners };
    }

    it('inicia fechado, abre por botão e sincroniza aria-expanded', async () => {
        const { controller, toggle, menu } = setupNavigation();

        expect(controller.isOpen()).toBe(false);
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(menu.dataset.mobileOpen).toBe('false');

        await toggle.dispatch('click');

        expect(controller.isOpen()).toBe(true);
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(toggle.getAttribute('aria-label')).toContain('Fechar');
        expect(menu.dataset.mobileOpen).toBe('true');
    });

    it('fecha por Escape e restaura o foco no botão', async () => {
        const { document, toggle } = setupNavigation();
        await toggle.dispatch('click');
        const preventDefault = jest.fn();

        await document.dispatch('keydown', { key: 'Escape', preventDefault });

        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(toggle.focused).toBe(true);
        expect(preventDefault).toHaveBeenCalledTimes(1);
    });

    it('fecha ao selecionar link, clicar fora ou voltar ao desktop', async () => {
        const { document, toggle, menu, link, outside, mediaListeners } = setupNavigation();

        await toggle.dispatch('click');
        await menu.dispatch('click', { target: link });
        expect(toggle.getAttribute('aria-expanded')).toBe('false');

        await toggle.dispatch('click');
        await document.dispatch('click', { target: outside });
        expect(toggle.getAttribute('aria-expanded')).toBe('false');

        await toggle.dispatch('click');
        mediaListeners[0]({ matches: false });
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
    });

    it('usa botão nativo e mantém controles privados ocultos antes da sessão', () => {
        const html = readPublic('index.html');
        expect(html).toMatch(/id="mobile-nav-toggle"[\s\S]*?type="button"[\s\S]*?aria-expanded="false"[\s\S]*?aria-controls="primary-navigation"/);
        expect(html).toMatch(/id="link-sala" hidden/);
        expect(html).toMatch(/id="avatar"[^>]*hidden/);
        expect(html).toMatch(/id="link-login-mobile" hidden/);
        expect(html).toMatch(/aria-current="page"/);
    });
});

describe('Goal Visual 2 - formulários acessíveis', () => {
    it('bloqueia envio duplicado no login e anuncia erro', async () => {
        const pending = deferred();
        const login = jest.fn(() => pending.promise);
        const { form, submit } = createForm({
            email: createField('aluno@example.test'),
            senha: createField('Senha!123')
        }, 'Entrar');
        const message = new FakeElement('mensagem-login');
        const document = createDocument({
            'form-login': form,
            'mensagem-login': message
        });
        loadLogin({
            document,
            window: { location: { href: '', search: '' } },
            login
        });

        const firstSubmit = form.dispatch('submit', { preventDefault: jest.fn() });
        await form.dispatch('submit', { preventDefault: jest.fn() });

        expect(login).toHaveBeenCalledTimes(1);
        expect(form.getAttribute('aria-busy')).toBe('true');
        expect(submit.disabled).toBe(true);
        expect(submit.getAttribute('aria-busy')).toBe('true');

        pending.reject(new Error('Credenciais inválidas.'));
        await firstSubmit;

        expect(message.getAttribute('role')).toBe('alert');
        expect(message.getAttribute('aria-live')).toBe('assertive');
        expect(message.classList.contains('is-error')).toBe(true);
        expect(form.getAttribute('aria-busy')).toBe('false');
        expect(submit.disabled).toBe(false);
    });

    it('associa erro de cadastro ao campo sem chamar a API', async () => {
        const { form } = createForm({
            nome_completo: createField('Ana Aluna'),
            cpf: createField('123'),
            email: createField('ana@example.test'),
            senha: createField('Senha!123'),
            confirmar_senha: createField('Senha!123')
        }, 'Cadastrar');
        const message = new FakeElement('mensagem-cadastro');
        const document = createDocument({
            'form-cadastro': form,
            'mensagem-cadastro': message,
            'bloco-pos-cadastro': new FakeElement('bloco-pos-cadastro'),
            'link-confirmar-email': new FakeElement('link-confirmar-email')
        });
        const fetch = jest.fn().mockResolvedValue(response({ payload: { disponivel: true } }));
        loadCadastro({ document, fetch });
        await new Promise((resolve) => setImmediate(resolve));
        fetch.mockClear();

        await form.dispatch('submit', { preventDefault: jest.fn() });

        expect(fetch).not.toHaveBeenCalled();
        expect(form.cpf.getAttribute('aria-invalid')).toBe('true');
        expect(form.cpf.focused).toBe(true);
        expect(message.getAttribute('role')).toBe('alert');
    });

    it('bloqueia duplicidade e conclui cadastro sem incluir papel no payload', async () => {
        const pendingAvailability = deferred();
        const fetch = jest.fn()
            .mockResolvedValueOnce(response({ payload: { disponivel: true } }))
            .mockImplementationOnce(() => pendingAvailability.promise)
            .mockResolvedValueOnce(response({ payload: {
                id_usuario: 10,
                email: 'ana@example.test',
                mensagem: 'Cadastro realizado. Enviamos o código de verificação por e-mail.',
                verificacao: { estado: 'PENDENTE', email_enviado: true }
            } }));
        const { form, submit } = createForm({
            nome_completo: createField('Ana Aluna'),
            cpf: createField('12345678901'),
            email: createField('ana@example.test'),
            senha: createField('Senha!123'),
            confirmar_senha: createField('Senha!123')
        }, 'Cadastrar');
        const message = new FakeElement('mensagem-cadastro');
        const postRegister = new FakeElement('bloco-pos-cadastro');
        const verificationLink = new FakeElement('link-confirmar-email');
        const document = createDocument({
            'form-cadastro': form,
            'mensagem-cadastro': message,
            'bloco-pos-cadastro': postRegister,
            'link-confirmar-email': verificationLink
        });
        loadCadastro({ document, fetch });
        await new Promise((resolve) => setImmediate(resolve));
        fetch.mockClear();

        const firstSubmit = form.dispatch('submit', { preventDefault: jest.fn() });
        await form.dispatch('submit', { preventDefault: jest.fn() });
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(form.getAttribute('aria-busy')).toBe('true');

        pendingAvailability.resolve(response({
            payload: { email_disponivel: true, cpf_disponivel: true }
        }));
        await firstSubmit;

        expect(fetch).toHaveBeenCalledTimes(2);
        expect(fetch.mock.calls.map(([url]) => url)).toEqual([
            '/api/usuarios/verificar-disponibilidade',
            '/api/usuarios'
        ]);
        const registrationPayload = JSON.parse(fetch.mock.calls[1][1].body);
        expect(registrationPayload).toEqual({
            nome_completo: 'Ana Aluna',
            cpf: '12345678901',
            email: 'ana@example.test',
            senha: 'Senha!123'
        });
        expect(registrationPayload).not.toHaveProperty('tipo');
        expect(message.getAttribute('role')).toBe('status');
        expect(message.classList.contains('is-success')).toBe(true);
        expect(postRegister.hidden).toBe(false);
        expect(submit.disabled).toBe(true);
        expect(submit.textContent).toBe('Cadastro concluído');
    });

    it('expõe loading, erro e recuperação na verificação sem envio duplicado', async () => {
        const pending = deferred();
        const fetch = jest.fn(() => pending.promise);
        const { form, submit } = createForm({
            email: createField('ana@example.test'),
            codigo: createField('123456')
        }, 'Confirmar e-mail');
        const message = new FakeElement('mensagem-verificacao-email');
        const document = createDocument({
            'form-verificar-email': form,
            'mensagem-verificacao-email': message
        });
        loadVerification({ document, fetch });

        const firstSubmit = form.dispatch('submit', { preventDefault: jest.fn() });
        await form.dispatch('submit', { preventDefault: jest.fn() });

        expect(fetch).toHaveBeenCalledTimes(1);
        expect(form.getAttribute('aria-busy')).toBe('true');
        expect(message.classList.contains('is-info')).toBe(true);
        expect(submit.disabled).toBe(true);

        pending.resolve(response({
            ok: false,
            status: 400,
            payload: { mensagem: 'Código inválido.' }
        }));
        await firstSubmit;

        expect(message.getAttribute('role')).toBe('alert');
        expect(message.classList.contains('is-error')).toBe(true);
        expect(form.getAttribute('aria-busy')).toBe('false');
        expect(submit.disabled).toBe(false);
    });

    it('anuncia sucesso e preserva endpoint e payload da verificação', async () => {
        const fetch = jest.fn().mockResolvedValue(response({ payload: { sucesso: true } }));
        const timer = jest.fn();
        const { form, submit } = createForm({
            email: createField('ana@example.test'),
            codigo: createField('654321')
        }, 'Confirmar e-mail');
        const message = new FakeElement('mensagem-verificacao-email');
        const document = createDocument({
            'form-verificar-email': form,
            'mensagem-verificacao-email': message
        });
        loadVerification({ document, fetch, setTimeout: timer });

        await form.dispatch('submit', { preventDefault: jest.fn() });

        expect(fetch).toHaveBeenCalledWith('/api/auth/verificar-codigo-email', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ email: 'ana@example.test', codigo: '654321' })
        }));
        expect(message.getAttribute('role')).toBe('status');
        expect(message.classList.contains('is-success')).toBe(true);
        expect(submit.disabled).toBe(true);
        expect(timer).toHaveBeenCalledWith(expect.any(Function), 1200);
    });
});

describe('Goal Visual 2 - estrutura, CSS e segurança', () => {
    const pages = ['index.html', 'login.html', 'cadastro.html', 'verificar-email.html'];
    const scripts = [
        'navigation.js',
        'theme.js',
        'session-ui.js',
        'script.js',
        'login.js',
        'cadastro.js',
        'verificar-email.js'
    ];

    it.each(pages)('%s possui um h1, landmark principal, labels e ordem CSS aprovada', (page) => {
        const html = readPublic(page);
        const styles = [...html.matchAll(/<link\s+rel="stylesheet"\s+href="(\/css\/[^"]+)">/g)]
            .map((match) => match[1]);
        expect((html.match(/<h1\b/g) || [])).toHaveLength(1);
        expect(html).toMatch(/<main\b[^>]*id="conteudo-principal"/);
        expect(styles).toEqual([
            '/css/tokens.css',
            '/css/base.css',
            '/css/style.css',
            '/css/components.css',
            '/css/layouts.css',
            '/css/responsive.css',
            '/css/utilities.css'
        ]);
        expect(html).not.toMatch(/\sstyle\s*=/i);
        expect(html).not.toMatch(/\son[a-z]+\s*=/i);
        expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
    });

    it('mantém labels associados, estados semânticos e tema nomeado nos formulários', () => {
        for (const page of ['login.html', 'cadastro.html', 'verificar-email.html']) {
            const html = readPublic(page);
            const inputIds = [...html.matchAll(/<input\b[^>]*\bid="([^"]+)"/g)]
                .map((match) => match[1]);
            inputIds.forEach((id) => expect(html).toContain(`for="${id}"`));
            expect(html).toMatch(/<form\b[^>]*aria-busy="false"/);
            expect(html).toMatch(/class="theme-toggle"[^>]*aria-label="Alternar tema"/);
            expect(html).toMatch(/class="auth-message status-message"[^>]*role="status"/);
        }
    });

    it('não introduz handler inline, sink innerHTML ou relaxamento da CSP', async () => {
        scripts.forEach((script) => {
            const source = readPublic('js', script);
            expect(source).not.toMatch(/\.innerHTML\s*=/);
            expect(source).not.toMatch(/\bon(click|change|submit|input|keydown)\s*=/i);
        });

        for (const page of pages) {
            const response = await request(app).get(`/${page}`);
            expect(response.status).toBe(200);
            expect(response.headers['content-security-policy']).toContain("script-src 'self'");
            expect(response.headers['content-security-policy']).not.toMatch(/script-src[^;]*'unsafe-inline'/);
        }
    });

    it('preserva contratos de login, cadastro e verificação', () => {
        const auth = readPublic('js', 'auth.js');
        const cadastro = readPublic('js', 'cadastro.js');
        const verification = readPublic('js', 'verificar-email.js');

        expect(auth).toContain("fetch('/api/auth/login'");
        expect(auth).toContain('body: JSON.stringify({ email, senha })');
        expect(cadastro).toContain("fetch('/api/usuarios'");
        expect(cadastro).toContain('body: JSON.stringify(payloadCadastro)');
        expect(cadastro).not.toMatch(/payloadCadastro\s*=\s*\{[^}]*\btipo\b/s);
        expect(verification).toContain("fetch('/api/auth/verificar-codigo-email'");
        expect(verification).toContain('body: JSON.stringify({ email, codigo })');
    });

    it('define disclosure abaixo de 900px, alvos de 44px e telas baixas roláveis', () => {
        const components = readPublic('css', 'components.css');
        const responsive = readPublic('css', 'responsive.css');
        const layouts = readPublic('css', 'layouts.css');

        expect(responsive).toContain('@media (max-width: 900px)');
        expect(responsive).toMatch(/\.nav-links\[data-mobile-open="true"\]\s*\{[^}]*display:\s*flex/s);
        expect(responsive).toMatch(/\.site-nav \.nav-links a\s*\{[^}]*min-block-size:\s*44px/s);
        expect(components).toMatch(/\.mobile-nav-toggle\s*\{[^}]*min-block-size:\s*44px/s);
        expect(components).toMatch(/\.auth-page \.btn-submit\s*\{[^}]*min-block-size:\s*44px/s);
        expect(responsive).toContain('@media (max-height: 680px)');
        expect(layouts).toMatch(/\.auth-page \.auth-shell\s*\{[^}]*min-block-size:\s*100dvh/s);
    });
});
