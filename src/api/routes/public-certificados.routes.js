'use strict';

const multer = require('multer');
const { param } = require('express-validator');
const router = require('express').Router();
const controller = require('../controllers/certificados.controller');
const { criarLimitadorCertificados } = require('../services/certificate-rate-limit.service');
const {
    obterLimiteUploadCertificadoBytes,
    obterLimiteUploadCertificadoMb
} = require('../../config/certificate-storage');

const windowMs = Number(process.env.CERTIFICATE_RATE_LIMIT_WINDOW_MS || 60000);
const consultaLimit = Number(process.env.CERTIFICATE_PUBLIC_RATE_LIMIT_MAX || (process.env.NODE_ENV === 'test' ? 1000 : 30));
const uploadLimit = Number(process.env.CERTIFICATE_UPLOAD_RATE_LIMIT_MAX || (process.env.NODE_ENV === 'test' ? 1000 : 10));

function uploadError(code, status, message) {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    return error;
}

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: obterLimiteUploadCertificadoBytes(),
        files: 1,
        fields: 0,
        // Busboy sinaliza partsLimit ao atingir o limite, inclusive no fechamento.
        // files=1 e fields=0 continuam impondo exatamente um arquivo sem campos.
        parts: 2,
        fieldNameSize: 100
    },
    fileFilter(req, file, callback) {
        if (file.mimetype !== 'application/pdf' || !/\.pdf$/i.test(String(file.originalname || ''))) {
            return callback(uploadError('TIPO_PDF_INVALIDO', 422, 'Selecione um arquivo PDF válido.'));
        }
        return callback(null, true);
    }
}).single('arquivo');

function receberPdf(req, res, next) {
    upload(req, res, (error) => {
        if (!error) return next();
        if (error instanceof multer.MulterError) {
            if (error.code === 'LIMIT_FILE_SIZE') {
                return next(uploadError(
                    'PDF_MUITO_GRANDE',
                    413,
                    `O PDF excede o limite de ${obterLimiteUploadCertificadoMb()} MB.`
                ));
            }
            return next(uploadError(
                'MULTIPART_INVALIDO',
                400,
                'Envie exatamente um arquivo PDF no campo arquivo.'
            ));
        }
        return next(error);
    });
}

router.post(
    '/validar-arquivo',
    criarLimitadorCertificados(uploadLimit, windowMs),
    receberPdf,
    controller.validarArquivo
);
router.get(
    '/:codigo',
    criarLimitadorCertificados(consultaLimit, windowMs),
    param('codigo').isString().trim().isLength({ min: 1, max: 64 }).withMessage('Código inválido.'),
    controller.validarCodigo
);

module.exports = router;
