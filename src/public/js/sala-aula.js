import { clearToken, getCurrentUser, getToken } from './auth.js';

const statusUsuario = document.getElementById('status-usuario');
const mensagemSalaAula = document.getElementById('mensagem-sala-aula');
const tituloTurma = document.getElementById('titulo-turma');
const nomeCurso = document.getElementById('nome-curso');
const badgeStatusTurma = document.getElementById('badge-status-turma');
const progressoTurma = document.getElementById('progresso-turma');
const periodoTurma = document.getElementById('periodo-turma');
const cargaHoraria = document.getElementById('carga-horaria');
const descricaoCurso = document.getElementById('descricao-curso');
const listaConteudos = document.getElementById('lista-conteudos');
const linkProva = document.getElementById('link-prova');
const linkExercicios = document.getElementById('link-exercicios');
const btnLogout = document.getElementById('btn-logout');

const params = new URLSearchParams(window.location.search);
const idTurma = Number(params.get('id_turma'));
const modoTeste = params.get('demo') === '1';

const MOCK_TURMA = {
    id_turma: 101,
    nome_turma: 'Turma Demo Front-end',
    nome_curso: 'Curso Demo de Interface',
    status_turma: 'EM ANDAMENTO',
    progresso_percentual: 45,
    data_inicio: '2026-01-10',
    data_fim: '2026-03-30',
    carga_horaria: 40,
    descricao_curso: 'Ambiente de aula em modo de demonstração para validar o fluxo sem autenticação.'
};

function formatarStatusTurma(status) {
    const texto = String(status || '').trim();
    const upper = texto.toUpperCase();

    if (upper.includes('ABERTA')) return 'badge badge--success';
    if (upper.includes('ANDAMENTO')) return 'badge badge--warning';
    if (upper.includes('ENCERRADA') || upper.includes('CONCLUÍDA') || upper.includes('CANCELADA')) {
        return 'badge badge--danger';
    }

    return 'badge badge--neutral';
}

function formatarData(valor) {
    if (!valor) return '--';

    const data = new Date(valor);
    if (Number.isNaN(data.getTime())) {
        return '--';
    }

    return data.toLocaleDateString('pt-BR');
}

function montarPeriodo(dataInicio, dataFim) {
    const inicio = formatarData(dataInicio);
    const fim = formatarData(dataFim);

    if (inicio === '--' && fim === '--') return 'Período não informado';
    if (inicio !== '--' && fim === '--') return `Início em ${inicio}`;
    if (inicio === '--' && fim !== '--') return `Até ${fim}`;
    return `${inicio} até ${fim}`;
}

function montarConteudosPadrao(nomeTurma = '') {
    return [
        {
            titulo: 'Módulo 1 — Boas-vindas e visão geral',
            descricao: `Introdução à dinâmica da turma ${nomeTurma || ''}.`.trim()
        },
        {
            titulo: 'Módulo 2 — Conteúdo principal da aula',
            descricao: 'Material teórico e exemplos práticos para consolidar o aprendizado.'
        },
        {
            titulo: 'Módulo 3 — Preparação para avaliações',
            descricao: 'Revisão guiada para prova e lista de exercícios.'
        }
    ];
}

function renderizarConteudos(nomeTurma) {
    if (!listaConteudos) return;

    const conteudos = montarConteudosPadrao(nomeTurma);
    listaConteudos.innerHTML = '';

    conteudos.forEach((conteudo) => {
        const item = document.createElement('li');
        item.className = 'module-item';
        item.innerHTML = `
            <h4>${conteudo.titulo}</h4>
            <p>${conteudo.descricao}</p>
        `;
        listaConteudos.appendChild(item);
    });
}

function configurarLinksAvaliacao(id) {
    const sufixoDemo = modoTeste ? '&demo=1' : '';

    if (linkProva) {
        linkProva.href = `/questionario.html?tipo=prova&id_turma=${encodeURIComponent(id)}${sufixoDemo}`;
    }
    if (linkExercicios) {
        linkExercicios.href = `/questionario.html?tipo=exercicio&id_turma=${encodeURIComponent(id)}${sufixoDemo}`;
    }
}

function preencherDadosTurma(turma) {
    if (tituloTurma) tituloTurma.textContent = turma.nome_turma || 'Turma';
    if (nomeCurso) nomeCurso.textContent = `Curso: ${turma.nome_curso || 'Curso não informado'}`;

    if (badgeStatusTurma) {
        badgeStatusTurma.className = formatarStatusTurma(turma.status_turma);
        badgeStatusTurma.textContent = turma.status_turma || 'Status não informado';
    }

    if (progressoTurma) {
        const progresso = Number(turma.progresso_percentual);
        progressoTurma.textContent = Number.isNaN(progresso) ? '--' : `${progresso}%`;
    }

    if (periodoTurma) {
        periodoTurma.textContent = montarPeriodo(turma.data_inicio, turma.data_fim);
    }

    if (cargaHoraria) {
        cargaHoraria.textContent = turma.carga_horaria ? `${turma.carga_horaria}h` : '--';
    }

    if (descricaoCurso) {
        descricaoCurso.innerHTML = `<strong>Descrição:</strong> ${turma.descricao_curso || 'Conteúdo sem descrição cadastrada.'}`;
    }

    if (mensagemSalaAula) {
        mensagemSalaAula.textContent = 'Acesso liberado para a sala de aula da turma selecionada.';
    }

    renderizarConteudos(turma.nome_turma);
    configurarLinksAvaliacao(turma.id_turma);
}

function exibirErro(mensagem) {
    if (mensagemSalaAula) {
        mensagemSalaAula.textContent = mensagem;
    }

    if (listaConteudos) {
        listaConteudos.innerHTML = `<li class="module-item error-state">${mensagem}</li>`;
    }

    if (linkProva) {
        linkProva.href = modoTeste ? '/sala-virtual.html?demo=1' : '/sala-virtual.html';
    }
    if (linkExercicios) {
        linkExercicios.href = modoTeste ? '/sala-virtual.html?demo=1' : '/sala-virtual.html';
    }
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

async function carregarSalaAula() {
    if (modoTeste) {
        if (statusUsuario) {
            statusUsuario.textContent = 'Modo teste ativo: acesso de demonstração sem login.';
        }

        const turmaDemo = Number.isInteger(idTurma) && idTurma > 0
            ? { ...MOCK_TURMA, id_turma: idTurma }
            : MOCK_TURMA;

        preencherDadosTurma(turmaDemo);

        if (mensagemSalaAula) {
            mensagemSalaAula.textContent = 'Dados simulados carregados com sucesso para validação da sala de aula.';
        }

        return;
    }

    const token = getToken();

    if (!token) {
        window.location.href = '/login.html?motivo=auth';
        return;
    }

    if (!Number.isInteger(idTurma) || idTurma <= 0) {
        window.location.href = '/sala-virtual.html?motivo=turma_invalida';
        return;
    }

    try {
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
            throw new Error('Não foi possível carregar os dados da sala de aula.');
        }

        const payload = await response.json();
        const turmas = Array.isArray(payload.turmas) ? payload.turmas : [];
        const turmaSelecionada = turmas.find((turma) => Number(turma.id_turma) === idTurma);

        if (!turmaSelecionada) {
            exibirErro('Você não possui acesso ativo para esta turma.');
            return;
        }

        preencherDadosTurma(turmaSelecionada);
    } catch (error) {
        console.error('Erro ao carregar sala de aula:', error);
        exibirErro('Erro ao carregar sala de aula. Tente novamente.');
    }
}

window.addEventListener('load', () => {
    configurarLogout();
    carregarSalaAula();
});