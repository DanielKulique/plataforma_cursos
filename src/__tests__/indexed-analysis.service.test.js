'use strict';

const {
    createIndexedAnalysisService,
    gatewayConfig,
    validateIndexedAnalysisResponse
} = require('../api/services/indexed-analysis.service');

const env = {
    MOTOR_IA_API_URL: 'http://motor-ia:8000',
    MOTOR_IA_INTERNAL_API_TOKEN: 'internal-secret',
    RETRIEVAL_API_TIMEOUT_MS: '5000',
    RETRIEVAL_MAX_RESPONSE_BYTES: '100000'
};

const analysis = {
    analysis_id: '00000000-0000-4000-8000-000000000001',
    query_segment_count: 1,
    candidate_count: 1,
    analyzed_pair_count: 1,
    index_snapshot_id: 'snapshot-1',
    model_fingerprint: 'f'.repeat(64),
    candidates: [{
        query_segment_id: 'query-1',
        source_segment_id: 'source-1',
        raw_cosine_similarity: -0.25,
        retrieval_rank: 1,
        detector_result: { resumo: {}, metricas: [], alertas: [] },
        source: { section_type: 'INTRODUCTION', page_numbers: [2] },
        excerpt: 'Trecho limitado.',
        warnings: []
    }],
    warnings: []
};

function response(payload, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: () => null },
        text: jest.fn().mockResolvedValue(JSON.stringify(payload))
    };
}

describe('gateway de análise indexada', () => {
    test('envia token somente no header, request ID e contrato versionado', async () => {
        const fetchImpl = jest.fn().mockResolvedValue(response(analysis));
        const service = createIndexedAnalysisService({ fetchImpl, env });
        const payload = { text: 'Texto sintético.', top_k: 5 };
        await expect(service.analisar(payload, { requestId: 'request-1' })).resolves.toEqual(analysis);
        const [url, options] = fetchImpl.mock.calls[0];
        expect(url).toBe('http://motor-ia:8000/internal/v1/analysis/indexed');
        expect(options.headers['X-Internal-Service-Token']).toBe('internal-secret');
        expect(options.headers['X-Request-ID']).toBe('request-1');
        expect(options.body).toBe(JSON.stringify(payload));
        expect(url).not.toContain('internal-secret');
    });

    test.each([401, 409, 413, 422, 429, 503])('preserva status operacional %i', async (status) => {
        const service = createIndexedAnalysisService({
            fetchImpl: jest.fn().mockResolvedValue(response({}, status)), env
        });
        await expect(service.analisar({ text: 'x' })).rejects.toMatchObject({ status });
    });

    test('valida status e reload manual', async () => {
        const status = { enabled: true, loaded: true, ready: true, vector_count: 2, warnings: [] };
        const fetchImpl = jest.fn()
            .mockResolvedValueOnce(response(status))
            .mockResolvedValueOnce(response({ changed: true, current: status }));
        const service = createIndexedAnalysisService({ fetchImpl, env });
        await expect(service.status({ requestId: 'r' })).resolves.toEqual(status);
        await expect(service.reload({ requestId: 'r' })).resolves.toEqual({ changed: true, current: status });
        expect(fetchImpl.mock.calls[0][1].method).toBe('GET');
        expect(fetchImpl.mock.calls[1][1].method).toBe('POST');
    });

    test('rejeita corpus integral, vetor e resposta excessiva', async () => {
        expect(validateIndexedAnalysisResponse({ ...analysis, candidates: [{ ...analysis.candidates[0], text: 'corpus' }] })).toBe(false);
        expect(validateIndexedAnalysisResponse({ ...analysis, candidates: [{ ...analysis.candidates[0], embedding: [1] }] })).toBe(false);
        const service = createIndexedAnalysisService({
            fetchImpl: jest.fn().mockResolvedValue(response(analysis)),
            env: { ...env, RETRIEVAL_MAX_RESPONSE_BYTES: '1024' }
        });
        const huge = { ...analysis, warnings: ['x'.repeat(2000)] };
        service.analisar = createIndexedAnalysisService({
            fetchImpl: jest.fn().mockResolvedValue(response(huge)),
            env: { ...env, RETRIEVAL_MAX_RESPONSE_BYTES: '1024' }
        }).analisar;
        await expect(service.analisar({ text: 'x' })).rejects.toMatchObject({ code: 'ANALISE_RESPOSTA_EXCESSIVA' });
    });

    test('bloqueia URL insegura, token ausente e resposta incompatível', async () => {
        expect(() => gatewayConfig({ ...env, MOTOR_IA_API_URL: 'file:///tmp/index' })).toThrow();
        expect(() => gatewayConfig({ ...env, MOTOR_IA_INTERNAL_API_TOKEN: '' })).toThrow();
        const service = createIndexedAnalysisService({
            fetchImpl: jest.fn().mockResolvedValue(response({ ok: true })), env
        });
        await expect(service.analisar({ text: 'x' })).rejects.toMatchObject({ status: 502 });
    });
});
