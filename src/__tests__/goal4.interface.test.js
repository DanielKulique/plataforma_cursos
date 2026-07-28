const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const cssDir = path.join(publicDir, 'css');
const html = fs.readFileSync(path.join(publicDir, 'admin.html'), 'utf8');
const script = fs.readFileSync(path.join(publicDir, 'js', 'admin.js'), 'utf8');
const dialogHelper = fs.readFileSync(path.join(publicDir, 'js', 'admin-dialog.js'), 'utf8');
const legacyStyles = fs.readFileSync(path.join(cssDir, 'style.css'), 'utf8');
const components = fs.readFileSync(path.join(cssDir, 'components.css'), 'utf8');
const layouts = fs.readFileSync(path.join(cssDir, 'layouts.css'), 'utf8');
const responsive = fs.readFileSync(path.join(cssDir, 'responsive.css'), 'utf8');
const styles = `${components}\n${layouts}\n${responsive}`;

function loadTabTargetIndex() {
    const start = script.indexOf('export function getAdminTabTargetIndex');
    const end = script.indexOf('\n}\n\nfunction updateTabs', start) + 2;
    const source = script.slice(start, end).replace('export ', '');
    return new Function(`${source}\nreturn getAdminTabTargetIndex;`)();
}

describe('Goal Visual 4 - painel administrativo acessível e responsivo', () => {
    it('carrega a cascata incremental, landmarks e sessão ADMIN autoritativa', () => {
        expect(html).toContain('class="academic-page admin-page admin-dashboard"');
        expect(html).toContain('href="#conteudo-principal"');
        expect(html).toContain('id="conteudo-principal"');
        expect(html).toContain('/css/components.css');
        expect(html).toContain('/css/layouts.css');
        expect(html).toContain('/css/responsive.css');
        expect(html).toContain('data-session-protected');
        expect(script).toContain("requiredRoles: ['ADMIN']");
        expect(script).toContain('papel confirmado pelo servidor: ADMIN');
    });

    it('preserva os endpoints, métodos e transformações de payload dos três CRUDs', () => {
        expect(script).toContain('/api/admin/usuarios');
        expect(script).toContain('/api/cursos');
        expect(script).toContain('/api/turmas');
        expect(script).toContain("method: 'POST'");
        expect(script).toContain("method: 'PATCH'");
        expect(script).toContain("method: 'PUT'");
        expect(script).toContain("method: 'DELETE'");
        expect(script).toContain('body: values');
        expect(script).toContain('carga_horaria: Number(values.carga_horaria)');
        expect(script).toContain('id_curso: Number(values.id_curso)');
        expect(script).toContain('id_professor: Number(values.id_professor)');
    });

    it('distingue loading, vazio, filtro sem resultado, erro HTTP e sucesso', () => {
        expect(script).toContain('renderLoading');
        expect(script).toContain('Nenhum usuário cadastrado');
        expect(script).toContain('Nenhum resultado');
        expect(script).toContain('HTTP ${status}');
        expect(script).toContain("showFeedback(successMessage)");
        expect(script).toContain("type === 'error' ? 'alert' : 'status'");
        expect(script).toContain("content.setAttribute('aria-busy', 'true')");
        expect(script).toContain("content.setAttribute('aria-busy', 'false')");
    });

    it('usa dialog nativo para formulários e confirmações com nomes associados', () => {
        expect(script.match(/openForm\(\{/g)?.length).toBeGreaterThanOrEqual(7);
        expect(script.match(/confirmAction\(\{/g)?.length).toBe(4);
        [
            'Criar usuário',
            'Editar usuário',
            'Trocar minha senha',
            'Criar curso',
            'Editar curso',
            'Criar turma',
            'Editar turma',
            'Excluir usuário',
            'Excluir curso',
            'Excluir turma'
        ].forEach((title) => expect(script).toContain(`title: '${title}'`));
        expect(script).not.toContain('window.confirm');
        expect(script).toContain("el('dialog', { className: 'admin-dialog' })");
        expect(script).toContain('aria-labelledby');
        expect(script).toContain('aria-describedby');
        expect(script).toContain('admin-dialog__close');
        expect(script).toContain('ariaLabel: `Fechar');
    });

    it('centraliza o diálogo e o backdrop, com largura e rolagem responsivas', () => {
        expect(components).toMatch(/\.admin-page \.admin-dialog\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*0;[\s\S]*?margin:\s*auto;/);
        expect(components).toMatch(/\.admin-page \.admin-dialog\s*\{[\s\S]*?z-index:\s*1000;[\s\S]*?overflow-y:\s*auto;/);
        expect(components).toMatch(/\.admin-page \.admin-dialog::backdrop\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*0;/);
        expect(responsive).toMatch(/@media \(max-width: 640px\)[\s\S]*?\.admin-page \.admin-dialog\s*\{[\s\S]*?100dvh/);
        expect(responsive).toMatch(/@media \(max-height: 680px\)[\s\S]*?\.admin-page \.admin-dialog/);
        expect(legacyStyles).not.toMatch(/\.admin-dialog\b/);
    });

    it('marca estado ocupado, impede envio duplicado e foca erro ou campo inválido', () => {
        expect(script).toContain('if (submitting) return');
        expect(script).toContain("form.setAttribute('aria-busy', String(busy))");
        expect(script).toContain('submit.disabled = busy');
        expect(script).toContain("form.querySelector(':invalid')?.focus()");
        expect(script).toContain('formError.focus()');
        expect(script).toContain("control.setAttribute('aria-invalid', 'true')");
        expect(script).not.toMatch(/console\.(log|info|debug)\([^)]*senha/i);
    });

    it('implementa tabs ARIA e navegação circular por setas, Home e End', () => {
        expect(script).toContain("tabs.setAttribute('role', 'tablist')");
        expect(script).toContain("tab.setAttribute('role', 'tab')");
        expect(script).toContain("tab.setAttribute('aria-controls', 'admin-panel-content')");
        expect(script).toContain("content.setAttribute('role', 'tabpanel')");
        expect(script).toContain("tab.setAttribute('aria-selected', String(selected))");

        const getTarget = loadTabTargetIndex();
        expect(getTarget('ArrowRight', 2, 3)).toBe(0);
        expect(getTarget('ArrowLeft', 0, 3)).toBe(2);
        expect(getTarget('Home', 2, 3)).toBe(0);
        expect(getTarget('End', 0, 3)).toBe(2);
        expect(getTarget('Escape', 1, 3)).toBeNull();
    });

    it('oferece busca e filtros rotulados, limpeza e alvos de toque', () => {
        expect(script).toContain("el('label', { text: `Buscar ${sectionLabel}` })");
        expect(script).toContain("el('label', { text: 'Filtrar por' })");
        expect(script).toContain("actionButton('Limpar filtros'");
        expect(styles).toMatch(/\.admin-page \.admin-toolbar :where\(input, select\)[\s\S]*?min-block-size:\s*48px/);
        expect(components).toMatch(/\.admin-page \.admin-tab[\s\S]*?min-block-size:\s*44px/);
    });

    it('estrutura tabelas com cabeçalhos, região rolável, dica e ações explícitas', () => {
        expect(script).toContain("cell.scope = 'col'");
        expect(script).toContain("container.setAttribute('role', 'region')");
        expect(script).toContain("container.setAttribute('aria-describedby', hintId)");
        expect(script).toContain('Tabela de usuários cadastrados');
        expect(script).toContain('`Editar ${itemType} ${itemLabel}`');
        expect(script).toContain('`Excluir ${itemType} ${itemLabel}`');
        expect(components).toMatch(/\.admin-page \.admin-table-scroll\s*\{[\s\S]*?overflow-x:\s*auto/);
        expect(responsive).toMatch(/\.admin-page \.admin-table-scroll-hint\s*\{[\s\S]*?display:\s*flex/);
    });

    it('mantém construção segura do DOM, CSP compatível e ausência de handlers inline', () => {
        expect(script).toContain('document.createElement');
        expect(script).toContain('textContent');
        expect(script).toContain('replaceChildren');
        expect(script).toContain('addEventListener');
        expect(script).not.toContain('innerHTML');
        expect(script).not.toMatch(/\.onclick\s*=/);
        expect(html).not.toMatch(/\son[a-z]+\s*=/i);
        expect(html).not.toMatch(/<script(?![^>]*\bsrc=)/i);
        expect(html).not.toMatch(/javascript:/i);
    });

    it('aplica foco contido, Escape, bloqueio do fundo e restauração do acionador', () => {
        expect(dialogHelper).toContain("dialog.addEventListener('keydown', containFocus)");
        expect(dialogHelper).toContain("dialog.addEventListener('cancel'");
        expect(dialogHelper).toContain("dialog.addEventListener('close'");
        expect(dialogHelper).toContain('lockPageScroll(documentRef)');
        expect(dialogHelper).not.toContain('.style.overflow');
        expect(dialogHelper).toContain('returnFocusTo.focus()');
    });
});
