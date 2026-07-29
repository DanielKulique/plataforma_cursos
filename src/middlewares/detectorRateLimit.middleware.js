'use strict';

const buckets = new Map();

function detectorRateLimit(req, res, next) {
    const userId = req.user?.id_usuario;
    if (!userId) return res.status(401).json({ mensagem: 'Sessão inválida' });
    const windowMs = Number(process.env.DETECTOR_RATE_LIMIT_WINDOW_MS || 60000);
    // O padrão comporta uma sessão normal com debounce; continua sendo proteção, não cadência do editor.
    const limit = Number(process.env.DETECTOR_RATE_LIMIT_MAX || 60);
    const now = Date.now();
    const current = buckets.get(userId);
    const bucket = !current || current.expiresAt <= now
        ? { count: 0, expiresAt: now + windowMs }
        : current;
    bucket.count += 1;
    buckets.set(userId, bucket);
    res.setHeader('RateLimit-Limit', String(limit));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, limit - bucket.count)));
    if (bucket.count > limit) {
        return res.status(429).json({
            codigo: 'DETECTOR_LIMITE_EXCEDIDO',
            mensagem: 'Muitas análises foram solicitadas em pouco tempo. Aguarde e tente novamente.'
        });
    }
    return next();
}

function resetDetectorRateLimit() {
    buckets.clear();
}

module.exports = { detectorRateLimit, resetDetectorRateLimit };
