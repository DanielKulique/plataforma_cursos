import { authenticatedFetch } from './auth.js';
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
const idQuestionario = params.get('id_questionario');
const tipo = String(params.get('tipo') || 'exercicio').toLowerCase();
let questionario = null;
let enviando = false;
let usuarioId = null;
let submissionId = null;
let draftKey = null;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function gerarUuid() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function lerRascunho() {
    try {
        return JSON.parse(sessionStorage.getItem(draftKey) || 'null');
    } catch (_) {
        return null;
    }
}

function coletarResposta(pergunta) {
    const nome = `pergunta_${pergunta.id_pergunta}`;
    if (pergunta.tipo_pergunta === 'ASSOCIACAO') {
        const matches = [...document.querySelectorAll(`select[data-question-id="${pergunta.id_pergunta}"]`)]
            .filter((select) => select.value)
            .map((select) => ({ left_id: select.dataset.leftId, right_id: select.value }));
        return { matches };
    }
    if (pergunta.formato_resposta === 'BOOLEANO') {
        const selected = document.querySelector(`input[name="${nome}"]:checked`);
        return selected ? { resposta_booleana: selected.value === 'true' } : null;
    }
    if (pergunta.tipo_pergunta === 'MULTIPLA_ESCOLHA') {
        const selected_option_ids = [...document.querySelectorAll(`input[name="${nome}"]:checked`)]
            .map((input) => Number(input.value));
        return { selected_option_ids };
    }
    const selected = document.querySelector(`input[name="${nome}"]:checked`);
    return selected ? { id_opcao: Number(selected.value) } : null;
}

function respostaCompleta(pergunta, resposta) {
    if (!resposta) return false;
    if (pergunta.tipo_pergunta === 'ASSOCIACAO') {
        return resposta.matches.length === pergunta.itens_esquerda.length
            && new Set(resposta.matches.map((match) => match.right_id)).size === pergunta.itens_direita.length;
    }
    if (pergunta.formato_resposta === 'BOOLEANO') return typeof resposta.resposta_booleana === 'boolean';
    if (pergunta.tipo_pergunta === 'MULTIPLA_ESCOLHA') return resposta.selected_option_ids.length > 0;
    return Number.isInteger(resposta.id_opcao) && resposta.id_opcao > 0;
}

function salvarRascunho() {
    if (!questionario || !draftKey || !submissionId) return;
    const respostas = Object.fromEntries(questionario.perguntas.map((pergunta) => [
        pergunta.id_pergunta, coletarResposta(pergunta)
    ]));
    sessionStorage.setItem(draftKey, JSON.stringify({ submissionId, respostas }));
}

function prepararRascunho() {
    draftKey = `questionario:${usuarioId}:${questionario.id_questionario}`;
    const rascunho = lerRascunho();
    submissionId = typeof rascunho?.submissionId === 'string'
        && UUID_PATTERN.test(rascunho.submissionId)
        ? rascunho.submissionId
        : gerarUuid();
    questionario.perguntas.forEach((pergunta) => {
        const saved = rascunho?.respostas?.[pergunta.id_pergunta];
        if (!saved) return;
        if (pergunta.tipo_pergunta === 'ASSOCIACAO') {
            (saved.matches || []).forEach((match) => {
                const select = $(`match_${pergunta.id_pergunta}_${match.left_id}`);
                if (select && [...select.options].some((option) => option.value === match.right_id)) select.value = match.right_id;
            });
            return;
        }
        const inputName = `pergunta_${pergunta.id_pergunta}`;
        const inputs = [...document.querySelectorAll(`input[name="${inputName}"]`)];
        if (pergunta.formato_resposta === 'BOOLEANO') {
            if (typeof saved.resposta_booleana === 'boolean') {
                const input = inputs.find((item) => item.value === String(saved.resposta_booleana));
                if (input) input.checked = true;
            }
        } else if (pergunta.tipo_pergunta === 'MULTIPLA_ESCOLHA') {
            const ids = Array.isArray(saved.selected_option_ids) ? saved.selected_option_ids : [saved.id_opcao || saved];
            inputs.forEach((input) => { input.checked = ids.some((id) => Number(id) === Number(input.value)); });
        } else {
            const id = Number(saved.id_opcao || saved);
            const input = inputs.find((item) => Number(item.value) === id);
            if (input) input.checked = true;
        }
    });
    salvarRascunho();
}

function mensagem(valor, erro = false) {
    setAcademicMessage(
        $('mensagem-questionario'),
        valor,
        erro ? 'error' : 'info'
    );
}

function atualizarContador() {
    const total = questionario?.perguntas.length || 0;
    const marcadas = (questionario?.perguntas || []).filter((pergunta) => respostaCompleta(pergunta, coletarResposta(pergunta))).length;
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
        options.className = pergunta.tipo_pergunta === 'ASSOCIACAO' ? 'question-match-list' : 'question-options-group';
        if (pergunta.tipo_pergunta === 'ASSOCIACAO') {
            pergunta.itens_esquerda.forEach((left, leftIndex) => {
                const row = document.createElement('div'); row.className = 'question-match-row';
                const label = document.createElement('label'); label.htmlFor = `match_${pergunta.id_pergunta}_${left.id_item}`;
                label.textContent = `${leftIndex + 1}. ${left.texto}`;
                const select = document.createElement('select'); select.id = label.htmlFor;
                select.dataset.questionId = pergunta.id_pergunta; select.dataset.leftId = left.id_item;
                const empty = document.createElement('option'); empty.value = ''; empty.textContent = 'Selecione a correspondência';
                select.append(empty);
                pergunta.itens_direita.forEach((right) => {
                    const choice = document.createElement('option'); choice.value = right.id_item; choice.textContent = right.texto;
                    select.append(choice);
                });
                select.addEventListener('change', () => { salvarRascunho(); atualizarContador(); });
                row.append(label, select); options.append(row);
            });
        } else {
            const choices = pergunta.formato_resposta === 'BOOLEANO'
                ? [{ value: 'true', text: 'Verdadeiro' }, { value: 'false', text: 'Falso' }]
                : (pergunta.opcoes || []).map((option) => ({ value: String(option.id_opcao), text: option.texto_opcao }));
            choices.forEach((choice) => {
                const label = document.createElement('label'); label.className = 'question-option';
                const input = document.createElement('input');
                input.type = pergunta.tipo_pergunta === 'MULTIPLA_ESCOLHA' ? 'checkbox' : 'radio';
                input.name = `pergunta_${pergunta.id_pergunta}`; input.value = choice.value;
                input.addEventListener('change', () => { salvarRascunho(); atualizarContador(); });
                const texto = document.createElement('span'); texto.textContent = choice.text;
                label.append(input, texto); options.append(label);
            });
        }
        fieldset.append(legend, options);
        item.appendChild(fieldset);
        lista.appendChild(item);
    });
    $('total-questoes-info').textContent = `${questionario.perguntas.length} questões`;
    prepararRascunho();
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
    const response = await authenticatedFetch(
        `/api/questionarios/historico?id_questionario=${questionario.id_questionario}`
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.mensagem || 'Não foi possível carregar o histórico.');
    renderizarHistorico(Array.isArray(body.tentativas) ? body.tentativas : []);
}

async function carregar() {
    if (!Number.isInteger(idTurma) || idTurma <= 0 || !['prova', 'exercicio'].includes(tipo)) {
        throw new Error('Turma ou tipo de questionário inválido.');
    }
    const response = await authenticatedFetch(
        `/api/turmas/${idTurma}/questionarios/disponivel?tipo=${tipo}${idQuestionario ? `&id_questionario=${encodeURIComponent(idQuestionario)}` : ''}`
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.mensagem || body.message || 'Não foi possível carregar o questionário.');
    questionario = body.questionario;
    $('questionario-tag').textContent = questionario.prova_final ? 'PROVA FINAL · mínimo 75%' : tipo === 'prova' ? 'Prova intermediária' : 'Exercício';
    $('questionario-title').textContent = questionario.titulo;
    $('questionario-description').textContent = questionario.descricao || 'Responda todas as questões.';
    $('contexto-questionario').textContent = questionario.id_modulo ? `Aula ${questionario.numero_aula} — ${questionario.titulo_aula} · ${questionario.titulo}` : questionario.prova_final ? `Prova final · ${questionario.titulo}` : questionario.titulo;
    if (questionario.id_modulo) document.querySelectorAll('a[href*="sala-aula.html"]') .forEach((link) => { link.href = `/sala-aula.html?id_turma=${idTurma}#aula-${questionario.id_modulo}`; });
    $('subtitulo-questionario').textContent = 'As respostas serão corrigidas e persistidas pelo servidor.';
    $('link-refazer').hidden = Boolean(questionario.prova_final);
    if (questionario.tentativa_finalizada) {
        mostrarResultadoFinal(questionario.resultado_final);
        await carregarHistorico();
        return;
    }
    renderizarQuestionario();
    await carregarHistorico();
}

function mostrarResultadoFinal(resultado) {
    $('form-questionario').hidden = true;
    $('resultado-questionario').hidden = false;
    $('resultado-titulo').textContent = `Resultado final: ${Number(resultado?.percentual || 0).toFixed(2)}%`;
    if (resultado?.aprovado) {
        const certificadoAtivo = resultado.status_certificado === 'ATIVO';
        $('resultado-descricao').textContent = certificadoAtivo
            ? 'APROVADO. Seu certificado está ATIVO e disponível na área do aluno.'
            : 'APROVADO. A emissão do certificado está pendente; ele ficará disponível na área do aluno.';
        $('link-certificados').hidden = false;
    } else {
        $('resultado-descricao').textContent = 'Não aprovado no Teste Final. A tentativa foi finalizada e não há nova tentativa disponível.';
        $('link-certificados').hidden = true;
    }
}

$('form-questionario').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (enviando || !questionario) return;
    const respostas = questionario.perguntas.map((pergunta) => ({
        id_pergunta: pergunta.id_pergunta, ...coletarResposta(pergunta)
    }));
    if (respostas.some((resposta, index) => !respostaCompleta(questionario.perguntas[index], resposta))) {
        mensagem('Responda todas as questões e use cada correspondência uma vez.', true);
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
        const response = await authenticatedFetch(`/api/questionarios/${questionario.id_questionario}/submissoes`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ submission_id: submissionId, respostas })
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.mensagem || body.message || 'Falha ao enviar respostas.');
        $('resultado-questionario').hidden = false;
        $('resultado-titulo').textContent = `Resultado: ${body.resultado.percentual}%`;
        $('resultado-descricao').textContent = `Você acertou ${body.resultado.acertos} de ${body.resultado.total_perguntas} questões. Pontuação: ${body.resultado.pontuacao}.`;
        if (questionario.prova_final) {
            const resultadoFinal = {
                percentual: body.resultado.percentual,
                aprovado: body.resultado.requisitos?.status_aprovacao === 'APROVADO'
                    && body.resultado.requisitos.elegivel_aprovacao,
                status_certificado: body.resultado.status_certificado
                    || body.resultado.requisitos?.status_certificado
            };
            mostrarResultadoFinal(resultadoFinal);
        }
        $('form-questionario').querySelectorAll('input,select,button').forEach((elemento) => {
            elemento.disabled = true;
        });
        sessionStorage.removeItem(draftKey);
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
        usuarioId = session.user.id_usuario;
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
