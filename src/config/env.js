const OBRIGATORIAS = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'JWT_SECRET'];

function validarAmbiente(env = process.env) {
    const ausentes = OBRIGATORIAS.filter((nome) => !String(env[nome] || '').trim());
    if (ausentes.length) {
        const erro = new Error(`Variáveis de ambiente obrigatórias ausentes: ${ausentes.join(', ')}`);
        erro.code = 'CONFIGURACAO_INVALIDA';
        throw erro;
    }
    const detectorUrl = String(env.DETECTOR_API_URL || 'http://127.0.0.1:8000').trim();
    let parsed;
    try {
        parsed = new URL(detectorUrl);
    } catch {
        throw Object.assign(new Error('DETECTOR_API_URL inválida.'), { code: 'CONFIGURACAO_INVALIDA' });
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
        throw Object.assign(new Error('DETECTOR_API_URL usa protocolo ou credenciais não permitidos.'), { code: 'CONFIGURACAO_INVALIDA' });
    }
    const detectorTimeout = Number(env.DETECTOR_API_TIMEOUT_MS || 15000);
    if (!Number.isInteger(detectorTimeout) || detectorTimeout < 1000 || detectorTimeout > 60000) {
        throw Object.assign(new Error('DETECTOR_API_TIMEOUT_MS deve estar entre 1000 e 60000.'), { code: 'CONFIGURACAO_INVALIDA' });
    }
    for (const [name, fallback] of [
        ['DETECTOR_API_TIMEOUT_INCREMENTAL_MS', 8000],
        ['DETECTOR_API_TIMEOUT_COMPLETE_MS', detectorTimeout]
    ]) {
        const value = Number(env[name] || fallback);
        if (!Number.isInteger(value) || value < 1000 || value > 60000) {
            throw Object.assign(new Error(`${name} deve estar entre 1000 e 60000.`), { code: 'CONFIGURACAO_INVALIDA' });
        }
    }
    const detectorLimit = Number(env.DETECTOR_RATE_LIMIT_MAX || 60);
    const detectorWindow = Number(env.DETECTOR_RATE_LIMIT_WINDOW_MS || 60000);
    if (!Number.isInteger(detectorLimit) || detectorLimit < 1 || detectorLimit > 100) {
        throw Object.assign(new Error('DETECTOR_RATE_LIMIT_MAX deve estar entre 1 e 100.'), { code: 'CONFIGURACAO_INVALIDA' });
    }
    if (!Number.isInteger(detectorWindow) || detectorWindow < 1000 || detectorWindow > 3600000) {
        throw Object.assign(new Error('DETECTOR_RATE_LIMIT_WINDOW_MS deve estar entre 1000 e 3600000.'), { code: 'CONFIGURACAO_INVALIDA' });
    }
}

module.exports = { validarAmbiente };
