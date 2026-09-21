import { initSessionUI } from './session-ui.js';
import { setAcademicMessage } from './academic-ui.js';
import {
    byId,
    formatPeriod,
    positiveId,
    renderBreadcrumbs,
    renderCourseNavigation,
    requestJson,
    setProgress,
    statusClass,
    statusLabel
} from './academic-area.js';

const idTurma = positiveId('id_turma');

function setLinks() {
    const query = `?id_turma=${encodeURIComponent(idTurma)}`;
    byId('link-aulas').href = `/sala-aulas.html${query}`;
    byId('link-avaliacoes').href = `/sala-avaliacoes.html${query}`;
    byId('link-progresso').href = `/sala-progresso.html${query}`;
    byId('link-certificado').href = `/meus-certificados.html${query}`;
}

window.addEventListener('load', async () => {
    const session = await initSessionUI({ requiredRoles: ['ALUNO'] });
    if (session.state !== 'authenticated') return;
    if (!idTurma) {
        window.location.href = '/sala-virtual.html?motivo=turma_invalida';
        return;
    }

    setLinks();
    renderCourseNavigation(byId('course-navigation'), idTurma, 'visao-geral');
    renderBreadcrumbs(byId('breadcrumbs'), [
        { label: 'Sala Virtual', href: '/sala-virtual.html' },
        { label: 'Curso' }
    ]);

    try {
        const payload = await requestJson('/api/matriculas/minha-sala');
        const turma = (payload.turmas || []).find((item) => Number(item.id_turma) === idTurma);
        if (!turma) throw Object.assign(new Error('Esta turma não está disponível na sua Sala Virtual.'), { status: 403 });
        byId('titulo-turma').textContent = turma.nome_curso || 'Curso';
        byId('nome-curso').textContent = turma.nome_turma || 'Turma';
        byId('periodo-turma').textContent = formatPeriod(turma.data_inicio, turma.data_fim);
        byId('status-turma').className = statusClass(turma.status_turma);
        byId('status-turma').textContent = statusLabel(turma.status_turma);
        const progress = setProgress(byId('progress-bar'), byId('progress-bar-fill'), turma.progresso_percentual);
        byId('progresso-label').textContent = `${progress}%`;
        byId('resumo-progresso').textContent = `${progress}% da trilha concluída. Veja conteúdos, avaliações e situação acadêmica.`;
        renderBreadcrumbs(byId('breadcrumbs'), [
            { label: 'Sala Virtual', href: '/sala-virtual.html' },
            { label: turma.nome_curso || 'Curso' }
        ]);
        setAcademicMessage(byId('mensagem-curso'), '', 'info');
    } catch (error) {
        setAcademicMessage(byId('mensagem-curso'), error.message, 'error');
    }
});
