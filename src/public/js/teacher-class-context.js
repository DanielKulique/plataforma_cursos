import { initSessionUI } from './session-ui.js';
import { byId, formatPeriod, renderBreadcrumbs, renderTeacherNavigation, requestJson, statusClass, statusLabel } from './academic-area.js';

export async function loadTeacherClass(idTurma, current, label) {
    const session = await initSessionUI({ requiredRoles: ['PROFESSOR', 'ADMIN'] });
    if (session.state !== 'authenticated') return null;
    let turma;
    if (session.user.tipo === 'PROFESSOR') {
        const payload = await requestJson(`/api/turmas/professor/${session.user.id_usuario}`);
        turma = (payload.turmas || []).find((item) => Number(item.id_turma) === Number(idTurma));
        if (!turma) throw Object.assign(new Error('Você não possui acesso a esta turma.'), { status: 403 });
    } else {
        turma = await requestJson(`/api/turmas/${idTurma}`);
    }
    if (byId('turma-title')) byId('turma-title').textContent = turma.nome_turma || 'Turma';
    if (byId('curso-title')) byId('curso-title').textContent = turma.nome_curso || 'Curso';
    if (byId('periodo-turma')) byId('periodo-turma').textContent = formatPeriod(turma.data_inicio, turma.data_fim);
    if (byId('status-turma')) { byId('status-turma').className = statusClass(turma.status); byId('status-turma').textContent = statusLabel(turma.status); }
    renderTeacherNavigation(byId('teacher-navigation'), idTurma, current);
    renderBreadcrumbs(byId('breadcrumbs'), [
        { label: 'Minhas turmas', href: session.user.tipo === 'ADMIN' ? '/admin.html' : '/professor.html' },
        { label: turma.nome_turma || 'Turma', href: `/professor-turma.html?id_turma=${encodeURIComponent(idTurma)}` },
        ...(current === 'visao-geral' ? [] : [{ label }])
    ]);
    return {
        session,
        turma,
        canEdit: String(turma.status).toUpperCase() !== 'ENCERRADA'
            && (session.user.tipo === 'ADMIN' || Number(turma.id_professor) === Number(session.user.id_usuario))
    };
}
