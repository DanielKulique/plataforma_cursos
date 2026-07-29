'use strict';

const {
    validatePayload,
    validateSegmentPayload,
    validateDocumentPayload
} = require('../middlewares/detectorContextual.validation');

const base = { documento: 'Documento sintético.', fonte_comparada: 'Fonte sintética.' };

describe('validação pública do detector contextual', () => {
    test('aceita metadados e parâmetros opcionais válidos', () => {
        expect(validatePayload({
            ...base,
            metadados_fonte: { autores: ['Silva'], ano: 2024, titulo: 'Obra', doi: null, url: null },
            parametros: {
                limiar_semantico: 0.75,
                limiar_lexical_reproducao: 0.8,
                limiar_lexical_parafrase: 0.2
            }
        })).toEqual({ ok: true });
    });

    test.each([
        [{}, 422],
        [{ ...base, documento: ' ' }, 422],
        [{ ...base, documento: 'x'.repeat(100001) }, 413],
        [{ ...base, desconhecido: true }, 422],
        [{ ...base, metadados_fonte: { autores: [''] } }, 422],
        [{ ...base, metadados_fonte: { ano: 1200 } }, 422],
        [{ ...base, parametros: { limiar_semantico: 2 } }, 422],
        [{ ...base, parametros: { limiar_lexical_parafrase: 0.8, limiar_lexical_reproducao: 0.7 } }, 422]
    ])('rejeita payload inválido %#', (input, status) => {
        expect(validatePayload(input)).toMatchObject({ ok: false, status });
    });
});

describe('validação dos contratos incremental e completo 2.0', () => {
    const manualSource = {
        fonte_id: 'manual-1',
        trecho_fonte_id: 'manual-chunk-1',
        texto_trecho: 'Fonte manual controlada.'
    };
    const segment = {
        sessao_id: 'sessao-efemera',
        segmento_id: 'segmento-estavel',
        versao: 5,
        texto_segmento: 'Texto incremental.',
        modo_fontes: 'FONTE_MANUAL',
        fonte_manual: manualSource,
        contexto: { referencias_atuais: [] }
    };

    test('aceita fonte manual, busca automática e híbrida', () => {
        expect(validateSegmentPayload(segment)).toEqual({ ok: true });
        expect(validateSegmentPayload({
            ...segment, modo_fontes: 'BUSCA_AUTOMATICA', fonte_manual: undefined
        })).toEqual({ ok: true });
        expect(validateSegmentPayload({
            ...segment, modo_fontes: 'HIBRIDO'
        })).toEqual({ ok: true });
    });

    test('rejeita versão, contexto, score e modo inválidos', () => {
        expect(validateSegmentPayload({ ...segment, versao: 0 }).ok).toBe(false);
        expect(validateSegmentPayload({ ...segment, contexto: { referencias_atuais: [3] } }).ok).toBe(false);
        expect(validateSegmentPayload({
            ...segment, fonte_manual: { ...manualSource, score_recuperacao: 4 }
        }).ok).toBe(false);
        expect(validateSegmentPayload({ ...segment, modo_fontes: 'SCRAPING_AO_VIVO' }).ok).toBe(false);
    });

    test('valida documento completo sem exigir fonte no modo automático', () => {
        expect(validateDocumentPayload({
            documento: 'Documento completo.',
            modo_fontes: 'BUSCA_AUTOMATICA',
            limite_candidatos: 5
        })).toEqual({ ok: true });
        expect(validateDocumentPayload({
            documento: 'Documento completo.',
            modo_fontes: 'FONTE_MANUAL'
        }).ok).toBe(false);
    });
});
