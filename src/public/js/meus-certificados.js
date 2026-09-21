import { clearToken } from './auth.js';
import { getMeusCertificados } from './api.js';
import { initSessionUI } from './session-ui.js';
import { createAcademicState, formatAcademicDate, setAcademicBusy, setAcademicMessage } from './academic-ui.js';
import { transferPrivatePdf } from './private-pdf.js';
import { byId, createElement, positiveId, renderBreadcrumbs } from './academic-area.js';
import { loadStudentCourse } from './student-course-context.js';

const idTurma = positiveId('id_turma');
const turmaParamInformado = new URLSearchParams(window.location.search).has('id_turma');

function meta(label, value) { const line = createElement('p', 'meta-line'); line.append(createElement('strong', '', `${label}: `), document.createTextNode(String(value ?? ''))); return line; }
function link(href, label, className = 'action-button action-button--ghost') { const node = createElement('a', className, label); node.href = href; return node; }
function sessionRedirect(error) { if (error?.status !== 401) return false; clearToken(); location.href = '/login.html?motivo=auth'; return true; }

function pdfAction(certificate, download = false) {
    const action = link(`/api/certificados/${encodeURIComponent(certificate.id_certificado)}/pdf${download ? '?download=1' : ''}`, download ? 'Baixar' : 'Visualizar', download ? undefined : 'action-button');
    if (!download) { action.target = '_blank'; action.rel = 'noopener'; }
    action.addEventListener('click', async (event) => {
        event.preventDefault(); setAcademicMessage(byId('mensagem-certificados'), download ? 'Preparando download...' : 'Abrindo certificado...', 'info');
        try { await transferPrivatePdf(action.href, download ? { download: true, filename: `certificado-${certificate.codigo_publico}.pdf` } : {}); setAcademicMessage(byId('mensagem-certificados'), '', 'info'); }
        catch (error) { if (!sessionRedirect(error)) setAcademicMessage(byId('mensagem-certificados'), error.message, 'error'); }
    });
    return action;
}

function certificateDetail(certificate, includeCourse = false) {
    const item = createElement('li', 'certificate-history__item');
    const title = includeCourse ? `${certificate.curso_nome} · ${certificate.turma_nome}` : `Versão ${certificate.versao || 1}`;
    item.append(createElement('strong', '', title), createElement('span', certificate.status === 'REVOGADO' ? 'badge badge--danger' : 'badge badge--success', certificate.status === 'REVOGADO' ? 'Revogada' : 'Ativa'), meta('Emissão', formatAcademicDate(certificate.emitido_em)), meta('Código', certificate.codigo_publico));
    return item;
}

function render(certificates) {
    const list = byId('lista-certificados'); list.replaceChildren(); setAcademicBusy(list, false);
    const filtered = idTurma ? certificates.filter((item) => Number(item.id_turma) === idTurma) : certificates;
    if (!filtered.length) { list.append(createAcademicState(idTurma ? 'O certificado desta turma ainda não está disponível.' : 'Você ainda não possui certificados emitidos.', 'empty')); return; }
    const groups = new Map(); filtered.forEach((item) => { if (!groups.has(item.id_turma)) groups.set(item.id_turma, []); groups.get(item.id_turma).push(item); });
    groups.forEach((group) => {
        group.sort((a, b) => Number(b.status === 'ATIVO') - Number(a.status === 'ATIVO') || Number(b.versao) - Number(a.versao));
        const current = group[0]; const card = createElement('li', 'card-item certificate-item'); const header = createElement('div', 'card-item__header');
        header.append(createElement('span', 'card-item__title', current.curso_nome), createElement('span', current.status === 'REVOGADO' ? 'badge badge--danger' : 'badge badge--success', current.status === 'REVOGADO' ? 'Certificado revogado' : 'Certificado ativo'));
        const metadata = createElement('div', 'card-item__meta-grid'); metadata.append(meta('Turma', current.turma_nome), meta('Emissão', formatAcademicDate(current.emitido_em)), meta('Carga horária', `${current.carga_horaria} horas`), meta('Versão', current.versao || 1));
        const actions = createElement('div', 'card-actions'); actions.append(pdfAction(current), pdfAction(current, true), link(`/certificados/validar/${encodeURIComponent(current.codigo_publico)}`, 'Validar'));
        const details = createElement('details', 'certificate-history'); details.append(createElement('summary', '', group.length > 1 ? 'Ver detalhe e histórico de versões' : 'Ver detalhe do certificado'));
        const history = createElement('ul', 'summary-list'); group.forEach((certificate) => history.append(certificateDetail(certificate))); details.append(history);
        card.append(header, metadata, actions, details); list.append(card);
    });
}

async function loadCertificates() {
    try { const payload = await getMeusCertificados({ retries: 1 }); render(payload.certificados || []); setAcademicMessage(byId('mensagem-certificados'), '', 'info'); }
    catch (error) { if (sessionRedirect(error)) return; byId('lista-certificados').replaceChildren(createAcademicState(error.status === 503 ? 'Seus certificados estão temporariamente indisponíveis.' : 'Não foi possível carregar seus certificados.', 'error')); setAcademicBusy(byId('lista-certificados'), false); setAcademicMessage(byId('mensagem-certificados'), error.message, 'error'); }
}

window.addEventListener('load', async () => {
    const session = await initSessionUI({ requiredRoles: ['ALUNO'] }); if (session.state !== 'authenticated') return;
    if (turmaParamInformado && !idTurma) { location.href = '/sala-virtual.html?motivo=turma_invalida'; return; }
    if (idTurma) {
        try { const course = await loadStudentCourse(idTurma, 'certificado', 'Certificado'); byId('course-navigation').hidden = false; byId('titulo-pagina').textContent = `Certificado — ${course.nome_curso}`; }
        catch (error) { setAcademicMessage(byId('mensagem-certificados'), error.message, 'error'); return; }
    } else renderBreadcrumbs(byId('breadcrumbs'), [{ label: 'Sala Virtual', href: '/sala-virtual.html' }, { label: 'Meus certificados' }]);
    await loadCertificates();
});
