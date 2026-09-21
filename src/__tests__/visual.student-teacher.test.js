'use strict';

const fs = require('fs');
const path = require('path');
const publicPath = (...parts) => path.join(__dirname, '..', 'public', ...parts);
const read = (...parts) => fs.readFileSync(publicPath(...parts), 'utf8');

const pages = [
    'sala-virtual.html', 'sala-aula.html', 'sala-aulas.html', 'sala-aula-detalhe.html',
    'sala-avaliacoes.html', 'sala-progresso.html', 'meus-certificados.html', 'questionario.html',
    'professor.html', 'professor-turma.html', 'professor-turma-alunos.html',
    'professor-turma-aulas.html', 'professor-turma-aula.html',
    'professor-turma-avaliacoes.html', 'professor-turma-avaliacao.html',
    'professor-turma-certificados.html'
];

describe('estrutura visual acadêmica', () => {
    it.each(pages)('%s usa sessão protegida, skip-link, um h1 e scripts externos', (page) => {
        const html = read(page);
        expect(html).toMatch(/<body class="academic-page academic-page--(?:student|teacher)/);
        expect(html).toContain('data-session-state="loading"');
        expect(html).toContain('data-session-protected');
        expect(html).toContain('class="skip-link"');
        expect(html).toContain('id="conteudo-principal"');
        expect((html.match(/<h1\b/g) || [])).toHaveLength(1);
        expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
        expect(html).not.toMatch(/\son[a-z]+=/i);
        expect(html).not.toMatch(/\sstyle=/i);
    });

    it('preserva a identidade Araucária e a cascata modular', () => {
        const tokens = read('css', 'tokens.css');
        expect(tokens).toContain('"Fraunces"');
        expect(tokens).toContain('"Work Sans"');
        expect(tokens).toContain('--palette-light-background: #f1ead9');
        expect(tokens).toContain('--palette-light-action: #1f3a2b');
        expect(tokens).toContain('--palette-light-accent: #9a592a');
        pages.forEach((page) => {
            const html = read(page);
            ['/css/tokens.css', '/css/base.css', '/css/style.css', '/css/components.css', '/css/layouts.css', '/css/responsive.css', '/css/utilities.css']
                .forEach((stylesheet) => expect(html).toContain(`href="${stylesheet}"`));
        });
    });

    it('trata loading, empty, error e feedback ao vivo', () => {
        const combinedHtml = pages.map((page) => read(page)).join('\n');
        const scripts = fs.readdirSync(publicPath('js')).filter((file) => /^(sala-|meus-|professor-turma).*\.js$/.test(file)).map((file) => read('js', file)).join('\n');
        expect(combinedHtml).toContain('is-loading');
        expect(combinedHtml).toContain('aria-live="polite"');
        expect(scripts).toContain('createAcademicState');
        expect(scripts).toContain('setAcademicMessage');
        expect(scripts).not.toMatch(/\b(?:MOCK|mockData|fallbackQuestionario|demo=1)\b/);
    });

    it('mantém diálogos nativos, rótulos e alertas nas áreas de edição', () => {
        const students = read('professor-turma-alunos.html');
        const assessment = read('professor-turma-avaliacao.html');
        expect(students).toContain('<dialog id="modal-matricula"');
        expect(students).toContain('<label for="nota-final">');
        expect(students).toContain('<label for="status-aprovacao">');
        expect(students).toMatch(/id="erro-modal"[^>]*role="alert"/);
        expect(assessment).toContain('<dialog id="modal-pergunta"');
        expect(assessment).toContain('<dialog id="modal-alternativa"');
        expect(assessment).toContain('aria-live="assertive"');
    });

    it('preserva alvos, foco, diálogo rolável e breakpoints móveis', () => {
        const components = read('css', 'components.css');
        const responsive = read('css', 'responsive.css');
        expect(components).toMatch(/\.academic-page \.btn[\s\S]*?min-block-size:\s*44px/);
        expect(components).toContain('.academic-dialog::backdrop');
        expect(components).toMatch(/\.academic-dialog\s*\{[\s\S]*?overflow-y:\s*auto/);
        expect(responsive).toContain('@media (max-width: 640px)');
        expect(responsive).toContain('@media (max-height: 680px)');
        expect(responsive).toContain('.academic-page .student-mobile-list');
    });
});
