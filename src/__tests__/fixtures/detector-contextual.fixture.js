'use strict';

function validDetectorResponse(overrides = {}) {
    return {
        versao_contrato: '1.0',
        status_analise: 'CONCLUIDO',
        resumo: {
            total_segmentos: 1,
            segmentos_analisados: 1,
            total_alertas: 1,
            gravidade_maxima: 'ALTA'
        },
        parametros_aplicados: {
            limiar_semantico: 0.8,
            limiar_lexical_reproducao: 0.7,
            limiar_lexical_parafrase: 0.2,
            valores_provisorios: true
        },
        segmentos: [{
            id: 'seg-000',
            indice: 0,
            inicio: 0,
            fim: 20,
            texto: 'Trecho sintético.',
            tipo: 'PARAGRAFO',
            analisavel: true,
            metricas: { score_semantico: 0.9, score_lexical: 0.8 },
            citacoes: [],
            alertas: [{
                codigo_regra: 'REG-01',
                rotulo: 'POSSIVEL_REPRODUCAO_NAO_ATRIBUIDA',
                tipo: 'INDICIO_SIMILARIDADE',
                gravidade: 'ALTA',
                mensagem: 'Recomenda-se revisar a atribuição da fonte.',
                evidencias: {}
            }]
        }],
        alertas: [{
            codigo_regra: 'REG-01',
            rotulo: 'POSSIVEL_REPRODUCAO_NAO_ATRIBUIDA',
            tipo: 'INDICIO_SIMILARIDADE',
            gravidade: 'ALTA',
            mensagem: 'Recomenda-se revisar a atribuição da fonte.',
            segmento_id: 'seg-000',
            evidencias: {}
        }],
        citacoes: [],
        referencias: [],
        associacoes: [],
        ...overrides
    };
}

function validIncrementalResponse(overrides = {}) {
    return {
        versao_contrato: '2.0',
        modo_analise: 'INCREMENTAL',
        status_analise: 'CONCLUIDO',
        status_contexto: 'ANALISE_PARCIAL',
        status_recuperacao: 'NAO_APLICAVEL',
        sessao_id: 'sessao-1',
        segmento_id: 'segmento-1',
        versao: 3,
        versao_indice: null,
        parametros_aplicados: {
            limiar_semantico: 0.8,
            limiar_lexical_reproducao: 0.7,
            limiar_lexical_parafrase: 0.2
        },
        fontes_candidatas: [{
            fonte_id: 'fonte-1',
            trecho_fonte_id: 'trecho-1',
            texto_trecho: 'Fonte controlada.',
            score_recuperacao: null
        }],
        metricas: [],
        citacoes: [],
        referencias: [],
        associacoes: [],
        alertas: [],
        tempos_ms: { tempo_total_ms: 10 },
        ...overrides
    };
}

function validCompleteV2Response(overrides = {}) {
    return {
        versao_contrato: '2.0',
        modo_analise: 'COMPLETA',
        status_analise: 'CONCLUIDO',
        status_contexto: 'COMPLETO',
        status_recuperacao: 'NAO_APLICAVEL',
        versao_indice: null,
        parametros_aplicados: {
            limiar_semantico: 0.8,
            limiar_lexical_reproducao: 0.7,
            limiar_lexical_parafrase: 0.2
        },
        resumo: {
            total_segmentos: 1,
            segmentos_analisados: 1,
            total_alertas: 0,
            gravidade_maxima: null
        },
        segmentos: [{
            segmento_id: 'segmento-1',
            versao: 1,
            fontes_candidatas: []
        }],
        fontes_candidatas: [],
        alertas: [],
        citacoes: [],
        referencias: [],
        associacoes: [],
        tempos_ms: { tempo_total_ms: 20 },
        ...overrides
    };
}

module.exports = { validDetectorResponse, validIncrementalResponse, validCompleteV2Response };
