import { clearToken, getCurrentUser, getToken, requireRole } from './auth.js';

const statusUsuario = document.getElementById('status-usuario');
const mensagemProfessor = document.getElementById('mensagem-professor');
const listaTurmas = document.getElementById('lista-minhas-turmas');
const btnLogout = document.getElementById('btn-logout');
const linkSala = document.getElementById('link-sala');

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

    btnLogout.addEventListener('click', () => {
        clearToken();
        window.location.href = '/login.html';
    });
}

function renderizarTurmas(turmas = []) {
    if (!listaTurmas) return;

    listaTurmas.innerHTML = '';

    if (turmas.length === 0) {
        listaTurmas.innerHTML = '<li class="card-item empty-state">Você não está atribuído a nenhuma turma no momento.</li>';
        return;
    }

    turmas.forEach((turma) => {
        const item = document.createElement('li');
        item.className = 'card-item';

        item.innerHTML = `
            <div class="card-item__header">
                <span class="card-item__title">${turma.nome_turma}</span>
                <span class="${formatarStatusTurma(turma.status)}">${turma.status || 'Status não informado'}</span>
            </div>
            <div class="card-item__meta-grid">
                <p class="meta-line"><strong>Curso:</strong> ${turma.nome_curso || 'N/A'}</p>
                <p class="meta-line"><strong>Alunos matriculados:</strong> ${turma.total_alunos || 0}</p>
                <p class="meta-line"><strong>Início:</strong> ${turma.data_inicio ? new Date(turma.data_inicio).toLocaleDateString('pt-BR') : 'N/A'}</p>
            </div>
            <p class="card-item__description">${turma.descricao_curso || 'Curso sem descrição cadastrada.'}</p>
            <div class="card-actions">
                <a class="action-button" href="/professor-turma.html?id_turma=${encodeURIComponent(turma.id_turma)}">
                    Gerenciar turma
                </a>
            </div>
        `;

        listaTurmas.appendChild(item);
    });
}

async function carregarTurmasProfessor() {
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

        // Verificar se o usuário é professor
        if (String(usuario.tipo || '').toUpperCase() !== 'PROFESSOR') {
            window.location.href = '/index.html?motivo=nao_autorizado';
            return;
        }

        if (statusUsuario) {
            statusUsuario.textContent = `Professor logado: ${usuario.nome_completo}`;
        }

        // Mostrar link para sala virtual apenas para alunos
        if (linkSala) {
            linkSala.hidden = true;
        }

        const response = await fetch('/api/turmas/professor/' + usuario.id_usuario, {
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
            throw new Error('Não foi possível carregar suas turmas.');
        }

        const payload = await response.json();
        renderizarTurmas(Array.isArray(payload.turmas) ? payload.turmas : []);

        if (mensagemProfessor) {
            const total = Array.isArray(payload.turmas) ? payload.turmas.length : 0;
            mensagemProfessor.textContent = total > 0 
                ? `Você está responsável por ${total} turma(s).`
                : 'Você não está atribuído a nenhuma turma no momento.';
        }
    } catch (error) {
        console.error('Erro ao carregar turmas do professor:', error);
        if (mensagemProfessor) {
            mensagemProfessor.textContent = 'Erro ao carregar turmas. Tente novamente.';
        }
        if (listaTurmas) {
            listaTurmas.innerHTML = '<li class="card-item error-state">Erro ao carregar turmas do professor.</li>';
        }
    }
}

window.addEventListener('load', () => {
    configurarLogout();
    carregarTurmasProfessor();
});