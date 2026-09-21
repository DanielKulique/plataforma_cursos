'use strict';

const { rateLimit } = require('express-rate-limit');

function criarLimitadorCertificados(limit, windowMs) {
    return rateLimit({
        windowMs,
        limit,
        standardHeaders: 'draft-8',
        legacyHeaders: false
    });
}

module.exports = { criarLimitadorCertificados };
