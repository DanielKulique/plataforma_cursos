/**
 * @fileoverview Página principal - Catálogo de cursos e turmas
 * @description Carrega e exibe cursos e turmas disponíveis
 */

import { authenticatedFetch } from './auth.js';
import { getCursos, getTurmas, handleAPIError } from './api.js';
import { initSessionUI } from './session-ui.js';
import {
    formatarTagTurma,
    formatarCorTurma,
    escapeHtml,
    showLoading,
    showEmpty,
    showError,
    getUrlParams
} from './utils.js';
import { confirmSuccess } from './modal.js';

// ============================================================
// ELEMENTOS DO DOM
// ============================================================

const avisoAcesso = document.getElementById('aviso-acesso');
const statusUsuario = document.getElementById('status-usuario');
const listaCursos = document.getElementById('lista-de-cursos');
const listaTurmas = document.getElementById('lista-de-turmas');

// ============================================================
// ESTADO
// ============================================================

let usuarioLogado = null;
let matriculasAtivas = []; // IDs das turmas que o usuário já está matriculado
let cursosDisponiveis = [];
let turmasDisponiveis = [];
let cursoSelecionado = null;

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

function setCollectionState(container, { busy = false, role = null } = {}) {
    if (!container) return;

    container.setAttribute('aria-busy', String(busy));
    if (role) {
        container.setAttribute('role', role);
        container.setAttribute('aria-live', role === 'alert' ? 'assertive' : 'polite');
    } else {
        container.removeAttribute('role');
        container.removeAttribute('aria-live');
    }
}

/**
 * Exibe mensagem de redirecionamento baseada no parâmetro da URL
 */
function mostrarMensagemPorMotivo() {
    if (!avisoAcesso) return;

    const params = getUrlParams();
    const motivo = params.get('motivo');

    if (motivo === 'nao_autorizado') {
        avisoAcesso.textContent = 'Acesso não autorizado para esta área. Você foi redirecionado para o catálogo.';
        avisoAcesso.hidden = false;
    }
}

// ============================================================
// RENDERIZAÇÃO DE CURSOS
// ============================================================

// Icones para cursos baseado no indice
const COURSE_ICONS = ['🧠', '✍️', '🎨', '📜', '💡', '📚'];
const COURSE_COLOR_CLASS_COUNT = 6;

/**
 * Renderiza lista de cursos no DOM com novo design
 * @param {Array} cursos - Lista de cursos
 */
function renderizarCursos(cursos) {
    if (!listaCursos) return;

    setCollectionState(listaCursos);
    listaCursos.replaceChildren();

    if (!Array.isArray(cursos) || cursos.length === 0) {
        showEmpty(listaCursos, 'Nenhum curso disponível no momento.');
        setCollectionState(listaCursos, { role: 'status' });
        return;
    }

    const opcoes = [
        { id_curso: null, nome_curso: 'Todos os cursos', carga_horaria: null },
        ...cursos
    ];

    opcoes.forEach((curso, index) => {
        const courseId = curso.id_curso === null ? null : String(curso.id_curso);
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'course-item';
        if (cursoSelecionado === courseId) item.classList.add('active');
        item.setAttribute('aria-pressed', String(cursoSelecionado === courseId));
        item.addEventListener('click', () => selecionarCurso(courseId));

        // Icone do curso
        const icon = document.createElement('div');
        icon.className = `course-icon course-icon--tone-${index % COURSE_COLOR_CLASS_COUNT}`;
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = COURSE_ICONS[index % COURSE_ICONS.length];

        // Info
        const info = document.createElement('div');
        info.className = 'course-info';

        const name = document.createElement('div');
        name.className = 'course-name';
        name.textContent = curso.nome_curso;

        const meta = document.createElement('div');
        meta.className = 'course-meta';
        const workload = document.createElement('span');
        workload.textContent = curso.carga_horaria === null
            ? 'Exibir todas as turmas'
            : `⏱ ${String(curso.carga_horaria ?? '')}h`;
        meta.appendChild(workload);

        info.appendChild(name);
        info.appendChild(meta);

        // Seta
        const arrow = document.createElement('span');
        arrow.className = 'c-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '›';

        item.appendChild(icon);
        item.appendChild(info);
        item.appendChild(arrow);
        listaCursos.appendChild(item);
    });
}

function selecionarCurso(idCurso) {
    cursoSelecionado = idCurso;
    renderizarCursos(cursosDisponiveis);
    renderizarTurmasFiltradas();
}

function renderizarTurmasFiltradas() {
    const turmas = cursoSelecionado === null
        ? turmasDisponiveis
        : turmasDisponiveis.filter((turma) => String(turma.id_curso) === cursoSelecionado);

    const emptyMessage = cursoSelecionado === null
        ? 'Nenhuma turma aberta no momento.'
        : 'Nenhuma turma encontrada para o curso selecionado.';
    renderizarTurmas(turmas, emptyMessage);
}

/**
 * Carrega cursos da API e renderiza
 */
async function carregarCursos() {
    if (!listaCursos) return;

    setCollectionState(listaCursos, { busy: true, role: 'status' });
    showLoading(listaCursos, 'Carregando cursos...');

    try {
        cursosDisponiveis = await getCursos();
        renderizarCursos(cursosDisponiveis);
        setTextContent('stat-cursos', cursosDisponiveis.length);
    } catch (error) {
        console.error('Erro ao carregar cursos:', error);
        showError(listaCursos, handleAPIError(error));
        setCollectionState(listaCursos, { role: 'alert' });
    }
}

// ============================================================
// MATRÍCULA EM TURMAS
// ============================================================

/**
 * Busca matrículas do aluno logado
 */
async function carregarMatriculasDoAluno() {
    if (!usuarioLogado || usuarioLogado.tipo !== 'ALUNO') {
        matriculasAtivas = [];
        return;
    }

    try {
        const response = await authenticatedFetch(`/api/matriculas/aluno/${usuarioLogado.id_usuario}`);

        if (response.ok) {
            const matriculas = await response.json();
            matriculasAtivas = matriculas
                .filter((matricula) => matricula.status_aprovacao !== 'CANCELADO')
                .map((matricula) => matricula.id_turma);
        } else {
            matriculasAtivas = [];
        }
    } catch (error) {
        console.error('Erro ao carregar matrículas:', error);
        matriculasAtivas = [];
    }
}

/**
 * Realiza matrícula em uma turma
 */
async function matricularEmTurma(idTurma, nomeTurma) {
    if (!usuarioLogado) {
        // Usuário não está logado, redirecionar para login
        window.location.href = '/login.html?motivo=auth&redirect=/index.html';
        return;
    }

    try {
        // Confirmar matrícula
        const confirmado = await confirmSuccess(
            'Confirmar Matrícula',
            `Deseja se matricular na turma <strong>"${escapeHtml(nomeTurma)}"</strong>?`,
            'Sim, quero me matricular!'
        );

        if (!confirmado) return;

        // Fazer requisição para API
        const response = await authenticatedFetch('/api/matriculas', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ id_turma: idTurma })
        });

        const data = await response.json();

        if (response.ok) {
            // Sucesso
            if (!matriculasAtivas.includes(idTurma)) matriculasAtivas.push(idTurma);
            turmasDisponiveis = await getTurmas();
            renderizarTurmasFiltradas();

            // Mostrar feedback
            alert('✅ ' + (data.mensagem || 'Matrícula realizada com sucesso!'));

            // Atualizar mensagem de boas-vindas
            if (statusUsuario) {
                statusUsuario.textContent = `Bem-vindo, ${usuarioLogado.nome_completo}! (${usuarioLogado.tipo}) - Matrícula realizada!`;
            }
        } else {
            // Erro
            const mensagemErro = data.mensagem || data.message || 'Erro ao realizar matrícula. Tente novamente.';
            alert('❌ ' + mensagemErro);
        }
    } catch (error) {
        console.error('Erro ao realizar matrícula:', error);
        alert('❌ Erro de conexão. Verifique sua internet e tente novamente.');
    }
}

/**
 * Verifica se usuário já está matriculado em uma turma
 */
function isMatriculado(idTurma) {
    return matriculasAtivas.includes(idTurma);
}

// ============================================================
// RENDERIZAÇÃO DE TURMAS
// ============================================================

/**
 * Renderiza lista de turmas no DOM com novo design
 * @param {Array} turmas - Lista de turmas
 */
function renderizarTurmas(turmas, emptyMessage = 'Nenhuma turma aberta no momento.') {
    if (!listaTurmas) return;

    setCollectionState(listaTurmas);
    listaTurmas.replaceChildren();

    if (!Array.isArray(turmas) || turmas.length === 0) {
        showEmpty(listaTurmas, emptyMessage);
        setCollectionState(listaTurmas, { role: 'status' });
        return;
    }

    const ehAluno = usuarioLogado?.tipo === 'ALUNO';

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
        date.textContent = `📚 ${cursoNome} · 👤 ${profNome}`;

        info.appendChild(name);
        info.appendChild(date);

        // Tag de status
        const tag = document.createElement('span');
        tag.className = formatarTagTurma(turma.status);
        const statusText = turma.status || 'Status';
        const statusLabels = {
            ABERTA: '● Inscrições abertas',
            FECHADA: '🔒 Inscrições fechadas',
            ENCERRADA: '■ Turma encerrada'
        };
        tag.textContent = statusLabels[statusText] || statusText;

        item.appendChild(info);
        item.appendChild(tag);

        // Botão de matrícula (apenas para alunos logados)
        if (ehAluno) {
            const jaMatriculado = isMatriculado(turma.id_turma);
            const statusAberto = statusText === 'ABERTA';

            if (jaMatriculado) {
                // Já está matriculado
                const btnMatriculado = document.createElement('button');
                btnMatriculado.className = 'btn btn-ghost btn-sm';
                btnMatriculado.disabled = true;
                btnMatriculado.textContent = '✓ Matriculado';
                item.appendChild(btnMatriculado);
            } else if (statusAberto) {
                // Pode se matricular
                const btnMatricular = document.createElement('button');
                btnMatricular.className = 'btn btn-primary btn-sm';
                btnMatricular.textContent = '📝 Matricular';
                btnMatricular.addEventListener('click', (e) => {
                    e.stopPropagation();
                    matricularEmTurma(turma.id_turma, turma.nome_turma);
                });
                item.appendChild(btnMatricular);
            } else {
                // Turma fechada
                const btnFechado = document.createElement('button');
                btnFechado.className = 'btn btn-ghost btn-sm';
                btnFechado.disabled = true;
                btnFechado.textContent = '🔒 Fechado';
                item.appendChild(btnFechado);
            }
        }

        listaTurmas.appendChild(item);
    });
}

/**
 * Carrega turmas da API e renderiza
 */
async function carregarTurmas() {
    if (!listaTurmas) return;

    setCollectionState(listaTurmas, { busy: true, role: 'status' });
    showLoading(listaTurmas, 'Carregando turmas...');

    try {
        turmasDisponiveis = await getTurmas();
        renderizarTurmasFiltradas();
        setTextContent('stat-turmas', turmasDisponiveis.length);
    } catch (error) {
        console.error('Erro ao carregar turmas:', error);
        showError(listaTurmas, handleAPIError(error));
        setCollectionState(listaTurmas, { role: 'alert' });
    }
}

function setTextContent(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value);
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================

window.addEventListener('load', async () => {
    const session = await initSessionUI();
    usuarioLogado = session.user;

    if (usuarioLogado?.tipo === 'ALUNO') {
        await carregarMatriculasDoAluno();
    }

    mostrarMensagemPorMotivo();

    await Promise.all([
        carregarCursos(),
        carregarTurmas()
    ]);
});
