const express = require('express');
const router = express.Router();
const matriculaController = require('../controllers/matricula.controller');
const { body, param } = require('express-validator');
const checkAuth = require('../../middlewares/checkAuth.middleware');
const checkUserPermission = require('../../middlewares/checkUserPermission.middleware');
const {
    checkProfessorTurmaPermission,
    checkProfessorMatriculaPermission,
    checkMatriculaReadPermission,
    checkMatriculaCancelPermission
} = require('../../middlewares/checkProfessorPermission.middleware');

const STATUS_APROVACAO = ['CURSANDO', 'APROVADO', 'REPROVADO', 'CANCELADO'];

//POST /api/matriculas - cria matricula do aluno logado
router.post(
    '/',
    checkAuth,
    body('id_turma').isInt().withMessage('O ID da turma deve ser um nÃºmero inteiro.'),
    matriculaController.criarMatricula
);

//GET /api/matriculas/aluno/:id - lista matriculas de um aluno
router.get(
    '/aluno/:id',
    checkAuth,
    checkUserPermission,
    param('id').isInt().withMessage('O ID deve ser um nÃºmero inteiro.'),
    matriculaController.buscarMatriculasDoAluno
);

//GET /api/matriculas/turma/:id_turma - lista matriculas de uma turma
router.get(
    '/turma/:id_turma',
    checkAuth,
    checkProfessorTurmaPermission,
    param('id_turma').isInt().withMessage('O ID da turma deve ser um nÃºmero inteiro.'),
    matriculaController.buscarMatriculasDaTurma
);

//GET /api/matriculas/:id - busca matricula por ID
router.get(
    '/:id',
    checkAuth,
    param('id').isInt().withMessage('O ID deve ser um nÃºmero inteiro.'),
    checkMatriculaReadPermission,
    matriculaController.buscarMatriculaPorId
);

//PATCH /api/matriculas/:id - atualiza matrÃ­cula
router.patch(
    '/:id',
    checkAuth,
    checkProfessorMatriculaPermission,
    param('id').isInt().withMessage('O ID deve ser um nÃºmero inteiro.'),
    body('nota_final').optional().isDecimal().withMessage('A nota final deve ser um nÃºmero decimal.'),
    body('status_aprovacao').optional().isIn(STATUS_APROVACAO).withMessage('Status invÃ¡lido.'),
    body('progresso_percentual').optional().isInt({ min: 0, max: 100 }).withMessage('O progresso deve estar entre 0 e 100.'),
    matriculaController.atualizarMatricula
);

//DELETE /api/matriculas/:id - cancela matrÃ­cula
router.delete(
    '/:id',
    checkAuth,
    param('id').isInt().withMessage('O ID deve ser um nÃºmero inteiro.'),
    checkMatriculaCancelPermission,
    matriculaController.cancelarMatricula
);

module.exports = router;
