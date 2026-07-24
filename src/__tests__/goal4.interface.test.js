const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(publicDir, 'admin.html'), 'utf8');
const script = fs.readFileSync(path.join(publicDir, 'js', 'admin.js'), 'utf8');
const dialogHelper = fs.readFileSync(path.join(publicDir, 'js', 'admin-dialog.js'), 'utf8');
const styles = fs.readFileSync(path.join(publicDir, 'css', 'style.css'), 'utf8');

describe('Goal 4 - painel administrativo seguro e funcional', () => {
    it('protege visualmente o painel com sessão ADMIN autoritativa', () => {
        expect(html).toContain('data-session-protected');
        expect(script).toContain("requiredRoles: ['ADMIN']");
        expect(script).toContain('papel confirmado pelo servidor: ADMIN');
    });

    it('conecta os três CRUDs às APIs reais', () => {
        expect(script).toContain('/api/admin/usuarios');
        expect(script).toContain('/api/cursos');
        expect(script).toContain('/api/turmas');
        expect(script).toContain("method: 'POST'");
        expect(script).toContain("method: 'PATCH'");
        expect(script).toContain("method: 'PUT'");
        expect(script).toContain("method: 'DELETE'");
    });

    it('oferece loading, vazio, sucesso, erro, filtros e formulários', () => {
        expect(script).toContain('renderLoading');
        expect(script).toContain('emptyState');
        expect(script).toContain("showFeedback(successMessage)");
        expect(script).toContain('renderError');
        expect(script).toContain("type = 'search'");
        expect(script).toContain('openForm');
        expect(script).toContain('reportValidity');
    });

    it('confirma exclusões e atualiza dados sem recarregar a página', () => {
        expect(script.match(/window\.confirm/g)?.length).toBe(3);
        expect(script).toContain('await loadActive()');
        expect(script).not.toContain('location.reload');
    });

    it('usa apenas construção segura do DOM e listeners explícitos', () => {
        expect(script).toContain('document.createElement');
        expect(script).toContain('textContent');
        expect(script).toContain('replaceChildren');
        expect(script).toContain('addEventListener');
        expect(script).not.toContain('innerHTML');
        expect(html).not.toMatch(/\son[a-z]+\s*=/i);
        expect(html).not.toMatch(/<script(?![^>]*\bsrc=)/i);
    });

    it('mantém senha fora da edição genérica e implementa troca própria separada', () => {
        expect(script).toContain('Trocar minha senha');
        expect(script).toContain('/senha`');
        expect(script).toContain("name: 'senha_atual'");
        expect(script).toContain("name: 'nova_senha'");
        expect(script).toContain('if (!usuario)');
    });

    it('centraliza criação de botões com ação e não contém handlers inline', () => {
        expect(script).toContain("button.addEventListener('click', (event) =>");
        expect(script).toContain('button.focus()');
        expect(script).toContain('handler(event)');
        expect(script).not.toMatch(/\.onclick\s*=/);
        expect(html).not.toMatch(/javascript:/i);
    });

    it('centraliza o overlay na viewport e mantém rolagem interna em desktop e celular', () => {
        expect(styles).toMatch(/\.admin-dialog\s*\{[^}]*position:fixed;[^}]*inset:0;[^}]*margin:auto;/s);
        expect(styles).toMatch(/\.admin-dialog\s*\{[^}]*z-index:1000;[^}]*overflow-y:auto;/s);
        expect(styles).toMatch(/\.admin-dialog::backdrop\s*\{[^}]*position:fixed;[^}]*inset:0;/s);
        expect(styles).toMatch(/@media \(max-width:640px\)[\s\S]*?\.admin-dialog\s*\{[^}]*100dvh/s);
    });

    it('aplica o mesmo ciclo acessível aos modais de usuário, curso, turma e senha', () => {
        expect(script).toContain("import { showAdminDialog } from './admin-dialog.js'");
        expect(script).toContain('showAdminDialog(dialog, { initialFocus:');
        expect(script.match(/openForm\(\{/g)?.length).toBeGreaterThanOrEqual(7);
        expect(dialogHelper).toContain("dialog.addEventListener('cancel'");
        expect(dialogHelper).toContain("dialog.addEventListener('close'");
        expect(dialogHelper).toContain("body.style.overflow = 'hidden'");
        expect(dialogHelper).toContain('opener.focus()');
    });
});
