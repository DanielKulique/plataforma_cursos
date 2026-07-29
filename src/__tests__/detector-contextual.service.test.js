'use strict';

const {
    createDetectorContextService,
    detectorConfig,
    validateDetectorResponse,
    validateIncrementalResponse,
    validateCompleteResponse
} = require('../api/services/detector-contextual.service');
const {
    validDetectorResponse,
    validIncrementalResponse,
    validCompleteV2Response
} = require('./fixtures/detector-contextual.fixture');

const payload = { documento: 'Documento sintético.', fonte_comparada: 'Fonte sintética.' };

describe('service do detector contextual', () => {
    test('usa URL configurada, timeout e X-Request-ID', async () => {
        const fetchImpl = jest.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => validDetectorResponse()
        });
        const service = createDetectorContextService({
            fetchImpl,
            env: { DETECTOR_API_URL: 'http://127.0.0.1:8000', DETECTOR_API_TIMEOUT_MS: '12000' }
        });
        await expect(service.analisar(payload, { requestId: 'req-123' })).resolves.toMatchObject({
            versao_contrato: '1.0'
        });
        expect(fetchImpl.mock.calls[0][0]).toBe('http://127.0.0.1:8000/api/v1/detectar');
        expect(fetchImpl.mock.calls[0][1].headers['X-Request-ID']).toBe('req-123');
        expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual(payload);
    });

    test.each([
        [413, 'DETECTOR_CONTEUDO_EXCESSIVO', 413],
        [422, 'DETECTOR_PAYLOAD_INVALIDO', 422],
        [500, 'DETECTOR_ERRO_EXTERNO', 502],
        [503, 'DETECTOR_INDISPONIVEL', 503]
    ])('mapeia status externo %i', async (external, code, status) => {
        const service = createDetectorContextService({
            fetchImpl: jest.fn().mockResolvedValue({ ok: false, status: external }),
            env: {}
        });
        await expect(service.analisar(payload)).rejects.toMatchObject({ code, status });
    });

    test('mapeia timeout e falha de rede sem vazar detalhe', async () => {
        const timeoutService = createDetectorContextService({
            fetchImpl: jest.fn().mockRejectedValue(Object.assign(new Error('texto privado'), { name: 'TimeoutError' })),
            env: {}
        });
        await expect(timeoutService.analisar(payload)).rejects.toMatchObject({
            code: 'DETECTOR_TIMEOUT', status: 504
        });
        const offlineService = createDetectorContextService({
            fetchImpl: jest.fn().mockRejectedValue(new TypeError('http://interno:8000 segredo')),
            env: {}
        });
        await expect(offlineService.analisar(payload)).rejects.toMatchObject({
            code: 'DETECTOR_INDISPONIVEL', status: 503
        });
    });

    test('rejeita JSON e contratos externos incompatíveis', async () => {
        const invalidJson = createDetectorContextService({
            fetchImpl: jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error('raw'); } }),
            env: {}
        });
        await expect(invalidJson.analisar(payload)).rejects.toMatchObject({
            code: 'DETECTOR_RESPOSTA_INVALIDA', status: 502
        });
        for (const response of [
            validDetectorResponse({ segmentos: [] , embeddings: [] }),
            validDetectorResponse({ segmentos: [{ id: 'x', metricas: { score_semantico: 2, score_lexical: 0 } }] }),
            validDetectorResponse({ alertas: undefined }),
            validDetectorResponse({ alertas: [{ codigo_regra: 'REG-99', gravidade: 'ALTA', mensagem: 'x' }] }),
            validDetectorResponse({ alertas: [{ codigo_regra: 'REG-01', gravidade: 'CRITICA', mensagem: 'x' }] })
        ]) {
            expect(validateDetectorResponse(response)).toBe(false);
        }
    });

    test('aceita regras conhecidas, listas vazias, múltiplos segmentos e parâmetros personalizados', () => {
        const rules = ['REG-01', 'REG-02', 'REG-03', 'REG-04', 'REG-05', 'REG-06', 'REG-07'];
        const alerts = rules.map((codigo_regra) => ({
            codigo_regra,
            gravidade: 'INFORMATIVA',
            mensagem: 'Revisão humana recomendada.'
        }));
        const segments = [0, 1].map((index) => ({
            id: `seg-${index}`,
            metricas: { score_semantico: 0.25 + index * 0.25, score_lexical: 0.1 + index * 0.2 },
            alertas: index === 0 ? alerts : []
        }));
        expect(validateDetectorResponse(validDetectorResponse({
            resumo: {
                total_segmentos: 2,
                segmentos_analisados: 2,
                total_alertas: alerts.length,
                gravidade_maxima: 'INFORMATIVA'
            },
            parametros_aplicados: {
                limiar_semantico: 0.76,
                limiar_lexical_reproducao: 0.81,
                limiar_lexical_parafrase: 0.19,
                valores_provisorios: false
            },
            segmentos: segments,
            alertas: alerts,
            citacoes: [],
            referencias: [],
            associacoes: []
        }))).toBe(true);
    });

    test('recusa campo acusatório mesmo aninhado', () => {
        expect(validateDetectorResponse(validDetectorResponse({
            resumo: {
                total_segmentos: 1,
                segmentos_analisados: 1,
                total_alertas: 0,
                gravidade_maxima: null,
                fraude_confirmada: true
            }
        }))).toBe(false);
    });

    test('bloqueia protocolos, credenciais e timeout inseguro', () => {
        expect(() => detectorConfig({ DETECTOR_API_URL: 'file:///tmp/modelo' })).toThrow();
        expect(() => detectorConfig({ DETECTOR_API_URL: 'http://user:pass@127.0.0.1' })).toThrow();
        expect(() => detectorConfig({ DETECTOR_API_TIMEOUT_MS: '999999' })).toThrow();
    });

    test('usa endpoints e timeouts distintos para segmento e documento', async () => {
        const fetchImpl = jest.fn()
            .mockResolvedValueOnce({ ok: true, status: 200, json: async () => validIncrementalResponse() })
            .mockResolvedValueOnce({ ok: true, status: 200, json: async () => validCompleteV2Response() });
        const service = createDetectorContextService({
            fetchImpl,
            env: {
                DETECTOR_API_URL: 'http://127.0.0.1:8000',
                DETECTOR_API_TIMEOUT_INCREMENTAL_MS: '7000',
                DETECTOR_API_TIMEOUT_COMPLETE_MS: '19000'
            }
        });
        await service.analisarSegmento({ segmento_id: 'segmento-1' });
        await service.analisarDocumento({ documento: 'texto' });
        expect(fetchImpl.mock.calls[0][0]).toMatch(/\/api\/v2\/detectar\/segmento$/);
        expect(fetchImpl.mock.calls[1][0]).toMatch(/\/api\/v2\/detectar\/documento$/);
        expect(detectorConfig({
            DETECTOR_API_TIMEOUT_INCREMENTAL_MS: '7000',
            DETECTOR_API_TIMEOUT_COMPLETE_MS: '19000'
        })).toMatchObject({ incrementalTimeout: 7000, completeTimeout: 19000 });
    });

    test('cancela análise incremental por sinal externo', async () => {
        const abort = new AbortController();
        const fetchImpl = jest.fn((_url, options) => new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(Object.assign(new Error('abort'), { name: 'AbortError' })));
        }));
        const service = createDetectorContextService({ fetchImpl, env: {} });
        const pending = service.analisarSegmento({}, { signal: abort.signal });
        abort.abort();
        await expect(pending).rejects.toMatchObject({ code: 'DETECTOR_CANCELADO', status: 499 });
    });

    test('aceita indisponibilidade e nenhum candidato como estados válidos', () => {
        expect(validateIncrementalResponse(validIncrementalResponse({
            status_analise: 'PARCIAL',
            status_contexto: 'RECUPERACAO_INDISPONIVEL',
            status_recuperacao: 'INDISPONIVEL',
            fontes_candidatas: []
        }))).toBe(true);
        expect(validateCompleteResponse(validCompleteV2Response({
            status_analise: 'PARCIAL',
            status_contexto: 'SEM_CANDIDATOS',
            status_recuperacao: 'SEM_CANDIDATOS'
        }))).toBe(true);
    });
});
