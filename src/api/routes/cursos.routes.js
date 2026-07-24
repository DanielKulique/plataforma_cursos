const express = require('express');
const router = express.Router();
const cursosController = require('../controllers/cursos.controller');
const { body, param } = require('express-validator');
const checkAuth = require('../../middlewares/checkAuth.middleware');
const checkRole = require('../../middlewares/checkRole.middleware');

router.get('/', cursosController.listarTodos);
router.get('/:id', param('id').isInt({ min: 1 }).withMessage('O ID deve ser um número inteiro positivo.'), cursosController.listarCursoPorId);

router.delete('/:id', checkAuth, checkRole('ADMIN'), param('id').isInt({ min: 1 }).withMessage('O ID deve ser um número inteiro positivo.'), cursosController.deletarCurso);

router.post(
    '/',
    checkAuth,
    checkRole('ADMIN'),
    body('nome_curso').isString().trim().notEmpty().withMessage('O nome do curso é obrigatório.').isLength({ max: 100 }).withMessage('O nome do curso deve ter no máximo 100 caracteres.'),
    body('descricao').optional({ nullable: true }).isString().withMessage('A descrição deve ser um texto.'),
    body('carga_horaria').isInt({ min: 1 }).withMessage('A carga horária deve ser um número inteiro positivo.'),
    cursosController.criarCurso
);

router.put(
    '/:id',
    checkAuth,
    checkRole('ADMIN'),
    param('id').isInt({ min: 1 }).withMessage('O ID deve ser um número inteiro positivo.'),
    body('nome_curso').isString().trim().notEmpty().withMessage('O nome do curso é obrigatório.').isLength({ max: 100 }).withMessage('O nome do curso deve ter no máximo 100 caracteres.'),
    body('descricao').optional({ nullable: true }).isString().withMessage('A descrição deve ser um texto.'),
    body('carga_horaria').isInt({ min: 1 }).withMessage('A carga horária deve ser um número inteiro positivo.'),
    cursosController.atualizarCurso
);

module.exports = router;
