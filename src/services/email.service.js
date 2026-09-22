const { Resend } = require('resend');
const logger = require('../utils/logger');

function emailDeliveryEnabled(env = process.env) {
    return String(env.EMAIL_DELIVERY_ENABLED || 'true').toLowerCase() !== 'false';
}

function publicRegistrationRequiresEmailVerification(env = process.env) {
    return String(env.PUBLIC_REGISTRATION_EMAIL_VERIFICATION_REQUIRED || 'true').toLowerCase() !== 'false';
}

function criarErroEntrega(code = 'EMAIL_PROVIDER_ERROR') {
    const error = new Error('Serviço de e-mail temporariamente indisponível.');
    error.status = 503;
    error.code = code;
    return error;
}

async function enviarPeloResend(payload, operacao) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const timeoutMs = Number(process.env.EMAIL_PROVIDER_TIMEOUT_MS || 10000);
    let timeoutId;

    try {
        const resultado = await Promise.race([
            resend.emails.send(payload),
            new Promise((resolve, reject) => {
                timeoutId = setTimeout(() => reject(criarErroEntrega('EMAIL_PROVIDER_TIMEOUT')), timeoutMs);
            })
        ]);

        if (resultado?.error) {
            logger.error(`${operacao}.falhou`, {
                provider: 'resend',
                reason: resultado.error.name || 'PROVIDER_RESPONSE_ERROR',
                statusCode: resultado.error.statusCode || null
            });
            throw criarErroEntrega();
        }
        if (!resultado?.data?.id) {
            logger.error(`${operacao}.falhou`, {
                provider: 'resend',
                reason: 'INVALID_PROVIDER_RESPONSE'
            });
            throw criarErroEntrega('EMAIL_PROVIDER_INVALID_RESPONSE');
        }

        return { enviado: true, modo: 'resend' };
    } catch (error) {
        if (!String(error.code || '').startsWith('EMAIL_PROVIDER_')) {
            logger.error(`${operacao}.falhou`, {
                provider: 'resend',
                reason: error.code || error.name || 'PROVIDER_EXCEPTION'
            });
        }
        throw String(error.code || '').startsWith('EMAIL_PROVIDER_')
            ? error
            : criarErroEntrega();
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Serviço de envio de e-mail.
 *
 * Comportamento:
 * - Produção (com RESEND_API_KEY): envia e-mail real via Resend.
 * - Desenvolvimento (sem chave): não envia, apenas loga no console.
 */
async function enviarCodigoVerificacaoEmail({ to, codigo }) {
    const apiKey = process.env.RESEND_API_KEY;
    const mailFrom = process.env.MAIL_FROM || 'onboarding@resend.dev';
    const appName = process.env.APP_NAME || 'Plataforma de Cursos';

    const assunto = `${appName} • Código de verificação`;
    const html = `
        <div style="font-family: Arial, sans-serif; line-height: 1.4; color: #111;">
            <h2 style="margin-bottom: 8px;">Confirmação de e-mail</h2>
            <p>Seu código de verificação é:</p>
            <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${codigo}</p>
            <p>Ele expira em aproximadamente 10 minutos.</p>
            <hr style="margin: 16px 0;" />
            <small>Se você não solicitou este código, ignore esta mensagem.</small>
        </div>
    `;

    // Fallback dev: sem API key -> não quebra fluxo local
    if (!emailDeliveryEnabled() || !apiKey) {
        if (process.env.NODE_ENV === 'production') {
            if (!emailDeliveryEnabled()) {
                logger.warn('email.verificacao.nao_enviado', { reason: 'EMAIL_DELIVERY_DISABLED' });
                return { enviado: false, modo: 'disabled' };
            }
            const error = new Error('Serviço de e-mail não configurado.');
            error.status = 503;
            throw error;
        }
        logger.warn('email.verificacao.nao_enviado', { reason: 'RESEND_NOT_CONFIGURED' });
        return { enviado: false, modo: 'debug' };
    }

    return enviarPeloResend({
        from: mailFrom,
        to,
        subject: assunto,
        html
    }, 'email.verificacao');
}

async function enviarRecuperacaoSenhaEmail({ to, token, expiraEm }) {
    const apiKey = process.env.RESEND_API_KEY;
    const mailFrom = process.env.MAIL_FROM || 'onboarding@resend.dev';
    const appName = process.env.APP_NAME || 'Plataforma de Cursos';
    const baseUrl = new URL(process.env.APP_BASE_URL || `http://localhost:${process.env.APP_PORT || 3000}`);
    const recoveryUrl = new URL('/redefinir-senha.html', baseUrl);
    recoveryUrl.hash = `token=${encodeURIComponent(token)}`;

    if (!emailDeliveryEnabled() || !apiKey) {
        if (process.env.NODE_ENV === 'production') {
            if (!emailDeliveryEnabled()) {
                logger.warn('email.recuperacao.nao_enviado', { reason: 'EMAIL_DELIVERY_DISABLED' });
                return { enviado: false, modo: 'disabled' };
            }
            const error = new Error('Serviço de e-mail não configurado.');
            error.status = 503;
            throw error;
        }
        logger.warn('email.recuperacao.nao_enviado', { reason: 'RESEND_NOT_CONFIGURED' });
        return { enviado: false, modo: 'debug' };
    }

    const envio = await enviarPeloResend({
        from: mailFrom,
        to,
        subject: `${appName} • Redefinição de senha`,
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111;">
                <h2>Redefinição de senha</h2>
                <p>Recebemos uma solicitação para redefinir sua senha.</p>
                <p><a href="${recoveryUrl.toString()}">Criar uma nova senha</a></p>
                <p>O link expira em ${Number(process.env.PASSWORD_RESET_TTL_MINUTES || 20)} minutos e só pode ser usado uma vez.</p>
                <p>Se você não fez esta solicitação, ignore esta mensagem.</p>
            </div>
        `
    }, 'email.recuperacao');
    return { ...envio, expira_em: expiraEm };
}

module.exports = {
    emailDeliveryEnabled,
    publicRegistrationRequiresEmailVerification,
    enviarPeloResend,
    enviarCodigoVerificacaoEmail,
    enviarRecuperacaoSenhaEmail
};
