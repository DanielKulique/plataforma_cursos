const express = require('express');
const router = express.Router();
const usuariosController = require('../controllers/usuarios.controller');
const { body, param } = require('express-validator');
const checkAuth = require('../../middlewares/checkAuth.middleware');
const checkRole = require('../../middlewares/checkRole.middleware');
const { normalizarEmail } = require('../../utils/identity');
const healthController = require('../controllers/health.controller');

function apenasCamposPermitidos(campos) {
    return body().custom((payload) => {
        const desconhecidos = Object.keys(payload || {}).filter((campo) => !campos.includes(campo));
        if (desconhecidos.length > 0) {
            throw new Error(`Campos não permitidos: ${desconhecidos.join(', ')}.`);
        }
        return true;
    });
}

/**
 * Rotas administrativas para gerenciamento de usuários
 * Todas requerem autenticação e papel ADMIN
 */

router.get('/metrics', checkAuth, checkRole('ADMIN'), healthController.metrics);

// POST /api/admin/usuarios - Criar novo usuário (ADMIN ou PROFESSOR)
router.post('/usuarios',
    checkAuth,
    checkRole('ADMIN'),
    apenasCamposPermitidos(['nome_completo', 'cpf', 'email', 'telefone', 'senha', 'tipo']),
    body('email').customSanitizer(normalizarEmail).isEmail().withMessage('O e-mail fornecido não é válido.'),
    body('senha')
        .isLength({ min: 8 }).withMessage('A senha precisa ter no mínimo 8 caracteres')
        .matches(/[A-Z]/).withMessage('A senha precisa ter pelo menos uma letra maiúscula')
        .matches(/[a-z]/).withMessage('A senha precisa ter pelo menos uma letra minúscula')
        .matches(/\d/).withMessage('A senha precisa ter pelo menos um número')
        .matches(/[^A-Za-z0-9]/).withMessage('A senha precisa ter pelo menos um símbolo'),
    body('cpf').isLength({ min: 11, max: 11 }).withMessage('O CPF deve ter exatamente 11 dígitos').isNumeric().withMessage('O CPF deve conter apenas números.'),
    body('nome_completo').isString().trim().isLength({ min: 2, max: 255 }).withMessage('O nome completo deve ter entre 2 e 255 caracteres.'),
    body('tipo').isIn(['ALUNO', 'PROFESSOR', 'ADMIN']).withMessage('Tipo inválido. Aceitos: ALUNO, PROFESSOR, ADMIN.'),
    body('telefone').optional({ nullable: true, checkFalsy: true }).isString().matches(/^[0-9()+\-\s]{8,20}$/).withMessage('Telefone deve ter entre 8 e 20 caracteres válidos.'),
    usuariosController.criarUsuarioAdmin
);

// GET /api/admin/usuarios - Listar todos os usuários
router.get('/usuarios',
    checkAuth,
    checkRole('ADMIN'),
    usuariosController.buscarTodosUsuarios
);

// GET /api/admin/usuarios/:id - Buscar usuário por ID
router.get('/usuarios/:id',
    checkAuth,
    checkRole('ADMIN'),
    param('id').isInt({ min: 1 }).withMessage('O ID deve ser um número inteiro positivo.'),
    usuariosController.buscarUsuarioPorId
);

// PATCH /api/admin/usuarios/:id - Atualizar usuário
router.patch('/usuarios/:id',
    checkAuth,
    checkRole('ADMIN'),
    param('id').isInt({ min: 1 }).withMessage('O ID deve ser um número inteiro positivo.'),
    apenasCamposPermitidos(['nome_completo', 'cpf', 'email', 'telefone', 'tipo']),
    body('email').optional().isEmail().withMessage('O e-mail fornecido não é válido.'),
    body('cpf').optional().isLength({ min: 11, max: 11 }).withMessage('O CPF deve ter exatamente 11 dígitos').isNumeric().withMessage('O CPF deve conter apenas números.'),
    body('nome_completo').optional().isString().trim().isLength({ min: 2, max: 255 }).withMessage('O nome completo deve ter entre 2 e 255 caracteres.'),
    body('tipo').optional().isIn(['ALUNO', 'PROFESSOR', 'ADMIN']).withMessage('Tipo inválido. Aceitos: ALUNO, PROFESSOR, ADMIN.'),
    body('telefone').optional({ nullable: true, checkFalsy: true }).isString().matches(/^[0-9()+\-\s]{8,20}$/).withMessage('Telefone deve ter entre 8 e 20 caracteres válidos.'),
    usuariosController.atualizarUsuarioAdmin
);

// DELETE /api/admin/usuarios/:id - Deletar usuário
router.delete('/usuarios/:id',
    checkAuth,
    checkRole('ADMIN'),
    param('id').isInt({ min: 1 }).withMessage('O ID deve ser um número inteiro positivo.'),
    usuariosController.deletarUsuario
);

module.exports = router;
