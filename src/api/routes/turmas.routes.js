const express = require('express');
const router = express.Router();
const turmasController = require('../controllers/turmas.controller');
const { body, header, param } = require('express-validator');
const checkAuth = require('../../middlewares/checkAuth.middleware');
const checkRole = require('../../middlewares/checkRole.middleware');
const { checkProfessorPermission } = require('../../middlewares/checkProfessorPermission.middleware');

const STATUS_TURMA = [
    'ABERTA',
    'FECHADA',
    'ENCERRADA'
];

function apenasCamposPermitidos(campos) {
    return body().custom((payload) => {
        const desconhecidos = Object.keys(payload || {}).filter((campo) => !campos.includes(campo));
        if (desconhecidos.length > 0) {
            throw new Error(`Campos não permitidos: ${desconhecidos.join(', ')}.`);
        }
        return true;
    });
}

// GET /api/turmas - listar todas as turmas (público)
router.get('/', turmasController.buscarTodasTurmas);

// GET /api/turmas/:id/replicacao-resumo - auditar estrutura antes da replicação (apenas ADMIN)
router.get(
    '/:id/replicacao-resumo',
    checkAuth,
    checkRole('ADMIN'),
    param('id').isInt({ min: 1 }).withMessage('O ID deve ser um número inteiro positivo.'),
    turmasController.buscarResumoReplicacao
);

// POST /api/turmas/:id/replicar - criar turma independente a partir da estrutura (apenas ADMIN)
router.post(
    '/:id/replicar',
    checkAuth,
    checkRole('ADMIN'),
    param('id').isInt({ min: 1 }).withMessage('O ID deve ser um número inteiro positivo.'),
    header('Idempotency-Key')
        .isString().trim().isLength({ min: 16, max: 64 })
        .matches(/^[A-Za-z0-9_-]+$/)
        .withMessage('Informe uma chave de idempotência válida.'),
    apenasCamposPermitidos(['nome_turma', 'id_professor', 'data_inicio', 'data_fim', 'status']),
    body('nome_turma').isString().trim().notEmpty().withMessage('O nome da nova turma é obrigatório.').isLength({ max: 100 }).withMessage('O nome da turma deve ter no máximo 100 caracteres.'),
    body('id_professor').isInt({ min: 1 }).withMessage('Selecione um professor válido.').toInt(),
    body('data_inicio').isISO8601().withMessage('A data de início deve ser válida.'),
    body('data_fim').optional({ nullable: true }).isISO8601().withMessage('A data de fim deve ser válida.'),
    body('status').isIn(STATUS_TURMA).withMessage('Status inválido.'),
    turmasController.replicarTurma
);

// GET /api/turmas/:id - buscar turma por ID (público)
router.get(
    '/:id',
    param('id').isInt({ min: 1 }).withMessage('O ID deve ser um número inteiro positivo.'),
    turmasController.buscarTurmaPorId
);

// GET /api/turmas/professor/:id - buscar turmas de um professor específico
router.get(
    '/professor/:id',
    checkAuth,
    checkProfessorPermission,
    param('id').isInt({ min: 1 }).withMessage('O ID do professor deve ser um número inteiro positivo.'),
    turmasController.buscarTurmasDoProfessor
);

// POST /api/turmas - criar nova turma (apenas ADMIN)
router.post(
    '/',
    checkAuth,
    checkRole('ADMIN'),
    apenasCamposPermitidos(['nome_turma', 'id_curso', 'id_professor', 'data_inicio', 'data_fim', 'status']),
    body('nome_turma').isString().trim().notEmpty().withMessage('O nome da turma é obrigatório.').isLength({ max: 100 }).withMessage('O nome da turma deve ter no máximo 100 caracteres.'),
    body('id_curso').isInt({ min: 1 }).withMessage('O ID do curso deve ser um número inteiro positivo.'),
    body('id_professor').isInt({ min: 1 }).withMessage('O ID do professor deve ser um número inteiro positivo.'),
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
    param('id').isInt({ min: 1 }).withMessage('O ID deve ser um número inteiro positivo.'),
    apenasCamposPermitidos(['nome_turma', 'id_curso', 'id_professor', 'data_inicio', 'data_fim', 'status']),
    body('nome_turma').optional().isString().trim().notEmpty().withMessage('O nome da turma é obrigatório.').isLength({ max: 100 }).withMessage('O nome da turma deve ter no máximo 100 caracteres.'),
    body('id_curso').optional().isInt({ min: 1 }).withMessage('O ID do curso deve ser um número inteiro positivo.'),
    body('id_professor').optional().isInt({ min: 1 }).withMessage('O ID do professor deve ser um número inteiro positivo.'),
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
    param('id').isInt({ min: 1 }).withMessage('O ID deve ser um número inteiro positivo.'),
    turmasController.deletarTurma
);

module.exports = router;
