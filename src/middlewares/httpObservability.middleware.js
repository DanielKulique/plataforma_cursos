'use strict';

const logger = require('../utils/logger');
const metrics = require('../api/services/http-metrics.service');

function routeName(req) {
    const routePath = req.route?.path;
    if (routePath) return `${req.baseUrl || ''}${routePath}`;
    return String(req.path || '/')
        .replace(/\/[0-9]+(?=\/|$)/g, '/:id')
        .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}(?=\/|$)/gi, '/:token')
        .slice(0, 200);
}

function httpObservability(options = {}) {
    const slowRequestMs = Number(options.slowRequestMs || process.env.SLOW_REQUEST_MS || 2000);
    return (req, res, next) => {
        const startedAt = process.hrtime.bigint();
        metrics.requestStarted();
        let finalized = false;
        const finalize = () => {
            if (finalized) return;
            finalized = true;
            const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
            const slow = durationMs >= slowRequestMs;
            metrics.requestFinished(res.statusCode, durationMs, slow);
            const details = {
                requestId: req.id,
                method: req.method,
                route: routeName(req),
                status: res.statusCode,
                durationMs: Number(durationMs.toFixed(3))
            };
            (slow ? logger.warn : logger.info)(slow ? 'http.request.slow' : 'http.request.completed', details);
        };
        res.once('finish', finalize);
        res.once('close', finalize);
        next();
    };
}

module.exports = httpObservability;
