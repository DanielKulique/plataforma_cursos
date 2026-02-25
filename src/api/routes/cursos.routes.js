const express = require('express');
const router = express.Router();
const cursosController = require('../controllers/cursos.controller');
const { body } = require('express-validator');
const checkAuth = require('../../middlewares/checkAuth.middleware');
const checkRole = require('../../middlewares/checkRole.middleware');

router.get('/', cursosController.listarTodos);
router.get('/:id', cursosController.listarCursoPorId);

router.delete('/:id', checkAuth, checkRole('ADMIN'), cursosController.deletarCurso);

router.post(
    '/',
    body('nome_curso').notEmpty().withMessage('O nome do curso é obrigatório.'),
    body('descricao').optional({ nullable: true }).isString().withMessage('A descrição deve ser um texto.'),
    body('carga_horaria').isInt({ min: 1 }).withMessage('A carga horária deve ser um número inteiro positivo.'),
    checkAuth,
    checkRole('ADMIN'),
    cursosController.criarCurso
);

router.put(
    '/:id',
    body('nome_curso').notEmpty().withMessage('O nome do curso é obrigatório.'),
    body('descricao').optional({ nullable: true }).isString().withMessage('A descrição deve ser um texto.'),
    body('carga_horaria').isInt({ min: 1 }).withMessage('A carga horária deve ser um número inteiro positivo.'),
    checkAuth,
    checkRole('ADMIN'),
    cursosController.atualizarCurso
);

module.exports = router;
