import { authenticatedFetch, clearToken } from './auth.js';
import { initSessionUI } from './session-ui.js';
import {
    createAcademicState,
    formatAcademicDate,
    setAcademicBusy,
    setAcademicMessage
} from './academic-ui.js';

const statusUsuario = document.getElementById('status-usuario');
const mensagemProfessor = document.getElementById('mensagem-professor');
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
    const strong = criarElemento('strong', '', `${label}: `);
    line.append(strong, document.createTextNode(String(value ?? '')));
    return line;
}

function mostrarEstadoLista(message, className) {
    const type = className.includes('error')
        ? 'error'
        : className.includes('loading') ? 'loading' : 'empty';
    listaTurmas.replaceChildren(createAcademicState(message, type));
    setAcademicBusy(listaTurmas, type === 'loading');
}

function renderizarTurmas(turmas = []) {
    if (!listaTurmas) return;

    listaTurmas.replaceChildren();
    setAcademicBusy(listaTurmas, false);

    if (turmas.length === 0) {
        mostrarEstadoLista('Você não está atribuído a nenhuma turma no momento.', 'empty-state');
        return;
    }

    turmas.forEach((turma) => {
        const item = document.createElement('li');
        item.className = 'card-item';

        const header = criarElemento('div', 'card-item__header');
        const title = criarElemento('span', 'card-item__title', turma.nome_turma || 'Turma sem nome');
        const status = criarElemento(
            'span',
            formatarStatusTurma(turma.status),
            rotularStatusTurma(turma.status)
        );
        header.append(title, status);

        const meta = criarElemento('div', 'card-item__meta-grid');
        const dataInicio = formatAcademicDate(turma.data_inicio);
        meta.append(
            criarLinhaMeta('Curso', turma.nome_curso || 'N/A'),
            criarLinhaMeta('Alunos matriculados', Number(turma.total_alunos) || 0),
            criarLinhaMeta('Início', dataInicio)
        );

        const description = criarElemento('p', 'card-item__description', turma.descricao_curso || 'Curso sem descrição cadastrada.');
        const actions = criarElemento('div', 'card-actions');
        const manage = criarElemento('a', 'action-button', 'Abrir painel da turma');
        manage.href = `/professor-turma.html?id_turma=${encodeURIComponent(turma.id_turma)}`;
        actions.append(manage);
        item.append(header, meta, description, actions);

        listaTurmas.appendChild(item);
    });
}

async function carregarTurmasProfessor(usuario) {
    try {
        if (listaTurmas) {
            mostrarEstadoLista('Carregando suas turmas...', 'loading-state');
        }

        if (statusUsuario) {
            statusUsuario.textContent = `Professor logado: ${usuario.nome_completo}`;
        }

        const response = await authenticatedFetch('/api/turmas/professor/' + usuario.id_usuario);

        if (response.status === 401) {
            clearToken();
            window.location.href = '/login.html?motivo=auth';
            return;
        }

        if (response.status === 403) {
            window.location.href = '/index.html?motivo=nao_autorizado';
            return;
        }

        if (!response.ok) {
            throw new Error('Não foi possível carregar suas turmas.');
        }

        const payload = await response.json();
        renderizarTurmas(Array.isArray(payload.turmas) ? payload.turmas : []);

        const total = Array.isArray(payload.turmas) ? payload.turmas.length : 0;
        setAcademicMessage(
            mensagemProfessor,
            total > 0
                ? `Você está responsável por ${total} turma(s).`
                : 'Você não está atribuído a nenhuma turma no momento.',
            'info'
        );
    } catch (error) {
        console.error('Erro ao carregar turmas do professor:', error);
        setAcademicMessage(mensagemProfessor, 'Erro ao carregar turmas. Tente novamente.', 'error');
        if (listaTurmas) {
            mostrarEstadoLista('Erro ao carregar turmas do professor.', 'error-state');
        }
    }
}

window.addEventListener('load', async () => {
    const session = await initSessionUI({ requiredRoles: ['PROFESSOR'] });
    if (session.state === 'authenticated') {
        await carregarTurmasProfessor(session.user);
    }
});
