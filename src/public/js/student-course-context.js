import { byId, formatPeriod, renderBreadcrumbs, renderCourseNavigation, requestJson, statusClass, statusLabel } from './academic-area.js';

export async function loadStudentCourse(idTurma, current, breadcrumbLabel) {
    const payload = await requestJson('/api/matriculas/minha-sala');
    const turma = (payload.turmas || []).find((item) => Number(item.id_turma) === Number(idTurma));
    if (!turma) throw Object.assign(new Error('Esta turma não está disponível na sua Sala Virtual.'), { status: 403 });

    if (byId('titulo-pagina')) byId('titulo-pagina').textContent = breadcrumbLabel;
    if (byId('nome-curso')) byId('nome-curso').textContent = turma.nome_curso || 'Curso';
    if (byId('nome-turma')) byId('nome-turma').textContent = turma.nome_turma || 'Turma';
    if (byId('periodo-turma')) byId('periodo-turma').textContent = formatPeriod(turma.data_inicio, turma.data_fim);
    if (byId('status-turma')) {
        byId('status-turma').className = statusClass(turma.status_turma);
        byId('status-turma').textContent = statusLabel(turma.status_turma);
    }

    renderCourseNavigation(byId('course-navigation'), idTurma, current);
    renderBreadcrumbs(byId('breadcrumbs'), [
        { label: 'Sala Virtual', href: '/sala-virtual.html' },
        { label: turma.nome_curso || 'Curso', href: `/sala-aula.html?id_turma=${encodeURIComponent(idTurma)}` },
        { label: breadcrumbLabel }
    ]);
    return turma;
}
