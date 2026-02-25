import { clearToken, getCurrentUser, getToken } from './auth.js';

const statusUsuario = document.getElementById('status-usuario');
const mensagemQuestionario = document.getElementById('mensagem-questionario');
const questionarioTag = document.getElementById('questionario-tag');
const questionarioTitle = document.getElementById('questionario-title');
const questionarioDescription = document.getElementById('questionario-description');
const contextoQuestionario = document.getElementById('contexto-questionario');
const subtituloQuestionario = document.getElementById('subtitulo-questionario');
const formQuestionario = document.getElementById('form-questionario');
const listaQuestoes = document.getElementById('lista-questoes');
const btnFinalizarQuestionario = document.getElementById('btn-finalizar-questionario');
const linkVoltarSala = document.getElementById('link-voltar-sala');
const resultadoQuestionario = document.getElementById('resultado-questionario');
const resultadoTitulo = document.getElementById('resultado-titulo');
const resultadoDescricao = document.getElementById('resultado-descricao');
const btnLogout = document.getElementById('btn-logout');

const params = new URLSearchParams(window.location.search);
const tipoQuestionario = String(params.get('tipo') || '').toLowerCase().trim();
const idTurma = Number(params.get('id_turma'));
const modoTeste = params.get('demo') === '1';

const MOCK_TURMA = {
    id_turma: 101,
    nome_turma: 'Turma Demo Front-end',
    nome_curso: 'Curso Demo de Interface',
    status_turma: 'EM ANDAMENTO',
    progresso_percentual: 45
};

const CONFIG_TIPO = {
    prova: {
        tag: 'Ambiente de prova',
        titulo: 'Prova da turma',
        descricao: 'Avaliação com questões objetivas para verificar domínio do conteúdo principal.',
        acaoFinalizar: 'Finalizar prova',
        tituloResultado: 'Prova finalizada'
    },
    exercicio: {
        tag: 'Ambiente de exercícios',
        titulo: 'Exercícios da turma',
        descricao: 'Atividade prática com foco em fixação e revisão do conteúdo.',
        acaoFinalizar: 'Finalizar exercícios',
        tituloResultado: 'Exercícios finalizados'
    }
};

const BANCO_QUESTOES = {
    prova: [
        {
            enunciado: 'Qual é o objetivo principal da sala virtual em uma plataforma de cursos?',
            opcoes: [
                { valor: 'a', texto: 'Apenas mostrar dados administrativos.' },
                { valor: 'b', texto: 'Centralizar conteúdos, progresso e avaliações da turma.', correta: true },
                { valor: 'c', texto: 'Substituir o processo de login.' }
            ]
        },
        {
            enunciado: 'Qual parâmetro identifica a turma selecionada na URL do ambiente de aula?',
            opcoes: [
                { valor: 'a', texto: 'id_usuario' },
                { valor: 'b', texto: 'id_curso' },
                { valor: 'c', texto: 'id_turma', correta: true }
            ]
        },
        {
            enunciado: 'Qual prática melhora a manutenção do front neste projeto?',
            opcoes: [
                { valor: 'a', texto: 'Criar páginas duplicadas para cada tipo de questionário.' },
                { valor: 'b', texto: 'Reutilizar uma página de questionário com parâmetro tipo.', correta: true },
                { valor: 'c', texto: 'Remover validação de acesso por perfil.' }
            ]
        }
    ],
    exercicio: [
        {
            enunciado: 'Quando o usuário não possui token válido, qual deve ser o comportamento da tela protegida?',
            opcoes: [
                { valor: 'a', texto: 'Permitir navegação normalmente.' },
                { valor: 'b', texto: 'Redirecionar para login com motivo de autenticação.', correta: true },
                { valor: 'c', texto: 'Carregar apenas parte da página sem dados.' }
            ]
        },
        {
            enunciado: 'Qual abordagem foi adotada para prova e exercícios?',
            opcoes: [
                { valor: 'a', texto: 'Uma página única questionario.html com tipo=prova|exercicio.', correta: true },
                { valor: 'b', texto: 'Duas APIs separadas e sem parâmetros de URL.' },
                { valor: 'c', texto: 'Somente páginas estáticas sem JS.' }
            ]
        },
        {
            enunciado: 'Para melhorar experiência do aluno, é importante exibir:',
            opcoes: [
                { valor: 'a', texto: 'Apenas uma tela em branco após enviar.' },
                { valor: 'b', texto: 'Resultado com acertos, percentual e feedback.', correta: true },
                { valor: 'c', texto: 'Somente logs no console.' }
            ]
        }
    ]
};

let questoesAtivas = [];

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

function aplicarContextoVisual(tipo) {
    const config = CONFIG_TIPO[tipo];
    if (!config) return;

    if (questionarioTag) questionarioTag.textContent = config.tag;
    if (questionarioTitle) questionarioTitle.textContent = config.titulo;
    if (questionarioDescription) questionarioDescription.textContent = config.descricao;
    if (btnFinalizarQuestionario) btnFinalizarQuestionario.textContent = config.acaoFinalizar;
}

function obterQuestoes(tipo) {
    return Array.isArray(BANCO_QUESTOES[tipo]) ? BANCO_QUESTOES[tipo] : [];
}

function renderizarQuestoes(questoes) {
    if (!listaQuestoes) return;

    listaQuestoes.innerHTML = '';

    if (!Array.isArray(questoes) || questoes.length === 0) {
        listaQuestoes.innerHTML = '<li class="question-item empty-state">Nenhuma questão disponível para este questionário.</li>';
        return;
    }

    questoes.forEach((questao, index) => {
        const item = document.createElement('li');
        item.className = 'question-item';

        const opcoesHtml = questao.opcoes
            .map((opcao) => `
                <label class="question-option">
                    <input type="radio" name="questao_${index}" value="${opcao.valor}" required>
                    <span>${opcao.texto}</span>
                </label>
            `)
            .join('');

        item.innerHTML = `
            <fieldset class="question-fieldset">
                <legend>${index + 1}. ${questao.enunciado}</legend>
                <div class="question-options-group">
                    ${opcoesHtml}
                </div>
            </fieldset>
        `;

        listaQuestoes.appendChild(item);
    });
}

function exibirErro(mensagem) {
    if (mensagemQuestionario) {
        mensagemQuestionario.textContent = mensagem;
    }

    if (listaQuestoes) {
        listaQuestoes.innerHTML = `<li class="question-item error-state">${mensagem}</li>`;
    }

    if (btnFinalizarQuestionario) {
        btnFinalizarQuestionario.disabled = true;
    }
}

function mensagemPorDesempenho(percentual) {
    if (percentual >= 80) return 'Excelente desempenho! Continue assim.';
    if (percentual >= 60) return 'Bom resultado. Revise os pontos para evoluir ainda mais.';
    return 'Você pode melhorar: revise o conteúdo e tente novamente.';
}

function calcularResultado(formData, questoes) {
    let acertos = 0;

    questoes.forEach((questao, index) => {
        const resposta = formData.get(`questao_${index}`);
        const opcaoCorreta = questao.opcoes.find((opcao) => opcao.correta);

        if (opcaoCorreta && resposta === opcaoCorreta.valor) {
            acertos += 1;
        }
    });

    const total = questoes.length;
    const percentual = total > 0 ? Math.round((acertos / total) * 100) : 0;

    return { acertos, total, percentual };
}

function configurarSubmit() {
    if (!formQuestionario) return;

    formQuestionario.addEventListener('submit', (event) => {
        event.preventDefault();

        const dados = new FormData(formQuestionario);
        const resultado = calcularResultado(dados, questoesAtivas);
        const config = CONFIG_TIPO[tipoQuestionario];

        if (resultadoQuestionario) {
            resultadoQuestionario.hidden = false;
        }

        if (resultadoTitulo) {
            resultadoTitulo.textContent = config?.tituloResultado || 'Questionário finalizado';
        }

        if (resultadoDescricao) {
            resultadoDescricao.textContent = `Você acertou ${resultado.acertos} de ${resultado.total} questões (${resultado.percentual}%). ${mensagemPorDesempenho(resultado.percentual)}`;
        }

        if (mensagemQuestionario) {
            mensagemQuestionario.textContent = 'Questionário concluído com sucesso.';
        }

        resultadoQuestionario?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
}

async function carregarContextoTurma(token) {
    if (modoTeste) {
        const turmaDemo = Number.isInteger(idTurma) && idTurma > 0
            ? { ...MOCK_TURMA, id_turma: idTurma }
            : MOCK_TURMA;

        if (contextoQuestionario) {
            contextoQuestionario.textContent = `${turmaDemo.nome_turma} · ${turmaDemo.nome_curso}`;
        }

        if (subtituloQuestionario) {
            subtituloQuestionario.textContent = `Turma em ${turmaDemo.status_turma} · progresso atual ${turmaDemo.progresso_percentual}%`;
        }

        if (linkVoltarSala) {
            linkVoltarSala.href = `/sala-aula.html?id_turma=${encodeURIComponent(turmaDemo.id_turma)}&demo=1`;
        }

        return turmaDemo;
    }

    const response = await fetch('/api/matriculas/minha-sala', {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    if (response.status === 401) {
        clearToken();
        window.location.href = '/login.html?motivo=auth';
        return null;
    }

    if (response.status === 403) {
        window.location.href = '/index.html?motivo=nao_autorizado';
        return null;
    }

    if (!response.ok) {
        throw new Error('Não foi possível validar o acesso ao questionário.');
    }

    const payload = await response.json();
    const turmas = Array.isArray(payload.turmas) ? payload.turmas : [];
    const turmaSelecionada = turmas.find((turma) => Number(turma.id_turma) === idTurma);

    if (!turmaSelecionada) {
        throw new Error('Você não possui acesso ativo para esta turma.');
    }

    if (contextoQuestionario) {
        contextoQuestionario.textContent = `${turmaSelecionada.nome_turma} · ${turmaSelecionada.nome_curso}`;
    }

    if (subtituloQuestionario) {
        subtituloQuestionario.textContent = `Turma em ${turmaSelecionada.status_turma || 'status não informado'} · progresso atual ${turmaSelecionada.progresso_percentual ?? 0}%`;
    }

    if (linkVoltarSala) {
        linkVoltarSala.href = `/sala-aula.html?id_turma=${encodeURIComponent(turmaSelecionada.id_turma)}`;
    }

    return turmaSelecionada;
}

async function inicializarQuestionario() {
    if (!Object.prototype.hasOwnProperty.call(CONFIG_TIPO, tipoQuestionario)) {
        window.location.href = '/sala-virtual.html?motivo=tipo_questionario_invalido';
        return;
    }

    if (!Number.isInteger(idTurma) || idTurma <= 0) {
        window.location.href = '/sala-virtual.html?motivo=turma_invalida';
        return;
    }

    if (modoTeste) {
        aplicarContextoVisual(tipoQuestionario);
        await carregarContextoTurma(null);

        questoesAtivas = obterQuestoes(tipoQuestionario);
        renderizarQuestoes(questoesAtivas);

        if (statusUsuario) {
            statusUsuario.textContent = 'Modo teste ativo: questionário sem login.';
        }

        if (mensagemQuestionario) {
            mensagemQuestionario.textContent = 'Demonstração ativa. Responda e finalize para validar a interface.';
        }

        return;
    }

    const token = getToken();

    if (!token) {
        window.location.href = '/login.html?motivo=auth';
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

        aplicarContextoVisual(tipoQuestionario);
        await carregarContextoTurma(token);

        questoesAtivas = obterQuestoes(tipoQuestionario);
        renderizarQuestoes(questoesAtivas);

        if (mensagemQuestionario) {
            mensagemQuestionario.textContent = 'Questionário pronto. Responda todas as questões para finalizar.';
        }
    } catch (error) {
        console.error('Erro ao inicializar questionário:', error);
        exibirErro(error.message || 'Erro ao carregar questionário. Tente novamente.');
    }
}

window.addEventListener('load', () => {
    configurarLogout();
    configurarSubmit();
    inicializarQuestionario();
});