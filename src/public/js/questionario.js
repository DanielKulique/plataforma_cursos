import { getToken } from './auth.js';
import { initSessionUI } from './session-ui.js';
import {
    createAcademicState,
    preferredScrollBehavior,
    setAcademicBusy,
    setAcademicMessage
} from './academic-ui.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const idTurma = Number(params.get('id_turma'));
const tipo = String(params.get('tipo') || 'exercicio').toLowerCase();
let questionario = null;
let enviando = false;

function mensagem(valor, erro = false) {
    setAcademicMessage(
        $('mensagem-questionario'),
        valor,
        erro ? 'error' : 'info'
    );
}

function atualizarContador() {
    const total = questionario?.perguntas.length || 0;
    const marcadas = document.querySelectorAll('#lista-questoes input:checked').length;
    $('contador-respostas').textContent = `${marcadas} de ${total} respondidas`;
    $('btn-finalizar-questionario').disabled = enviando || marcadas !== total || total === 0;
}

function renderizarQuestionario() {
    const lista = $('lista-questoes');
    lista.replaceChildren();
    setAcademicBusy(lista, false);
    if (!questionario.perguntas.length) {
        lista.appendChild(createAcademicState(
            'Este questionário ainda não possui perguntas.',
            'empty'
        ));
    }
    questionario.perguntas.forEach((pergunta, indice) => {
        const item = document.createElement('li');
        item.className = 'question-item';
        const fieldset = document.createElement('fieldset');
        fieldset.className = 'question-fieldset';
        const legend = document.createElement('legend');
        legend.textContent = `${indice + 1}. ${pergunta.texto_pergunta}`;
        const options = document.createElement('div');
        options.className = 'question-options-group';
        pergunta.opcoes.forEach((opcao) => {
            const label = document.createElement('label');
            label.className = 'question-option';
            const input = document.createElement('input');
            input.type = 'radio';
            input.id = `opcao_${opcao.id_opcao}`;
            input.name = `pergunta_${pergunta.id_pergunta}`;
            input.value = opcao.id_opcao;
            input.addEventListener('change', atualizarContador);
            const texto = document.createElement('span');
            texto.textContent = opcao.texto_opcao;
            label.append(input, texto);
            options.appendChild(label);
        });
        fieldset.append(legend, options);
        item.appendChild(fieldset);
        lista.appendChild(item);
    });
    $('total-questoes-info').textContent = `${questionario.perguntas.length} questões`;
    atualizarContador();
}

function renderizarHistorico(tentativas) {
    const lista = $('lista-historico');
    lista.replaceChildren();
    setAcademicBusy(lista, false);
    if (!tentativas.length) {
        lista.appendChild(createAcademicState(
            'Nenhuma tentativa registrada para este questionário.',
            'empty'
        ));
        return;
    }
    tentativas.forEach((tentativa) => {
        const item = document.createElement('li');
        item.className = 'history-item';
        const titulo = document.createElement('strong');
        titulo.textContent = `${Number(tentativa.percentual).toFixed(2)}% — ${tentativa.acertos}/${tentativa.total_perguntas} acertos`;
        const data = document.createElement('span');
        data.textContent = tentativa.finalizada_em
            ? new Date(tentativa.finalizada_em).toLocaleString('pt-BR')
            : 'Tentativa em processamento';
        item.append(titulo, data);
        lista.appendChild(item);
    });
}

async function carregarHistorico() {
    if (!questionario) return;
    setAcademicBusy($('lista-historico'), true);
    const response = await fetch(
        `/api/questionarios/historico?id_questionario=${questionario.id_questionario}`,
        { headers: { Authorization: `Bearer ${getToken()}` } }
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.mensagem || 'Não foi possível carregar o histórico.');
    renderizarHistorico(Array.isArray(body.tentativas) ? body.tentativas : []);
}

async function carregar() {
    if (!Number.isInteger(idTurma) || idTurma <= 0 || !['prova', 'exercicio'].includes(tipo)) {
        throw new Error('Turma ou tipo de questionário inválido.');
    }
    const response = await fetch(
        `/api/turmas/${idTurma}/questionarios/disponivel?tipo=${tipo}`,
        { headers: { Authorization: `Bearer ${getToken()}` } }
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.mensagem || 'Não foi possível carregar o questionário.');
    questionario = body.questionario;
    $('questionario-tag').textContent = tipo === 'prova' ? 'Prova' : 'Exercício';
    $('questionario-title').textContent = questionario.titulo;
    $('questionario-description').textContent = questionario.descricao || 'Responda todas as questões.';
    $('contexto-questionario').textContent = questionario.titulo;
    $('subtitulo-questionario').textContent = 'As respostas serão corrigidas e persistidas pelo servidor.';
    renderizarQuestionario();
    await carregarHistorico();
}

$('form-questionario').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (enviando || !questionario) return;
    const respostas = questionario.perguntas.map((pergunta) => ({
        id_pergunta: pergunta.id_pergunta,
        id_opcao: Number(document.querySelector(
            `input[name="pergunta_${pergunta.id_pergunta}"]:checked`
        )?.value)
    }));
    if (respostas.some((resposta) => !resposta.id_opcao)) {
        mensagem('Responda todas as questões.', true);
        return;
    }

    enviando = true;
    setAcademicBusy($('form-questionario'), true);
    const submitButton = $('btn-finalizar-questionario');
    submitButton.setAttribute('aria-busy', 'true');
    submitButton.textContent = 'Enviando respostas...';
    atualizarContador();
    mensagem('Enviando respostas…');
    try {
        const response = await fetch(`/api/questionarios/${questionario.id_questionario}/submissoes`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${getToken()}`
            },
            body: JSON.stringify({ respostas })
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.mensagem || 'Falha ao enviar respostas.');
        $('resultado-questionario').hidden = false;
        $('resultado-titulo').textContent = `Resultado: ${body.resultado.percentual}%`;
        $('resultado-descricao').textContent = `Você acertou ${body.resultado.acertos} de ${body.resultado.total_perguntas} questões. Pontuação: ${body.resultado.pontuacao}.`;
        $('form-questionario').querySelectorAll('input,button').forEach((elemento) => {
            elemento.disabled = true;
        });
        await carregarHistorico();
        setAcademicMessage(
            $('mensagem-questionario'),
            'Tentativa corrigida e salva.',
            'success'
        );
        setAcademicBusy($('form-questionario'), false);
        submitButton.setAttribute('aria-busy', 'false');
        submitButton.textContent = 'Questionário finalizado';
        $('resultado-questionario').scrollIntoView({
            behavior: preferredScrollBehavior()
        });
    } catch (error) {
        mensagem(error.message, true);
        enviando = false;
        setAcademicBusy($('form-questionario'), false);
        submitButton.setAttribute('aria-busy', 'false');
        submitButton.textContent = submitButton.dataset.idleLabel || 'Finalizar questionário';
        atualizarContador();
    }
});

$('link-voltar-sala').href = `/sala-aula.html?id_turma=${idTurma}`;
$('link-voltar-sala-resultado').href = `/sala-aula.html?id_turma=${idTurma}`;
$('link-refazer').href = location.href;

window.addEventListener('load', async () => {
    const session = await initSessionUI({ requiredRoles: ['ALUNO'] });
    if (session.state !== 'authenticated') return;
    try {
        $('status-usuario').textContent = session.user.nome_completo;
        mensagem('Carregando questionário e histórico…');
        setAcademicBusy($('lista-questoes'), true);
        setAcademicBusy($('lista-historico'), true);
        await carregar();
        mensagem('Questionário pronto.');
    } catch (error) {
        mensagem(error.message, true);
        $('lista-questoes').replaceChildren(createAcademicState(error.message, 'error'));
        $('lista-historico').replaceChildren(createAcademicState(
            'O histórico não pôde ser carregado porque o questionário está indisponível.',
            'error'
        ));
        setAcademicBusy($('lista-questoes'), false);
        setAcademicBusy($('lista-historico'), false);
    }
});
