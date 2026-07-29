'use strict';

const detectorService = require('../services/detector-contextual.service');
const analysisModel = require('../models/analise-contextual.model');
const logger = require('../../utils/logger');

function requestAbortSignal(req) {
    const controller = new AbortController();
    if (typeof req.once === 'function') {
        req.once('aborted', () => controller.abort());
    }
    return controller.signal;
}

function sendError(req, res, error, startedAt, mode) {
    const status = Number(error.status) || 500;
    logger.error('detector.contextual.failed', {
        requestId: req.id,
        actorId: req.user?.id_usuario,
        actorRole: req.user?.tipo,
        analysisMode: mode,
        documentCharacters: typeof req.body?.documento === 'string' ? req.body.documento.length : 0,
        segmentCharacters: typeof req.body?.texto_segmento === 'string' ? req.body.texto_segmento.length : 0,
        sourceCharacters: typeof req.body?.fonte_comparada === 'string'
            ? req.body.fonte_comparada.length
            : (req.body?.fonte_manual?.texto_trecho?.length || 0),
        classifiedError: error.code || 'DETECTOR_ERRO_INTERNO',
        publicStatus: status,
        timedOut: status === 504,
        durationMs: Date.now() - startedAt
    });
    if (status === 499 && req.aborted) return undefined;
    return res.status(status).json({
        codigo: error.code || 'DETECTOR_ERRO_INTERNO',
        mensagem: status < 500 ? error.message : (
            error.code?.startsWith('DETECTOR_') ? error.message : 'Não foi possível concluir a análise.'
        ),
        request_id: req.id
    });
}

async function analisar(req, res) {
    const startedAt = Date.now();
    try {
        const result = await detectorService.analisar(req.body, { requestId: req.id });
        const analysisDurationMs = Date.now() - startedAt;
        // A inferência externa termina antes desta escrita curta; nenhum texto é persistido.
        const saved = await analysisModel.salvarResumo({
            usuarioId: req.user.id_usuario,
            resultado: result,
            duracaoMs: analysisDurationMs
        });
        logger.info('detector.contextual.completed', {
            requestId: req.id,
            actorId: req.user.id_usuario,
            actorRole: req.user.tipo,
            documentCharacters: req.body.documento.length,
            sourceCharacters: req.body.fonte_comparada.length,
            segments: result.resumo.segmentos_analisados,
            alerts: result.resumo.total_alertas,
            maximumSeverity: result.resumo.gravidade_maxima,
            publicStatus: 200,
            durationMs: Date.now() - startedAt
        });
        return res.status(200).json({
            success: true,
            id_analise: saved.id,
            request_id: req.id,
            data: result
        });
    } catch (error) {
        return sendError(req, res, error, startedAt, 'LEGADO_COMPLETO');
    }
}

async function analisarSegmento(req, res) {
    const startedAt = Date.now();
    try {
        const result = await detectorService.analisarSegmento(req.body, {
            requestId: req.id,
            signal: requestAbortSignal(req)
        });
        logger.info('detector.contextual.incremental.completed', {
            requestId: req.id,
            actorId: req.user.id_usuario,
            actorRole: req.user.tipo,
            sessionId: req.body.sessao_id,
            segmentId: req.body.segmento_id,
            segmentVersion: req.body.versao,
            segmentCharacters: req.body.texto_segmento.length,
            candidates: result.fontes_candidatas.length,
            alerts: result.alertas.length,
            publicStatus: 200,
            durationMs: Date.now() - startedAt
        });
        return res.status(200).json({
            success: true,
            request_id: req.id,
            data: result
        });
    } catch (error) {
        return sendError(req, res, error, startedAt, 'INCREMENTAL');
    }
}

async function analisarDocumento(req, res) {
    const startedAt = Date.now();
    try {
        const result = await detectorService.analisarDocumento(req.body, {
            requestId: req.id,
            signal: requestAbortSignal(req)
        });
        const saved = await analysisModel.salvarResumo({
            usuarioId: req.user.id_usuario,
            resultado: result,
            duracaoMs: Date.now() - startedAt
        });
        logger.info('detector.contextual.complete.completed', {
            requestId: req.id,
            actorId: req.user.id_usuario,
            actorRole: req.user.tipo,
            documentCharacters: req.body.documento.length,
            candidates: result.fontes_candidatas.length,
            segments: result.resumo.segmentos_analisados,
            alerts: result.resumo.total_alertas,
            publicStatus: 200,
            durationMs: Date.now() - startedAt
        });
        return res.status(200).json({
            success: true,
            id_analise: saved.id,
            request_id: req.id,
            data: result
        });
    } catch (error) {
        return sendError(req, res, error, startedAt, 'COMPLETA');
    }
}

module.exports = { analisar, analisarSegmento, analisarDocumento };
