import { clearToken, getToken } from './auth.js';
import { initSessionUI } from './session-ui.js';
import { createAcademicDialog } from './academic-dialog.js';
import {
    createAcademicState,
    formatAcademicDate,
    setAcademicBusy,
    setAcademicMessage
} from './academic-ui.js';

const $ = (id) => document.getElementById(id);
const idTurma = Number(new URLSearchParams(window.location.search).get('id_turma'));
const modalEdicao = $('modal-edicao');
const formEdicaoMatricula = $('form-edicao-matricula');
const notaFinalInput = $('nota-final');
const statusAprovacaoInput = $('status-aprovacao');
const progressoInput = $('progresso');
const erroModal = $('erro-modal-edicao');
const salvarButton = $('salvar-matricula');
let matriculaEditando = null;
let usuarioAtual = null;
let salvandoMatricula = false;

const dialogController = createAcademicDialog(modalEdicao, {
    initialFocus: () => notaFinalInput
});

function formatarStatusAprovacao(status) {
    const valor = String(status || '').toUpperCase();
    if (valor === 'APROVADO') return 'badge badge--success';
    if (valor === 'CURSANDO') return 'badge badge--warning';
    if (['REPROVADO', 'CANCELADO'].includes(valor)) return 'badge badge--danger';
    return 'badge badge--neutral';
}

function rotularStatusAprovacao(status) {
    const valor = String(status || '').toUpperCase();
    const labels = {
        APROVADO: 'Aprovado',
        CURSANDO: 'Cursando',
        REPROVADO: 'Reprovado',
        CANCELADO: 'Cancelado'
    };
    return labels[valor] || status || 'Não informado';
}

function formatarStatusTurma(status) {
    const valor = String(status || '').toUpperCase();
    if (valor === 'ABERTA') return 'badge badge--success';
    if (valor === 'FECHADA') return 'badge badge--warning';
    if (valor === 'ENCERRADA') return 'badge badge--danger';
    return 'badge badge--neutral';
}

function rotularStatusTurma(status) {
    const valor = String(status || '').toUpperCase();
    const labels = {
        ABERTA: 'Inscrições abertas',
        FECHADA: 'Inscrições fechadas',
        ENCERRADA: 'Turma encerrada'
    };
    return labels[valor] || status || 'Não informado';
}

function formatarProgresso(progresso) {
    const valor = Number(progresso);
    if (!Number.isFinite(valor)) return '0%';
    if (valor >= 100) return 'Concluído';
    if (valor >= 75) return 'Avançado';
    if (valor >= 50) return 'Intermediário';
    if (valor >= 25) return 'Básico';
    return 'Iniciante';
}

function abrirModal(matricula, trigger) {
    matriculaEditando = matricula;
    notaFinalInput.value = matricula.nota_final ?? '';
    statusAprovacaoInput.value = matricula.status_aprovacao || 'CURSANDO';
    progressoInput.value = matricula.progresso_percentual ?? '';
    notaFinalInput.removeAttribute('aria-invalid');
    setAcademicMessage(erroModal, '', 'error');
    dialogController.open(trigger);
}

function fecharModal(options) {
    dialogController.close(options);
}

function celulaTexto(valor, className = '') {
    const cell = document.createElement('td');
    if (className) cell.className = className;
    cell.textContent = String(valor ?? '');
    return cell;
}

function renderizarEstadoTabela(valor, type = 'empty') {
    const linha = document.createElement('tr');
    const celula = celulaTexto(valor, `table-empty ${type === 'error' ? 'error-state' : ''}`);
    celula.colSpan = 6;
    celula.setAttribute('role', type === 'error' ? 'alert' : 'status');
    linha.append(celula);
    $('lista-alunos-turma').replaceChildren(linha);
    setAcademicBusy($('lista-alunos-turma'), false);
}

function renderizarAlunos(alunos) {
    const lista = $('lista-alunos-turma');
    lista.replaceChildren();
    setAcademicBusy(lista, false);

    if (!alunos.length) {
        renderizarEstadoTabela('Nenhum aluno matriculado nesta turma.');
        return;
    }

    alunos.forEach((aluno) => {
        const linha = document.createElement('tr');
        const progressoCelula = document.createElement('td');
        const progresso = document.createElement('div');
        progresso.className = 'progress-cell';
        const valor = document.createElement('span');
        valor.className = 'progress-value';
        valor.textContent = `${Number(aluno.progresso_percentual) || 0}%`;
        const rotulo = document.createElement('span');
        rotulo.className = 'progress-label';
        rotulo.textContent = formatarProgresso(aluno.progresso_percentual);
        progresso.append(valor, rotulo);
        progressoCelula.append(progresso);

        const statusCelula = document.createElement('td');
        const status = document.createElement('span');
        status.className = formatarStatusAprovacao(aluno.status_aprovacao);
        status.textContent = rotularStatusAprovacao(aluno.status_aprovacao);
        statusCelula.append(status);

        const acoes = document.createElement('td');
        const editar = document.createElement('button');
        editar.type = 'button';
        editar.className = 'action-button action-button--small';
        editar.textContent = 'Editar dados';
        editar.dataset.matriculaId = String(aluno.id_matricula);
        editar.setAttribute(
            'aria-label',
            `Editar nota, progresso e status de ${aluno.nome_completo || 'aluno'}`
        );
        editar.addEventListener('click', () => abrirModal(aluno, editar));
        acoes.append(editar);

        const nota = aluno.nota_final !== null && Number.isFinite(Number(aluno.nota_final))
            ? Number(aluno.nota_final).toFixed(1)
            : 'N/A';
        linha.append(
            celulaTexto(aluno.nome_completo || 'Nome não informado'),
            celulaTexto(aluno.email || 'E-mail não informado'),
            progressoCelula,
            celulaTexto(nota),
            statusCelula,
            acoes
        );
        lista.appendChild(linha);
    });
}

function renderizarListaSimples(idLista, itens, criarItem, mensagemVazia) {
    const lista = $(idLista);
    lista.replaceChildren();
    setAcademicBusy(lista, false);
    if (!itens.length) {
        lista.appendChild(createAcademicState(mensagemVazia, 'empty'));
        return;
    }
    itens.forEach((item) => lista.appendChild(criarItem(item)));
}

function renderizarConteudos(conteudos) {
    renderizarListaSimples('lista-conteudos-professor', conteudos, (conteudo) => {
        const item = document.createElement('li');
        item.className = 'module-item module-item--static';
        const titulo = document.createElement('h3');
        titulo.textContent = conteudo.titulo;
        const descricao = document.createElement('p');
        descricao.textContent = [conteudo.tipo, conteudo.descricao].filter(Boolean).join(' · ');
        item.append(titulo, descricao);
        return item;
    }, 'Nenhum conteúdo cadastrado nesta turma.');
}

function renderizarQuestionarios(questionarios) {
    renderizarListaSimples('lista-questionarios-professor', questionarios, (questionario) => {
        const item = document.createElement('li');
        item.className = 'module-item module-item--static';
        const titulo = document.createElement('h3');
        titulo.textContent = questionario.titulo;
        const descricao = document.createElement('p');
        descricao.textContent = `${questionario.tipo} · ${questionario.total_perguntas} pergunta(s) · ${questionario.ativo ? 'Ativo' : 'Inativo'}`;
        item.append(titulo, descricao);
        return item;
    }, 'Nenhum questionário cadastrado nesta turma.');
}

async function requisitarJson(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            ...(options.headers || {}),
            Authorization: `Bearer ${getToken()}`
        }
    });
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) {
        clearToken();
        window.location.href = '/login.html?motivo=auth';
        throw new Error('Sessão inválida.');
    }
    if (response.status === 403) {
        throw new Error('Você não tem permissão para acessar esta turma.');
    }
    if (!response.ok) {
        throw new Error(body.mensagem || body.message || 'Não foi possível carregar o recurso.');
    }
    return body;
}

async function atualizarMatricula(matriculaId, dadosAtualizacao) {
    return requisitarJson(`/api/matriculas/${matriculaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dadosAtualizacao)
    });
}

async function carregarTurma() {
    if (!Number.isInteger(idTurma) || idTurma <= 0) {
        window.location.href = '/professor.html?motivo=turma_invalida';
        return;
    }

    try {
        setAcademicBusy($('lista-alunos-turma'), true);
        setAcademicBusy($('lista-conteudos-professor'), true);
        setAcademicBusy($('lista-questionarios-professor'), true);
        $('status-usuario').textContent = `Professor logado: ${usuarioAtual.nome_completo}`;

        const [alunosBody, conteudosBody, questionariosBody] = await Promise.all([
            requisitarJson(`/api/matriculas/turma/${idTurma}`),
            requisitarJson(`/api/turmas/${idTurma}/conteudos`),
            requisitarJson(`/api/turmas/${idTurma}/questionarios`)
        ]);
        const turma = await requisitarJson(`/api/turmas/${idTurma}`);
        const alunos = Array.isArray(alunosBody.matriculas) ? alunosBody.matriculas : [];

        $('turma-title').textContent = turma.nome_turma || 'Turma';
        $('titulo-alunos').textContent = `Alunos matriculados em ${turma.nome_turma}`;
        $('subtitulo-alunos').textContent = `Lista de alunos e seu desempenho na turma ${turma.nome_turma}.`;
        $('resumo-curso').textContent = turma.nome_curso || 'Não informado';
        $('resumo-status').className = formatarStatusTurma(turma.status);
        $('resumo-status').textContent = rotularStatusTurma(turma.status);
        $('resumo-periodo').textContent = [turma.data_inicio, turma.data_fim]
            .filter(Boolean)
            .map(formatAcademicDate)
            .join(' — ') || 'Não informado';
        $('resumo-alunos').textContent = String(alunos.length);

        renderizarAlunos(alunos);
        renderizarConteudos(Array.isArray(conteudosBody.conteudos) ? conteudosBody.conteudos : []);
        renderizarQuestionarios(
            Array.isArray(questionariosBody.questionarios) ? questionariosBody.questionarios : []
        );
        setAcademicMessage(
            $('mensagem-turma'),
            alunos.length
                ? `Esta turma tem ${alunos.length} aluno(s) matriculado(s).`
                : 'Esta turma não tem alunos matriculados no momento.',
            'info'
        );
    } catch (error) {
        setAcademicMessage($('mensagem-turma'), error.message, 'error');
        renderizarEstadoTabela('Erro ao carregar alunos da turma.', 'error');
        $('lista-conteudos-professor').replaceChildren(
            createAcademicState('Erro ao carregar conteúdos da turma.', 'error')
        );
        $('lista-questionarios-professor').replaceChildren(
            createAcademicState('Erro ao carregar questionários da turma.', 'error')
        );
        setAcademicBusy($('lista-conteudos-professor'), false);
        setAcademicBusy($('lista-questionarios-professor'), false);
    }
}

$('fechar-modal').addEventListener('click', () => fecharModal());
$('cancelar-modal').addEventListener('click', () => fecharModal());
modalEdicao.addEventListener('click', (event) => {
    if (event.target === modalEdicao) fecharModal();
});
modalEdicao.addEventListener('close', () => {
    matriculaEditando = null;
    salvandoMatricula = false;
    setAcademicBusy(formEdicaoMatricula, false);
    salvarButton.disabled = false;
    salvarButton.setAttribute('aria-busy', 'false');
    salvarButton.textContent = salvarButton.dataset.idleLabel || 'Atualizar';
});

formEdicaoMatricula.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!matriculaEditando || salvandoMatricula) return;

    const dados = {};
    notaFinalInput.removeAttribute('aria-invalid');
    setAcademicMessage(erroModal, '', 'error');
    if (notaFinalInput.value !== '') {
        const nota = Number(notaFinalInput.value);
        if (!Number.isFinite(nota) || nota < 0 || nota > 10) {
            notaFinalInput.setAttribute('aria-invalid', 'true');
            setAcademicMessage(erroModal, 'A nota deve estar entre 0 e 10.', 'error');
            notaFinalInput.focus();
            return;
        }
        dados.nota_final = nota;
    }
    if (statusAprovacaoInput.value) dados.status_aprovacao = statusAprovacaoInput.value;
    if (progressoInput.value !== '') dados.progresso_percentual = Number(progressoInput.value);

    salvandoMatricula = true;
    setAcademicBusy(formEdicaoMatricula, true);
    salvarButton.disabled = true;
    salvarButton.setAttribute('aria-busy', 'true');
    salvarButton.textContent = 'Atualizando...';
    const matriculaId = matriculaEditando.id_matricula;

    try {
        await atualizarMatricula(matriculaId, dados);
        fecharModal({ shouldRestoreFocus: false });
        await carregarTurma();
        setAcademicMessage(
            $('mensagem-turma'),
            'Matrícula atualizada e dados recarregados do banco.',
            'success'
        );
        [...document.querySelectorAll('[data-matricula-id]')]
            .find((button) => button.dataset.matriculaId === String(matriculaId))
            ?.focus();
    } catch (error) {
        salvandoMatricula = false;
        setAcademicBusy(formEdicaoMatricula, false);
        salvarButton.disabled = false;
        salvarButton.setAttribute('aria-busy', 'false');
        salvarButton.textContent = salvarButton.dataset.idleLabel || 'Atualizar';
        setAcademicMessage(
            erroModal,
            `Erro ao atualizar matrícula: ${error.message}`,
            'error'
        );
    }
});

window.addEventListener('load', async () => {
    const session = await initSessionUI({ requiredRoles: ['PROFESSOR'] });
    if (session.state !== 'authenticated') return;
    usuarioAtual = session.user;
    await carregarTurma();
});
