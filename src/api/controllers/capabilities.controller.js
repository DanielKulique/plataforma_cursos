'use strict';

const { isEnabled } = require('../../middlewares/featureFlag.middleware');

function listar(req, res) {
    return res.status(200).json({
        features: {
            detector: {
                enabled: isEnabled(process.env.DETECTOR_ENABLED),
                experimental: true
            }
        }
    });
}

module.exports = { listar };
