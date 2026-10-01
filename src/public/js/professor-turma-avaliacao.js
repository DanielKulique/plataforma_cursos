import { createAcademicDialog } from './academic-dialog.js';
import { createAcademicState, setAcademicBusy, setAcademicMessage } from './academic-ui.js';
import { ordenarItens } from './learning-path.js';
import { byId, createElement, positiveId, renderBreadcrumbs, requestJson } from './academic-area.js';
import { loadTeacherClass } from './teacher-class-context.js';

const idTurma = positiveId('id_turma'); const idQuestionario = positiveId('id_questionario'); let assessment; let questionEditing; let questionForOption; let optionEditing; let canEdit = false;
let draftOptions = []; let draftPairs = [];
const questionDialog = createAcademicDialog(byId('modal-pergunta'), { initialFocus: () => byId('pergunta-texto') }); const optionDialog = createAcademicDialog(byId('modal-alternativa'), { initialFocus: () => byId('alternativa-texto') });
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => (button.dataset.close === 'pergunta' ? questionDialog : optionDialog).close()));
function structureEditable() { return canEdit && assessment && !assessment.possui_historico; }
function nextOrder(items) { return Math.max(0, ...items.map((item) => Number(item.ordem)).filter(Number.isFinite)) + 1; }
function campoTexto(row, id, label, value, onInput) {
    const group = createElement('div', 'form-group');
    const caption = createElement('label', '', label); caption.htmlFor = id;
    const input = createElement('input'); input.id = id; input.type = 'text'; input.maxLength = 255; input.required = true; input.value = value;
    input.addEventListener('input', () => onInput(input.value));
    group.append(caption, input); row.append(group);
}
function renderOptionRows() {
    const host = byId('opcoes-autoria'); host.replaceChildren();
    draftOptions.forEach((option, index) => {
        const row = createElement('div', 'question-builder-row');
        row.append(createElement('strong', 'question-builder-row__title', `Alternativa ${index + 1}`));
        campoTexto(row, `opcao-texto-${index}`, `Texto da alternativa ${index + 1}`, option.texto_opcao,
            (value) => { draftOptions[index].texto_opcao = value; });
        const correct = createElement('label', 'academic-checkbox');
        const check = createElement('input'); check.type = 'checkbox'; check.checked = Boolean(option.correta);
        check.setAttribute('aria-label', `Marcar alternativa ${index + 1} como correta`);
        check.addEventListener('change', () => { draftOptions[index].correta = check.checked; });
        correct.append(check, createElement('span', '', `Alternativa ${index + 1} correta`)); row.append(correct);
        if (draftOptions.length > 2) {
            const removeButton = createElement('button', 'action-button action-button--danger action-button--small', `Remover alternativa ${index + 1}`);
            removeButton.type = 'button'; removeButton.addEventListener('click', () => { draftOptions.splice(index, 1); renderOptionRows(); }); row.append(removeButton);
        }
        host.append(row);
    });
}
function renderPairRows() {
    const host = byId('pares-autoria'); host.replaceChildren();
    draftPairs.forEach((pair, index) => {
        const row = createElement('div', 'question-builder-row');
        row.append(createElement('strong', 'question-builder-row__title', `Par ${index + 1}`));
        campoTexto(row, `par-esquerda-${index}`, `Item esquerdo ${index + 1}`, pair.esquerda,
            (value) => { draftPairs[index].esquerda = value; });
        campoTexto(row, `par-direita-${index}`, `Item correspondente ${index + 1}`, pair.direita,
            (value) => { draftPairs[index].direita = value; });
        if (draftPairs.length > 2) {
            const removeButton = createElement('button', 'action-button action-button--danger action-button--small', `Remover par ${index + 1}`);
            removeButton.type = 'button'; removeButton.addEventListener('click', () => { draftPairs.splice(index, 1); renderPairRows(); }); row.append(removeButton);
        }
        host.append(row);
    });
}
function mostrarEditor(tipo) {
    byId('editor-multipla-escolha').hidden = tipo !== 'MULTIPLA_ESCOLHA';
    byId('editor-verdadeiro-falso').hidden = tipo !== 'VERDADEIRO_FALSO';
    byId('editor-associacao').hidden = tipo !== 'ASSOCIACAO';
    document.querySelectorAll('input[name="resposta-booleana"]').forEach((input) => {
        input.disabled = tipo !== 'VERDADEIRO_FALSO'; input.required = tipo === 'VERDADEIRO_FALSO';
    });
    renderOptionRows(); renderPairRows();
    document.querySelectorAll('#editor-multipla-escolha input').forEach((input) => { input.disabled = tipo !== 'MULTIPLA_ESCOLHA'; });
    document.querySelectorAll('#editor-associacao input').forEach((input) => { input.disabled = tipo !== 'ASSOCIACAO'; });
}
function openQuestion(question, trigger) {
    if (!structureEditable() || (question && !['MULTIPLA_ESCOLHA', 'VERDADEIRO_FALSO', 'ASSOCIACAO'].includes(question.tipo_pergunta))) return;
    questionEditing = question; byId('form-pergunta').reset();
    byId('titulo-modal-pergunta').textContent = question ? 'Editar pergunta' : 'Nova pergunta';
    byId('pergunta-texto').value = question?.texto_pergunta || '';
    byId('pergunta-tipo').value = question?.tipo_pergunta || 'MULTIPLA_ESCOLHA';
    byId('pergunta-ordem').value = question?.ordem ?? nextOrder(assessment.perguntas || []);
    byId('pergunta-pontos').value = question?.pontos ?? 1;
    draftOptions = question?.tipo_pergunta === 'MULTIPLA_ESCOLHA'
        ? (question.opcoes || []).map((option) => ({ texto_opcao: option.texto_opcao, correta: Boolean(option.correta) }))
        : [{ texto_opcao: '', correta: false }, { texto_opcao: '', correta: false }];
    draftPairs = question?.tipo_pergunta === 'ASSOCIACAO'
        ? (question.pares || []).map((pair) => ({ esquerda: pair.esquerda, direita: pair.direita }))
        : [{ esquerda: '', direita: '' }, { esquerda: '', direita: '' }];
    if (question?.tipo_pergunta === 'VERDADEIRO_FALSO' && question.resposta_booleana != null) {
        const value = String(Boolean(question.resposta_booleana));
        const radio = document.querySelector(`input[name="resposta-booleana"][value="${value}"]`);
        if (radio) radio.checked = true;
    }
    mostrarEditor(byId('pergunta-tipo').value);
    setAcademicMessage(byId('erro-pergunta'), '', 'error'); questionDialog.open(trigger);
}
function openOption(question, option, trigger) { if (!structureEditable() || question.tipo_pergunta !== 'MULTIPLA_ESCOLHA') return; questionForOption = question; optionEditing = option; byId('form-alternativa').reset(); byId('titulo-modal-alternativa').textContent = option ? 'Editar alternativa' : 'Nova alternativa'; byId('alternativa-texto').value = option?.texto_opcao || ''; byId('alternativa-ordem').value = option?.ordem ?? nextOrder(question.opcoes || []); byId('alternativa-correta').checked = Boolean(option?.correta); byId('alternativa-correta').disabled = Boolean(option?.correta) && (question.opcoes || []).filter((item) => item.correta).length <= 1; setAcademicMessage(byId('erro-alternativa'), '', 'error'); optionDialog.open(trigger); }
async function remove(kind, item, label) { if (!confirm(`Excluir ${label}?`)) return; try { await requestJson(kind === 'question' ? `/api/perguntas/${item.id_pergunta}` : `/api/opcoes/${item.id_opcao}`, { method: 'DELETE' }); await load(); setAcademicMessage(byId('mensagem-avaliacao'), `${label} excluída.`, 'success'); } catch (error) { setAcademicMessage(byId('mensagem-avaliacao'), error.message, 'error'); } }
function optionNode(question, option) {
    const item = createElement('li', `assessment-option${option.correta ? ' is-correct' : ''}`);
    item.append(createElement('span', 'assessment-option__indicator'), createElement('span', 'assessment-option__text', option.texto_opcao),
        createElement('span', option.correta ? 'badge badge--success' : 'assessment-option__order', option.correta ? 'Correta' : `Ordem ${option.ordem}`));
    if (structureEditable() && question.tipo_pergunta === 'MULTIPLA_ESCOLHA') {
        const actions = createElement('div', 'teacher-item-actions');
        const edit = createElement('button', 'action-button action-button--ghost action-button--small', 'Editar'); edit.type = 'button';
        edit.addEventListener('click', () => openOption(question, option, edit)); actions.append(edit);
        const corretas = (question.opcoes || []).filter((item) => item.correta).length;
        if ((question.opcoes || []).length > 2 && (!option.correta || corretas > 1)) {
            const del = createElement('button', 'action-button action-button--danger action-button--small', 'Excluir'); del.type = 'button';
            del.addEventListener('click', () => remove('option', option, 'a alternativa')); actions.append(del);
        }
        item.append(actions);
    }
    return item;
}
function render() {
    const list = byId('lista-perguntas'); list.replaceChildren(); setAcademicBusy(list, false);
    const questions = ordenarItens(assessment.perguntas || []);
    if (!questions.length) {
        const state = createAcademicState('Nenhuma pergunta criada.', 'empty');
        if (structureEditable()) {
            const button = createElement('button', 'action-button', 'Criar primeira pergunta'); button.type = 'button';
            button.addEventListener('click', () => openQuestion(null, button)); state.append(button);
        }
        list.append(state); return;
    }
    const nomes = { MULTIPLA_ESCOLHA: 'Múltipla escolha', VERDADEIRO_FALSO: 'Verdadeiro ou falso', ASSOCIACAO: 'Associação' };
    questions.forEach((question, index) => {
        const item = createElement('li', 'assessment-question');
        const header = createElement('div', 'assessment-question__header');
        const copy = createElement('div', 'assessment-question__copy');
        copy.append(createElement('span', 'assessment-question__label', `Pergunta ${index + 1}`),
            createElement('h3', '', question.texto_pergunta),
            createElement('p', '', `${nomes[question.tipo_pergunta] || question.tipo_pergunta} · ${question.pontos} ponto(s) · Ordem ${question.ordem}`));
        header.append(copy);
        if (structureEditable()) {
            const actions = createElement('div', 'teacher-item-actions');
            if (nomes[question.tipo_pergunta]) {
                const edit = createElement('button', 'action-button action-button--ghost action-button--small', 'Editar'); edit.type = 'button';
                edit.addEventListener('click', () => openQuestion(question, edit)); actions.append(edit);
            }
            if (question.tipo_pergunta === 'MULTIPLA_ESCOLHA') {
                const add = createElement('button', 'action-button action-button--small', 'Adicionar alternativa'); add.type = 'button';
                add.addEventListener('click', () => openOption(question, null, add)); actions.append(add);
            }
            const del = createElement('button', 'action-button action-button--danger action-button--small', 'Excluir'); del.type = 'button';
            del.addEventListener('click', () => remove('question', question, 'a pergunta')); actions.append(del); header.append(actions);
        }
        item.append(header);
        if (question.tipo_pergunta === 'ASSOCIACAO') {
            const pairs = createElement('ol', 'assessment-option-list');
            ordenarItens(question.pares || []).forEach((pair) => {
                const row = createElement('li', 'assessment-option');
                row.append(createElement('span', 'assessment-option__indicator'),
                    createElement('span', 'assessment-option__text', `${pair.esquerda} → ${pair.direita}`),
                    createElement('span', 'assessment-option__order', `Ordem ${pair.ordem}`)); pairs.append(row);
            });
            item.append(pairs);
        } else if (question.tipo_pergunta === 'VERDADEIRO_FALSO' && question.resposta_booleana != null) {
            item.append(createElement('p', 'badge badge--success', `Gabarito: ${question.resposta_booleana ? 'Verdadeiro' : 'Falso'}`));
        } else {
            const options = createElement('ol', 'assessment-option-list');
            ordenarItens(question.opcoes || []).forEach((option) => options.append(optionNode(question, option))); item.append(options);
        }
        list.append(item);
    });
}
async function load() { const payload = await requestJson(`/api/turmas/${idTurma}/questionarios`); assessment = (payload.questionarios || []).find((item) => Number(item.id_questionario) === idQuestionario); if (!assessment) throw new Error('A avaliação informada não existe nesta turma.'); byId('titulo-avaliacao').textContent = assessment.titulo; byId('meta-avaliacao').textContent = `${assessment.tipo === 'PROVA' ? assessment.prova_final ? 'Prova final' : 'Prova' : 'Exercício'} · ${(assessment.perguntas || []).length} pergunta(s) · ${assessment.ativo ? 'Disponível' : 'Inativa'} · ${assessment.possui_historico ? 'Estrutura protegida' : 'Estrutura editável'}`; byId('aviso-protecao').hidden = !assessment.possui_historico; byId('nova-pergunta').disabled = !structureEditable(); render(); }
byId('nova-pergunta').addEventListener('click', (event) => openQuestion(null, event.currentTarget));
byId('pergunta-tipo').addEventListener('change', () => {
    draftOptions = [{ texto_opcao: '', correta: false }, { texto_opcao: '', correta: false }];
    draftPairs = [{ esquerda: '', direita: '' }, { esquerda: '', direita: '' }];
    document.querySelectorAll('input[name="resposta-booleana"]').forEach((input) => { input.checked = false; });
    mostrarEditor(byId('pergunta-tipo').value);
});
byId('adicionar-opcao').addEventListener('click', () => {
    draftOptions.push({ texto_opcao: '', correta: false }); renderOptionRows();
});
byId('adicionar-par').addEventListener('click', () => {
    draftPairs.push({ esquerda: '', direita: '' }); renderPairRows();
});
byId('form-pergunta').addEventListener('submit', async (event) => {
    event.preventDefault(); if (!structureEditable()) return;
    const data = {
        texto_pergunta: byId('pergunta-texto').value.trim(), tipo_pergunta: byId('pergunta-tipo').value,
        ordem: Number(byId('pergunta-ordem').value), pontos: Number(byId('pergunta-pontos').value)
    };
    if (data.tipo_pergunta === 'MULTIPLA_ESCOLHA') {
        data.opcoes = draftOptions.map((option, index) => ({
            texto_opcao: option.texto_opcao.trim(), ordem: index + 1, correta: Boolean(option.correta)
        }));
        if (data.opcoes.length < 2 || !data.opcoes.some((option) => option.correta)) {
            setAcademicMessage(byId('erro-pergunta'), 'Inclua duas alternativas e marque pelo menos uma correta.', 'error'); return;
        }
    } else if (data.tipo_pergunta === 'VERDADEIRO_FALSO') {
        const selected = document.querySelector('input[name="resposta-booleana"]:checked');
        if (!selected) { setAcademicMessage(byId('erro-pergunta'), 'Escolha Verdadeiro ou Falso.', 'error'); return; }
        data.resposta_booleana = selected.value === 'true';
    } else {
        data.pares = draftPairs.map((pair, index) => ({
            esquerda: pair.esquerda.trim(), direita: pair.direita.trim(), ordem: index + 1
        }));
        if (data.pares.length < 2) { setAcademicMessage(byId('erro-pergunta'), 'Inclua pelo menos dois pares.', 'error'); return; }
    }
    const button = byId('salvar-pergunta'); const editing = Boolean(questionEditing); button.disabled = true;
    try {
        await requestJson(questionEditing ? `/api/perguntas/${questionEditing.id_pergunta}` : `/api/questionarios/${idQuestionario}/perguntas`, {
            method: questionEditing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
        });
        questionDialog.close(); questionEditing = null; await load();
        setAcademicMessage(byId('mensagem-avaliacao'), editing ? 'Pergunta atualizada.' : 'Pergunta adicionada.', 'success');
    } catch (error) { setAcademicMessage(byId('erro-pergunta'), error.message, 'error'); }
    finally { button.disabled = false; }
});
byId('form-alternativa').addEventListener('submit', async (event) => { event.preventDefault(); if (!structureEditable() || !questionForOption) return; const data = { texto_opcao: byId('alternativa-texto').value.trim(), ordem: Number(byId('alternativa-ordem').value), correta: byId('alternativa-correta').checked }; if (optionEditing?.correta && byId('alternativa-correta').disabled) delete data.correta; const button = byId('salvar-alternativa'); button.disabled = true; try { await requestJson(optionEditing ? `/api/opcoes/${optionEditing.id_opcao}` : `/api/perguntas/${questionForOption.id_pergunta}/opcoes`, { method: optionEditing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); optionDialog.close(); await load(); setAcademicMessage(byId('mensagem-avaliacao'), optionEditing ? 'Alternativa atualizada.' : 'Alternativa adicionada.', 'success'); } catch (error) { setAcademicMessage(byId('erro-alternativa'), error.message, 'error'); } finally { button.disabled = false; } });
window.addEventListener('load', async () => { if (!idTurma || !idQuestionario) { location.href = idTurma ? `/professor-turma-avaliacoes.html?id_turma=${idTurma}` : '/professor.html?motivo=turma_invalida'; return; } try { const context = await loadTeacherClass(idTurma, 'avaliacoes', 'Avaliação'); if (!context) return; canEdit = context.canEdit; await load(); renderBreadcrumbs(byId('breadcrumbs'), [{ label: 'Minhas turmas', href: context.session.user.tipo === 'ADMIN' ? '/admin.html' : '/professor.html' }, { label: context.turma.nome_turma, href: `/professor-turma.html?id_turma=${idTurma}` }, { label: 'Avaliações', href: `/professor-turma-avaliacoes.html?id_turma=${idTurma}` }, { label: assessment.titulo }]); if (!canEdit) setAcademicMessage(byId('mensagem-avaliacao'), 'Turma encerrada — estrutura disponível somente para consulta.', 'info'); } catch (error) { byId('lista-perguntas').replaceChildren(createAcademicState(error.message, 'error')); setAcademicBusy(byId('lista-perguntas'), false); setAcademicMessage(byId('mensagem-avaliacao'), error.message, 'error'); } });
