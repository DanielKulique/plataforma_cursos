'use strict';

jest.mock('../api/services/detector-contextual.service', () => ({
    analisar: jest.fn(),
    analisarSegmento: jest.fn(),
    analisarDocumento: jest.fn()
}));
jest.mock('../api/models/analise-contextual.model', () => ({ salvarResumo: jest.fn() }));
jest.mock('../utils/logger', () => ({ info: jest.fn(), error: jest.fn() }));

const service = require('../api/services/detector-contextual.service');
const model = require('../api/models/analise-contextual.model');
const controller = require('../api/controllers/analises-contextuais.controller');
const logger = require('../utils/logger');
const {
    validDetectorResponse,
    validIncrementalResponse,
    validCompleteV2Response
} = require('./fixtures/detector-contextual.fixture');

function responseMock() {
    return {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
    };
}

beforeEach(() => {
    jest.clearAllMocks();
});

test('controller usa usuário da sessão e persiste somente resultado validado', async () => {
    const result = validDetectorResponse();
    service.analisar.mockResolvedValue(result);
    model.salvarResumo.mockResolvedValue({ id: 9 });
    const req = {
        id: 'req-1',
        user: { id_usuario: 7, tipo: 'PROFESSOR' },
        body: { documento: 'documento privado', fonte_comparada: 'fonte privada' }
    };
    const res = responseMock();
    await controller.analisar(req, res);
    expect(model.salvarResumo).toHaveBeenCalledWith({
        usuarioId: 7,
        resultado: result,
        duracaoMs: expect.any(Number)
    });
    expect(JSON.stringify(model.salvarResumo.mock.calls[0][0])).not.toContain('documento privado');
    expect(JSON.stringify(model.salvarResumo.mock.calls[0][0])).not.toContain('fonte privada');
    expect(res.status).toHaveBeenCalledWith(200);
});

test('controller incremental nunca persiste versões intermediárias', async () => {
    const result = validIncrementalResponse();
    service.analisarSegmento.mockResolvedValue(result);
    const req = {
        id: 'req-2',
        user: { id_usuario: 7, tipo: 'ALUNO' },
        body: {
            sessao_id: 'sessao-efemera',
            segmento_id: 'segmento-1',
            versao: 8,
            texto_segmento: 'texto privado incremental'
        }
    };
    const res = responseMock();
    await controller.analisarSegmento(req, res);
    expect(model.salvarResumo).not.toHaveBeenCalled();
    expect(service.analisarSegmento).toHaveBeenCalledWith(req.body, expect.objectContaining({
        requestId: 'req-2',
        signal: expect.any(AbortSignal)
    }));
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain(req.body.texto_segmento);
    expect(res.status).toHaveBeenCalledWith(200);
});

test('controller completo persiste apenas o resumo autorizado', async () => {
    const result = validCompleteV2Response();
    service.analisarDocumento.mockResolvedValue(result);
    model.salvarResumo.mockResolvedValue({ id: 12 });
    const req = {
        id: 'req-3',
        user: { id_usuario: 7, tipo: 'PROFESSOR' },
        body: { documento: 'documento completo privado', modo_fontes: 'BUSCA_AUTOMATICA' }
    };
    const res = responseMock();
    await controller.analisarDocumento(req, res);
    expect(model.salvarResumo).toHaveBeenCalledWith({
        usuarioId: 7,
        resultado: result,
        duracaoMs: expect.any(Number)
    });
    expect(JSON.stringify(model.salvarResumo.mock.calls[0][0])).not.toContain(req.body.documento);
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain(req.body.documento);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id_analise: 12 }));
});
