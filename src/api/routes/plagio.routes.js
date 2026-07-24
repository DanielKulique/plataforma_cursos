const express = require('express');
const { body } = require('express-validator');
const plagioController = require('../controllers/plagio.controller');
const checkAuth = require('../../middlewares/checkAuth.middleware');
const checkRole = require('../../middlewares/checkRole.middleware');

const router = express.Router();

router.post(
    '/analisar',
    checkAuth,
    checkRole('ALUNO'),
    body('texto_original')
        .isString().withMessage('O texto original deve ser uma string.')
        .trim()
        .isLength({ min: 10, max: 20000 }).withMessage('O texto original deve conter entre 10 e 20.000 caracteres.'),
    body('texto_suspeito').isString().withMessage('O texto suspeito deve ser uma string.').trim()
        .isLength({ min: 10, max: 20000 }).withMessage('O texto suspeito deve conter entre 10 e 20.000 caracteres.'),
    plagioController.verificarTexto
);

module.exports = router;
