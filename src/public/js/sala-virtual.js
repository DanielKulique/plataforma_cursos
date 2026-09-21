import { clearToken } from './auth.js';
import { getMinhaSala } from './api.js';
import { initSessionUI } from './session-ui.js';
import {
    createAcademicState,
    setAcademicBusy,
    setAcademicMessage
} from './academic-ui.js';

const statusUsuario = document.getElementById('status-usuario');
const mensagemSala = document.getElementById('mensagem-sala');
const listaTurmas = document.getElementById('lista-minhas-turmas');

function formatarStatusTurma(status) {
    const texto = String(status || '').trim();
    const upper = texto.toUpperCase();

    if (upper === 'ABERTA') return 'badge badge--success';
    if (upper === 'FECHADA') return 'badge badge--warning';
    if (upper === 'ENCERRADA') return 'badge badge--danger';
    return 'badge badge--neutral';
}

function rotularStatusTurma(status) {
    const valor = String(status || '').toUpperCase();
    const labels = {
        ABERTA: 'Inscrições abertas',
        FECHADA: 'Inscrições fechadas',
        ENCERRADA: 'Turma encerrada'
    };
    return labels[valor] || status || 'Status não informado';
}

function criarElemento(tag, className = '', text = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = String(text ?? '');
    return element;
}

function criarLinhaMeta(label, value) {
    const line = criarElemento('p', 'meta-line');
    line.append(criarElemento('strong', '', `${label}: `), document.createTextNode(String(value ?? '')));
    return line;
}

function criarLink(href, className, text) {
    const link = criarElemento('a', className, text);
    link.href = href;
    return link;
}

function mostrarEstadoLista(message, className) {
    const type = className.includes('error')
        ? 'error'
        : className.includes('loading') ? 'loading' : 'empty';
    listaTurmas.replaceChildren(createAcademicState(message, type));
    setAcademicBusy(listaTurmas, type === 'loading');
}

function criarProgresso(percentual) {
    const valor = Math.min(100, Math.max(0, Number(percentual) || 0));
    const wrapper = criarElemento('div', 'academic-progress academic-progress--compact');
    const header = criarElemento('div', 'academic-progress__header');
    header.append(
        criarElemento('span', '', 'Progresso'),
        criarElemento('strong', '', `${valor}%`)
    );
    const track = criarElemento('div', 'progress-bar-container');
    track.setAttribute('role', 'progressbar');
    track.setAttribute('aria-label', 'Progresso na turma');
    track.setAttribute('aria-valuemin', '0');
    track.setAttribute('aria-valuemax', '100');
    track.setAttribute('aria-valuenow', String(valor));
    const fill = criarElemento('div', 'progress-bar-fill');
    // Exceção dinâmica documentada: o percentual real não cabe em classes fixas.
    fill.style.setProperty('--progress-value', `${valor}%`);
    track.append(fill);
    wrapper.append(header, track);
    return wrapper;
}

function renderizarTurmas(turmas = []) {
    if (!listaTurmas) return;

    listaTurmas.replaceChildren();
    setAcademicBusy(listaTurmas, false);

    if (turmas.length === 0) {
        mostrarEstadoLista('Você ainda não possui turma com acesso ativo na sua sala virtual.', 'empty-state');
        return;
    }

    turmas.forEach((turma) => {
        const item = document.createElement('li');
        item.className = 'card-item sala-card';

        const linkSalaAula = `/sala-aula.html?id_turma=${encodeURIComponent(turma.id_turma)}`;

        const header = criarElemento('div', 'card-item__header');
        header.append(
            criarElemento('span', 'card-item__title', turma.nome_curso || 'Curso sem nome'),
            criarElemento('span', formatarStatusTurma(turma.status_turma), rotularStatusTurma(turma.status_turma))
        );

        const meta = criarElemento('div', 'card-item__meta-grid');
        meta.append(
            criarLinhaMeta('Turma', turma.nome_turma || 'Turma sem nome')
        );

        const description = criarElemento('p', 'card-item__description');
        const nextStep = Number(turma.progresso_percentual) >= 100
            ? 'Trilha concluída. Consulte seu progresso e certificado.'
            : Number(turma.progresso_percentual) > 0
                ? 'Próximo passo: retomar suas aulas.'
                : 'Próximo passo: começar a primeira aula.';
        description.textContent = nextStep;

        const actions = criarElemento('div', 'card-actions');
        actions.append(
            criarLink(linkSalaAula, 'action-button', 'Continuar curso')
        );
        item.append(
            header,
            meta,
            criarProgresso(turma.progresso_percentual),
            description,
            actions
        );

        listaTurmas.appendChild(item);
    });
}

function redirecionarSessao(error) {
    if (error?.status !== 401) return false;
    clearToken();
    window.location.href = '/login.html?motivo=auth';
    return true;
}

async function carregarTurmas() {
    const payload = await getMinhaSala({ retries: 1 });
    renderizarTurmas(payload?.turmas || []);
    setAcademicMessage(
        mensagemSala,
        payload?.total > 0
            ? `Você possui ${payload.total} turma(s) com acesso ao conteúdo.`
            : 'Sem turmas com acesso no momento. Faça inscrição em uma turma com vagas abertas.',
        'info'
    );
}

function tratarFalhaTurmas(error) {
    if (redirecionarSessao(error)) return;
    if (error?.status === 403) {
        window.location.href = '/index.html?motivo=nao_autorizado';
        return;
    }
    console.error('Erro ao carregar turmas da sala virtual:', error);
    setAcademicMessage(mensagemSala, 'Não foi possível carregar suas turmas agora.', 'error');
    if (listaTurmas) {
        mostrarEstadoLista('Não foi possível carregar suas turmas. Recarregue a página para tentar novamente.', 'error-state');
    }
}

async function carregarSalaVirtual(usuario) {
    if (listaTurmas) mostrarEstadoLista('Carregando suas turmas...', 'loading-state');
    if (statusUsuario) statusUsuario.textContent = `Aluno logado: ${usuario.nome_completo}`;
    try { await carregarTurmas(); } catch (error) { tratarFalhaTurmas(error); }
}

window.addEventListener('load', async () => {
    const session = await initSessionUI({ requiredRoles: ['ALUNO'] });
    if (session.state === 'authenticated') {
        await carregarSalaVirtual(session.user);
    }
});
