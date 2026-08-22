'use strict';

const buckets = new Map();

function createLimit(kind, envName, fallback) {
    return (req, res, next) => {
        const userId = req.user?.id_usuario;
        if (!userId) return res.status(401).json({ mensagem: 'Sessão inválida' });
        const windowMs = Number(process.env.RETRIEVAL_RATE_LIMIT_WINDOW_MS || 60000);
        const limit = Number(process.env[envName] || fallback);
        const key = `${kind}:${userId}`;
        const now = Date.now();
        const previous = buckets.get(key);
        const bucket = !previous || previous.expiresAt <= now
            ? { count: 0, expiresAt: now + windowMs }
            : previous;
        bucket.count += 1;
        buckets.set(key, bucket);
        res.setHeader('RateLimit-Limit', String(limit));
        res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - bucket.count)));
        if (bucket.count > limit) {
            return res.status(429).json({ codigo: 'ANALISE_LIMITE_EXCEDIDO', mensagem: 'Limite de operações excedido.' });
        }
        return next();
    };
}

const indexedAnalysisRateLimit = createLimit('analysis', 'RETRIEVAL_ANALYSIS_RATE_LIMIT_MAX', 10);
const indexStatusRateLimit = createLimit('status', 'RETRIEVAL_STATUS_RATE_LIMIT_MAX', 30);
const indexReloadRateLimit = createLimit('reload', 'RETRIEVAL_RELOAD_RATE_LIMIT_MAX', 2);

function resetIndexedAnalysisRateLimits() { buckets.clear(); }

module.exports = {
    indexedAnalysisRateLimit,
    indexStatusRateLimit,
    indexReloadRateLimit,
    resetIndexedAnalysisRateLimits
};
