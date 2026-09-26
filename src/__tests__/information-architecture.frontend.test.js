'use strict';

const fs = require('fs');
const path = require('path');
const publicDir = path.join(__dirname, '..', 'public');
const read = (...parts) => fs.readFileSync(path.join(publicDir, ...parts), 'utf8');

describe('Goal 13 — arquitetura de informação do aluno', () => {
    it('mantém a Sala Virtual como hub de turmas, sem certificados ou avaliações expandidos', () => {
        const html = read('sala-virtual.html');
        const script = read('js', 'sala-virtual.js');
        expect(html).toContain('id="lista-minhas-turmas"');
        expect(html).toContain('href="/meus-certificados.html"');
        expect(html).not.toContain('id="lista-meus-certificados"');
        expect(script).toContain("'Continuar curso'");
        expect(script).not.toContain('getMeusCertificados');
        expect(script).not.toContain("'Prova'");
        expect(script).not.toContain("'Exercícios'");
    });

    it('oferece hub e URLs especializadas preservando id_turma', () => {
        const hub = read('sala-aula.html');
        const script = read('js', 'sala-aula-hub.js');
        ['link-aulas', 'link-avaliacoes', 'link-progresso', 'link-certificado'].forEach((id) => expect(hub).toContain(`id="${id}"`));
        expect(script).toContain('/sala-aulas.html${query}');
        expect(script).toContain('/sala-avaliacoes.html${query}');
        expect(script).toContain('/sala-progresso.html${query}');
        expect(script).toContain('/meus-certificados.html${query}');
        expect(script).toContain("requestJson('/api/matriculas/minha-sala')");
        expect(script).not.toContain('/questionarios');
        expect(script).not.toContain('/conteudos');
        expect(script).toContain("{ label: turma.nome_curso || 'Curso' }");
    });

    it('lista a estrutura de aulas e carrega materiais somente no detalhe', () => {
        const list = read('js', 'sala-aulas.js');
        const detail = read('js', 'sala-aula-detalhe.js');
        expect(list).toContain('/sala-aula-detalhe.html?id_turma=');
        expect(list).not.toContain('transferPrivatePdf');
        expect(detail).toContain("filter((item) => Number(item.id_modulo) === idAula)");
        expect(detail).toContain('transferPrivatePdf(link.href)');
        expect(detail).toContain('/api/conteudos/${content.id_conteudo}/progresso');
    });

    it('separa exercícios/provas, progresso e certificados versionados', () => {
        const assessments = read('js', 'sala-avaliacoes.js');
        const progress = read('js', 'sala-progresso.js');
        const certificates = read('js', 'meus-certificados.js');
        expect(assessments).toContain("item.tipo === 'EXERCICIO'");
        expect(assessments).toContain("item.tipo === 'PROVA'");
        expect(assessments).toContain('item.bloqueada');
        expect(assessments).toContain('requisito_percentual_prova');
        expect(assessments).toContain('progresso_para_prova');
        expect(progress).toContain('course.progresso_percentual');
        expect(progress).toContain("item.tipo === 'EXERCICIO'");
        expect(certificates).toContain('getMeusCertificados({ retries: 1 })');
        expect(certificates).toContain('Ver detalhe e histórico de versões');
        expect(certificates).toContain('transferPrivatePdf(action.href');
    });

    it.each([
        ['sala-aula.html', 'sala-aula-hub.js'], ['sala-aulas.html', 'sala-aulas.js'],
        ['sala-aula-detalhe.html', 'sala-aula-detalhe.js'], ['sala-avaliacoes.html', 'sala-avaliacoes.js'],
        ['sala-progresso.html', 'sala-progresso.js'], ['meus-certificados.html', 'meus-certificados.js']
    ])('%s revalida sessão e suporta URL direta (%s)', (page, scriptFile) => {
        expect(read(page)).toContain('data-session-protected');
        const script = read('js', scriptFile);
        expect(script).toContain("requiredRoles: ['ALUNO']");
        expect(script).toContain("positiveId('id_turma')");
    });

    it('trata parâmetros ausentes, inválidos e recursos inexistentes sem depender da página anterior', () => {
        const lesson = read('js', 'sala-aula-detalhe.js');
        const certificates = read('js', 'meus-certificados.js');
        expect(lesson).toContain('if (!idTurma || !idAula)');
        expect(lesson).toContain('A aula informada não existe nesta turma.');
        expect(certificates).toContain("has('id_turma')");
        expect(certificates).toContain('turmaParamInformado && !idTurma');
    });
});

describe('Goal 13 — arquitetura de informação do professor/admin', () => {
    it('transforma professor-turma em painel sem listas e editores completos', () => {
        const html = read('professor-turma.html');
        const script = read('js', 'professor-turma-dashboard.js');
        ['link-alunos', 'link-aulas', 'link-avaliacoes', 'link-certificados'].forEach((id) => expect(html).toContain(`id="${id}"`));
        expect(html).not.toContain('lista-alunos');
        expect(html).not.toContain('lista-conteudos');
        expect(html).not.toContain('lista-perguntas');
        expect(script).not.toContain('/api/matriculas/turma/');
        expect(script).not.toContain('/questionarios');
    });

    it('usa páginas próprias e navegação contextual compartilhada', () => {
        const common = read('js', 'academic-area.js');
        expect(common).toContain('/professor-turma-alunos.html${query}');
        expect(common).toContain('/professor-turma-aulas.html${query}');
        expect(common).toContain('/professor-turma-avaliacoes.html${query}');
        expect(common).toContain('/professor-turma-certificados.html${query}');
        expect(common).toContain("link.setAttribute('aria-current', 'page')");
    });

    it('lista aulas resumidas e mostra conteúdos apenas no detalhe', () => {
        const list = read('js', 'professor-turma-aulas.js');
        const detail = read('js', 'professor-turma-aula.js');
        expect(list).toContain('/professor-turma-aula.html?id_turma=');
        expect(list).not.toContain('conteudo.corpo');
        expect(detail).toContain("filter((item) => Number(item.id_modulo) === idAula)");
        expect(detail).toContain('/api/turmas/${idTurma}/conteudos/pdf');
        expect(detail).toContain("method: editing ? 'PUT' : 'POST'");
    });

    it('lista avaliações sem perguntas e reserva estrutura para o detalhe', () => {
        const listHtml = read('professor-turma-avaliacoes.html');
        const list = read('js', 'professor-turma-avaliacoes.js');
        const detailHtml = read('professor-turma-avaliacao.html');
        const detail = read('js', 'professor-turma-avaliacao.js');
        expect(listHtml).not.toContain('lista-perguntas');
        expect(list).toContain('/professor-turma-avaliacao.html?id_turma=');
        expect(detailHtml).toContain('id="lista-perguntas"');
        expect(detail).toContain('assessment.possui_historico');
        expect(detail).toContain("return canEdit && assessment && !assessment.possui_historico");
    });

    it('preserva contratos de matrícula, autoria e certificados sem endpoint novo', () => {
        const students = read('js', 'professor-turma-alunos.js');
        const lessons = read('js', 'professor-turma-aulas.js');
        const content = read('js', 'professor-turma-aula.js');
        const assessments = read('js', 'professor-turma-avaliacoes.js');
        const detail = read('js', 'professor-turma-avaliacao.js');
        const certificates = read('js', 'professor-turma-certificados.js');
        expect(students).toContain('/api/matriculas/${editing.id_matricula}');
        expect(lessons).toContain('/api/turmas/${idTurma}/modulos');
        expect(content).toContain('/api/conteudos/${editing.id_conteudo}');
        expect(assessments).toContain('/api/turmas/${idTurma}/questionarios');
        expect(detail).toContain('/api/questionarios/${idQuestionario}/perguntas');
        expect(certificates).toContain('/api/certificados/matriculas/${id}/emitir');
        expect(certificates).toContain('/api/certificados/${operating.id_certificado}/${operation}');
    });

    it('mantém ENCERRADA read-only e FECHADA editável pela autorização existente', () => {
        const context = read('js', 'teacher-class-context.js');
        const certificates = read('js', 'professor-turma-certificados.js');
        expect(context).toContain("String(turma.status).toUpperCase() !== 'ENCERRADA'");
        expect(context).not.toMatch(/status[^\n]+FECHADA[^\n]+canEdit/);
        expect(certificates).toContain("!student.id_certificado && student.status_aprovacao === 'APROVADO'");
        expect(certificates).not.toContain("student.status_aprovacao === 'APROVADO' && context.canEdit");
    });

    it('valida parâmetros de detalhe e mantém retorno contextual explícito', () => {
        const assessments = read('js', 'professor-turma-avaliacoes.js');
        const assessment = read('js', 'professor-turma-avaliacao.js');
        const lesson = read('js', 'professor-turma-aula.js');
        expect(assessments).toContain("has('id_aula')");
        expect(assessments).toContain('aulaParamInformado && !presetLesson');
        expect(assessment).toContain('if (!idTurma || !idQuestionario)');
        expect(assessment).toContain('/professor-turma-avaliacoes.html?id_turma=');
        expect(lesson).toContain('A aula informada não existe nesta turma.');
        expect(lesson).toContain('/professor-turma-aulas.html?id_turma=');
    });
});

describe('Goal 13 — UX transversal', () => {
    it('possui breadcrumbs, links reais, estado atual e foco visível herdado', () => {
        const common = read('js', 'academic-area.js');
        expect(common).toContain("nav.setAttribute('aria-label', 'Caminho de navegação')");
        expect(common).toContain("createElement('a'");
        expect(common).not.toContain('onclick');
        expect(read('css', 'base.css')).toMatch(/:focus-visible/);
        expect(common).not.toContain('history.back');
    });

    it('contém o overflow nas navegações locais sem ampliar o shell acadêmico', () => {
        const components = read('css', 'components.css');
        const layouts = read('css', 'layouts.css');
        const responsive = read('css', 'responsive.css');
        expect(layouts).toMatch(/\.academic-page \.academic-main\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
        expect(layouts).toMatch(/\.academic-page \.academic-main > \*\s*\{[\s\S]*?min-inline-size:\s*0/);
        expect(layouts).toMatch(/\.academic-page \.course-navigation-host\s*\{[\s\S]*?max-inline-size:\s*100%;[\s\S]*?min-inline-size:\s*0/);
        expect(components).toMatch(/\.academic-page \.section-navigation\s*\{[\s\S]*?position:\s*static;[\s\S]*?overflow-x:\s*auto;[\s\S]*?overscroll-behavior-inline:\s*contain/);
        expect(components).toMatch(/\.academic-page \.academic-breadcrumbs\s*\{[\s\S]*?position:\s*static;[\s\S]*?max-inline-size:\s*100%/);
        expect(responsive).toContain('.academic-page .student-desktop-table');
        expect(responsive).toContain('.academic-page .student-mobile-list');
        expect(responsive).toContain('.academic-page .hub-grid');
    });

    it('não introduz scripts inline, handlers inline ou sinks HTML nas novas páginas', () => {
        const pages = fs.readdirSync(publicDir).filter((file) => /^(sala-|meus-|professor-turma).*\.html$/.test(file));
        pages.forEach((page) => {
            const html = read(page);
            expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
            expect(html).not.toMatch(/\son[a-z]+=/i);
            expect(html).not.toMatch(/\sstyle=/i);
        });
        const scripts = fs.readdirSync(path.join(publicDir, 'js')).filter((file) => /^(academic-area|student-course|sala-|meus-|teacher-class|professor-turma).*\.js$/.test(file));
        scripts.forEach((file) => expect(read('js', file)).not.toMatch(/\.innerHTML\s*=|insertAdjacentHTML|document\.write/));
    });
});
