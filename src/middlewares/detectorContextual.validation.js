'use strict';

const LIMITS = Object.freeze({
    documento: 100000,
    fonte: 50000,
    autores: 20,
    candidatos: 20,
    referencias: 500
});
const SOURCE_MODES = new Set(['FONTE_MANUAL', 'BUSCA_AUTOMATICA', 'HIBRIDO']);

function invalid(message, status = 422, code = 'DETECTOR_PAYLOAD_INVALIDO') {
    return { ok: false, status, code, message };
}

function validatePayload(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return invalid('Informe os dados da análise.');
    const allowed = new Set(['documento', 'fonte_comparada', 'metadados_fonte', 'parametros']);
    if (Object.keys(body).some((key) => !allowed.has(key))) return invalid('O payload contém campos não permitidos.');
    for (const [key, limit] of [['documento', LIMITS.documento], ['fonte_comparada', LIMITS.fonte]]) {
        if (typeof body[key] !== 'string' || !body[key].trim()) return invalid(`O campo ${key} é obrigatório.`);
        if (body[key].length > limit) return invalid(
            `O campo ${key} excede o limite permitido.`, 413, 'DETECTOR_CONTEUDO_EXCESSIVO'
        );
    }
    if (body.metadados_fonte !== undefined) {
        const metadata = body.metadados_fonte;
        if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return invalid('Metadados da fonte inválidos.');
        const metadataAllowed = new Set(['autores', 'ano', 'titulo', 'doi', 'url']);
        if (Object.keys(metadata).some((key) => !metadataAllowed.has(key))) return invalid('Os metadados contêm campos não permitidos.');
        if (metadata.autores !== undefined) {
            if (!Array.isArray(metadata.autores) || metadata.autores.length > LIMITS.autores
                || metadata.autores.some((author) => typeof author !== 'string' || !author.trim())) {
                return invalid('A lista de autores é inválida.');
            }
        }
        if (metadata.ano !== undefined && metadata.ano !== null
            && (!Number.isInteger(metadata.ano) || metadata.ano < 1500 || metadata.ano > 2100)) {
            return invalid('O ano da fonte é inválido.');
        }
        for (const key of ['titulo', 'doi', 'url']) {
            if (metadata[key] !== undefined && metadata[key] !== null && typeof metadata[key] !== 'string') {
                return invalid(`O campo ${key} deve ser texto.`);
            }
        }
    }
    if (body.parametros !== undefined) {
        const parameters = body.parametros;
        if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) return invalid('Parâmetros inválidos.');
        const parameterAllowed = new Set([
            'limiar_semantico', 'limiar_lexical_reproducao', 'limiar_lexical_parafrase'
        ]);
        if (Object.keys(parameters).some((key) => !parameterAllowed.has(key))) return invalid('Os parâmetros contêm campos não permitidos.');
        if (Object.values(parameters).some((value) => typeof value !== 'number' || value < 0 || value > 1)) {
            return invalid('Os limiares devem estar entre 0.0 e 1.0.');
        }
        if (parameters.limiar_lexical_parafrase !== undefined
            && parameters.limiar_lexical_reproducao !== undefined
            && parameters.limiar_lexical_parafrase >= parameters.limiar_lexical_reproducao) {
            return invalid('O limiar de paráfrase deve ser menor que o limiar de reprodução.');
        }
    }
    return { ok: true };
}

function validateParameters(parameters) {
    if (parameters === undefined) return { ok: true };
    if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) return invalid('Parâmetros inválidos.');
    const parameterAllowed = new Set([
        'limiar_semantico', 'limiar_lexical_reproducao', 'limiar_lexical_parafrase'
    ]);
    if (Object.keys(parameters).some((key) => !parameterAllowed.has(key))) return invalid('Os parâmetros contêm campos não permitidos.');
    if (Object.values(parameters).some((value) => typeof value !== 'number' || value < 0 || value > 1)) {
        return invalid('Os limiares devem estar entre 0.0 e 1.0.');
    }
    if (parameters.limiar_lexical_parafrase !== undefined
        && parameters.limiar_lexical_reproducao !== undefined
        && parameters.limiar_lexical_parafrase >= parameters.limiar_lexical_reproducao) {
        return invalid('O limiar de paráfrase deve ser menor que o limiar de reprodução.');
    }
    return { ok: true };
}

function validateManualSource(source) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) return invalid('A fonte manual é inválida.');
    const allowed = new Set([
        'fonte_id', 'trecho_fonte_id', 'texto_trecho', 'titulo', 'autores', 'ano',
        'doi', 'url', 'origem', 'score_recuperacao', 'versao_fonte'
    ]);
    if (Object.keys(source).some((key) => !allowed.has(key))) return invalid('A fonte manual contém campos não permitidos.');
    if (typeof source.texto_trecho !== 'string' || !source.texto_trecho.trim()) return invalid('O trecho da fonte manual é obrigatório.');
    if (source.texto_trecho.length > LIMITS.fonte) return invalid(
        'A fonte manual excede o limite permitido.', 413, 'DETECTOR_CONTEUDO_EXCESSIVO'
    );
    for (const key of ['fonte_id', 'trecho_fonte_id']) {
        if (source[key] !== undefined && (typeof source[key] !== 'string' || !source[key].trim())) {
            return invalid(`O campo ${key} é inválido.`);
        }
    }
    for (const key of ['titulo', 'doi', 'url', 'origem', 'versao_fonte']) {
        if (source[key] !== undefined && source[key] !== null && typeof source[key] !== 'string') {
            return invalid(`O campo ${key} da fonte deve ser texto.`);
        }
    }
    if (source.autores !== undefined && (!Array.isArray(source.autores)
        || source.autores.length > LIMITS.autores
        || source.autores.some((author) => typeof author !== 'string' || !author.trim()))) {
        return invalid('A lista de autores da fonte é inválida.');
    }
    if (source.ano !== undefined && source.ano !== null
        && (!Number.isInteger(source.ano) || source.ano < 1500 || source.ano > 2100)) {
        return invalid('O ano da fonte é inválido.');
    }
    if (source.score_recuperacao !== undefined && source.score_recuperacao !== null
        && (typeof source.score_recuperacao !== 'number'
            || source.score_recuperacao < 0 || source.score_recuperacao > 1)) {
        return invalid('O score de recuperação é inválido.');
    }
    return { ok: true };
}

function validateSourceMode(body) {
    if (!SOURCE_MODES.has(body.modo_fontes)) return invalid('O modo de fontes é inválido.');
    if (body.limite_candidatos !== undefined
        && (!Number.isInteger(body.limite_candidatos)
            || body.limite_candidatos < 1 || body.limite_candidatos > LIMITS.candidatos)) {
        return invalid('O limite de candidatos deve estar entre 1 e 20.');
    }
    if (['FONTE_MANUAL', 'HIBRIDO'].includes(body.modo_fontes)) {
        return validateManualSource(body.fonte_manual);
    }
    if (body.fonte_manual !== undefined) return invalid('Fonte manual não é aceita no modo automático.');
    return { ok: true };
}

function validateSegmentPayload(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return invalid('Informe os dados da análise.');
    const allowed = new Set([
        'sessao_id', 'segmento_id', 'versao', 'indice', 'texto_segmento', 'inicio', 'fim',
        'tipo', 'analisavel', 'contexto', 'modo_fontes', 'fonte_manual',
        'limite_candidatos', 'parametros'
    ]);
    if (Object.keys(body).some((key) => !allowed.has(key))) return invalid('O payload contém campos não permitidos.');
    for (const key of ['sessao_id', 'segmento_id', 'texto_segmento']) {
        if (typeof body[key] !== 'string' || !body[key].trim()) return invalid(`O campo ${key} é obrigatório.`);
    }
    if (body.texto_segmento.length > LIMITS.documento) return invalid(
        'O segmento excede o limite permitido.', 413, 'DETECTOR_CONTEUDO_EXCESSIVO'
    );
    if (!Number.isInteger(body.versao) || body.versao < 1) return invalid('A versão do segmento é inválida.');
    if (body.indice !== undefined && (!Number.isInteger(body.indice) || body.indice < 0)) return invalid('O índice do segmento é inválido.');
    if (body.inicio !== undefined && (!Number.isInteger(body.inicio) || body.inicio < 0)) return invalid('A posição inicial é inválida.');
    if (body.fim !== undefined && (!Number.isInteger(body.fim) || body.fim < 0)) return invalid('A posição final é inválida.');
    if (body.contexto !== undefined) {
        const context = body.contexto;
        if (!context || typeof context !== 'object' || Array.isArray(context)) return invalid('O contexto é inválido.');
        const contextAllowed = new Set(['segmento_anterior', 'segmento_seguinte', 'referencias_atuais']);
        if (Object.keys(context).some((key) => !contextAllowed.has(key))) return invalid('O contexto contém campos não permitidos.');
        for (const key of ['segmento_anterior', 'segmento_seguinte']) {
            if (context[key] !== undefined && context[key] !== null && typeof context[key] !== 'string') {
                return invalid(`O campo ${key} deve ser texto.`);
            }
        }
        if (context.referencias_atuais !== undefined && context.referencias_atuais !== null
            && (!Array.isArray(context.referencias_atuais)
                || context.referencias_atuais.length > LIMITS.referencias
                || context.referencias_atuais.some((item) => typeof item !== 'string'))) {
            return invalid('As referências atuais são inválidas.');
        }
    }
    const sourceMode = validateSourceMode(body);
    if (!sourceMode.ok) return sourceMode;
    return validateParameters(body.parametros);
}

function validateDocumentPayload(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return invalid('Informe os dados da análise.');
    const allowed = new Set(['documento', 'modo_fontes', 'fonte_manual', 'limite_candidatos', 'parametros']);
    if (Object.keys(body).some((key) => !allowed.has(key))) return invalid('O payload contém campos não permitidos.');
    if (typeof body.documento !== 'string' || !body.documento.trim()) return invalid('O documento é obrigatório.');
    if (body.documento.length > LIMITS.documento) return invalid(
        'O documento excede o limite permitido.', 413, 'DETECTOR_CONTEUDO_EXCESSIVO'
    );
    const sourceMode = validateSourceMode(body);
    if (!sourceMode.ok) return sourceMode;
    return validateParameters(body.parametros);
}

function middlewareFor(validate) {
    return (req, res, next) => {
        const result = validate(req.body);
        if (result.ok) return next();
        return res.status(result.status).json({ codigo: result.code, mensagem: result.message });
    };
}

function validateDetectorPayload(req, res, next) {
    const result = validatePayload(req.body);
    if (result.ok) return next();
    return res.status(result.status).json({ codigo: result.code, mensagem: result.message });
}

module.exports = {
    LIMITS,
    validatePayload,
    validateSegmentPayload,
    validateDocumentPayload,
    validateDetectorPayload,
    validateDetectorSegmentPayload: middlewareFor(validateSegmentPayload),
    validateDetectorDocumentPayload: middlewareFor(validateDocumentPayload)
};
