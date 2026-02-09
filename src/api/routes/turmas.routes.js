const express = require('express');
const router = express.Router();
const turmasController = require('../controllers/turmas.controller');
const { body, param } = require('express-validator');
const checkAuth = require('../../middlewares/checkAuth.middleware');
const checkRole = require('../../middlewares/checkRole.middleware');

const STATUS_TURMA = [
    'INSCRI\u00C7\u00D5ES ABERTAS',
    'EM ANDAMENTO',
    'CONCLU\u00CDDA'
];

//GET /api/turmas - listar todas as turmas (publico)
router.get('/', turmasController.buscarTodasTurmas);

//GET /api/turmas/:id - Buscar turma por ID (publico)
router.get(
    '/:id',
    param('id').isInt().withMessage('O ID deve ser um nÃºmero inteiro.'),
    turmasController.buscarTurmaPorId
);

//POST /api/turmas - criar nova turma (apenas ADMIN)
router.post(
    '/',
    checkAuth,
    checkRole('ADMIN'),
    body('nome_turma').notEmpty().withMessage('O nome da turma Ã© obrigatÃ³rio.'),
    body('id_curso').isInt().withMessage('O ID do curso deve ser um numero inteiro'),
    body('id_professor').isInt().withMessage('O ID do professor deve ser um numero inteiro'),
    body('data_inicio').isISO8601().withMessage('A data de inÃ­cio deve ser vÃ¡lida.'),
    body('data_fim').optional({ nullable: true }).isISO8601().withMessage('A data de fim deve ser vÃ¡lida.'),
    body('status').optional().isIn(STATUS_TURMA).withMessage('Status invÃ¡lido'),
    turmasController.criarTurma
);

//PATCH /api/turmas/:id - atualizar turma (apenas ADMIN)
router.patch(
    '/:id',
    checkAuth,
    checkRole('ADMIN'),
    param('id').isInt().withMessage('O ID deve ser um nÃºmero inteiro.'),
    body('nome_turma').optional().notEmpty().withMessage('O nome da turma Ã© obrigatÃ³rio.'),
    body('id_curso').optional().isInt().withMessage('O ID do curso deve ser um numero inteiro'),
    body('id_professor').optional().isInt().withMessage('O ID do professor deve ser um numero inteiro'),
    body('data_inicio').optional().isISO8601().withMessage('A data de inÃ­cio deve ser vÃ¡lida.'),
    body('data_fim').optional({ nullable: true }).isISO8601().withMessage('A data de fim deve ser vÃ¡lida.'),
    body('status').optional().isIn(STATUS_TURMA).withMessage('Status invÃ¡lido'),
    turmasController.atualizarTurma
);

//DELETE /api/turmas/:id - deletar turma (apenas ADMIN)
router.delete(
    '/:id',
    checkAuth,
    checkRole('ADMIN'),
    param('id').isInt().withMessage('O ID deve ser um nÃºmero inteiro.'),
    turmasController.deletarTurma
);

module.exports = router;
