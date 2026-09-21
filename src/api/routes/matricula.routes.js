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

const STATUS_APROVACAO = ['CURSANDO', 'APROVADO', 'REPROVADO'];
const apenasCamposAcademicos = body().custom((payload) => {
    const permitidos = ['nota_final', 'status_aprovacao'];
    const desconhecidos = Object.keys(payload || {}).filter((campo) => !permitidos.includes(campo));
    if (desconhecidos.length) throw new Error(`Campos não permitidos: ${desconhecidos.join(', ')}.`);
    return true;
});

// POST /api/matriculas - cria matrícula do aluno logado
router.post(
    '/',
    checkAuth,
    checkRole('ALUNO'),
    body('id_turma').isInt({ min: 1 }).withMessage('O ID da turma deve ser um número inteiro positivo.').toInt(),
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
    apenasCamposAcademicos,
    body('nota_final').optional({ nullable: true }).isFloat({ min: 0, max: 10 }).withMessage('A nota final deve estar entre 0 e 10.').toFloat(),
    body('status_aprovacao').optional().isIn(STATUS_APROVACAO).withMessage('Status inválido.'),
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
