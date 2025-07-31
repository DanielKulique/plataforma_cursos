const express = require('express');
const router = express.Router();
const UsuariosController = require('../controllers/usuarios.controller');
const { body , param } = require('express-validator'); 
const checkAuth = require('../../middlewares/checkAuth.middleware');
const checkRole = require('../../middlewares/checkRole.middleware');
const checkUserPermission = require('../../middlewares/checkUserPermission.middleware');

router.post('/',
	body('email').isEmail().withMessage('O e-mail fornecido não é valido.'),
	body('senha').isLength({ min: 6}).withMessage('A senha precisa ter no minimo 6 caracteres'),
	body('cpf').isLength({ min: 11, max: 11}).withMessage('O CPF deve ter exatamente 11 digítos').isNumeric().withMessage('O CPF deve conter apenas números.'), 
	body('nome_completo').notEmpty().withMessage('O nome de usuário é obrigatório.'), 
	UsuariosController.criarUsuario);

router.patch('/:id', 
	checkAuth,
	checkUserPermission,
	param('id').isInt().withMessage('O ID deve ser um número inteiro.'),
	body('email').optional().isEmail().withMessage('O e-mail fornecido não é valido.'),
	body('senha').optional().isLength({ min: 6}).withMessage('A senha precisa ter no minimo 6 caracteres'),
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
