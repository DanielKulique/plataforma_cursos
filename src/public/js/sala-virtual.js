import { clearToken, getCurrentUser, getToken } from './auth.js';

const statusUsuario = document.getElementById('status-usuario');
const mensagemSala = document.getElementById('mensagem-sala');
const listaTurmas = document.getElementById('lista-minhas-turmas');
const btnLogout = document.getElementById('btn-logout');

const params = new URLSearchParams(window.location.search);
const modoTeste = params.get('demo') === '1';

const MOCK_SALA_PAYLOAD = {
    total: 1,
    turmas: [
        {
            id_turma: 101,
            nome_turma: 'Turma Demo Front-end',
            status_turma: 'EM ANDAMENTO',
            progresso_percentual: 45,
            nome_curso: 'Curso Demo de Interface',
            descricao_curso: 'Turma simulada para validar fluxo de sala de aula e questionários sem login.'
        }
    ]
};

function formatarStatusTurma(status) {
    const texto = String(status || '').trim();
    const upper = texto.toUpperCase();

    if (upper.includes('ABERTA')) return 'badge badge--success';
    if (upper.includes('ANDAMENTO')) return 'badge badge--warning';
    if (upper.includes('ENCERRADA') || upper.includes('CANCELADA')) return 'badge badge--danger';
    return 'badge badge--neutral';
}

function configurarLogout() {
    if (!btnLogout) return;

    if (modoTeste) {
        btnLogout.textContent = 'Encerrar teste';
    }

    btnLogout.addEventListener('click', () => {
        clearToken();
        window.location.href = modoTeste ? '/index.html' : '/login.html';
    });
}

function montarLinkComDemo(url) {
    if (!modoTeste) return url;

    const separador = url.includes('?') ? '&' : '?';
    return `${url}${separador}demo=1`;
}

function renderizarTurmas(turmas = []) {
    if (!listaTurmas) return;

    listaTurmas.innerHTML = '';

    if (turmas.length === 0) {
        listaTurmas.innerHTML = '<li class="card-item empty-state">Você ainda não possui turma aberta ativa na sua sala virtual.</li>';
        return;
    }

    turmas.forEach((turma) => {
        const item = document.createElement('li');
        item.className = 'card-item sala-card';

        const linkSalaAula = montarLinkComDemo(`/sala-aula.html?id_turma=${encodeURIComponent(turma.id_turma)}`);
        const linkProva = montarLinkComDemo(`/questionario.html?tipo=prova&id_turma=${encodeURIComponent(turma.id_turma)}`);
        const linkExercicios = montarLinkComDemo(`/questionario.html?tipo=exercicio&id_turma=${encodeURIComponent(turma.id_turma)}`);

        item.innerHTML = `
            <div class="card-item__header">
                <span class="card-item__title">${turma.nome_curso}</span>
                <span class="${formatarStatusTurma(turma.status_turma)}">${turma.status_turma || 'Status não informado'}</span>
            </div>
            <div class="card-item__meta-grid">
                <p class="meta-line"><strong>Turma:</strong> ${turma.nome_turma}</p>
                <p class="meta-line"><strong>Progresso:</strong> ${turma.progresso_percentual}%</p>
            </div>
            <p class="card-item__description"><strong>Descrição:</strong> ${turma.descricao_curso || 'Conteúdo do curso sem descrição cadastrada.'}</p>
            <div class="conteudo-placeholder">
                <strong>Conteúdo liberado:</strong>
                <ul>
                    <li>Módulo 1: Boas-vindas da turma</li>
                    <li>Módulo 2: Material inicial</li>
                    <li>Módulo 3: Atividade prática</li>
                </ul>
            </div>
            <div class="card-actions">
                <a class="action-button" href="${linkSalaAula}">
                    Entrar na sala de aula
                </a>
                <a class="action-button action-button--ghost" href="${linkProva}">
                    Prova
                </a>
                <a class="action-button action-button--ghost" href="${linkExercicios}">
                    Exercícios
                </a>
            </div>
        `;

        listaTurmas.appendChild(item);
    });
}

async function carregarSalaVirtual() {
    if (modoTeste) {
        if (statusUsuario) {
            statusUsuario.textContent = 'Modo teste ativo: navegação sem login.';
        }

        renderizarTurmas(MOCK_SALA_PAYLOAD.turmas || []);

        if (mensagemSala) {
            mensagemSala.textContent = 'Ambiente carregado com dados simulados para validação rápida.';
        }

        return;
    }

    const token = getToken();
    if (!token) {
        window.location.href = '/login.html?motivo=auth';
        return;
    }

    try {
        if (listaTurmas) {
            listaTurmas.innerHTML = '<li class="card-item loading-state">Carregando suas turmas...</li>';
        }

        const usuario = await getCurrentUser();

        if (!usuario) {
            window.location.href = '/login.html?motivo=auth';
            return;
        }

        if (String(usuario.tipo || '').toUpperCase() !== 'ALUNO') {
            window.location.href = '/index.html?motivo=nao_autorizado';
            return;
        }

        if (statusUsuario) {
            statusUsuario.textContent = `Aluno logado: ${usuario.nome_completo}`;
        }

        const response = await fetch('/api/matriculas/minha-sala', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

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
            throw new Error('Não foi possível carregar sua sala virtual.');
        }

        const payload = await response.json();
        renderizarTurmas(payload.turmas || []);

        if (mensagemSala) {
            mensagemSala.textContent = payload.total > 0
                ? `Você possui ${payload.total} turma(s) aberta(s) com acesso ao conteúdo.`
                : 'Sem turmas abertas no momento. Faça inscrição em uma turma com vagas abertas.';
        }
    } catch (error) {
        console.error('Erro ao carregar sala virtual:', error);
        if (mensagemSala) {
            mensagemSala.textContent = 'Erro ao carregar sala virtual. Tente novamente.';
        }
        if (listaTurmas) {
            listaTurmas.innerHTML = '<li class="card-item error-state">Erro ao carregar turmas da sala virtual.</li>';
        }
    }
}

window.addEventListener('load', () => {
    configurarLogout();
    carregarSalaVirtual();
});
