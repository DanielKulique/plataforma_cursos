/**
 * @fileoverview Página principal - Catálogo de cursos e turmas
 * @description Carrega e exibe cursos e turmas disponíveis
 */

import { getCurrentUser, clearToken } from './auth.js';
import { getCursos, getTurmas, handleAPIError } from './api.js';
import {
    formatarStatusTurma,
    formatarTagTurma,
    formatarCorTurma,
    escapeHtml,
    showLoading,
    showEmpty,
    showError,
    getUrlParams
} from './utils.js';
import { confirmDanger } from './modal.js';

// ============================================================
// ELEMENTOS DO DOM
// ============================================================

const avisoAcesso = document.getElementById('aviso-acesso');
const statusUsuario = document.getElementById('status-usuario');
const linkLogin = document.getElementById('link-login');
const linkSala = document.getElementById('link-sala');
const btnLogout = document.getElementById('btn-logout');
const listaCursos = document.getElementById('lista-de-cursos');
const listaTurmas = document.getElementById('lista-de-turmas');

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

/**
 * Exibe mensagem de redirecionamento baseada no parâmetro da URL
 */
function mostrarMensagemPorMotivo() {
    if (!avisoAcesso) return;

    const params = getUrlParams();
    const motivo = params.get('motivo');

    if (motivo === 'nao_autorizado') {
        avisoAcesso.textContent = 'Acesso não autorizado para esta área. Você foi redirecionado para o catálogo.';
    }
}

/**
 * Configura o botão de logout com confirmação
 */
function configurarLogout() {
    if (!btnLogout) return;

    btnLogout.addEventListener('click', async () => {
        const confirmou = await confirmDanger(
            'Sair da conta',
            'Tem certeza que deseja encerrar sua sessão?'
        );

        if (confirmou) {
            clearToken();
            window.location.href = '/index.html';
        }
    });
}

// ============================================================
// SESSÃO DO USUÁRIO
// ============================================================

/**
 * Carrega e exibe informações da sessão do usuário
 */
async function carregarSessaoUsuario() {
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

        statusUsuario.textContent = `Bem-vindo, ${escapeHtml(usuario.nome_completo)}! (${usuario.tipo})`;

        if (linkLogin) linkLogin.hidden = true;
        if (btnLogout) btnLogout.hidden = false;

        // Configurar link da sala baseado no tipo de usuário
        if (linkSala) {
            const tipoUsuario = String(usuario.tipo || '').toUpperCase();

            if (tipoUsuario === 'ALUNO') {
                linkSala.hidden = false;
                linkSala.href = '/sala-virtual.html';
                linkSala.textContent = 'Sala virtual';
            } else if (tipoUsuario === 'PROFESSOR') {
                linkSala.hidden = false;
                linkSala.href = '/professor.html';
                linkSala.textContent = 'Minhas Turmas';
            } else if (tipoUsuario === 'ADMIN') {
                linkSala.hidden = false;
                linkSala.href = '/admin.html';
                linkSala.textContent = 'Administração';
            } else {
                linkSala.hidden = true;
            }
        }
    } catch (error) {
        console.error('Erro ao carregar sessão do usuário:', error);
        statusUsuario.textContent = 'Não foi possível carregar a sessão do usuário.';
    }
}

// ============================================================
// RENDERIZAÇÃO DE CURSOS
// ============================================================

// Icones para cursos baseado no indice
const COURSE_ICONS = ['🧠', '✍️', '🎨', '📜', '💡', '📚'];
const COURSE_COLORS = [
    'rgba(124,58,237,.12)',
    'rgba(244,114,182,.1)',
    'rgba(34,211,238,.08)',
    'rgba(74,222,128,.08)',
    'rgba(167,139,250,.12)',
    'rgba(251,191,36,.1)'
];

/**
 * Renderiza lista de cursos no DOM com novo design
 * @param {Array} cursos - Lista de cursos
 */
function renderizarCursos(cursos) {
    if (!listaCursos) return;

    listaCursos.innerHTML = '';

    if (!Array.isArray(cursos) || cursos.length === 0) {
        showEmpty(listaCursos, 'Nenhum curso disponivel no momento.');
        return;
    }

    cursos.forEach((curso, index) => {
        const item = document.createElement('div');
        item.className = 'course-item';

        // Icone do curso
        const icon = document.createElement('div');
        icon.className = 'course-icon';
        icon.style.background = COURSE_COLORS[index % COURSE_COLORS.length];
        icon.textContent = COURSE_ICONS[index % COURSE_ICONS.length];

        // Info
        const info = document.createElement('div');
        info.className = 'course-info';

        const name = document.createElement('div');
        name.className = 'course-name';
        name.textContent = curso.nome_curso;

        const meta = document.createElement('div');
        meta.className = 'course-meta';
        meta.innerHTML = `<span>⏱ ${curso.carga_horaria}h</span>`;

        info.appendChild(name);
        info.appendChild(meta);

        // Seta
        const arrow = document.createElement('span');
        arrow.className = 'c-arrow';
        arrow.textContent = '›';

        item.appendChild(icon);
        item.appendChild(info);
        item.appendChild(arrow);
        listaCursos.appendChild(item);
    });
}

/**
 * Carrega cursos da API e renderiza
 */
async function carregarCursos() {
    if (!listaCursos) return;

    showLoading(listaCursos, 'Carregando cursos...');

    try {
        const cursos = await getCursos();
        renderizarCursos(cursos);
    } catch (error) {
        console.error('Erro ao carregar cursos:', error);
        showError(listaCursos, handleAPIError(error));
    }
}

// ============================================================
// RENDERIZAÇÃO DE TURMAS
// ============================================================

/**
 * Renderiza lista de turmas no DOM com novo design
 * @param {Array} turmas - Lista de turmas
 */
function renderizarTurmas(turmas) {
    if (!listaTurmas) return;

    listaTurmas.innerHTML = '';

    if (!Array.isArray(turmas) || turmas.length === 0) {
        showEmpty(listaTurmas, 'Nenhuma turma aberta no momento.');
        return;
    }

    turmas.forEach((turma) => {
        const item = document.createElement('div');
        item.className = `class-item ${formatarCorTurma(turma.status)}`;

        // Info
        const info = document.createElement('div');
        info.className = 'class-info';

        const name = document.createElement('div');
        name.className = 'class-name';
        name.textContent = turma.nome_turma;

        const date = document.createElement('div');
        date.className = 'class-date';
        const cursoNome = turma.nome_curso || turma.id_curso || 'N/A';
        const profNome = turma.nome_professor || turma.id_professor || 'N/A';
        date.textContent = `📚 ${escapeHtml(cursoNome)} · 👤 ${escapeHtml(profNome)}`;

        info.appendChild(name);
        info.appendChild(date);

        // Tag de status
        const tag = document.createElement('span');
        tag.className = formatarTagTurma(turma.status);
        const statusText = turma.status || 'Status';
        tag.textContent = statusText.toUpperCase().includes('ABERTA') ? '● Aberta' :
                          statusText.toUpperCase().includes('BREVE') ? '◌ Em breve' :
                          statusText.toUpperCase().includes('INSCRI') ? '✦ Inscricoes' :
                          statusText;

        item.appendChild(info);
        item.appendChild(tag);
        listaTurmas.appendChild(item);
    });
}

/**
 * Carrega turmas da API e renderiza
 */
async function carregarTurmas() {
    if (!listaTurmas) return;

    showLoading(listaTurmas, 'Carregando turmas...');

    try {
        const turmas = await getTurmas();
        renderizarTurmas(turmas);
    } catch (error) {
        console.error('Erro ao carregar turmas:', error);
        showError(listaTurmas, handleAPIError(error));
    }
}

// ============================================================
// AVATAR E ATIVIDADES
// ============================================================

/**
 * Renderiza avatar com iniciais do usuário
 */
async function renderizarAvatar() {
    const avatar = document.getElementById('avatar');
    if (!avatar) return;

    try {
        const usuario = await getCurrentUser();
        if (usuario) {
            const iniciais = usuario.nome_completo
                .split(' ')
                .map(n => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2);
            avatar.textContent = iniciais;
        }
    } catch {
        avatar.textContent = '?';
    }
}

/**
 * Gera timeline de atividades mockadas
 */
function gerarAtividadesMock() {
    return [
        {
            tipo: 'success',
            acao: 'Você concluiu o módulo',
            destaque: '"O que é plágio e como evitá-lo" no curso Plágio 3.0',
            hora: 'Hoje, 14h32'
        },
        {
            tipo: 'purple',
            acao: 'Matriculado com sucesso na turma',
            destaque: '"Plágio 3.0 — Março 2025"',
            hora: 'Ontem, 10h15'
        },
        {
            tipo: 'pink',
            acao: 'Certificado emitido',
            destaque: '"Direitos Autorais — Turma A"',
            hora: '15 mar, 09h00'
        },
        {
            tipo: 'cyan',
            acao: 'Nova turma disponível',
            destaque: '"Propriedade Intelectual T1" — inscrições abertas',
            hora: '12 mar, 08h45'
        }
    ];
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================

window.addEventListener('load', async () => {
    mostrarMensagemPorMotivo();
    configurarLogout();

    // Carregar dados em paralelo para melhor performance
    await Promise.all([
        carregarSessaoUsuario(),
        carregarCursos(),
        carregarTurmas(),
        renderizarAvatar()
    ]);
});
