'use strict';

function normalizePoolAcquisitionError(error) {
    const message = String(error?.message || '');
    if (/queue limit|no connections available/i.test(message)) {
        return Object.assign(new Error('Banco temporariamente saturado.'), {
            code: 'DB_POOL_SATURATED',
            status: 503,
            cause: error
        });
    }
    return error;
}

module.exports = { normalizePoolAcquisitionError };
