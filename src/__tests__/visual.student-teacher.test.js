const fs = require('fs');
const path = require('path');

const publicPath = (...parts) => path.join(__dirname, '..', 'public', ...parts);
const readPublic = (...parts) => fs.readFileSync(publicPath(...parts), 'utf8');

const phasePages = [
    'sala-virtual.html',
    'sala-aula.html',
    'questionario.html',
    'professor.html',
    'professor-turma.html'
];

const phaseScripts = [
    'sala-virtual.js',
    'sala-aula.js',
    'questionario.js',
    'professor.js',
    'professor-turma.js',
    'academic-ui.js',
    'academic-dialog.js'
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

function loadModuleFunctions(file, names) {
    const source = readPublic('js', file)
        .replace(/^import[^\n]+\n/gm, '')
        .replace(/\bexport\s+/g, '');
    const scrollSource = readPublic('js', 'page-scroll.js').replace(/\bexport\s+/g, '');
    const lockPageScroll = new Function(`${scrollSource}\nreturn lockPageScroll;`)();
    const factory = new Function(
        'lockPageScroll',
        `${source}\nreturn { ${names.join(', ')} };`
    );
    return factory(lockPageScroll);
}

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
    constructor(documentRef) {
        this.documentRef = documentRef;
        this.attributes = {};
        this.listeners = {};
        this.hidden = false;
        this.disabled = false;
        this.isConnected = true;
        this.classList = new FakeClassList();
        this.textContent = '';
    }

    setAttribute(name, value) {
        this.attributes[name] = String(value);
    }

    addEventListener(type, listener) {
        this.listeners[type] ||= [];
        this.listeners[type].push(listener);
    }

    dispatch(type, event = {}) {
        (this.listeners[type] || []).forEach((listener) => listener(event));
    }

    focus() {
        this.documentRef.activeElement = this;
        this.focusCalls = (this.focusCalls || 0) + 1;
    }
}

class FakeDialog extends FakeElement {
    constructor(documentRef, focusable = []) {
        super(documentRef);
        this.focusable = focusable;
        this.open = false;
    }

    querySelectorAll() {
        return this.focusable;
    }

    showModal() {
        this.open = true;
        this.showModalCalls = (this.showModalCalls || 0) + 1;
    }

    close() {
        this.open = false;
        this.closeCalls = (this.closeCalls || 0) + 1;
        this.dispatch('close');
    }
}

function dialogSetup() {
    const documentRef = {
        activeElement: null,
        body: { classList: new FakeClassList() },
        documentElement: { classList: new FakeClassList() },
        defaultView: { setTimeout: (callback) => callback() }
    };
    const opener = new FakeElement(documentRef);
    const first = new FakeElement(documentRef);
    const last = new FakeElement(documentRef);
    const dialog = new FakeDialog(documentRef, [first, last]);
    documentRef.activeElement = opener;
    return { documentRef, opener, first, last, dialog };
}

describe('Goal Visual 3 - estrutura acadêmica', () => {
    it.each(phasePages)('%s usa a cascata incremental, landmarks e disclosure móvel', (page) => {
        const html = readPublic(page);
        const styles = [...html.matchAll(/<link\s+rel="stylesheet"\s+href="(\/css\/[^"]+)">/g)]
            .map((match) => match[1]);

        expect(styles).toEqual(expectedStyles);
        expect(html).toMatch(/<body class="academic-page academic-page--(?:student|teacher)/);
        expect(html).toContain('data-session-state="loading"');
        expect(html).toContain('data-session-protected');
        expect(html).toMatch(/<a class="skip-link" href="#conteudo-principal">/);
        expect(html).toMatch(/<nav class="academic-nav" aria-label="[^"]+">/);
        expect(html).toContain('id="mobile-nav-toggle"');
        expect(html).toContain('aria-controls="primary-navigation"');
        expect(html).toContain('aria-expanded="false"');
        expect(html).toContain('id="primary-navigation"');
        expect(html).toContain('<main class="academic-main" id="conteudo-principal"');
        expect((html.match(/<h1\b/g) || [])).toHaveLength(1);
        expect(html).toContain('class="academic-trail" aria-hidden="true"');
        expect(html).not.toMatch(/\sstyle="/i);
        expect(html).not.toMatch(/\son[a-z]+="/i);
        expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
    });

    it('organiza a área do aluno em turmas, progresso, módulos, avaliação e histórico reais', () => {
        const virtualRoom = readPublic('sala-virtual.html');
        const classroom = readPublic('sala-aula.html');
        const quiz = readPublic('questionario.html');

        expect(virtualRoom).toMatch(/<ul class="academic-card-list" id="lista-minhas-turmas"/);
        expect(classroom).toContain('role="progressbar"');
        expect(classroom).toMatch(/role="group" aria-label="Filtrar conteúdos por tipo"/);
        expect(classroom).toMatch(/data-filtro="todos" aria-pressed="true"/);
        expect(classroom).toMatch(/id="link-prova"[^>]*\bhidden\b/);
        expect(classroom).toMatch(/id="link-exercicios"[^>]*\bhidden\b/);
        expect(quiz).toMatch(/<form id="form-questionario" aria-busy="false">/);
        expect(quiz).toContain('selecione exatamente uma alternativa');
        expect(quiz).toMatch(/<ul id="lista-historico" class="history-list" aria-busy="true">/);
        expect(quiz).toContain('Desempenho persistido');
    });

    it('mantém a área do professor focada em acompanhamento sem iniciar autoria', () => {
        const teacher = readPublic('professor.html');
        const classroom = readPublic('professor-turma.html');
        const source = readPublic('js', 'professor-turma.js');

        expect(teacher).toContain('Acompanhamento de turmas');
        expect(classroom).toContain('Material persistido, sem ações de autoria.');
        expect(classroom).toContain('Somente metadados; nenhum gabarito é exibido.');
        expect(classroom).toMatch(/<caption class="sr-only">/);
        expect(classroom).toMatch(/<th scope="col">Aluno<\/th>/);
        expect(classroom).toContain('role="region"');
        expect(classroom).toContain('tabindex="0"');
        expect(source).not.toMatch(/\b(?:criar|editar)(?:Conteudo|Questionario)\b/);
        expect(source).not.toMatch(/gabarito|resposta_correta/i);
    });

    it('expõe estados semânticos sem dados simulados ou sinks de HTML', () => {
        const combinedHtml = phasePages.map((file) => readPublic(file)).join('\n');
        const combinedJs = phaseScripts.map((file) => readPublic('js', file)).join('\n');

        expect(combinedHtml).toMatch(/is-loading/);
        expect(combinedHtml).toMatch(/aria-busy="true"/);
        expect(combinedHtml).toMatch(/role="status"/);
        expect(combinedJs).toContain("createAcademicState(");
        expect(combinedJs).toContain("setAcademicMessage(");
        expect(combinedJs).not.toMatch(/\b(?:MOCK|mockData|fallbackQuestionario|demo=1)\b/);
        expect(combinedJs).not.toMatch(/\.innerHTML\s*=|insertAdjacentHTML|document\.write/);
    });
});

describe('Goal Visual 3 - contratos funcionais preservados', () => {
    it('mantém os endpoints e payloads existentes do aluno', () => {
        const classroom = readPublic('js', 'sala-aula.js');
        const quiz = readPublic('js', 'questionario.js');

        expect(classroom).toContain('/api/matriculas/minha-sala');
        expect(classroom).toContain('/api/conteudos/${conteudo.id_conteudo}/progresso');
        expect(classroom).toContain("method: 'PUT'");
        expect(classroom).toContain('body: JSON.stringify({ status })');
        expect(classroom).toContain('buscarQuestionarioDisponivel');
        expect(quiz).toContain('/api/turmas/${idTurma}/questionarios/disponivel?tipo=${tipo}');
        expect(quiz).toContain('/api/questionarios/${questionario.id_questionario}/submissoes');
        expect(quiz).toContain('body: JSON.stringify({ respostas })');
        expect(quiz).toContain('/api/questionarios/historico?id_questionario=');
    });

    it('mantém os endpoints, método e payload de acompanhamento do professor', () => {
        const teacher = readPublic('js', 'professor.js');
        const classroom = readPublic('js', 'professor-turma.js');

        expect(teacher).toContain("'/api/turmas/professor/' + usuario.id_usuario");
        expect(classroom).toContain('/api/matriculas/turma/${idTurma}');
        expect(classroom).toContain('/api/turmas/${idTurma}/conteudos');
        expect(classroom).toContain('/api/turmas/${idTurma}/questionarios');
        expect(classroom).toContain('/api/matriculas/${matriculaId}');
        expect(classroom).toContain("method: 'PATCH'");
        expect(classroom).toContain('body: JSON.stringify(dadosAtualizacao)');
    });

    it('mantém autorização por papel e não altera armazenamento do token', () => {
        expect(readPublic('js', 'sala-virtual.js')).toContain("requiredRoles: ['ALUNO']");
        expect(readPublic('js', 'sala-aula.js')).toContain("requiredRoles: ['ALUNO']");
        expect(readPublic('js', 'questionario.js')).toContain("requiredRoles: ['ALUNO']");
        expect(readPublic('js', 'professor.js')).toContain("requiredRoles: ['PROFESSOR']");
        expect(readPublic('js', 'professor-turma.js')).toContain("requiredRoles: ['PROFESSOR']");
        phaseScripts.forEach((file) => {
            expect(readPublic('js', file)).not.toMatch(/localStorage\.(?:setItem|removeItem)/);
        });
    });
});

describe('Goal Visual 3 - diálogo acessível', () => {
    it('usa dialog nativo, campos rotulados e mensagem de validação', () => {
        const html = readPublic('professor-turma.html');

        expect(html).toMatch(/<dialog id="modal-edicao" class="academic-dialog"/);
        expect(html).toContain('aria-labelledby="titulo-modal-edicao"');
        expect(html).toContain('aria-describedby="descricao-modal-edicao"');
        ['nota-final', 'status-aprovacao', 'progresso'].forEach((id) => {
            expect(html).toMatch(new RegExp(`<label for="${id}">`));
        });
        expect(html).toMatch(/id="erro-modal-edicao"[^>]*role="alert"/);
    });

    it('abre modalmente, bloqueia o fundo e leva foco ao campo inicial', () => {
        const { createAcademicDialog } = loadModuleFunctions(
            'academic-dialog.js',
            ['createAcademicDialog']
        );
        const { documentRef, opener, first, dialog } = dialogSetup();
        const controller = createAcademicDialog(dialog, {
            initialFocus: first,
            documentRef
        });

        controller.open(opener);

        expect(dialog.showModalCalls).toBe(1);
        expect(dialog.attributes).toMatchObject({ 'aria-modal': 'true', tabindex: '-1' });
        expect(documentRef.body.classList.contains('is-scroll-locked')).toBe(true);
        expect(documentRef.documentElement.classList.contains('is-scroll-locked')).toBe(true);
        expect(documentRef.activeElement).toBe(first);
    });

    it('contém Tab e Shift+Tab dentro do diálogo', () => {
        const { createAcademicDialog } = loadModuleFunctions(
            'academic-dialog.js',
            ['createAcademicDialog']
        );
        const { documentRef, opener, first, last, dialog } = dialogSetup();
        const controller = createAcademicDialog(dialog, { initialFocus: first, documentRef });
        controller.open(opener);

        documentRef.activeElement = last;
        const tabEvent = { key: 'Tab', shiftKey: false, preventDefault: jest.fn() };
        dialog.dispatch('keydown', tabEvent);
        expect(tabEvent.preventDefault).toHaveBeenCalledTimes(1);
        expect(documentRef.activeElement).toBe(first);

        documentRef.activeElement = first;
        const shiftTabEvent = { key: 'Tab', shiftKey: true, preventDefault: jest.fn() };
        dialog.dispatch('keydown', shiftTabEvent);
        expect(shiftTabEvent.preventDefault).toHaveBeenCalledTimes(1);
        expect(documentRef.activeElement).toBe(last);
    });

    it('fecha com Escape, restaura a rolagem e devolve foco ao acionador', () => {
        const { createAcademicDialog } = loadModuleFunctions(
            'academic-dialog.js',
            ['createAcademicDialog']
        );
        const { documentRef, opener, first, dialog } = dialogSetup();
        const controller = createAcademicDialog(dialog, { initialFocus: first, documentRef });
        controller.open(opener);
        const cancelEvent = { preventDefault: jest.fn() };

        dialog.dispatch('cancel', cancelEvent);

        expect(cancelEvent.preventDefault).toHaveBeenCalledTimes(1);
        expect(dialog.closeCalls).toBe(1);
        expect(documentRef.body.classList.contains('is-scroll-locked')).toBe(false);
        expect(documentRef.documentElement.classList.contains('is-scroll-locked')).toBe(false);
        expect(documentRef.activeElement).toBe(opener);
    });
});

describe('Goal Visual 3 - CSS responsivo e utilitários acadêmicos', () => {
    const components = readPublic('css', 'components.css');
    const layouts = readPublic('css', 'layouts.css');
    const responsive = readPublic('css', 'responsive.css');

    it('isola a camada nas páginas acadêmicas e mantém alvos de 44px', () => {
        expect(components).toMatch(/\.academic-page \.btn[\s\S]*?min-block-size:\s*44px/);
        expect(components).toMatch(/\.academic-page \.filter-chip[\s\S]*?min-block-size:\s*44px/);
        expect(layouts).toContain('.academic-page .academic-main');
        expect(`${components}\n${layouts}\n${responsive}`).not.toMatch(/(^|\})\s*\.admin-tabs\b/m);
        expect(components).toContain('.admin-page .admin-tabs');
    });

    it('prevê tabela rolável, disclosure, celular e telas baixas', () => {
        expect(components).toMatch(/\.academic-page \.academic-table-scroll[\s\S]*?overflow-x:\s*auto/);
        expect(responsive).toContain('@media (max-width: 900px)');
        expect(responsive).toMatch(/\.academic-page \.academic-nav \.nav-links\[data-mobile-open="true"\]/);
        expect(responsive).toContain('@media (max-width: 640px)');
        expect(responsive).toContain('@media (max-height: 680px)');
        expect(responsive).toMatch(/\.academic-dialog[\s\S]*?max-block-size:\s*calc\(100dvh - var\(--space-4\)\)/);
    });

    it('centraliza o diálogo, permite rolagem e estiliza o backdrop', () => {
        expect(components).toMatch(/\.academic-dialog\s*\{[\s\S]*?margin:\s*auto/);
        expect(components).toMatch(/\.academic-dialog\s*\{[\s\S]*?overflow-y:\s*auto/);
        expect(components).toContain('.academic-dialog::backdrop');
    });

    it('formata mensagens, datas e preferência de movimento sem HTML dinâmico', () => {
        const {
            createAcademicState,
            formatAcademicDate,
            preferredScrollBehavior,
            setAcademicMessage
        } = loadModuleFunctions('academic-ui.js', [
            'createAcademicState',
            'formatAcademicDate',
            'preferredScrollBehavior',
            'setAcademicMessage'
        ]);
        const element = {
            textContent: '',
            hidden: true,
            attributes: {},
            classList: new FakeClassList(),
            setAttribute(name, value) {
                this.attributes[name] = String(value);
            }
        };
        setAcademicMessage(element, 'Falha controlada', 'error');
        expect(element.textContent).toBe('Falha controlada');
        expect(element.hidden).toBe(false);
        expect(element.attributes).toMatchObject({
            role: 'alert',
            'aria-live': 'assertive',
            'aria-atomic': 'true'
        });
        expect(formatAcademicDate('2026-07-23')).toBe('23/07/2026');
        expect(formatAcademicDate('2026-07-23T12:00:00Z')).toMatch(/23\/07\/2026/);
        expect(preferredScrollBehavior({
            matchMedia: () => ({ matches: true })
        })).toBe('auto');

        const state = createAcademicState('Sem registros', 'empty', {
            createElement: () => new FakeElement({ activeElement: null })
        });
        expect(state.textContent).toBe('Sem registros');
        expect(state.attributes.role).toBe('status');
    });
});
