const express = require('express');
const router = express.Router();
const UsuariosController = require('../controllers/usuarios.controller');
const { body , param } = require('express-validator'); 
const checkAuth = require('../../middlewares/checkAuth.middleware');
const checkRole = require('../../middlewares/checkRole.middleware');
const checkUserPermission = require('../../middlewares/checkUserPermission.middleware');
const { normalizarEmail } = require('../../utils/identity');

function apenasCamposPermitidos(campos) {
	return body().custom((payload) => {
		const desconhecidos = Object.keys(payload || {}).filter((campo) => !campos.includes(campo));
		if (desconhecidos.length > 0) {
			throw new Error(`Campos não permitidos: ${desconhecidos.join(', ')}.`);
		}
		return true;
	});
}

router.post('/',
		body('email').customSanitizer(normalizarEmail).isEmail().withMessage('O e-mail fornecido não é valido.'),
	body('senha')
		.isLength({ min: 8 }).withMessage('A senha precisa ter no mínimo 8 caracteres')
		.matches(/[A-Z]/).withMessage('A senha precisa ter pelo menos uma letra maiúscula')
		.matches(/[a-z]/).withMessage('A senha precisa ter pelo menos uma letra minúscula')
		.matches(/\d/).withMessage('A senha precisa ter pelo menos um número')
		.matches(/[^A-Za-z0-9]/).withMessage('A senha precisa ter pelo menos um símbolo'),
	body('cpf').isLength({ min: 11, max: 11}).withMessage('O CPF deve ter exatamente 11 digítos').isNumeric().withMessage('O CPF deve conter apenas números.'),
	body('nome_completo').isString().trim().isLength({ min: 2, max: 255 }).withMessage('O nome completo deve ter entre 2 e 255 caracteres.'),
	body('telefone').optional({ nullable: true, checkFalsy: true }).isString().matches(/^[0-9()+\-\s]{8,20}$/).withMessage('Telefone deve ter entre 8 e 20 caracteres válidos.'),
	body('tipo').optional().isIn(['ALUNO', 'aluno']).withMessage('Cadastro público permite apenas o tipo ALUNO. Para PROFESSOR/ADMIN, contate o administrador.'),
	UsuariosController.criarUsuario);

router.post('/verificar-disponibilidade',
		body('email').customSanitizer(normalizarEmail).isEmail().withMessage('O e-mail fornecido não é valido.'),
	body('cpf').isLength({ min: 11, max: 11}).withMessage('O CPF deve ter exatamente 11 digítos').isNumeric().withMessage('O CPF deve conter apenas números.'),
	UsuariosController.verificarDisponibilidadeCadastro);

router.patch('/:id', 
	checkAuth,
	checkUserPermission,
	param('id').isInt({ min: 1 }).withMessage('O ID deve ser um número inteiro positivo.'),
	apenasCamposPermitidos(['nome_completo', 'cpf', 'email', 'telefone']),
	body('email').optional().isEmail().withMessage('O e-mail fornecido não é valido.'),
	body('cpf').optional().isLength({ min: 11, max: 11}).withMessage('O CPF deve ter exatamente 11 digítos').isNumeric().withMessage('O CPF deve conter apenas números.'), 
	body('nome_completo').optional().isString().trim().isLength({ min: 2, max: 255 }).withMessage('O nome completo deve ter entre 2 e 255 caracteres.'),
	body('telefone').optional({ nullable: true, checkFalsy: true }).isString().matches(/^[0-9()+\-\s]{8,20}$/).withMessage('Telefone deve ter entre 8 e 20 caracteres válidos.'),
	UsuariosController.atualizarUsuario);

router.patch('/:id/senha',
	checkAuth,
	param('id').isInt({ min: 1 }).withMessage('O ID deve ser um número inteiro positivo.'),
	apenasCamposPermitidos(['senha_atual', 'nova_senha']),
	body('senha_atual').isString().notEmpty().withMessage('A senha atual é obrigatória.'),
	body('nova_senha')
		.isLength({ min: 8 }).withMessage('A nova senha precisa ter no mínimo 8 caracteres')
		.matches(/[A-Z]/).withMessage('A nova senha precisa ter pelo menos uma letra maiúscula')
		.matches(/[a-z]/).withMessage('A nova senha precisa ter pelo menos uma letra minúscula')
		.matches(/\d/).withMessage('A nova senha precisa ter pelo menos um número')
		.matches(/[^A-Za-z0-9]/).withMessage('A nova senha precisa ter pelo menos um símbolo'),
	UsuariosController.alterarSenha);

router.get('/:id',
	checkAuth,
	checkUserPermission,
	param('id').isInt({ min: 1 }).withMessage('O ID deve ser um número inteiro positivo.'),
	UsuariosController.buscarUsuarioPorId);

router.get('/',
	checkAuth,
	checkRole('ADMIN'),
	UsuariosController.buscarTodosUsuarios);

router.delete('/:id',
	checkAuth,
	checkRole('ADMIN'), //apenas o admin pode deletar usuários, mudar logica se necessário!
	param('id').isInt({ min: 1 }).withMessage('O ID deve ser um número inteiro positivo.'),
	UsuariosController.deletarUsuario);

module.exports = router;
