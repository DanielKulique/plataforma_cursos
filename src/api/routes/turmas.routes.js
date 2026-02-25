const express = require('express');
const router = express.Router();
const turmasController = require('../controllers/turmas.controller');
const { body, param } = require('express-validator');
const checkAuth = require('../../middlewares/checkAuth.middleware');
const checkRole = require('../../middlewares/checkRole.middleware');
const { checkProfessorPermission } = require('../../middlewares/checkProfessorPermission.middleware');

const STATUS_TURMA = [
    'INSCRIÇÕES ABERTAS',
    'EM ANDAMENTO',
    'CONCLUÍDA'
];

// GET /api/turmas - listar todas as turmas (público)
router.get('/', turmasController.buscarTodasTurmas);

// GET /api/turmas/:id - buscar turma por ID (público)
router.get(
    '/:id',
    param('id').isInt().withMessage('O ID deve ser um número inteiro.'),
    turmasController.buscarTurmaPorId
);

// GET /api/turmas/professor/:id - buscar turmas de um professor específico
router.get(
    '/professor/:id',
    checkAuth,
    checkProfessorPermission,
    param('id').isInt().withMessage('O ID do professor deve ser um número inteiro.'),
    turmasController.buscarTurmasDoProfessor
);

// POST /api/turmas - criar nova turma (apenas ADMIN)
router.post(
    '/',
    checkAuth,
    checkRole('ADMIN'),
    body('nome_turma').notEmpty().withMessage('O nome da turma é obrigatório.'),
    body('id_curso').isInt().withMessage('O ID do curso deve ser um número inteiro.'),
    body('id_professor').isInt().withMessage('O ID do professor deve ser um número inteiro.'),
    body('data_inicio').isISO8601().withMessage('A data de início deve ser válida.'),
    body('data_fim').optional({ nullable: true }).isISO8601().withMessage('A data de fim deve ser válida.'),
    body('status').optional().isIn(STATUS_TURMA).withMessage('Status inválido.'),
    turmasController.criarTurma
);

// PATCH /api/turmas/:id - atualizar turma (apenas ADMIN)
router.patch(
    '/:id',
    checkAuth,
    checkRole('ADMIN'),
    param('id').isInt().withMessage('O ID deve ser um número inteiro.'),
    body('nome_turma').optional().notEmpty().withMessage('O nome da turma é obrigatório.'),
    body('id_curso').optional().isInt().withMessage('O ID do curso deve ser um número inteiro.'),
    body('id_professor').optional().isInt().withMessage('O ID do professor deve ser um número inteiro.'),
    body('data_inicio').optional().isISO8601().withMessage('A data de início deve ser válida.'),
    body('data_fim').optional({ nullable: true }).isISO8601().withMessage('A data de fim deve ser válida.'),
    body('status').optional().isIn(STATUS_TURMA).withMessage('Status inválido.'),
    turmasController.atualizarTurma
);

// DELETE /api/turmas/:id - deletar turma (apenas ADMIN)
router.delete(
    '/:id',
    checkAuth,
    checkRole('ADMIN'),
    param('id').isInt().withMessage('O ID deve ser um número inteiro.'),
    turmasController.deletarTurma
);

module.exports = router;
