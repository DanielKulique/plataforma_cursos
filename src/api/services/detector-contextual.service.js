'use strict';

const logger = require('../../utils/logger');

const KNOWN_RULES = new Set(['REG-01', 'REG-02', 'REG-03', 'REG-04', 'REG-05', 'REG-06', 'REG-07']);
const KNOWN_SEVERITIES = new Set(['INFORMATIVA', 'BAIXA', 'MEDIA', 'ALTA']);
const FORBIDDEN_KEYS = new Set([
    'plagio_detectado', 'fraude_confirmada', 'culpado', 'percentual_de_plagio',
    'embedding', 'embeddings', 'tensor', 'stack', 'stack_trace', 'caminho_local'
]);

class DetectorContextError extends Error {
    constructor(code, status, message) {
        super(message);
        this.name = 'DetectorContextError';
        this.code = code;
        this.status = status;
    }
}

function detectorConfig(env = process.env) {
    const rawUrl = String(env.DETECTOR_API_URL || 'http://127.0.0.1:8000').trim();
    let url;
    try {
        url = new URL(rawUrl);
    } catch {
        throw new DetectorContextError('DETECTOR_CONFIGURACAO_INVALIDA', 500, 'Configuração do detector inválida.');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw new DetectorContextError('DETECTOR_CONFIGURACAO_INVALIDA', 500, 'Configuração do detector inválida.');
    }
    const timeout = Number(env.DETECTOR_API_TIMEOUT_MS || 15000);
    if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 60000) {
        throw new DetectorContextError('DETECTOR_CONFIGURACAO_INVALIDA', 500, 'Configuração do detector inválida.');
    }
    const incrementalTimeout = Number(env.DETECTOR_API_TIMEOUT_INCREMENTAL_MS || 8000);
    const completeTimeout = Number(env.DETECTOR_API_TIMEOUT_COMPLETE_MS || timeout);
    for (const value of [incrementalTimeout, completeTimeout]) {
        if (!Number.isInteger(value) || value < 1000 || value > 60000) {
            throw new DetectorContextError('DETECTOR_CONFIGURACAO_INVALIDA', 500, 'Configuração do detector inválida.');
        }
    }
    return {
        endpoint: new URL('/api/v1/detectar', url).href,
        incrementalEndpoint: new URL('/api/v2/detectar/segmento', url).href,
        completeEndpoint: new URL('/api/v2/detectar/documento', url).href,
        timeout,
        incrementalTimeout,
        completeTimeout
    };
}

function walkForbidden(value, seen = new WeakSet()) {
    if (!value || typeof value !== 'object') return false;
    if (seen.has(value)) return false;
    seen.add(value);
    return Object.entries(value).some(([key, item]) => (
        FORBIDDEN_KEYS.has(String(key).toLowerCase()) || walkForbidden(item, seen)
    ));
}

function validateAlert(alert) {
    return alert && typeof alert === 'object'
        && KNOWN_RULES.has(alert.codigo_regra)
        && KNOWN_SEVERITIES.has(alert.gravidade)
        && typeof alert.mensagem === 'string';
}

function validateDetectorResponse(payload) {
    if (!payload || typeof payload !== 'object' || walkForbidden(payload)) return false;
    if (payload.versao_contrato !== '1.0' || payload.status_analise !== 'CONCLUIDO') return false;
    if (!payload.resumo || typeof payload.resumo !== 'object') return false;
    const summaryNumbers = [
        payload.resumo.total_segmentos,
        payload.resumo.segmentos_analisados,
        payload.resumo.total_alertas
    ];
    if (!summaryNumbers.every((value) => Number.isInteger(value) && value >= 0)) return false;
    if (payload.resumo.gravidade_maxima !== null
        && payload.resumo.gravidade_maxima !== undefined
        && !KNOWN_SEVERITIES.has(payload.resumo.gravidade_maxima)) return false;
    if (!payload.parametros_aplicados || typeof payload.parametros_aplicados !== 'object') return false;
    for (const key of ['limiar_semantico', 'limiar_lexical_reproducao', 'limiar_lexical_parafrase']) {
        const value = Number(payload.parametros_aplicados[key]);
        if (!Number.isFinite(value) || value < 0 || value > 1) return false;
    }
    for (const key of ['segmentos', 'alertas', 'citacoes', 'referencias', 'associacoes']) {
        if (!Array.isArray(payload[key])) return false;
    }
    if (!payload.alertas.every(validateAlert)) return false;
    return payload.segmentos.every((segment) => {
        if (!segment || typeof segment !== 'object' || typeof segment.id !== 'string') return false;
        if (segment.metricas !== null && segment.metricas !== undefined) {
            const semantic = Number(segment.metricas.score_semantico);
            const lexical = Number(segment.metricas.score_lexical);
            if (![semantic, lexical].every((score) => Number.isFinite(score) && score >= 0 && score <= 1)) return false;
        }
        return !Array.isArray(segment.alertas) || segment.alertas.every(validateAlert);
    });
}

function validateCandidate(candidate) {
    if (!candidate || typeof candidate !== 'object') return false;
    if (typeof candidate.fonte_id !== 'string' || !candidate.fonte_id) return false;
    if (typeof candidate.trecho_fonte_id !== 'string' || !candidate.trecho_fonte_id) return false;
    if (typeof candidate.texto_trecho !== 'string' || !candidate.texto_trecho) return false;
    if (candidate.score_recuperacao !== null && candidate.score_recuperacao !== undefined) {
        const score = Number(candidate.score_recuperacao);
        if (!Number.isFinite(score) || score < 0 || score > 1) return false;
    }
    return true;
}

function validateIncrementalResponse(payload) {
    if (!payload || typeof payload !== 'object' || walkForbidden(payload)) return false;
    if (payload.versao_contrato !== '2.0' || payload.modo_analise !== 'INCREMENTAL') return false;
    if (!['CONCLUIDO', 'PARCIAL'].includes(payload.status_analise)) return false;
    if (typeof payload.sessao_id !== 'string' || typeof payload.segmento_id !== 'string') return false;
    if (!Number.isInteger(payload.versao) || payload.versao < 1) return false;
    for (const key of ['fontes_candidatas', 'metricas', 'citacoes', 'referencias', 'associacoes', 'alertas']) {
        if (!Array.isArray(payload[key])) return false;
    }
    if (!payload.fontes_candidatas.every(validateCandidate)) return false;
    return payload.alertas.every(validateAlert);
}

function validateCompleteResponse(payload) {
    if (!payload || typeof payload !== 'object' || walkForbidden(payload)) return false;
    if (payload.versao_contrato !== '2.0' || payload.modo_analise !== 'COMPLETA') return false;
    if (!['CONCLUIDO', 'PARCIAL'].includes(payload.status_analise)) return false;
    if (!payload.resumo || typeof payload.resumo !== 'object') return false;
    for (const key of ['total_segmentos', 'segmentos_analisados', 'total_alertas']) {
        if (!Number.isInteger(payload.resumo[key]) || payload.resumo[key] < 0) return false;
    }
    for (const key of ['segmentos', 'fontes_candidatas', 'alertas', 'citacoes', 'referencias', 'associacoes']) {
        if (!Array.isArray(payload[key])) return false;
    }
    if (!payload.fontes_candidatas.every(validateCandidate) || !payload.alertas.every(validateAlert)) return false;
    return payload.segmentos.every((segment) => (
        segment
        && typeof segment.segmento_id === 'string'
        && Number.isInteger(segment.versao)
        && Array.isArray(segment.fontes_candidatas)
        && segment.fontes_candidatas.every(validateCandidate)
    ));
}

function mapExternalStatus(status) {
    if (status === 413) return new DetectorContextError(
        'DETECTOR_CONTEUDO_EXCESSIVO', 413, 'O conteúdo enviado excede o limite permitido.'
    );
    if (status === 400 || status === 422) return new DetectorContextError(
        'DETECTOR_PAYLOAD_INVALIDO', 422, 'Os dados enviados não foram aceitos pelo serviço de análise.'
    );
    if (status === 503) return new DetectorContextError(
        'DETECTOR_INDISPONIVEL', 503, 'O serviço de análise está temporariamente indisponível.'
    );
    return new DetectorContextError(
        'DETECTOR_ERRO_EXTERNO', 502, 'O serviço de análise não conseguiu concluir a solicitação.'
    );
}

function createDetectorContextService({ fetchImpl = global.fetch, env = process.env } = {}) {
    async function requestExternal(payload, {
        requestId,
        endpoint,
        timeout,
        signal,
        validate,
        mode
    }) {
            const startedAt = Date.now();
            try {
                const timeoutSignal = AbortSignal.timeout(timeout);
                const requestSignal = signal && typeof AbortSignal.any === 'function'
                    ? AbortSignal.any([timeoutSignal, signal])
                    : timeoutSignal;
                const response = await fetchImpl(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Request-ID': String(requestId || '')
                    },
                    body: JSON.stringify(payload),
                    signal: requestSignal
                });
                if (!response.ok) throw mapExternalStatus(response.status);
                let result;
                try {
                    result = await response.json();
                } catch {
                    throw new DetectorContextError(
                        'DETECTOR_RESPOSTA_INVALIDA', 502, 'O serviço de análise retornou uma resposta incompatível.'
                    );
                }
                if (!validate(result)) {
                    throw new DetectorContextError(
                        'DETECTOR_RESPOSTA_INVALIDA', 502, 'O serviço de análise retornou uma resposta incompatível.'
                    );
                }
                logger.info('detector.contextual.external.completed', {
                    requestId,
                    externalStatus: response.status,
                    durationMs: Date.now() - startedAt,
                    analysisMode: mode,
                    segments: result.resumo?.segmentos_analisados ?? 1,
                    alerts: result.resumo?.total_alertas ?? result.alertas.length,
                    candidates: result.fontes_candidatas?.length ?? 0
                });
                return result;
            } catch (error) {
                if (error instanceof DetectorContextError) throw error;
                if (signal?.aborted) {
                    throw new DetectorContextError(
                        'DETECTOR_CANCELADO', 499, 'A análise foi cancelada porque o conteúdo mudou.'
                    );
                }
                if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
                    throw new DetectorContextError(
                        'DETECTOR_TIMEOUT', 504, 'A análise ultrapassou o tempo esperado. Tente novamente.'
                    );
                }
                throw new DetectorContextError(
                    'DETECTOR_INDISPONIVEL', 503, 'O serviço de análise está temporariamente indisponível.'
                );
            }
    }

    return {
        async analisar(payload, { requestId, signal } = {}) {
            const { endpoint, timeout } = detectorConfig(env);
            return requestExternal(payload, {
                requestId, endpoint, timeout, signal, validate: validateDetectorResponse, mode: 'LEGADO_COMPLETO'
            });
        },
        async analisarSegmento(payload, { requestId, signal } = {}) {
            const { incrementalEndpoint, incrementalTimeout } = detectorConfig(env);
            return requestExternal(payload, {
                requestId,
                endpoint: incrementalEndpoint,
                timeout: incrementalTimeout,
                signal,
                validate: validateIncrementalResponse,
                mode: 'INCREMENTAL'
            });
        },
        async analisarDocumento(payload, { requestId, signal } = {}) {
            const { completeEndpoint, completeTimeout } = detectorConfig(env);
            return requestExternal(payload, {
                requestId,
                endpoint: completeEndpoint,
                timeout: completeTimeout,
                signal,
                validate: validateCompleteResponse,
                mode: 'COMPLETA'
            });
        }
    };
}

const defaultService = createDetectorContextService();

module.exports = {
    DetectorContextError,
    createDetectorContextService,
    detectorConfig,
    validateDetectorResponse,
    validateIncrementalResponse,
    validateCompleteResponse,
    analisar: (...args) => defaultService.analisar(...args),
    analisarSegmento: (...args) => defaultService.analisarSegmento(...args),
    analisarDocumento: (...args) => defaultService.analisarDocumento(...args)
};
