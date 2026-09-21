const authModel = require('../models/auth.models');
const logger = require('../../utils/logger');
const { validationResult } = require('express-validator');
const {
    enviarCodigoVerificacaoEmail,
    enviarRecuperacaoSenhaEmail
} = require('../../services/email.service');
const { clearSessionCookie, createSessionToken, setSessionCookie } = require('../../config/session');

async function login(req, res) {
    const { email, senha } = req.body;

    try {
        const usuario = await authModel.login(email, senha);

        const { token, csrfToken } = createSessionToken(usuario);
        setSessionCookie(res, token);

        res.status(200).json({
            mensagem: `Bem vindo, ${usuario.nome_completo}`,
            csrf_token: csrfToken,
            usuario: {
                id_usuario: usuario.id_usuario,
                nome_completo: usuario.nome_completo,
                email: usuario.email,
                telefone: usuario.telefone,
                tipo: usuario.tipo
            }
        })
    } catch (error) {
        if (error.code === 'EMAIL_NAO_VERIFICADO') {
            return res.status(403).json({
                mensagem: 'E-mail ainda não confirmado. Verifique com o código enviado.',
                code: error.code
            });
        }
        if (error.code === 'CREDENCIAIS_INVALIDAS' || error.status === 401) {
            return res.status(401).json({ mensagem: 'Email ou senha inválidos' });
        }
        logger.error('auth.login.falhou', { requestId: req.id, error });
        return res.status(500).json({ mensagem: 'Não foi possível entrar agora.' });
    }
}

async function csrf(req, res) {
    if (!req.auth?.csrf) return res.status(401).json({ mensagem: 'Sessão inválida' });
    return res.status(200).json({ csrf_token: req.auth.csrf });
}

async function logout(req, res) {
    try {
        await authModel.invalidarSessoes(req.user.id_usuario);
        clearSessionCookie(res);
        return res.status(204).end();
    } catch {
        clearSessionCookie(res);
        return res.status(500).json({ mensagem: 'Não foi possível encerrar a sessão.' });
    }
}

async function recuperarSenha(req, res) {
    const validation = validationResult(req);
    if (!validation.isEmpty()) {
        return res.status(400).json({ mensagem: 'Informe um e-mail válido.' });
    }

    const resposta = {
        mensagem: 'Se existir uma conta para este e-mail, enviaremos as instruções de recuperação.'
    };

    try {
        const recuperacao = await authModel.criarTokenRecuperacao(req.body.email);
        if (recuperacao) {
            try {
                await enviarRecuperacaoSenhaEmail({
                    to: recuperacao.email,
                    token: recuperacao.token,
                    expiraEm: recuperacao.expira_em
                });
            } catch (error) {
                logger.error('email.recuperacao.falhou', {
                    requestId: req.id,
                    code: error.code || 'EMAIL_PROVIDER_ERROR'
                });
            }
        }
    } catch (error) {
        logger.error('auth.recuperacao.falhou', { error });
    }

    return res.status(202).json(resposta);
}

async function redefinirSenha(req, res) {
    const validation = validationResult(req);
    if (!validation.isEmpty()) {
        return res.status(400).json({ mensagem: 'Token ou nova senha inválidos.' });
    }

    try {
        await authModel.redefinirSenha(req.body.token, req.body.nova_senha);
        clearSessionCookie(res);
        return res.status(200).json({ mensagem: 'Senha redefinida com sucesso.' });
    } catch (error) {
        const status = error.status && error.status < 500 ? error.status : 500;
        return res.status(status).json({
            mensagem: status < 500
                ? error.message
                : 'Não foi possível redefinir a senha.'
        });
    }
}

async function enviarCodigoVerificacao(req, res) {
    const { email } = req.body;

    try {
        const validation = validationResult(req);
        if (!email || !validation.isEmpty()) {
            return res.status(400).json({ mensagem: 'E-mail é obrigatório.' });
        }

        const resultado = await authModel.enviarCodigoVerificacaoPorEmail(email);
        if (resultado.enviar) {
            try {
                await enviarCodigoVerificacaoEmail({
                    to: resultado.email,
                    codigo: resultado.codigo,
                    expiraEm: resultado.expira_em
                });
            } catch (error) {
                logger.error('email.verificacao.reenvio_falhou', {
                    requestId: req.id,
                    code: error.code || 'EMAIL_PROVIDER_ERROR'
                });
            }
        }

        return res.status(202).json({
            mensagem: 'Se houver uma conta pendente para este e-mail, enviaremos um novo código.'
        });
    } catch (error) {
        logger.error('auth.verificacao.reenvio_falhou', { requestId: req.id, error });
        return res.status(500).json({ mensagem: 'Não foi possível processar a solicitação agora.' });
    }
}

async function verificarCodigoEmail(req, res) {
    const { email, codigo } = req.body;

    try {
        const validation = validationResult(req);
        if (!email || !codigo || !validation.isEmpty()) {
            return res.status(400).json({ mensagem: 'E-mail e código são obrigatórios.' });
        }

        const resultado = await authModel.verificarCodigoEmail(email, codigo);

        if (resultado.jaVerificado) {
            return res.status(200).json({ mensagem: 'E-mail já estava verificado.' });
        }

        return res.status(200).json({ mensagem: 'E-mail verificado com sucesso!' });
    } catch (error) {
        if (error.status && error.status < 500) {
            return res.status(error.status).json({
                mensagem: error.message,
                ...(error.code ? { code: error.code } : {})
            });
        }
        logger.error('auth.verificacao.confirmacao_falhou', { requestId: req.id, error });
        return res.status(500).json({ mensagem: 'Não foi possível verificar o código agora.' });
    }
}

async function me(req, res) {
    if (!req.user) {
        return res.status(401).json({ mensagem: 'Sessão inválida' });
    }

    return res.status(200).json({
        mensagem: `Bem vindo, ${req.user.nome_completo}`,
        usuario: req.user
    });
}

module.exports = {
    login,
    logout,
    csrf,
    recuperarSenha,
    redefinirSenha,
    me,
    enviarCodigoVerificacao,
    verificarCodigoEmail
};
