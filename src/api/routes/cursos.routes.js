//get /api/turmas
// listar turmas disponiveis - inscricoes abertas

//get /api/turmas/?id
//lista uma turma por seu id - dados da turma

//put /api/turmas/:id
//atualiza infos de uma turma

const express = require('express');
const router = express.Router();
const cursosController = require('../controllers/cursos.control');

router.get('/', cursosController.listarTodos);
router.get('/:id', cursosController.ListarCursoPorId);

module.exports = router;