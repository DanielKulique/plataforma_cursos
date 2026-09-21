const fs = require('fs');
const path = require('path');

const publicPath = (...parts) => path.join(__dirname, '..', 'public', ...parts);
const html = fs.readFileSync(publicPath('professor-turma-avaliacao.html'), 'utf8');
const script = fs.readFileSync(publicPath('js', 'professor-turma-avaliacao.js'), 'utf8');
const components = fs.readFileSync(publicPath('css', 'components.css'), 'utf8');
const responsive = fs.readFileSync(publicPath('css', 'responsive.css'), 'utf8');

describe('autoria completa de avaliações no frontend do professor', () => {
    it('oferece formulários acessíveis para pergunta e alternativa', () => {
        expect(html).toContain('id="form-pergunta"');
        expect(html).toContain('id="pergunta-pontos"');
        expect(html).toContain('id="pergunta-ordem"');
        expect(html).toContain('id="form-alternativa"');
        expect(html).toContain('id="alternativa-correta"');
        expect(html).toContain('id="alternativa-ordem"');
        expect(html).toContain('aria-live="assertive"');
    });

    it('reutiliza o CRUD existente para editar, excluir, ordenar e marcar o gabarito', () => {
        expect(script).toContain('`/api/perguntas/${questionEditing.id_pergunta}`');
        expect(script).toContain('`/api/perguntas/${questionForOption.id_pergunta}/opcoes`');
        expect(script).toContain('`/api/opcoes/${optionEditing.id_opcao}`');
        expect(script).toContain("method: questionEditing ? 'PATCH' : 'POST'");
        expect(script).toContain("method: optionEditing ? 'PATCH' : 'POST'");
        expect(script).toContain("method: 'DELETE'");
        expect(script).not.toMatch(/editarPergunta2|update-question-v2/i);
    });

    it('renderiza estrutura, gabarito e bloqueio por histórico sem esconder a consulta', () => {
        expect(html).toContain('assessment-question-list');
        expect(script).toContain("option.correta ? 'Correta'");
        expect(script).toContain('assessment.possui_historico');
        expect(script).toContain('Estrutura protegida');
        expect(script).toContain('!assessment.possui_historico');
    });

    it('mantém a composição legível em telas estreitas', () => {
        expect(components).toContain('.teacher-class-page .assessment-option');
        expect(components).toContain('overflow-wrap: anywhere');
        expect(responsive).toContain('.teacher-class-page .assessment-option__actions');
    });
});
