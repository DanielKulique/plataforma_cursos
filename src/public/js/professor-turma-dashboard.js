import { setAcademicMessage } from './academic-ui.js';
import { byId, positiveId } from './academic-area.js';
import { loadTeacherClass } from './teacher-class-context.js';

const idTurma = positiveId('id_turma');
function setLinks() {
    const query = `?id_turma=${encodeURIComponent(idTurma)}`;
    byId('link-alunos').href = `/professor-turma-alunos.html${query}`;
    byId('link-aulas').href = `/professor-turma-aulas.html${query}`;
    byId('link-avaliacoes').href = `/professor-turma-avaliacoes.html${query}`;
    byId('link-certificados').href = `/professor-turma-certificados.html${query}`;
}
window.addEventListener('load', async () => {
    if (!idTurma) { location.href = '/professor.html?motivo=turma_invalida'; return; }
    setLinks();
    try {
        const context = await loadTeacherClass(idTurma, 'visao-geral', 'Visão geral'); if (!context) return;
        setAcademicMessage(byId('mensagem-turma'), String(context.turma.status).toUpperCase() === 'ENCERRADA' ? 'Turma encerrada — conteúdo acadêmico disponível somente para consulta.' : 'Escolha uma área para gerenciar esta turma.', 'info');
    } catch (error) { setAcademicMessage(byId('mensagem-turma'), error.message, 'error'); }
});
