

const express = require('express');
const router = express.Router();
const turmasController = require('../controllers/turmas.controller');
const {body, param } = require ('express-validator');
const checkAuth = require('../../middlewares/checkAuth.middlewares');
const checkRole = require('../../middlewares/checkRole.middlewares');


//GET /api/turmas - listar todas as turmas (publico)

router.get('/', turmasController.buscasTodasTurmas);

//GET /api/turmas/:id - Buscar turma por ID (publico)

router.get('/:id',
	param('id').isInt().withMessage('O ID deve ser um número inteiro.'),
	turmasControler.buscarTurmaPorId
);

//POST /api/turmas - criar nova turma (apenas ADMIN ou PROFESSOR)
router.post('/',
	checkAuth,
	checkRole('ADMIN'),
	body('nome_turma').notEmpyt().withMessage('O nume da turma é obrigatório.'),
	body('id_curso').isInt().withMessage('O ID do curso deve ser um numero inteiro'),
	body('id_professor').isInt().withMessage('O ID do professor deve ser um numero inteiro'),
	body('status').isIn(['ABERTA', 'EM_ANDAMENTO', 'CONCLUIDA']).withMessage('Status inválido'),
	turmasController.criarTurma	
);

router.delete('/:id',
	checkAuth,
	checkRole('ADMIN'),
	param('id').isInt().withMessage('O ID deve ser um número inteiro.'),
	turmasController.deletarTurma
);


module.exports = router;