// GET /api/auth/me usa a sessão do cookie HttpOnly e retorna o usuário atual.

const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const checkAuth = require('../../middlewares/checkAuth.middleware');
const { body } = require('express-validator');
const { rateLimit } = require('express-rate-limit');
const { criarLimitadoresVerificacaoEmail } = require('../../middlewares/emailVerificationRateLimit.middleware');
const { normalizarEmail } = require('../../utils/identity');

const passwordRecoveryLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.PASSWORD_RECOVERY_RATE_LIMIT || 5),
    standardHeaders: 'draft-8',
    legacyHeaders: false
});
const passwordResetLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.PASSWORD_RESET_RATE_LIMIT || 10),
    standardHeaders: 'draft-8',
    legacyHeaders: false
});
const limitadoresEmail = criarLimitadoresVerificacaoEmail();

//rota de login
router.post('/login', body('email').customSanitizer(normalizarEmail), authController.login);
router.post('/logout', checkAuth, authController.logout);
router.get('/csrf', checkAuth, authController.csrf);
router.post(
    '/recuperar-senha',
    passwordRecoveryLimit,
    body('email').customSanitizer(normalizarEmail).isEmail(),
    authController.recuperarSenha
);
router.post(
    '/redefinir-senha',
    passwordResetLimit,
    body('token').isString().isLength({ min: 32, max: 256 }),
    body('nova_senha')
        .isLength({ min: 8 })
        .matches(/[A-Z]/)
        .matches(/[a-z]/)
        .matches(/\d/)
        .matches(/[^A-Za-z0-9]/),
    authController.redefinirSenha
);
router.post(
    '/enviar-codigo-verificacao',
    limitadoresEmail.envioPorIp,
    limitadoresEmail.envioPorIdentidade,
    body('email').customSanitizer(normalizarEmail).isEmail(),
    authController.enviarCodigoVerificacao
);
router.post(
    '/verificar-codigo-email',
    limitadoresEmail.verificacaoPorIp,
    limitadoresEmail.verificacaoPorIdentidade,
    body('email').customSanitizer(normalizarEmail).isEmail(),
    body('codigo').isString().matches(/^\d{6}$/),
    authController.verificarCodigoEmail
);
router.get('/me', checkAuth, authController.me);

module.exports = router;
