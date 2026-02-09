//get /api/turmas
// listar turmas disponiveis - inscricoes abertas

//get /api/turmas/?id
//lista uma turma por seu id - dados da turma

//put /api/turmas/:id
//atualiza infos de uma turma

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
    body('nome_curso').notEmpty().withMessage('O nome do curso Ã© obrigatÃ³rio.'),
    body('descricao').optional({ nullable: true }).isString().withMessage('A descriÃ§Ã£o deve ser um texto.'),
    body('carga_horaria').isInt({ min: 1 }).withMessage('A carga horÃ¡ria deve ser um nÃºmero inteiro positivo.'),
    checkAuth,
    checkRole('ADMIN'),
    cursosController.criarCurso
);
router.put(
    '/:id',
    body('nome_curso').notEmpty().withMessage('O nome do curso Ã© obrigatÃ³rio.'),
    body('descricao').optional({ nullable: true }).isString().withMessage('A descriÃ§Ã£o deve ser um texto.'),
    body('carga_horaria').isInt({ min: 1 }).withMessage('A carga horÃ¡ria deve ser um nÃºmero inteiro positivo.'),
    checkAuth,
    checkRole('ADMIN'),
    cursosController.atualizarCurso
);

module.exports = router;
