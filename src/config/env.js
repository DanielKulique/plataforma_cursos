const { obterDiretorioMateriais, obterLimitePdfMb } = require('./material-storage');
const {
    obterDiretorioCertificados,
    obterLimiteUploadCertificadoMb
} = require('./certificate-storage');

const { assertDatabaseConnectionEnvironment } = require('./database-connection');
const { buildRuntimeConfig } = require('./runtime-config');

const OBRIGATORIAS = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'DB_ENVIRONMENT_IDENTITY', 'JWT_SECRET'];

function validarAmbiente(env = process.env) {
    buildRuntimeConfig(env);
    assertDatabaseConnectionEnvironment(env);
    const detectorAtivo = String(env.DETECTOR_ENABLED || '').toLowerCase() === 'true';
    const emailAtivo = String(env.EMAIL_DELIVERY_ENABLED || 'true').toLowerCase() !== 'false';
    const obrigatorias = env.NODE_ENV === 'production'
        ? [
            ...OBRIGATORIAS,
            'APP_BASE_URL',
            ...(emailAtivo ? ['RESEND_API_KEY', 'MAIL_FROM'] : []),
            ...(detectorAtivo ? ['IA_ANALISE_URL', 'MOTOR_IA_INTERNAL_API_TOKEN'] : [])
        ]
        : OBRIGATORIAS;
    const ausentes = obrigatorias.filter((nome) => !String(env[nome] || '').trim());
    if (ausentes.length) {
        const erro = new Error(`Variáveis de ambiente obrigatórias ausentes: ${ausentes.join(', ')}`);
        erro.code = 'CONFIGURACAO_INVALIDA';
        throw erro;
    }
    if (env.NODE_ENV === 'production' && String(env.JWT_SECRET).length < 32) {
        throw Object.assign(new Error('JWT_SECRET deve possuir ao menos 32 caracteres em produção.'), { code: 'CONFIGURACAO_INVALIDA' });
    }
    if (env.DETECTOR_ENABLED !== undefined && !['true', 'false'].includes(String(env.DETECTOR_ENABLED).toLowerCase())) {
        throw Object.assign(new Error('DETECTOR_ENABLED deve ser true ou false.'), { code: 'CONFIGURACAO_INVALIDA' });
    }
    if (env.EMAIL_DELIVERY_ENABLED !== undefined
        && !['true', 'false'].includes(String(env.EMAIL_DELIVERY_ENABLED).toLowerCase())) {
        throw Object.assign(new Error('EMAIL_DELIVERY_ENABLED deve ser true ou false.'), { code: 'CONFIGURACAO_INVALIDA' });
    }
    obterLimitePdfMb(env);
    obterDiretorioMateriais(env);
    obterLimiteUploadCertificadoMb(env);
    obterDiretorioCertificados(env);

    const certificateRateWindow = Number(env.CERTIFICATE_RATE_LIMIT_WINDOW_MS || 60000);
    const certificatePublicLimit = Number(env.CERTIFICATE_PUBLIC_RATE_LIMIT_MAX || 30);
    const certificateUploadLimit = Number(env.CERTIFICATE_UPLOAD_RATE_LIMIT_MAX || 10);
    if (!Number.isInteger(certificateRateWindow) || certificateRateWindow < 1000 || certificateRateWindow > 3600000) {
        throw Object.assign(new Error('CERTIFICATE_RATE_LIMIT_WINDOW_MS deve estar entre 1000 e 3600000.'), { code: 'CONFIGURACAO_INVALIDA' });
    }
    if (!Number.isInteger(certificatePublicLimit) || certificatePublicLimit < 1 || certificatePublicLimit > 1000) {
        throw Object.assign(new Error('CERTIFICATE_PUBLIC_RATE_LIMIT_MAX deve estar entre 1 e 1000.'), { code: 'CONFIGURACAO_INVALIDA' });
    }
    if (!Number.isInteger(certificateUploadLimit) || certificateUploadLimit < 1 || certificateUploadLimit > 1000) {
        throw Object.assign(new Error('CERTIFICATE_UPLOAD_RATE_LIMIT_MAX deve estar entre 1 e 1000.'), { code: 'CONFIGURACAO_INVALIDA' });
    }

    const sessionTtl = Number(env.SESSION_TTL_SECONDS || 28800);
    const resetTtl = Number(env.PASSWORD_RESET_TTL_MINUTES || 20);
    const emailVerificationTtl = Number(env.EMAIL_VERIFICATION_TTL_MINUTES || 10);
    const emailProviderTimeout = Number(env.EMAIL_PROVIDER_TIMEOUT_MS || 10000);
    if (!Number.isInteger(sessionTtl) || sessionTtl < 300 || sessionTtl > 604800) {
        throw Object.assign(new Error('SESSION_TTL_SECONDS deve estar entre 300 e 604800.'), { code: 'CONFIGURACAO_INVALIDA' });
    }
    if (!Number.isInteger(resetTtl) || resetTtl < 5 || resetTtl > 60) {
        throw Object.assign(new Error('PASSWORD_RESET_TTL_MINUTES deve estar entre 5 e 60.'), { code: 'CONFIGURACAO_INVALIDA' });
    }
    if (!Number.isInteger(emailVerificationTtl) || emailVerificationTtl < 5 || emailVerificationTtl > 60) {
        throw Object.assign(new Error('EMAIL_VERIFICATION_TTL_MINUTES deve estar entre 5 e 60.'), { code: 'CONFIGURACAO_INVALIDA' });
    }
    if (!Number.isInteger(emailProviderTimeout) || emailProviderTimeout < 1000 || emailProviderTimeout > 60000) {
        throw Object.assign(new Error('EMAIL_PROVIDER_TIMEOUT_MS deve estar entre 1000 e 60000.'), { code: 'CONFIGURACAO_INVALIDA' });
    }

    const emailRateWindow = Number(env.EMAIL_VERIFICATION_RATE_LIMIT_WINDOW_MS || 900000);
    const emailRateLimits = [
        ['EMAIL_CODE_SEND_IP_RATE_LIMIT_MAX', 20],
        ['EMAIL_CODE_SEND_IDENTITY_RATE_LIMIT_MAX', 5],
        ['EMAIL_CODE_VERIFY_IP_RATE_LIMIT_MAX', 60],
        ['EMAIL_CODE_VERIFY_IDENTITY_RATE_LIMIT_MAX', 10]
    ];
    if (!Number.isInteger(emailRateWindow) || emailRateWindow < 1000 || emailRateWindow > 3600000) {
        throw Object.assign(new Error('EMAIL_VERIFICATION_RATE_LIMIT_WINDOW_MS deve estar entre 1000 e 3600000.'), { code: 'CONFIGURACAO_INVALIDA' });
    }
    for (const [name, fallback] of emailRateLimits) {
        const value = Number(env[name] || fallback);
        if (!Number.isInteger(value) || value < 1 || value > 1000) {
            throw Object.assign(new Error(`${name} deve estar entre 1 e 1000.`), { code: 'CONFIGURACAO_INVALIDA' });
        }
    }
    if (env.APP_BASE_URL) {
        let appUrl;
        try {
            appUrl = new URL(String(env.APP_BASE_URL));
        } catch {
            throw Object.assign(new Error('APP_BASE_URL inválida.'), { code: 'CONFIGURACAO_INVALIDA' });
        }
        if (!['http:', 'https:'].includes(appUrl.protocol) || appUrl.username || appUrl.password) {
            throw Object.assign(new Error('APP_BASE_URL inválida.'), { code: 'CONFIGURACAO_INVALIDA' });
        }
        if (env.NODE_ENV === 'production' && appUrl.protocol !== 'https:') {
            throw Object.assign(new Error('APP_BASE_URL deve usar HTTPS em produção.'), { code: 'CONFIGURACAO_INVALIDA' });
        }
    }

    if (detectorAtivo) {
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
        let legacyDetectorUrl;
        try {
            legacyDetectorUrl = new URL(String(env.IA_ANALISE_URL));
        } catch {
            throw Object.assign(new Error('IA_ANALISE_URL inválida.'), { code: 'CONFIGURACAO_INVALIDA' });
        }
        if (!['http:', 'https:'].includes(legacyDetectorUrl.protocol)
            || legacyDetectorUrl.username || legacyDetectorUrl.password) {
            throw Object.assign(new Error('IA_ANALISE_URL usa protocolo ou credenciais não permitidos.'), { code: 'CONFIGURACAO_INVALIDA' });
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
}

module.exports = { validarAmbiente };
