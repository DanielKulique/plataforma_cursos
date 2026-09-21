const crypto = require('crypto');

function normalizarEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function gerarCodigoVerificacao() {
    return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function calcularExpiracaoCodigo(now = Date.now(), env = process.env) {
    const ttlMinutes = Number(env.EMAIL_VERIFICATION_TTL_MINUTES || 10);
    return new Date(now + ttlMinutes * 60 * 1000);
}

function hashIdentidade(email) {
    return crypto.createHash('sha256').update(normalizarEmail(email)).digest('hex');
}

module.exports = {
    calcularExpiracaoCodigo,
    gerarCodigoVerificacao,
    hashIdentidade,
    normalizarEmail
};
