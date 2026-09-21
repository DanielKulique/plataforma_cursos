'use strict';

const { validationResult } = require('express-validator');
const service = require('../services/certificate.service');
const storage = require('../services/certificate-storage.service');
const logger = require('../../utils/logger');

function invalidos(req, res) {
    const errors = validationResult(req);
    if (errors.isEmpty()) return false;
    res.status(400).json({ mensagem: errors.array()[0]?.msg || 'Dados inválidos.', errors: errors.array() });
    return true;
}

function responderErro(next, error) {
    return next(error);
}

async function emitir(req, res, next) {
    if (invalidos(req, res)) return;
    try {
        const resultado = await service.emitirCertificado(req.params.id_matricula, req.user);
        logger.info('certificado.emitido', {
            requestId: req.id,
            actorId: req.user.id_usuario,
            certificateId: resultado.certificado.id_certificado,
            reused: resultado.reutilizado
        });
        return res.status(resultado.reutilizado ? 200 : 201).json(resultado);
    } catch (error) {
        logger.error('certificado.emissao.falhou', {
            requestId: req.id,
            actorId: req.user?.id_usuario,
            enrollmentId: Number(req.params.id_matricula),
            error
        });
        return responderErro(next, error);
    }
}

async function meus(req, res, next) {
    try {
        const certificados = await service.listarMeusCertificados(req.user);
        return res.status(200).json({ total: certificados.length, certificados });
    } catch (error) {
        return responderErro(next, error);
    }
}

async function pdf(req, res, next) {
    if (invalidos(req, res)) return;
    try {
        const resultado = await service.obterDownload(req.params.id_certificado, req.user);
        return require('../services/private-download.service').sendPrivatePdf(
            res, require('../../config/certificate-storage').obterDiretorioCertificados(),
            require('path').basename(resultado.caminho), 'certificates',
            storage.formatarContentDisposition(resultado.certificado.codigo_publico, req.query.download === '1')
        );
    } catch (error) {
        return responderErro(next, error);
    }
}

async function revogar(req, res, next) {
    if (invalidos(req, res)) return;
    try {
        const certificado = await service.revogarCertificado(
            req.params.id_certificado,
            req.body.motivo,
            req.user
        );
        logger.info('certificado.revogado', {
            requestId: req.id,
            actorId: req.user.id_usuario,
            certificateId: certificado.id_certificado
        });
        return res.status(200).json({ certificado, mensagem: 'Certificado revogado.' });
    } catch (error) {
        return responderErro(next, error);
    }
}

async function validarCodigo(req, res, next) {
    if (invalidos(req, res)) return;
    try {
        return res.status(200).json(await service.validarPorCodigo(req.params.codigo));
    } catch (error) {
        return responderErro(next, error);
    }
}

async function validarArquivo(req, res, next) {
    const buffer = req.file?.buffer;
    try {
        if (!buffer) {
            const error = new Error('Selecione um certificado PDF para validar.');
            error.status = 400;
            error.code = 'PDF_AUSENTE';
            throw error;
        }
        return res.status(200).json(await service.validarArquivo(buffer));
    } catch (error) {
        return responderErro(next, error);
    } finally {
        if (buffer) buffer.fill(0);
    }
}

async function reemitir(req, res, next) {
    if (invalidos(req, res)) return;
    try {
        const resultado = await service.reemitirCertificado(req.params.id_certificado, req.body.motivo, req.user);
        logger.info('certificado.reemitido', {
            requestId: req.id, actorId: req.user.id_usuario,
            certificateId: resultado.certificado.id_certificado,
            previousCertificateId: Number(req.params.id_certificado)
        });
        return res.status(201).json(resultado);
    } catch (error) { return responderErro(next, error); }
}

async function historico(req, res, next) {
    if (invalidos(req, res)) return;
    try {
        const certificados = await service.listarHistorico(req.params.id_certificado, req.user);
        return res.json({ certificados, total: certificados.length });
    } catch (error) { return responderErro(next, error); }
}

module.exports = {
    reemitir,
    historico, emitir, meus, pdf, revogar, validarArquivo, validarCodigo };
