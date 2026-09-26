import { initSessionUI } from './session-ui.js';
import { createAcademicState, setAcademicBusy, setAcademicMessage } from './academic-ui.js';
import { byId, createElement, positiveId, requestJson } from './academic-area.js';
import { loadStudentCourse } from './student-course-context.js';

const idTurma = positiveId('id_turma');

function assessmentState(item, closed) {
    if (closed) return 'Turma encerrada';
    if (item.bloqueada) return `Bloqueada · ${item.requisitos?.progresso_para_prova || 0}% da trilha`;
    if (item.concluido) return item.melhor_nota !== null && item.melhor_nota !== undefined ? `Realizada · melhor nota ${item.melhor_nota}%` : 'Realizada';
    return item.ativo ? 'Disponível' : 'Indisponível';
}

function renderList(target, items, emptyMessage, closed) {
    const list = byId(target); list.replaceChildren(); setAcademicBusy(list, false);
    if (!items.length) { list.append(createAcademicState(emptyMessage, 'empty')); return; }
    items.forEach((item) => {
        const row = createElement('li', 'summary-row'); const copy = createElement('div');
        copy.append(createElement('h3', '', item.titulo), createElement('p', '', `${item.total_perguntas || 0} pergunta(s) · ${assessmentState(item, closed)}`));
        if (item.prova_final && item.bloqueada) {
            const requisito = item.requisitos?.requisito_percentual_prova;
            const progresso = item.requisitos?.progresso_para_prova ?? 0;
            copy.append(createElement('p', '', `Complete pelo menos ${requisito}% da trilha para liberar esta avaliação.`));
            copy.append(createElement('p', '', `Seu progresso: ${progresso}%.`));
        }
        const link = createElement('a', 'action-button', item.concluido ? 'Revisar / tentar novamente' : 'Iniciar');
        link.href = `/questionario.html?tipo=${String(item.tipo).toLowerCase()}&id_turma=${encodeURIComponent(idTurma)}&id_questionario=${encodeURIComponent(item.id_questionario)}`;
        if (closed || item.bloqueada || !item.ativo || !Number(item.total_perguntas)) { link.removeAttribute('href'); link.setAttribute('aria-disabled', 'true'); link.classList.add('is-disabled'); }
        row.append(copy, link); list.append(row);
    });
}

window.addEventListener('load', async () => {
    const session = await initSessionUI({ requiredRoles: ['ALUNO'] }); if (session.state !== 'authenticated') return;
    if (!idTurma) { location.href = '/sala-virtual.html?motivo=turma_invalida'; return; }
    try {
        const [course, payload] = await Promise.all([loadStudentCourse(idTurma, 'avaliacoes', 'Avaliações'), requestJson(`/api/turmas/${idTurma}/questionarios`)]);
        const items = payload.questionarios || []; const closed = String(course.status_turma).toUpperCase() === 'ENCERRADA';
        renderList('lista-exercicios', items.filter((item) => item.tipo === 'EXERCICIO'), 'Nenhum exercício disponível.', closed);
        renderList('lista-provas', items.filter((item) => item.tipo === 'PROVA'), 'Nenhuma prova disponível.', closed);
        setAcademicMessage(byId('mensagem-avaliacoes'), closed ? 'Turma encerrada — avaliações disponíveis somente para consulta.' : '', 'info');
    } catch (error) {
        ['lista-exercicios', 'lista-provas'].forEach((id) => { byId(id).replaceChildren(createAcademicState(error.message, 'error')); setAcademicBusy(byId(id), false); });
        setAcademicMessage(byId('mensagem-avaliacoes'), error.message, 'error');
    }
});
