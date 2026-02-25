const express = require('express');
const router = express.Router();
const UsuariosController = require('../controllers/usuarios.controller');
const { body , param } = require('express-validator'); 
const checkAuth = require('../../middlewares/checkAuth.middleware');
const checkRole = require('../../middlewares/checkRole.middleware');
const checkUserPermission = require('../../middlewares/checkUserPermission.middleware');

router.post('/',
	body('email').isEmail().withMessage('O e-mail fornecido não é valido.'),
	body('senha')
		.isLength({ min: 8 }).withMessage('A senha precisa ter no mínimo 8 caracteres')
		.matches(/[A-Z]/).withMessage('A senha precisa ter pelo menos uma letra maiúscula')
		.matches(/[a-z]/).withMessage('A senha precisa ter pelo menos uma letra minúscula')
		.matches(/\d/).withMessage('A senha precisa ter pelo menos um número')
		.matches(/[^A-Za-z0-9]/).withMessage('A senha precisa ter pelo menos um símbolo'),
	body('cpf').isLength({ min: 11, max: 11}).withMessage('O CPF deve ter exatamente 11 digítos').isNumeric().withMessage('O CPF deve conter apenas números.'),
	body('nome_completo').notEmpty().withMessage('O nome de usuário é obrigatório.'),
	body('tipo').optional().isIn(['ALUNO', 'aluno']).withMessage('Cadastro público permite apenas o tipo ALUNO. Para PROFESSOR/ADMIN, contate o administrador.'),
	UsuariosController.criarUsuario);

router.post('/verificar-disponibilidade',
	body('email').isEmail().withMessage('O e-mail fornecido não é valido.'),
	body('cpf').isLength({ min: 11, max: 11}).withMessage('O CPF deve ter exatamente 11 digítos').isNumeric().withMessage('O CPF deve conter apenas números.'),
	UsuariosController.verificarDisponibilidadeCadastro);

router.patch('/:id', 
	checkAuth,
	checkUserPermission,
	param('id').isInt().withMessage('O ID deve ser um número inteiro.'),
	body('email').optional().isEmail().withMessage('O e-mail fornecido não é valido.'),
	body('senha')
		.optional()
		.isLength({ min: 8 }).withMessage('A senha precisa ter no mínimo 8 caracteres')
		.matches(/[A-Z]/).withMessage('A senha precisa ter pelo menos uma letra maiúscula')
		.matches(/[a-z]/).withMessage('A senha precisa ter pelo menos uma letra minúscula')
		.matches(/\d/).withMessage('A senha precisa ter pelo menos um número')
		.matches(/[^A-Za-z0-9]/).withMessage('A senha precisa ter pelo menos um símbolo'),
	body('cpf').optional().isLength({ min: 11, max: 11}).withMessage('O CPF deve ter exatamente 11 digítos').isNumeric().withMessage('O CPF deve conter apenas números.'), 
	body('nome_completo').optional().notEmpty().withMessage('O nome de usuário é obrigatório.'), 
	UsuariosController.atualizarUsuario);

router.get('/:id',
	checkAuth,
	checkUserPermission,
	param('id').isInt().withMessage('O ID deve ser um número inteiro.'),
	UsuariosController.buscarUsuarioPorId);

router.get('/',
	checkAuth,
	checkRole('ADMIN'),
	UsuariosController.buscarTodosUsuarios);

router.delete('/:id',
	checkAuth,
	checkRole('ADMIN'), //apenas o admin pode deletar usuários, mudar logica se necessário!
	param('id').isInt().withMessage('O ID deve ser um número inteiro.'),
	UsuariosController.deletarUsuario);

module.exports = router;
