'use strict';

const router = require('express').Router();
const checkAuth = require('../../middlewares/checkAuth.middleware');
const {
    validateDetectorPayload,
    validateDetectorSegmentPayload,
    validateDetectorDocumentPayload
} = require('../../middlewares/detectorContextual.validation');
const { detectorRateLimit } = require('../../middlewares/detectorRateLimit.middleware');
const controller = require('../controllers/analises-contextuais.controller');

// ALUNO, PROFESSOR e ADMIN são autorizados; checkAuth resolve o papel atual no banco.
router.post('/contextual', checkAuth, detectorRateLimit, validateDetectorPayload, controller.analisar);
router.post('/contextual/segmento', checkAuth, detectorRateLimit, validateDetectorSegmentPayload, controller.analisarSegmento);
router.post('/contextual/documento', checkAuth, detectorRateLimit, validateDetectorDocumentPayload, controller.analisarDocumento);

module.exports = router;
