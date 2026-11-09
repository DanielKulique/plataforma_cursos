import { createAcademicDialog } from './academic-dialog.js';
import { createAcademicState, setAcademicBusy, setAcademicMessage } from './academic-ui.js';
import { byId, createElement, positiveId, requestJson, statusClass, statusLabel } from './academic-area.js';
import { loadTeacherClass } from './teacher-class-context.js';

const idTurma = positiveId('id_turma'); let editing = null; let canEdit = false; let page = 1; let pageLimit = 25; let total = 0; let loading = false;
const dialog = createAcademicDialog(byId('modal-matricula'), { initialFocus: () => byId('nota-final') });
document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => dialog.close()));

function actionButton(student) { const button = createElement('button', 'action-button action-button--small', 'Editar'); button.type = 'button'; button.disabled = !canEdit || student.prova_final_percentual != null; if (student.prova_final_percentual != null) button.title = 'Resultado definido pelo Teste Final.'; button.addEventListener('click', () => { editing = student; byId('nota-final').value = student.nota_final ?? ''; byId('status-aprovacao').value = student.status_aprovacao || 'CURSANDO'; setAcademicMessage(byId('erro-modal'), '', 'error'); dialog.open(button); }); return button; }
function render(students) {
    const body = byId('lista-alunos'); const mobile = byId('lista-alunos-mobile'); body.replaceChildren(); mobile.replaceChildren(); setAcademicBusy(body, false); setAcademicBusy(mobile, false);
    if (!students.length) { const row = createElement('tr'); const cell = createElement('td', 'table-empty', 'Nenhum aluno matriculado nesta turma.'); cell.colSpan = 6; row.append(cell); body.append(row); mobile.append(createAcademicState('Nenhum aluno matriculado nesta turma.', 'empty')); return; }
    students.forEach((student) => {
        const row = createElement('tr'); const status = createElement('span', statusClass(student.status_aprovacao), statusLabel(student.status_aprovacao)); const actionCell = createElement('td'); actionCell.append(actionButton(student));
        [student.nome_completo || 'Nome não informado', student.email || 'E-mail não informado', `${Number(student.progresso_percentual) || 0}%`, student.prova_final_percentual == null ? 'Não finalizado' : `${Number(student.prova_final_percentual).toFixed(2)}%`].forEach((value) => row.append(createElement('td', '', value)));
        const statusCell = createElement('td'); statusCell.append(status); row.append(statusCell, actionCell); body.append(row);
        const card = createElement('li', 'card-item'); const header = createElement('div', 'card-item__header'); header.append(createElement('span', 'card-item__title', student.nome_completo), createElement('span', statusClass(student.status_aprovacao), statusLabel(student.status_aprovacao)));
        const meta = createElement('div', 'card-item__meta-grid'); meta.append(createElement('p', '', student.email || 'E-mail não informado'), createElement('p', '', `Progresso: ${Number(student.progresso_percentual) || 0}%`), createElement('p', '', `Teste Final: ${student.prova_final_percentual == null ? 'Não finalizado' : `${Number(student.prova_final_percentual).toFixed(2)}%`}`)); const actions = createElement('div', 'card-actions'); actions.append(actionButton(student)); card.append(header, meta, actions); mobile.append(card);
    });
}

function updatePaging() {
    byId('alunos-anterior').disabled = loading || page <= 1;
    byId('alunos-proxima').disabled = loading || page * pageLimit >= total;
    byId('pagina-alunos').textContent = `Página ${page} de ${Math.max(1, Math.ceil(total / pageLimit))} · ${total} alunos`;
}
async function loadStudents() {
    if (loading) return;
    loading = true; updatePaging();
    byId('filtro-situacao').disabled = true;
    setAcademicBusy(byId('lista-alunos'), true); setAcademicBusy(byId('lista-alunos-mobile'), true);
    setAcademicMessage(byId('mensagem-alunos'), 'Carregando alunos.', 'info');
    try {
        const query = new URLSearchParams({ page, limit: pageLimit, status: byId('filtro-situacao').value });
        const payload = await requestJson(`/api/matriculas/turma/${idTurma}?${query}`);
        total = payload.total; pageLimit = payload.limit;
        render(payload.matriculas || []);
        const counts = payload.summary || {};
        byId('resumo-situacoes').textContent = `Cursando: ${counts.CURSANDO || 0} · Aprovado: ${counts.APROVADO || 0} · Reprovado: ${counts.REPROVADO || 0}`;
        setAcademicMessage(byId('mensagem-alunos'), canEdit ? '' : 'Turma encerrada — dados disponíveis somente para consulta.', 'info');
    } catch (error) {
        render([]); total = 0;
        byId('resumo-situacoes').textContent = '';
        setAcademicMessage(byId('mensagem-alunos'), error.message, 'error');
    } finally { loading = false; byId('filtro-situacao').disabled = false; updatePaging(); }
}
byId('filtro-situacao').addEventListener('change', () => { page = 1; loadStudents(); });
byId('alunos-anterior').addEventListener('click', () => { page--; loadStudents(); });
byId('alunos-proxima').addEventListener('click', () => { page++; loadStudents(); });
byId('form-matricula').addEventListener('submit', async (event) => { event.preventDefault(); if (!editing || !canEdit) return; const button = byId('salvar-matricula'); button.disabled = true;
    try { const data = { status_aprovacao: byId('status-aprovacao').value }; if (byId('nota-final').value !== '') data.nota_final = Number(byId('nota-final').value); await requestJson(`/api/matriculas/${editing.id_matricula}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); dialog.close(); await loadStudents(); setAcademicMessage(byId('mensagem-alunos'), 'Matrícula atualizada.', 'success'); }
    catch (error) { setAcademicMessage(byId('erro-modal'), error.message, 'error'); } finally { button.disabled = false; }
});
window.addEventListener('load', async () => { if (!idTurma) { location.href = '/professor.html?motivo=turma_invalida'; return; } try { const context = await loadTeacherClass(idTurma, 'alunos', 'Alunos'); if (!context) return; canEdit = context.canEdit; if (!canEdit) setAcademicMessage(byId('mensagem-alunos'), 'Turma encerrada — dados disponíveis somente para consulta.', 'info'); await loadStudents(); } catch (error) { render([]); setAcademicMessage(byId('mensagem-alunos'), error.message, 'error'); } });
