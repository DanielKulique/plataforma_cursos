import { initSessionUI } from './session-ui.js';
import { setAcademicMessage } from './academic-ui.js';
import { byId, positiveId, requestJson, setProgress, statusLabel } from './academic-area.js';
import { loadStudentCourse } from './student-course-context.js';

const idTurma = positiveId('id_turma');
window.addEventListener('load', async () => {
    const session = await initSessionUI({ requiredRoles: ['ALUNO'] }); if (session.state !== 'authenticated') return;
    if (!idTurma) { location.href = '/sala-virtual.html?motivo=turma_invalida'; return; }
    try {
        const [course, contentsPayload, assessmentsPayload] = await Promise.all([
            loadStudentCourse(idTurma, 'progresso', 'Meu progresso'), requestJson(`/api/turmas/${idTurma}/conteudos`), requestJson(`/api/turmas/${idTurma}/questionarios`)
        ]);
        const contents = contentsPayload.conteudos || []; const assessments = assessmentsPayload.questionarios || [];
        const exercises = assessments.filter((item) => item.tipo === 'EXERCICIO'); const finalExam = assessments.find((item) => item.prova_final);
        const official = setProgress(byId('progress-bar'), byId('progress-bar-fill'), course.progresso_percentual); byId('progresso-label').textContent = `${official}%`;
        byId('metrica-conteudos').textContent = `${contents.filter((item) => item.concluido).length}/${contents.length} concluídos`;
        byId('metrica-exercicios').textContent = `${exercises.filter((item) => item.concluido).length}/${exercises.length} realizados`;
        byId('metrica-prova').textContent = finalExam ? (finalExam.melhor_nota !== null && finalExam.melhor_nota !== undefined ? `${finalExam.melhor_nota}%` : finalExam.bloqueada ? 'Bloqueada' : 'Disponível') : 'Não publicada';
        const requirements = finalExam?.requisitos || assessments[0]?.requisitos;
        byId('metrica-situacao').textContent = statusLabel(requirements?.status_aprovacao || course.status_aprovacao || 'CURSANDO');
        setAcademicMessage(byId('mensagem-progresso'), official < 80 ? 'A prova final será liberada após atingir 80% da trilha, conforme validação do backend.' : 'Percentual mínimo da trilha atingido. Consulte Avaliações para verificar a disponibilidade da prova.', 'info');
    } catch (error) { setAcademicMessage(byId('mensagem-progresso'), error.message, 'error'); }
});
