const authModel = require('../models/auth.models');
const jwt = require('jsonwebtoken');
const { enviarCodigoVerificacaoEmail } = require('../../services/email.service');

async function login(req, res) {
    const { email, senha } = req.body;

    try {
        const usuario = await authModel.login(email, senha);

        const payload = {
            id_usuario: usuario.id_usuario,
            tipo: usuario.tipo
        }
        const token = jwt.sign(payload, process.env.JWT_SECRET, {
            expiresIn: '8h' // Token válido por 8 horas
        });

        res.status(200).json({
            mensagem: `Bem vindo, ${usuario.nome_completo}`,
            token,
            usuario: {
                id_usuario: usuario.id_usuario,
                nome_completo: usuario.nome_completo,
                email: usuario.email,
                telefone: usuario.telefone,
                tipo: usuario.tipo
            }
        })
    }catch (error) {
        return res.status(error.status || 401).json({ mensagem: error.message });
    }
}

async function enviarCodigoVerificacao(req, res) {
    const { email } = req.body;

    try {
        if (!email) {
            return res.status(400).json({ mensagem: 'E-mail é obrigatório.' });
        }

        const resultado = await authModel.enviarCodigoVerificacaoPorEmail(email);
        const envio = await enviarCodigoVerificacaoEmail({
            to: resultado.email,
            codigo: resultado.codigo,
            expiraEm: resultado.expira_em
        });

        const payload = {
            mensagem: 'Código de verificação gerado com sucesso.',
            email: resultado.email,
            expira_em: resultado.expira_em
        };

        // No modo debug (sem RESEND_API_KEY), mantemos o código para facilitar testes locais.
        if (envio?.modo === 'debug') {
            payload.codigo_debug = resultado.codigo;
            payload.aviso = 'E-mail real não enviado (modo debug). Configure RESEND_API_KEY para envio real.';
        }

        return res.status(200).json(payload);
    } catch (error) {
        return res.status(error.status || 500).json({ mensagem: error.message || 'Erro ao gerar código de verificação.' });
    }
}

async function verificarCodigoEmail(req, res) {
    const { email, codigo } = req.body;

    try {
        if (!email || !codigo) {
            return res.status(400).json({ mensagem: 'E-mail e código são obrigatórios.' });
        }

        const resultado = await authModel.verificarCodigoEmail(email, codigo);

        if (resultado.jaVerificado) {
            return res.status(200).json({ mensagem: 'E-mail já estava verificado.' });
        }

        return res.status(200).json({ mensagem: 'E-mail verificado com sucesso!' });
    } catch (error) {
        return res.status(error.status || 500).json({ mensagem: error.message || 'Erro ao verificar código.' });
    }
}

async function me(req, res) {
    try {
        const usuario = await authModel.buscarUsuarioPorId(req.user.id_usuario);

        return res.status(200).json({
            mensagem: `Bem vindo, ${usuario.nome_completo}`,
            usuario
        });
    } catch (error) {
        if (error.message === 'Usuário não encontrado') {
            return res.status(404).json({ mensagem: error.message });
        }

        return res.status(500).json({
            mensagem: 'Ocorreu um erro no servidor.'
        });
    }
}

module.exports = {
    login,
    me,
    enviarCodigoVerificacao,
    verificarCodigoEmail
};
