const { Resend } = require('resend');

/**
 * Serviço de envio de e-mail.
 *
 * Comportamento:
 * - Produção (com RESEND_API_KEY): envia e-mail real via Resend.
 * - Desenvolvimento (sem chave): não envia, apenas loga no console.
 */
async function enviarCodigoVerificacaoEmail({ to, codigo, expiraEm }) {
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
    if (!apiKey) {
        console.warn('[email.service] RESEND_API_KEY não configurada. E-mail real não enviado.');
        console.info(`[email.service] DEBUG código para ${to}: ${codigo} (expira em ${expiraEm})`);
        return { enviado: false, modo: 'debug' };
    }

    const resend = new Resend(apiKey);

    await resend.emails.send({
        from: mailFrom,
        to,
        subject: assunto,
        html
    });

    return { enviado: true, modo: 'resend' };
}

module.exports = {
    enviarCodigoVerificacaoEmail
};
