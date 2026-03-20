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
    body('texto')
        .isString().withMessage('O campo texto deve ser uma string.')
        .trim()
        .isLength({ min: 10 }).withMessage('O texto deve conter ao menos 10 caracteres.'),
    plagioController.verificarTexto
);

module.exports = router;
