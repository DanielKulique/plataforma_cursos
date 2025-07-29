const express = require('express');
const router = express.Router();
const UsuariosController = require('../controllers/usuarios.controller');
const { body } = require = ('express-validator'); 

router.post('/',
	body('email').isEmail().withMessage('O e-mail fornecido não é valido.'),
	body('senha').isLength({ min: 6}).withMessage('A senha precisa ter no minimo 6 caracteres'),
	body('cpf').isLength({ min: 11, max: 11}).withMessage('O CPF deve ter exatamente 11 digítos').isNumeric().withMessage('O CPF deve conter apenas números.'), 
	UsuariosController.criarUsuario);

module.exports = router;