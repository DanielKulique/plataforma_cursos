import { authenticatedFetch, clearToken } from './auth.js';
import { formatAcademicDate } from './academic-ui.js';
import { userMessage } from './user-message.js';

export const byId = (id) => document.getElementById(id);

export function createElement(tag, className = '', text = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== '') element.textContent = String(text ?? '');
    return element;
}

export function positiveId(name) {
    const value = Number(new URLSearchParams(window.location.search).get(name));
    return Number.isInteger(value) && value > 0 ? value : null;
}

export async function requestJson(url, options = {}) {
    let response;
    try { response = await authenticatedFetch(url, options); }
    catch { throw new Error('Não foi possível conectar. Confira sua conexão e tente novamente.'); }
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) {
        clearToken();
        window.location.href = '/login.html?motivo=auth';
        throw Object.assign(new Error('Sua sessão expirou.'), { status: 401 });
    }
    if (!response.ok) {
        const safeMessages = {
            400: 'Dados inválidos na requisição.',
            403: 'Você não tem permissão para esta ação.',
            404: 'Recurso não encontrado.',
            409: 'A operação entrou em conflito com o estado atual.',
            422: 'Os dados enviados não passaram na validação.',
            429: 'Muitas solicitações. Aguarde e tente novamente.',
            500: 'O servidor não conseguiu concluir a solicitação.',
            503: 'Serviço temporariamente indisponível.'
        };
        throw Object.assign(new Error(
            response.status < 500 ? userMessage(body.mensagem || body.message, safeMessages[response.status])
                : safeMessages[response.status] || 'Não foi possível carregar esta área.'
        ), { status: response.status, code: body.code });
    }
    return body;
}

export function statusClass(status) {
    const value = String(status || '').toUpperCase();
    if (value === 'ABERTA' || value === 'APROVADO' || value === 'ATIVO') return 'badge badge--success';
    if (value === 'FECHADA' || value === 'CURSANDO') return 'badge badge--warning';
    if (['ENCERRADA', 'REPROVADO', 'CANCELADO', 'REVOGADO'].includes(value)) return 'badge badge--danger';
    return 'badge badge--neutral';
}

export function statusLabel(status) {
    const value = String(status || '').toUpperCase();
    return {
        ABERTA: 'Aberta',
        FECHADA: 'Fechada',
        ENCERRADA: 'Encerrada',
        APROVADO: 'Aprovado',
        CURSANDO: 'Cursando',
        REPROVADO: 'Reprovado',
        CANCELADO: 'Cancelado',
        ATIVO: 'Ativo',
        REVOGADO: 'Revogado'
    }[value] || status || 'Não informado';
}

export function formatPeriod(start, end) {
    return [start, end]
        .filter(Boolean)
        .map((date) => formatAcademicDate(String(date).slice(0, 10)))
        .join(' — ') || 'Período não informado';
}

export function setProgress(track, fill, value) {
    const percentage = Math.min(100, Math.max(0, Number(value) || 0));
    track?.setAttribute('aria-valuenow', String(percentage));
    fill?.style.setProperty('--progress-value', `${percentage}%`);
    return percentage;
}

function navLink(href, text, current = false) {
    const link = createElement('a', '', text);
    link.href = href;
    if (current) link.setAttribute('aria-current', 'page');
    return link;
}

export function renderCourseNavigation(container, idTurma, current) {
    if (!container || !idTurma) return;
    const query = `?id_turma=${encodeURIComponent(idTurma)}`;
    const items = [
        ['visao-geral', `/sala-aula.html${query}`, 'Visão geral'],
        ['aulas', `/sala-aulas.html${query}`, 'Aulas'],
        ['avaliacoes', `/sala-avaliacoes.html${query}`, 'Avaliações'],
        ['progresso', `/sala-progresso.html${query}`, 'Meu progresso'],
        ['certificado', `/meus-certificados.html${query}`, 'Certificado']
    ];
    const nav = createElement('nav', 'section-navigation');
    nav.setAttribute('aria-label', 'Áreas do curso');
    items.forEach(([key, href, label]) => nav.append(navLink(href, label, current === key)));
    container.replaceChildren(nav);
}

export function renderTeacherNavigation(container, idTurma, current) {
    if (!container || !idTurma) return;
    const query = `?id_turma=${encodeURIComponent(idTurma)}`;
    const items = [
        ['visao-geral', `/professor-turma.html${query}`, 'Visão geral'],
        ['alunos', `/professor-turma-alunos.html${query}`, 'Alunos'],
        ['aulas', `/professor-turma-aulas.html${query}`, 'Aulas'],
        ['avaliacoes', `/professor-turma-avaliacoes.html${query}`, 'Avaliações'],
        ['certificados', `/professor-turma-certificados.html${query}`, 'Certificados']
    ];
    const nav = createElement('nav', 'section-navigation');
    nav.setAttribute('aria-label', 'Áreas da turma');
    items.forEach(([key, href, label]) => nav.append(navLink(href, label, current === key)));
    container.replaceChildren(nav);
}

export function renderBreadcrumbs(container, items) {
    if (!container) return;
    const nav = createElement('nav', 'academic-breadcrumbs');
    nav.setAttribute('aria-label', 'Caminho de navegação');
    const list = createElement('ol');
    items.forEach((item, index) => {
        const entry = createElement('li');
        if (item.href && index < items.length - 1) entry.append(navLink(item.href, item.label));
        else {
            const current = createElement('span', '', item.label);
            current.setAttribute('aria-current', 'page');
            entry.append(current);
        }
        list.append(entry);
    });
    nav.append(list);
    container.replaceChildren(nav);
}

export function renderAcademicHeader(host, area = 'student', current = '') {
    if (!host) return;
    const header = createElement('header', 'academic-header');
    const nav = createElement('nav', 'academic-nav');
    nav.setAttribute('aria-label', area === 'teacher' ? 'Navegação da área de gestão' : 'Navegação da área do aluno');

    const brand = navLink('/index.html', '');
    brand.className = 'nav-brand';
    brand.setAttribute('aria-label', 'Plágio — página inicial');
    const image = createElement('img', 'brand-mark brand-logo');
    image.src = '/assets/landing/papagaio-detalhado.webp';
    image.width = 256;
    image.height = 256;
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    const texts = createElement('span', 'brand-texts');
    texts.append(createElement('span', 'brand-name', 'Plágio'), createElement('span', 'brand-sub', 'Não Copie Essa Ideia 4.0'));
    brand.append(image, texts);

    const links = createElement('div', 'nav-links');
    links.id = 'primary-navigation';
    links.append(navLink('/index.html', 'Catálogo'));
    if (area === 'teacher') links.append(navLink('/professor.html', 'Minhas turmas', current === 'teacher'));
    else links.append(navLink('/sala-virtual.html', 'Sala Virtual', current === 'student'));
    links.append(navLink('/verificador.html', 'Verificador'));

    const right = createElement('div', 'nav-right');
    const mobile = createElement('button', 'mobile-nav-toggle');
    mobile.id = 'mobile-nav-toggle';
    mobile.type = 'button';
    mobile.setAttribute('aria-expanded', 'false');
    mobile.setAttribute('aria-controls', 'primary-navigation');
    mobile.setAttribute('aria-label', 'Abrir menu de navegação');
    const mobileIcon = createElement('span', 'mobile-nav-toggle__icon');
    mobileIcon.setAttribute('aria-hidden', 'true');
    mobileIcon.append(createElement('span'), createElement('span'), createElement('span'));
    mobile.append(mobileIcon, createElement('span', 'mobile-nav-toggle__label', 'Menu'));
    const theme = createElement('button', 'theme-toggle');
    theme.id = 'theme-toggle';
    theme.type = 'button';
    theme.setAttribute('aria-label', 'Alternar tema');
    const moon = createElement('span', 'icon-moon', 'Lua');
    const sun = createElement('span', 'icon-sun', 'Sol');
    moon.setAttribute('aria-hidden', 'true');
    sun.setAttribute('aria-hidden', 'true');
    theme.append(moon, sun);
    const avatar = createElement('button', 'avatar', '?');
    avatar.id = 'avatar';
    avatar.type = 'button';
    avatar.hidden = true;
    avatar.setAttribute('aria-label', 'Abrir menu do perfil');
    right.append(mobile, theme, avatar);
    nav.append(brand, links, right);
    header.append(nav);
    host.replaceWith(header);
}

document.querySelectorAll('[data-academic-header]').forEach((host) => {
    renderAcademicHeader(host, host.dataset.academicHeader, host.dataset.currentArea);
});
