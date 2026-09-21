const logger = require('../../utils/logger');
const operational = require('../services/operational-status.service');

function publicStatus(req, res) {
    return res.status(200).json({ status: 'ok' });
}

async function readyStatus(req, res) {
    const result = await operational.readiness();
    if (!result.ready) logger.warn('health.readiness.degraded', {
        requestId: req.id,
        database: result.database,
        storage: result.storage
    });
    return res.status(result.ready ? 200 : 503).json({ status: result.ready ? 'ok' : 'degraded' });
}

async function status(req, res) {
    try {
        const snapshot = await operational.metrics();
        const healthy = snapshot.database.status === 'ok' && snapshot.storage.status === 'ok';
        return res.status(healthy ? 200 : 503).json({
            status: healthy ? 'ok' : 'degraded',
            components: {
                database: snapshot.database.status,
                storage: snapshot.storage.status,
                backup: snapshot.backup.status,
                pool: snapshot.database.pool.status
            }
        });
    } catch (error) {
        logger.error('health.admin.degraded', { requestId: req.id, error });
        return res.status(503).json({
            status: 'degraded',
            components: {
                database: 'unavailable',
                storage: 'unavailable',
                backup: 'unavailable',
                pool: 'unavailable'
            }
        });
    }
}

async function metrics(req, res, next) {
    try {
        return res.status(200).json(await operational.metrics());
    } catch (error) {
        logger.error('metrics.admin.failed', { requestId: req.id, error });
        return next(error);
    }
}

module.exports = {
    metrics,
    publicStatus,
    readyStatus,
    status
};
