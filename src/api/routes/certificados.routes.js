'use strict';

const router = require('express').Router();
const { body, param, query } = require('express-validator');
const checkAuth = require('../../middlewares/checkAuth.middleware');
const controller = require('../controllers/certificados.controller');

const idMatricula = param('id_matricula').isInt({ min: 1 }).withMessage('Matrícula inválida.').toInt();
const idCertificado = param('id_certificado').isInt({ min: 1 }).withMessage('Certificado inválido.').toInt();

router.post('/matriculas/:id_matricula/emitir', checkAuth, idMatricula, controller.emitir);
router.get('/meus', checkAuth, controller.meus);
router.get(
    '/:id_certificado/pdf',
    checkAuth,
    idCertificado,
    query('download').optional().isIn(['0', '1']).withMessage('Opção de download inválida.'),
    controller.pdf
);
router.post(
    '/:id_certificado/revogar',
    checkAuth,
    idCertificado,
    body().custom((payload) => {
        const desconhecidos = Object.keys(payload || {}).filter((campo) => campo !== 'motivo');
        if (desconhecidos.length) throw new Error(`Campos não permitidos: ${desconhecidos.join(', ')}.`);
        return true;
    }),
    body('motivo').isString().trim().isLength({ min: 3, max: 500 })
        .withMessage('Informe um motivo de revogação entre 3 e 500 caracteres.'),
    controller.revogar
);

router.get('/:id_certificado/historico', checkAuth, idCertificado, controller.historico);
router.post(
    '/:id_certificado/reemitir', checkAuth,
    (req, res, next) => req.user.tipo === 'ADMIN' ? next()
        : res.status(403).json({ mensagem: 'Somente administradores podem reemitir certificados.' }),
    idCertificado,
    body().custom(payload => {
        if (!payload || Array.isArray(payload) || Object.keys(payload).some(key => key !== 'motivo')) {
            throw new Error('Envie somente o motivo da reemissão.');
        }
        return true;
    }),
    body('motivo').isString().bail().trim().isLength({ min: 3, max: 500 })
        .withMessage('Informe um motivo de reemissão entre 3 e 500 caracteres.'),
    controller.reemitir
);

module.exports = router;
