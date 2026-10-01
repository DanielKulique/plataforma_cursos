'use strict';

const TIPOS_QUESTAO = Object.freeze([
    'MULTIPLA_ESCOLHA',
    'VERDADEIRO_FALSO',
    'ASSOCIACAO'
]);

function erroValidacao(code, message) {
    return Object.assign(new Error(message), { code, status: 400 });
}

function textoValido(value) {
    return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 255;
}

function ordemValida(value) {
    return Number.isInteger(Number(value)) && Number(value) >= 0;
}

function exigirCampos(item, permitidos, contexto) {
    const desconhecidos = Object.keys(item || {}).filter((campo) => !permitidos.includes(campo));
    if (desconhecidos.length) {
        throw erroValidacao('CAMPOS_QUESTAO_INVALIDOS',  `Campos não permitidos em ${contexto}: ${desconhecidos.join(', ')}.`);
    }
}

function validarAutoriaPergunta(dados) {
    const tipo = dados.tipo_pergunta || 'MULTIPLA_ESCOLHA';
    if (!TIPOS_QUESTAO.includes(tipo)) {
        throw erroValidacao('TIPO_PERGUNTA_INVALIDO', 'Tipo de pergunta inválido.');
    }
    if (!textoValido(dados.texto_pergunta)) {
        throw erroValidacao('ENUNCIADO_INVALIDO', 'Informe um enunciado com até 255 caracteres.');
    }
    const pontos = dados.pontos === undefined ? 1 : Number(dados.pontos);
    if (!Number.isFinite(pontos) || pontos < 0.01 || pontos > 1000
        || Math.abs(Math.round(pontos * 100) - pontos * 100) > 1e-8) {
        throw erroValidacao('PONTUACAO_INVALIDA', 'A pontuação deve ter até duas casas decimais, entre 0,01 e 1000.');
    }
    if (!ordemValida(dados.ordem)) {
        throw erroValidacao('ORDEM_PERGUNTA_INVALIDA', 'A ordem da pergunta deve ser um inteiro não negativo.');
    }

    if (tipo === 'MULTIPLA_ESCOLHA') {
        if (dados.resposta_booleana !== undefined || dados.pares !== undefined) {
            throw erroValidacao('DADOS_TIPO_INCOMPATIVEL', 'Envie somente os campos de múltipla escolha.');
        }
        if (!Array.isArray(dados.opcoes) || dados.opcoes.length < 2) {
            throw erroValidacao('MINIMO_OPCOES', 'A pergunta precisa ter pelo menos duas alternativas.');
        }
        const ordens = new Set();
        let corretas = 0;
        dados.opcoes.forEach((opcao) => {
            exigirCampos(opcao, ['texto_opcao', 'ordem', 'correta'], 'alternativa');
            if (!textoValido(opcao.texto_opcao)) {
                throw erroValidacao('TEXTO_OPCAO_INVALIDO', 'Toda alternativa precisa de um texto com até 255 caracteres.');
            }
            if (!ordemValida(opcao.ordem) || ordens.has(Number(opcao.ordem))) {
                throw erroValidacao('ORDEM_OPCAO_INVALIDA', 'As alternativas devem possuir ordens diferentes e ser inteiras.');
            }
            ordens.add(Number(opcao.ordem));
            if (typeof opcao.correta !== 'boolean') {
                throw erroValidacao('GABARITO_INVALIDO', 'Marque cada alternativa como correta ou incorreta.');
            }
            if (opcao.correta) corretas += 1;
        });
        if (!corretas) throw erroValidacao('GABARITO_OBRIGATORIO', 'Marque pelo menos uma alternativa correta.');
        return { tipo, pontos };
    }

    if (tipo === 'VERDADEIRO_FALSO') {
        if (dados.opcoes !== undefined || dados.pares !== undefined) {
            throw erroValidacao('DADOS_TIPO_INCOMPATIVEL', 'Verdadeiro ou falso não aceita alternativas personalizadas.');
        }
        if (typeof dados.resposta_booleana !== 'boolean') {
            throw erroValidacao('RESPOSTA_BOOLEAN_INVALIDA', 'Informe true ou false como resposta correta.');
        }
        return { tipo, pontos };
    }

    if (dados.opcoes !== undefined || dados.resposta_booleana !== undefined) {
        throw erroValidacao('DADOS_TIPO_INCOMPATIVEL', 'Associação não aceita alternativas nem resposta booleana.');
    }
    if (!Array.isArray(dados.pares) || dados.pares.length < 2) {
        throw erroValidacao('MINIMO_PARES', 'A pergunta precisa ter pelo menos dois pares.');
    }
    const ordens = new Set();
    dados.pares.forEach((par) => {
        exigirCampos(par, ['esquerda', 'direita', 'ordem'], 'par de associação');
        if (!textoValido(par.esquerda) || !textoValido(par.direita)) {
            throw erroValidacao('TEXTO_PAR_INVALIDO', 'Os dois lados de cada par são obrigatórios e aceitam até 255 caracteres.');
        }
        if (!ordemValida(par.ordem) || ordens.has(Number(par.ordem))) {
            throw erroValidacao('ORDEM_PAR_INVALIDA', 'Os pares devem ter ordens inteiras e diferentes.');
        }
        ordens.add(Number(par.ordem));
    });
    return { tipo, pontos };
}

function tipoSuportado(tipo) {
    return TIPOS_QUESTAO.includes(tipo);
}

module.exports = { TIPOS_QUESTAO, validarAutoriaPergunta, tipoSuportado, erroValidacao };
