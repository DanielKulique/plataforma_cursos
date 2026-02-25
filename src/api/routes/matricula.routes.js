const express = require('express');
const router = express.Router();
const matriculaController = require('../controllers/matricula.controller');
const { body, param } = require('express-validator');
const checkAuth = require('../../middlewares/checkAuth.middleware');
const checkRole = require('../../middlewares/checkRole.middleware');
const checkUserPermission = require('../../middlewares/checkUserPermission.middleware');
const {
    checkProfessorTurmaPermission,
    checkProfessorMatriculaPermission,
    checkMatriculaReadPermission,
    checkMatriculaCancelPermission
} = require('../../middlewares/checkProfessorPermission.middleware');

const STATUS_APROVACAO = ['CURSANDO', 'APROVADO', 'REPROVADO', 'CANCELADO'];

// POST /api/matriculas - cria matrícula do aluno logado
router.post(
    '/',
    checkAuth,
    body('id_turma').isInt().withMessage('O ID da turma deve ser um número inteiro.'),
    matriculaController.criarMatricula
);

// GET /api/matriculas/aluno/:id - lista matrículas de um aluno
router.get(
    '/aluno/:id',
    checkAuth,
    checkUserPermission,
    param('id').isInt().withMessage('O ID deve ser um número inteiro.'),
    matriculaController.buscarMatriculasDoAluno
);

// GET /api/matriculas/minha-sala - sala virtual do aluno logado
router.get(
    '/minha-sala',
    checkAuth,
    checkRole('ALUNO'),
    matriculaController.buscarMinhaSalaVirtual
);

// GET /api/matriculas/turma/:id_turma - lista matrículas de uma turma
router.get(
    '/turma/:id_turma',
    checkAuth,
    checkProfessorTurmaPermission,
    param('id_turma').isInt().withMessage('O ID da turma deve ser um número inteiro.'),
    matriculaController.buscarMatriculasDaTurma
);

// GET /api/matriculas/:id - busca matrícula por ID
router.get(
    '/:id',
    checkAuth,
    param('id').isInt().withMessage('O ID deve ser um número inteiro.'),
    checkMatriculaReadPermission,
    matriculaController.buscarMatriculaPorId
);

// PATCH /api/matriculas/:id - atualiza matrícula
router.patch(
    '/:id',
    checkAuth,
    checkProfessorMatriculaPermission,
    param('id').isInt().withMessage('O ID deve ser um número inteiro.'),
    body('nota_final').optional().isDecimal().withMessage('A nota final deve ser um número decimal.'),
    body('status_aprovacao').optional().isIn(STATUS_APROVACAO).withMessage('Status inválido.'),
    body('progresso_percentual').optional().isInt({ min: 0, max: 100 }).withMessage('O progresso deve estar entre 0 e 100.'),
    matriculaController.atualizarMatricula
);

// DELETE /api/matriculas/:id - cancela matrícula
router.delete(
    '/:id',
    checkAuth,
    param('id').isInt().withMessage('O ID deve ser um número inteiro.'),
    checkMatriculaCancelPermission,
    matriculaController.cancelarMatricula
);

module.exports = router;
