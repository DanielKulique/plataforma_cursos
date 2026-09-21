import { clearToken } from './auth.js';
import { initSessionUI } from './session-ui.js';
import { createAcademicState, preferredScrollBehavior, setAcademicBusy, setAcademicMessage } from './academic-ui.js';
import { transferPrivatePdf } from './private-pdf.js';
import { ordenarItens, tipoMaterial } from './learning-path.js';
import { byId, createElement, positiveId, renderBreadcrumbs, renderCourseNavigation, requestJson } from './academic-area.js';
import { loadStudentCourse } from './student-course-context.js';

const idTurma = positiveId('id_turma');
const idAula = positiveId('id_aula');
let selected = null;
let closed = false;
let saving = false;
let contents = [];

function updateCompletionAction() {
    const button = byId('concluir-conteudo');
    const done = Boolean(selected?.concluido);
    button.disabled = saving || done || closed;
    button.textContent = saving ? 'Salvando...' : done ? 'Conteúdo concluído' : 'Marcar como concluído';
    byId('status-conteudo').textContent = done ? 'Concluído' : closed ? 'Somente consulta' : 'Em andamento';
    byId('status-conteudo').className = `badge ${done ? 'badge--success' : closed ? 'badge--neutral' : 'badge--warning'}`;
}

async function saveProgress(content, status) {
    const result = await requestJson(`/api/conteudos/${content.id_conteudo}/progresso`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status })
    });
    content.concluido = result.status === 'CONCLUIDO';
    content.em_andamento = result.status === 'INICIADO';
    return result;
}

function safeContentUrl(content) {
    return content.url ? window.SecurityUtils?.toSafeUrl(content.url, { baseUrl: location.origin }) : null;
}

async function openContent(content) {
    selected = content;
    byId('visualizador').hidden = false;
    byId('video-container').hidden = true;
    byId('video-player').src = '';
    byId('corpo-conteudo').replaceChildren();
    byId('titulo-conteudo').textContent = content.titulo || 'Conteúdo';
    byId('meta-conteudo').textContent = [tipoMaterial[content.tipo] || content.tipo, content.duracao_minutos ? `${content.duracao_minutos} min` : null].filter(Boolean).join(' · ');
    try {
        if (!content.concluido && !closed) await saveProgress(content, 'INICIADO');
        const url = safeContentUrl(content);
        if (content.url && !url) throw new Error('A URL deste conteúdo não pertence a uma origem permitida.');
        if (content.tipo === 'VIDEO' && url) {
            byId('video-container').hidden = false;
            byId('video-player').src = url;
        } else if (url) {
            const link = createElement('a', 'btn btn-ghost', content.tipo === 'PDF' ? 'Abrir PDF protegido' : 'Abrir material');
            link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
            if (content.tipo === 'PDF') link.addEventListener('click', async (event) => {
                event.preventDefault();
                try { await transferPrivatePdf(link.href); } catch (error) {
                    if (error.status === 401) { clearToken(); location.href = '/login.html?motivo=auth'; return; }
                    setAcademicMessage(byId('mensagem-aula'), error.message, 'error');
                }
            });
            byId('corpo-conteudo').append(link);
        } else {
            byId('corpo-conteudo').textContent = content.corpo || content.descricao || 'Material sem texto disponível.';
        }
        updateCompletionAction();
        byId('visualizador').scrollIntoView({ behavior: preferredScrollBehavior(), block: 'start' });
    } catch (error) {
        setAcademicMessage(byId('mensagem-aula'), error.message, 'error');
    }
}

function renderContents() {
    const list = byId('lista-materiais');
    list.replaceChildren(); setAcademicBusy(list, false);
    if (!contents.length) { list.append(createAcademicState('Esta aula ainda não possui materiais publicados.', 'empty')); return; }
    ordenarItens(contents).forEach((content) => {
        const item = createElement('li', 'module-item');
        const button = createElement('button', 'module-item-action'); button.type = 'button';
        const icon = createElement('span', 'module-item-icon', content.concluido ? '✓' : '○'); icon.setAttribute('aria-hidden', 'true');
        const copy = createElement('div', 'module-item-body');
        copy.append(createElement('h3', '', content.titulo), createElement('p', '', [tipoMaterial[content.tipo] || content.tipo, content.descricao].filter(Boolean).join(' · ')));
        button.append(icon, copy, createElement('span', `module-item-status ${content.concluido ? 'concluido' : 'nao-iniciado'}`, content.concluido ? 'Concluído' : 'Abrir'));
        button.addEventListener('click', () => openContent(content)); item.append(button); list.append(item);
    });
}

function setLessonNavigation(modules) {
    const ordered = ordenarItens(modules);
    const index = ordered.findIndex((item) => Number(item.id_modulo) === idAula);
    [['aula-anterior', ordered[index - 1]], ['proxima-aula', ordered[index + 1]]].forEach(([id, module]) => {
        const link = byId(id); link.hidden = !module;
        if (module) link.href = `/sala-aula-detalhe.html?id_turma=${encodeURIComponent(idTurma)}&id_aula=${encodeURIComponent(module.id_modulo)}`;
    });
}

byId('fechar-conteudo').addEventListener('click', () => { byId('visualizador').hidden = true; byId('video-player').src = ''; selected = null; });
byId('concluir-conteudo').addEventListener('click', async () => {
    if (!selected || saving) return; saving = true; updateCompletionAction();
    try { await saveProgress(selected, 'CONCLUIDO'); renderContents(); setAcademicMessage(byId('mensagem-aula'), 'Conteúdo concluído.', 'success'); }
    catch (error) { setAcademicMessage(byId('mensagem-aula'), error.message, 'error'); }
    finally { saving = false; updateCompletionAction(); }
});

window.addEventListener('load', async () => {
    const session = await initSessionUI({ requiredRoles: ['ALUNO'] });
    if (session.state !== 'authenticated') return;
    if (!idTurma || !idAula) { location.href = idTurma ? `/sala-aulas.html?id_turma=${idTurma}` : '/sala-virtual.html?motivo=turma_invalida'; return; }
    try {
        const [course, payload] = await Promise.all([loadStudentCourse(idTurma, 'aulas', 'Aula'), requestJson(`/api/turmas/${idTurma}/conteudos`)]);
        const module = (payload.modulos || []).find((item) => Number(item.id_modulo) === idAula);
        if (!module) throw new Error('A aula informada não existe nesta turma.');
        closed = String(course.status_turma).toUpperCase() === 'ENCERRADA';
        byId('titulo-pagina').textContent = module.titulo || 'Aula'; byId('descricao-aula').textContent = module.descricao || '';
        renderBreadcrumbs(byId('breadcrumbs'), [
            { label: 'Sala Virtual', href: '/sala-virtual.html' },
            { label: course.nome_curso || 'Curso', href: `/sala-aula.html?id_turma=${idTurma}` },
            { label: 'Aulas', href: `/sala-aulas.html?id_turma=${idTurma}` },
            { label: module.titulo || 'Aula' }
        ]);
        renderCourseNavigation(byId('course-navigation'), idTurma, 'aulas');
        contents = (payload.conteudos || []).filter((item) => Number(item.id_modulo) === idAula);
        setLessonNavigation(payload.modulos || []); renderContents();
        setAcademicMessage(byId('mensagem-aula'), closed ? 'Turma encerrada — conteúdo disponível somente para consulta.' : '', closed ? 'info' : 'success');
    } catch (error) {
        byId('lista-materiais').replaceChildren(createAcademicState(error.message, 'error')); setAcademicBusy(byId('lista-materiais'), false); setAcademicMessage(byId('mensagem-aula'), error.message, 'error');
    }
});
