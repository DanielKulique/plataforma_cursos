'use strict';

const service = require('../services/indexed-analysis.service');
const logger = require('../../utils/logger');

function requestSignal(req) {
    const controller = new AbortController();
    if (typeof req.once === 'function') req.once('aborted', () => controller.abort());
    return controller.signal;
}

function sendError(req, res, error, startedAt, operation) {
    const status = Number(error.status) || 500;
    logger.error('analysis.indexed.failed', {
        requestId: req.id,
        actorId: req.user?.id_usuario,
        actorRole: req.user?.tipo,
        analysisOperation: operation,
        textCharacters: typeof req.body?.text === 'string' ? req.body.text.length : 0,
        classifiedError: error.code || 'ANALISE_ERRO_INTERNO',
        publicStatus: status,
        durationMs: Date.now() - startedAt
    });
    if (status === 499 && req.aborted) return undefined;
    return res.status(status).json({
        codigo: error.code || 'ANALISE_ERRO_INTERNO',
        mensagem: status < 500 ? error.message : (
            error.code?.startsWith('ANALISE_') ? error.message : 'Não foi possível concluir a operação.'
        ),
        request_id: req.id
    });
}

async function analisar(req, res) {
    const startedAt = Date.now();
    try {
        const result = await service.analisar(req.body, { requestId: req.id, signal: requestSignal(req) });
        logger.info('analysis.indexed.completed', {
            requestId: req.id,
            actorId: req.user.id_usuario,
            actorRole: req.user.tipo,
            textCharacters: req.body.text.length,
            querySegments: result.query_segment_count,
            candidates: result.candidate_count,
            analyzedPairs: result.analyzed_pair_count,
            publicStatus: 200,
            durationMs: Date.now() - startedAt
        });
        return res.status(200).json({ success: true, request_id: req.id, data: result });
    } catch (error) {
        return sendError(req, res, error, startedAt, 'ANALYSIS');
    }
}

async function status(req, res) {
    const startedAt = Date.now();
    try {
        const result = await service.status({ requestId: req.id, signal: requestSignal(req) });
        return res.status(200).json({ success: true, request_id: req.id, data: result });
    } catch (error) {
        return sendError(req, res, error, startedAt, 'STATUS');
    }
}

async function reload(req, res) {
    const startedAt = Date.now();
    try {
        const result = await service.reload({ requestId: req.id, signal: requestSignal(req) });
        return res.status(200).json({ success: true, request_id: req.id, data: result });
    } catch (error) {
        return sendError(req, res, error, startedAt, 'RELOAD');
    }
}

module.exports = { analisar, status, reload };
