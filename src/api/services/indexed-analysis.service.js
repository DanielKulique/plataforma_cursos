'use strict';

const logger = require('../../utils/logger');

const ALLOWED_STATUSES = new Set([400, 401, 403, 409, 413, 422, 429, 503]);
const FORBIDDEN_RESPONSE_KEYS = new Set([
    'text', 'text_content', 'texto_trecho', 'embedding', 'embeddings', 'vector',
    'vectors', 'path', 'stack', 'stack_trace', 'internal_token'
]);

class IndexedAnalysisGatewayError extends Error {
    constructor(code, status, message) {
        super(message);
        this.name = 'IndexedAnalysisGatewayError';
        this.code = code;
        this.status = status;
    }
}

function gatewayConfig(env = process.env) {
    const rawUrl = String(env.MOTOR_IA_API_URL || env.DETECTOR_API_URL || 'http://127.0.0.1:8000').trim();
    let url;
    try {
        url = new URL(rawUrl);
    } catch {
        throw new IndexedAnalysisGatewayError('ANALISE_CONFIGURACAO_INVALIDA', 500, 'Configuração do motor de análise inválida.');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw new IndexedAnalysisGatewayError('ANALISE_CONFIGURACAO_INVALIDA', 500, 'Configuração do motor de análise inválida.');
    }
    const token = String(env.MOTOR_IA_INTERNAL_API_TOKEN || '');
    if (!token || token.length > 4096) {
        throw new IndexedAnalysisGatewayError('ANALISE_CONFIGURACAO_INVALIDA', 500, 'Autenticação interna não configurada.');
    }
    const timeout = Number(env.RETRIEVAL_API_TIMEOUT_MS || 20000);
    const maximumResponseBytes = Number(env.RETRIEVAL_MAX_RESPONSE_BYTES || 1048576);
    if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 60000
        || !Number.isInteger(maximumResponseBytes) || maximumResponseBytes < 1024 || maximumResponseBytes > 5242880) {
        throw new IndexedAnalysisGatewayError('ANALISE_CONFIGURACAO_INVALIDA', 500, 'Limites do gateway são inválidos.');
    }
    return {
        token,
        timeout,
        maximumResponseBytes,
        analysisEndpoint: new URL('/internal/v1/analysis/indexed', url).href,
        statusEndpoint: new URL('/internal/v1/corpus/index/status', url).href,
        reloadEndpoint: new URL('/internal/v1/corpus/index/reload', url).href
    };
}

function hasForbiddenKey(value, seen = new WeakSet()) {
    if (!value || typeof value !== 'object') return false;
    if (seen.has(value)) return false;
    seen.add(value);
    return Object.entries(value).some(([key, item]) => (
        FORBIDDEN_RESPONSE_KEYS.has(String(key).toLowerCase()) || hasForbiddenKey(item, seen)
    ));
}

function validateIndexedAnalysisResponse(payload) {
    if (!payload || typeof payload !== 'object' || hasForbiddenKey(payload)) return false;
    if (typeof payload.analysis_id !== 'string'
        || typeof payload.index_snapshot_id !== 'string'
        || typeof payload.model_fingerprint !== 'string') return false;
    for (const key of ['query_segment_count', 'candidate_count', 'analyzed_pair_count']) {
        if (!Number.isInteger(payload[key]) || payload[key] < 0) return false;
    }
    if (!Array.isArray(payload.candidates) || !Array.isArray(payload.warnings)) return false;
    return payload.candidates.every((candidate) => (
        candidate && typeof candidate.query_segment_id === 'string'
        && typeof candidate.source_segment_id === 'string'
        && Number.isFinite(candidate.raw_cosine_similarity)
        && candidate.raw_cosine_similarity >= -1 && candidate.raw_cosine_similarity <= 1
        && Number.isInteger(candidate.retrieval_rank) && candidate.retrieval_rank > 0
        && candidate.source && typeof candidate.source === 'object'
        && typeof candidate.source.section_type === 'string'
        && (candidate.excerpt === null || candidate.excerpt === undefined || typeof candidate.excerpt === 'string')
    ));
}

function validateStatusResponse(payload) {
    return Boolean(payload && typeof payload === 'object'
        && typeof payload.enabled === 'boolean'
        && typeof payload.loaded === 'boolean'
        && typeof payload.ready === 'boolean'
        && Number.isInteger(payload.vector_count)
        && Array.isArray(payload.warnings)
        && !hasForbiddenKey(payload));
}

function mapMotorStatus(status) {
    if (ALLOWED_STATUSES.has(status)) {
        return new IndexedAnalysisGatewayError(
            `ANALISE_MOTOR_${status}`, status,
            status >= 500 ? 'O serviço de análise está temporariamente indisponível.' : 'A solicitação não foi aceita pelo serviço de análise.'
        );
    }
    return new IndexedAnalysisGatewayError('ANALISE_MOTOR_INVALIDO', 502, 'O motor de análise retornou uma resposta inválida.');
}

function createIndexedAnalysisService({ fetchImpl = global.fetch, env = process.env } = {}) {
    async function call(method, endpoint, body, { requestId, signal, validate }) {
        const config = gatewayConfig(env);
        const timeoutSignal = AbortSignal.timeout(config.timeout);
        const effectiveSignal = signal && typeof AbortSignal.any === 'function'
            ? AbortSignal.any([timeoutSignal, signal])
            : timeoutSignal;
        const startedAt = Date.now();
        try {
            const response = await fetchImpl(endpoint, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Internal-Service-Token': config.token,
                    'X-Request-ID': String(requestId || '')
                },
                body: body === undefined ? undefined : JSON.stringify(body),
                signal: effectiveSignal
            });
            if (!response.ok) throw mapMotorStatus(response.status);
            const declared = Number(response.headers?.get?.('content-length') || 0);
            if (declared > config.maximumResponseBytes) {
                throw new IndexedAnalysisGatewayError('ANALISE_RESPOSTA_EXCESSIVA', 502, 'O motor retornou uma resposta excessiva.');
            }
            let payload;
            if (typeof response.text === 'function') {
                const raw = await response.text();
                if (Buffer.byteLength(raw, 'utf8') > config.maximumResponseBytes) {
                    throw new IndexedAnalysisGatewayError('ANALISE_RESPOSTA_EXCESSIVA', 502, 'O motor retornou uma resposta excessiva.');
                }
                try { payload = JSON.parse(raw); } catch {
                    throw new IndexedAnalysisGatewayError('ANALISE_RESPOSTA_INVALIDA', 502, 'O motor retornou uma resposta incompatível.');
                }
            } else {
                payload = await response.json();
                if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > config.maximumResponseBytes) {
                    throw new IndexedAnalysisGatewayError('ANALISE_RESPOSTA_EXCESSIVA', 502, 'O motor retornou uma resposta excessiva.');
                }
            }
            if (!validate(payload)) {
                throw new IndexedAnalysisGatewayError('ANALISE_RESPOSTA_INVALIDA', 502, 'O motor retornou uma resposta incompatível.');
            }
            logger.info('analysis.indexed.external.completed', {
                requestId,
                externalStatus: response.status,
                durationMs: Date.now() - startedAt,
                candidates: payload.candidate_count,
                snapshotId: payload.snapshot_id || payload.index_snapshot_id
            });
            return payload;
        } catch (error) {
            if (error instanceof IndexedAnalysisGatewayError) throw error;
            if (signal?.aborted) {
                throw new IndexedAnalysisGatewayError('ANALISE_CANCELADA', 499, 'A análise foi cancelada.');
            }
            if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
                throw new IndexedAnalysisGatewayError('ANALISE_TIMEOUT', 504, 'A análise ultrapassou o tempo permitido.');
            }
            throw new IndexedAnalysisGatewayError('ANALISE_INDISPONIVEL', 503, 'O serviço de análise está temporariamente indisponível.');
        }
    }

    return {
        analisar: (payload, context = {}) => {
            const config = gatewayConfig(env);
            return call('POST', config.analysisEndpoint, payload, { ...context, validate: validateIndexedAnalysisResponse });
        },
        status: (context = {}) => {
            const config = gatewayConfig(env);
            return call('GET', config.statusEndpoint, undefined, { ...context, validate: validateStatusResponse });
        },
        reload: (context = {}) => {
            const config = gatewayConfig(env);
            return call('POST', config.reloadEndpoint, undefined, {
                ...context,
                validate: (payload) => Boolean(payload && typeof payload.changed === 'boolean'
                    && payload.current && validateStatusResponse(payload.current))
            });
        }
    };
}

const defaultService = createIndexedAnalysisService();

module.exports = {
    IndexedAnalysisGatewayError,
    createIndexedAnalysisService,
    gatewayConfig,
    validateIndexedAnalysisResponse,
    validateStatusResponse,
    analisar: (...args) => defaultService.analisar(...args),
    status: (...args) => defaultService.status(...args),
    reload: (...args) => defaultService.reload(...args)
};
