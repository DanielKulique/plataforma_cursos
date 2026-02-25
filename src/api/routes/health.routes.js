const express = require('express');
const router = express.Router();
const healthController = require('../controllers/health.controller');
const checkAuth = require('../../middlewares/checkAuth.middleware');
const checkRole = require('../../middlewares/checkRole.middleware');

router.get('/', checkAuth, checkRole('ADMIN'), healthController.status);

module.exports = router;
