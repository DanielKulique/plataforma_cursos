'use strict';

const router = require('express').Router();
const checkAuth = require('../../middlewares/checkAuth.middleware');
const checkRole = require('../../middlewares/checkRole.middleware');
const { validateIndexedAnalysis } = require('../../middlewares/indexedAnalysis.validation');
const {
    indexedAnalysisRateLimit,
    indexStatusRateLimit,
    indexReloadRateLimit
} = require('../../middlewares/indexedAnalysisRateLimit.middleware');
const controller = require('../controllers/indexed-analysis.controller');

router.post('/analises/similaridade', checkAuth, indexedAnalysisRateLimit, validateIndexedAnalysis, controller.analisar);
router.get('/admin/corpus/index/status', checkAuth, checkRole('ADMIN'), indexStatusRateLimit, controller.status);
router.post('/admin/corpus/index/reload', checkAuth, checkRole('ADMIN'), indexReloadRateLimit, controller.reload);

module.exports = router;
