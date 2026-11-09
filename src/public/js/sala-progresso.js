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
        byId('metrica-prova').textContent = finalExam ? (finalExam.requisitos?.prova_final_percentual != null ? `${finalExam.requisitos.prova_final_percentual}%` : finalExam.bloqueada ? 'Bloqueada' : 'Disponível') : 'Não publicada';
        const requirements = finalExam?.requisitos || assessments[0]?.requisitos;
        byId('metrica-situacao').textContent = statusLabel(requirements?.status_aprovacao || course.status_aprovacao || 'CURSANDO');
        setAcademicMessage(byId('mensagem-progresso'), requirements?.prova_final_tentada ? `Teste Final: ${requirements.prova_final_percentual}%. ${requirements.prova_final_aprovada ? 'Aprovado.' : 'Reprovado.'} Não há nova tentativa disponível.` : official < 80 ? 'Você poderá realizar a prova final quando concluir pelo menos 80% dos conteúdos do curso.' : 'Você já concluiu o mínimo de conteúdos. Acesse Avaliações para realizar o Teste Final.', 'info');
    } catch (error) { setAcademicMessage(byId('mensagem-progresso'), error.message, 'error'); }
});
