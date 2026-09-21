'use strict';

const router = require('express').Router();
const checkAuth = require('../../middlewares/checkAuth.middleware');
const controller = require('../controllers/capabilities.controller');

router.get('/', checkAuth, controller.listar);

module.exports = router;
