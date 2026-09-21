'use strict';

function isEnabled(value) {
    if (value === undefined && process.env.NODE_ENV === 'test') return true;
    return String(value || '').trim().toLowerCase() === 'true';
}

function detectorEnabled(req, res, next) {
    if (isEnabled(process.env.DETECTOR_ENABLED)) return next();
    return res.status(503).json({
        codigo: 'RECURSO_DESABILITADO',
        mensagem: 'O verificador experimental não está disponível neste ambiente.'
    });
}

module.exports = { detectorEnabled, isEnabled };
