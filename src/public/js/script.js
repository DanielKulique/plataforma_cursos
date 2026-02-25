import { getCurrentUser, clearToken } from './auth.js';

function formatarStatusTurma(status) {
    const texto = String(status || '').trim();
    const upper = texto.toUpperCase();

    if (upper.includes('ABERTA')) return 'badge badge--success';
    if (upper.includes('ANDAMENTO')) return 'badge badge--warning';
    if (upper.includes('ENCERRADA') || upper.includes('CANCELADA')) return 'badge badge--danger';
    return 'badge badge--neutral';
}

function mostrarMensagemPorMotivo() {
    const avisoAcesso = document.getElementById('aviso-acesso');
    if (!avisoAcesso) return;

    const params = new URLSearchParams(window.location.search);
    const motivo = params.get('motivo');

    if (motivo === 'nao_autorizado') {
        avisoAcesso.textContent = 'Acesso não autorizado para esta área. Você foi redirecionado para o catálogo.';
    }
}

async function carregarSessaoUsuario() {
    const statusUsuario = document.getElementById('status-usuario');
    const linkLogin = document.getElementById('link-login');
    const linkSala = document.getElementById('link-sala');
    const btnLogout = document.getElementById('btn-logout');

    if (!statusUsuario) return;

    try {
        const usuario = await getCurrentUser();

        if (!usuario) {
            statusUsuario.textContent = 'Você não está logado.';
            if (linkLogin) linkLogin.hidden = false;
            if (linkSala) linkSala.hidden = true;
            if (btnLogout) btnLogout.hidden = true;
            return;
        }

        statusUsuario.textContent = `Bem-vindo, ${usuario.nome_completo}! (${usuario.tipo})`;
        if (linkLogin) linkLogin.hidden = true;
        if (linkSala) {
            const tipoUsuario = String(usuario.tipo || '').toUpperCase();
            if (tipoUsuario === 'ALUNO') {
                linkSala.hidden = false;
                linkSala.href = '/sala-virtual.html';
            } else if (tipoUsuario === 'PROFESSOR') {
                linkSala.hidden = false;
                linkSala.href = '/professor.html';
                linkSala.textContent = 'Minhas Turmas';
            } else {
                linkSala.hidden = true;
            }
        }
        if (btnLogout) btnLogout.hidden = false;
    } catch (error) {
        console.error('Erro ao carregar sessão do usuário:', error);
        statusUsuario.textContent = 'Não foi possível carregar a sessão do usuário.';
    }
}

function configurarLogout() {
    const btnLogout = document.getElementById('btn-logout');
    if (!btnLogout) return;

    btnLogout.addEventListener('click', () => {
        clearToken();
        window.location.href = '/index.html';
    });
}

async function carregarCursos() {
    const listaHtml = document.getElementById('lista-de-cursos');
    if (!listaHtml) return;

    listaHtml.innerHTML = '<li class="card-item loading-state">Carregando cursos...</li>';

    try {
        const response = await fetch('/api/cursos');
        if (!response.ok) throw new Error('Falha ao carregar cursos.');

        const cursos = await response.json();
        listaHtml.innerHTML = '';

        if (!Array.isArray(cursos) || cursos.length === 0) {
            listaHtml.innerHTML = '<li class="card-item empty-state">Nenhum curso disponível no momento.</li>';
            return;
        }

        cursos.forEach(curso => {
            const item = document.createElement('li');
            item.className = 'card-item';
            item.innerHTML = `
                <div class="card-item__header">
                    <span class="card-item__title">${curso.nome_curso}</span>
                    <span class="card-item__meta">${curso.carga_horaria}h</span>
                </div>
                <p class="card-item__description">${curso.descricao || 'Curso sem descrição cadastrada.'}</p>
            `;
            listaHtml.appendChild(item);
        });
    } catch (error) {
        console.error('Erro ao carregar cursos:', error);
        listaHtml.innerHTML = '<li class="card-item error-state">Não foi possível carregar os cursos.</li>';
    }
}

async function carregarTurmas() {
    const listaHtml = document.getElementById('lista-de-turmas');
    if (!listaHtml) return;

    listaHtml.innerHTML = '<li class="card-item loading-state">Carregando turmas...</li>';

    try {
        const response = await fetch('/api/turmas');
        if (!response.ok) throw new Error('Falha ao carregar turmas.');

        const turmas = await response.json();
        listaHtml.innerHTML = '';

        if (!Array.isArray(turmas) || turmas.length === 0) {
            listaHtml.innerHTML = '<li class="card-item empty-state">Nenhuma turma aberta no momento.</li>';
            return;
        }

        turmas.forEach(turma => {
            const item = document.createElement('li');
            item.className = 'card-item';
            item.innerHTML = `
                <div class="card-item__header">
                    <span class="card-item__title">${turma.nome_turma}</span>
                    <span class="${formatarStatusTurma(turma.status)}">${turma.status || 'Status não informado'}</span>
                </div>
                <div class="card-item__meta-grid">
                    <p class="meta-line"><strong>Curso:</strong> ${turma.id_curso ?? 'N/A'}</p>
                    <p class="meta-line"><strong>Professor:</strong> ${turma.id_professor ?? 'N/A'}</p>
                </div>
            `;
            listaHtml.appendChild(item);
        });
    } catch (error) {
        console.error('Erro ao carregar turmas:', error);
        listaHtml.innerHTML = '<li class="card-item error-state">Não foi possível carregar as turmas.</li>';
    }
}

window.addEventListener('load', async () => {
    mostrarMensagemPorMotivo();
    configurarLogout();
    await carregarSessaoUsuario();
    await carregarCursos();
    await carregarTurmas();
});
