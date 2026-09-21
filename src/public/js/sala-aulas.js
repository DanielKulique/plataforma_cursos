import { initSessionUI } from './session-ui.js';
import { createAcademicState, setAcademicBusy, setAcademicMessage } from './academic-ui.js';
import { montarAulas } from './learning-path.js';
import { byId, createElement, positiveId, requestJson } from './academic-area.js';
import { loadStudentCourse } from './student-course-context.js';

const idTurma = positiveId('id_turma');

function renderLessons(modulos, conteudos) {
    const list = byId('lista-aulas');
    list.replaceChildren();
    setAcademicBusy(list, false);
    const aulas = montarAulas(modulos, conteudos, []);
    if (!aulas.length) {
        list.append(createAcademicState('Nenhuma aula foi publicada nesta turma.', 'empty'));
        return;
    }
    aulas.forEach((aula) => {
        const item = createElement('li', 'summary-row');
        const copy = createElement('div');
        copy.append(
            createElement('h3', '', `Aula ${aula.numero} — ${aula.titulo}`),
            createElement('p', '', `${aula.progresso.total} conteúdo(s) · ${aula.progresso.concluidos}/${aula.progresso.total} concluídos · ${aula.progresso.estado}`)
        );
        const link = createElement('a', 'action-button', aula.progresso.concluidos ? 'Continuar' : 'Abrir');
        link.href = `/sala-aula-detalhe.html?id_turma=${encodeURIComponent(idTurma)}&id_aula=${encodeURIComponent(aula.id_modulo)}`;
        item.append(copy, link);
        list.append(item);
    });
}

window.addEventListener('load', async () => {
    const session = await initSessionUI({ requiredRoles: ['ALUNO'] });
    if (session.state !== 'authenticated') return;
    if (!idTurma) { location.href = '/sala-virtual.html?motivo=turma_invalida'; return; }
    try {
        const [, payload] = await Promise.all([
            loadStudentCourse(idTurma, 'aulas', 'Aulas'),
            requestJson(`/api/turmas/${idTurma}/conteudos`)
        ]);
        renderLessons(payload.modulos || [], payload.conteudos || []);
        setAcademicMessage(byId('mensagem-aulas'), '', 'info');
    } catch (error) {
        setAcademicBusy(byId('lista-aulas'), false);
        byId('lista-aulas').replaceChildren(createAcademicState(error.message, 'error'));
        setAcademicMessage(byId('mensagem-aulas'), error.message, 'error');
    }
});
