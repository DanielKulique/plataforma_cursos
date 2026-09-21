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
const { detectorEnabled } = require('../../middlewares/featureFlag.middleware');

router.post('/analises/similaridade', detectorEnabled, checkAuth, indexedAnalysisRateLimit, validateIndexedAnalysis, controller.analisar);
router.get('/admin/corpus/index/status', detectorEnabled, checkAuth, checkRole('ADMIN'), indexStatusRateLimit, controller.status);
router.post('/admin/corpus/index/reload', detectorEnabled, checkAuth, checkRole('ADMIN'), indexReloadRateLimit, controller.reload);

module.exports = router;
