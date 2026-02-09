//get /api/auth/me
//front end envia token JWT, e a rota retorna as infs do user logado. "Bem vindo, Daniel".

const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const checkAuth = require('../../middlewares/checkAuth.middleware');

//rota de login
router.post('/login', authController.login);
router.get('/me', checkAuth, authController.me);

module.exports = router;