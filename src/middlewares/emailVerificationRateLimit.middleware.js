const { ipKeyGenerator, rateLimit } = require('express-rate-limit');
const { hashIdentidade, normalizarEmail } = require('../utils/identity');

function limiteInteiro(valor, fallback) {
    const numero = Number(valor);
    return Number.isInteger(numero) && numero > 0 ? numero : fallback;
}

function chavePorIdentidade(req) {
    const email = normalizarEmail(req.body?.email);
    if (email) return `email:${hashIdentidade(email)}`;
    return `ip:${ipKeyGenerator(req.ip)}`;
}

function respostaLimite(req, res) {
    return res.status(429).json({
        mensagem: 'Muitas solicitações. Aguarde alguns minutos e tente novamente.'
    });
}

function opcoesComuns(windowMs, limit, keyGenerator) {
    return {
        windowMs,
        limit,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        handler: respostaLimite,
        ...(keyGenerator ? { keyGenerator } : {})
    };
}

function criarLimitadoresVerificacaoEmail(env = process.env) {
    const emTeste = env.NODE_ENV === 'test' || env.JEST_WORKER_ID !== undefined;
    const fallbackTeste = emTeste ? 1000 : null;
    const windowMs = limiteInteiro(env.EMAIL_VERIFICATION_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
    const envioIpMax = limiteInteiro(env.EMAIL_CODE_SEND_IP_RATE_LIMIT_MAX, fallbackTeste || 20);
    const envioIdentidadeMax = limiteInteiro(env.EMAIL_CODE_SEND_IDENTITY_RATE_LIMIT_MAX, fallbackTeste || 5);
    const verificacaoIpMax = limiteInteiro(env.EMAIL_CODE_VERIFY_IP_RATE_LIMIT_MAX, fallbackTeste || 60);
    const verificacaoIdentidadeMax = limiteInteiro(env.EMAIL_CODE_VERIFY_IDENTITY_RATE_LIMIT_MAX, fallbackTeste || 10);

    return {
        envioPorIp: rateLimit(opcoesComuns(windowMs, envioIpMax)),
        envioPorIdentidade: rateLimit(opcoesComuns(windowMs, envioIdentidadeMax, chavePorIdentidade)),
        verificacaoPorIp: rateLimit(opcoesComuns(windowMs, verificacaoIpMax)),
        verificacaoPorIdentidade: rateLimit(opcoesComuns(windowMs, verificacaoIdentidadeMax, chavePorIdentidade))
    };
}

module.exports = { criarLimitadoresVerificacaoEmail };
