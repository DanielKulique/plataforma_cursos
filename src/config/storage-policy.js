'use strict';

function integer(env, key, fallback, minimum) {
    const value = Number(env[key] ?? fallback);
    if (!Number.isSafeInteger(value) || value < minimum || value > 36500) {
        throw new Error(`${key} inválido (mínimo ${minimum}).`);
    }
    return value;
}

function storagePolicy(env = process.env) {
    return {
        graceHours: integer(env, 'STORAGE_GRACE_HOURS', 48, 24),
        retentionDays: integer(env, 'MATERIAL_RETENTION_DAYS', 90, 1)
    };
}

module.exports = { storagePolicy };
