const usuariosModel = require('../models/usuarios.models');
const { validationResult } = require('express-validator');
const logger = require('../../utils/logger');
const { clearSessionCookie } = require('../../config/session');
const {
    emailDeliveryEnabled,
    publicRegistrationRequiresEmailVerification,
    enviarCodigoVerificacaoEmail
} = require('../../services/email.service');
const { sendHttpError } = require('../../utils/http-response');
const { paginated, parsePagination } = require('../../utils/pagination');

function responderValidacao(req, res) {
    const errors = validationResult(req);
    if (errors.isEmpty()) return false;

    res.status(400).json({
        message: errors.array()[0]?.msg || 'Dados inválidos.',
        errors: errors.array()
    });
    return true;
}

function responderErro(res, error, mensagemPadrao) {
    return sendHttpError(res, error, { internalMessage: mensagemPadrao, legacyKey: 'message' });
}

async function criarUsuario(req, res) {
    if (responderValidacao(req, res)) return;

    const exigeVerificacaoEmail = publicRegistrationRequiresEmailVerification();
    if (exigeVerificacaoEmail && !emailDeliveryEnabled()) {
        logger.warn('usuario.publico.indisponivel', {
            requestId: req.id,
            reason: 'EMAIL_DELIVERY_DISABLED'
        });
        return res.status(503).json({
            error: 'Cadastro temporariamente indisponível.',
            message: 'Cadastro temporariamente indisponível.'
        });
    }

    try {
        const cadastro = exigeVerificacaoEmail
            ? await usuariosModel.criarAlunoComVerificacao(req.body)
            : await usuariosModel.criarAlunoComVerificacao(req.body, true);
        const novoUsuario = cadastro.usuario;

        if (!exigeVerificacaoEmail) {
            logger.info('usuario.publico.criado_sem_verificacao_email', {
                requestId: req.id,
                userId: novoUsuario.id_usuario
            });
            return res.status(201).json({
                ...novoUsuario,
                mensagem: 'Cadastro realizado. Sua conta já está pronta para entrar.',
                verificacao: {
                    estado: 'VERIFICADO',
                    email_enviado: false,
                    expira_em: null
                }
            });
        }

        let emailEnviado = false;

        try {
            const envio = await enviarCodigoVerificacaoEmail({
                to: novoUsuario.email,
                codigo: cadastro.verificacao.codigo,
                expiraEm: cadastro.verificacao.expira_em
            });
            emailEnviado = envio?.enviado === true;
        } catch (error) {
            logger.error('usuario.publico.email_verificacao.falhou', {
                requestId: req.id,
                userId: novoUsuario.id_usuario,
                code: error.code || 'EMAIL_PROVIDER_ERROR'
            });
        }

        logger.info('usuario.publico.criado', {
            requestId: req.id,
            userId: novoUsuario.id_usuario,
            emailEnviado
        });
        return res.status(201).json({
            ...novoUsuario,
            mensagem: emailEnviado
                ? 'Cadastro realizado. Enviamos o código de verificação por e-mail.'
                : 'Cadastro realizado, mas não foi possível confirmar o envio do código. Solicite um novo envio.',
            verificacao: {
                estado: 'PENDENTE',
                email_enviado: emailEnviado,
                expira_em: cadastro.verificacao.expira_em
            }
        });
    } catch (error) {
        logger.error('usuario.publico.falhou', { requestId: req.id, error });
        return responderErro(res, error, 'Ocorreu um erro no servidor ao criar o usuário.');
    }
}

function statusCadastro(_req, res) {
    const exigeVerificacaoEmail = publicRegistrationRequiresEmailVerification();
    const disponivel = !exigeVerificacaoEmail || emailDeliveryEnabled();
    return res.status(200).json({
        disponivel,
        ...(disponivel ? {} : { mensagem: 'Novos cadastros estão temporariamente indisponíveis.' })
    });
}

async function atualizarUsuario(req, res) {
    if (responderValidacao(req, res)) return;

    try {
        if (Object.keys(req.body).length === 0) {
            return res.status(400).json({ message: 'Nenhum dado para atualizar.' });
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'senha') || Object.prototype.hasOwnProperty.call(req.body, 'tipo')) {
            return res.status(400).json({ message: 'Senha e papel não podem ser alterados por este endpoint.' });
        }

        const usuario = await usuariosModel.atualizarUsuario(req.params.id, req.body);
        logger.info('usuario.atualizado', { requestId: req.id, userId: Number(req.params.id) });
        return res.status(200).json({ message: 'Usuário atualizado com sucesso.', ...usuario });
    } catch (error) {
        logger.error('usuario.atualizacao.falhou', { requestId: req.id, userId: Number(req.params.id), error });
        return responderErro(res, error, 'Ocorreu um erro no servidor.');
    }
}

async function atualizarUsuarioAdmin(req, res) {
    if (responderValidacao(req, res)) return;

    try {
        if (Object.keys(req.body).length === 0) {
            return res.status(400).json({ message: 'Nenhum dado para atualizar.' });
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'senha')) {
            return res.status(400).json({ message: 'Senha não pode ser alterada pelo PATCH administrativo.' });
        }

        const usuario = await usuariosModel.atualizarUsuarioAdmin(req.params.id, req.body);
        logger.info('usuario.admin.atualizado', {
            requestId: req.id,
            actorId: req.user?.id_usuario,
            userId: Number(req.params.id)
        });
        return res.status(200).json({ message: 'Usuário atualizado com sucesso.', ...usuario });
    } catch (error) {
        logger.error('usuario.admin.atualizacao.falhou', {
            requestId: req.id,
            actorId: req.user?.id_usuario,
            userId: Number(req.params.id),
            error
        });
        return responderErro(res, error, 'Ocorreu um erro no servidor.');
    }
}

async function alterarSenha(req, res) {
    if (responderValidacao(req, res)) return;

    try {
        await usuariosModel.alterarSenha(
            req.params.id,
            req.user?.id_usuario,
            req.body.senha_atual,
            req.body.nova_senha
        );
        clearSessionCookie(res);
        logger.info('usuario.senha.alterada', { requestId: req.id, userId: req.user?.id_usuario });
        return res.status(200).json({ message: 'Senha alterada com sucesso. Entre novamente.' });
    } catch (error) {
        logger.error('usuario.senha.alteracao.falhou', {
            requestId: req.id,
            actorId: req.user?.id_usuario,
            targetId: Number(req.params.id),
            error
        });
        return responderErro(res, error, 'Ocorreu um erro no servidor ao alterar a senha.');
    }
}

async function buscarUsuarioPorId(req, res) {
    if (responderValidacao(req, res)) return;

    try {
        const usuario = await usuariosModel.buscarUsuarioPorId(req.params.id);
        logger.info('usuario.consultado', { requestId: req.id, userId: Number(req.params.id) });
        return res.status(200).json(usuario);
    } catch (error) {
        logger.error('usuario.consulta.falhou', { requestId: req.id, userId: Number(req.params.id), error });
        return responderErro(res, error, 'Ocorreu um erro no servidor.');
    }
}

async function buscarTodosUsuarios(req, res) {
    try {
        const pagination = parsePagination(req.query);
        const usuarios = await usuariosModel.buscarTodosUsuarios(pagination);
        logger.info('usuario.lista.consultada', { requestId: req.id, total: usuarios.total });
        return res.status(200).json(paginated(usuarios.items, usuarios.total, pagination));
    } catch (error) {
        logger.error('usuario.lista.falhou', { requestId: req.id, error });
        if (error.status === 400) return responderErro(res, error, error.message);
        return res.status(500).json({ message: 'Ocorreu um erro no servidor.' });
    }
}

async function deletarUsuario(req, res) {
    if (responderValidacao(req, res)) return;

    try {
        await usuariosModel.deletarUsuario(req.params.id, req.user?.id_usuario);
        logger.info('usuario.removido', {
            requestId: req.id,
            actorId: req.user?.id_usuario,
            userId: Number(req.params.id)
        });
        return res.status(204).send();
    } catch (error) {
        logger.error('usuario.remocao.falhou', {
            requestId: req.id,
            actorId: req.user?.id_usuario,
            userId: Number(req.params.id),
            error
        });
        return responderErro(res, error, 'Ocorreu um erro no servidor.');
    }
}

async function verificarDisponibilidadeCadastro(req, res) {
    if (responderValidacao(req, res)) return;

    try {
        const resultado = await usuariosModel.verificarDisponibilidade(req.body.email, req.body.cpf);
        return res.status(200).json(resultado);
    } catch (error) {
        logger.error('usuario.disponibilidade.falhou', { requestId: req.id, error });
        return res.status(500).json({ message: 'Ocorreu um erro no servidor ao verificar disponibilidade.' });
    }
}

async function criarUsuarioAdmin(req, res) {
    if (responderValidacao(req, res)) return;

    try {
        const cadastro = await usuariosModel.criarUsuarioAdministrativo(req.body);
        const novoUsuario = cadastro.usuario;
        logger.info('usuario.admin.criado', {
            requestId: req.id,
            actorId: req.user?.id_usuario,
            userId: novoUsuario.id_usuario
        });
        return res.status(201).json(novoUsuario);
    } catch (error) {
        logger.error('usuario.admin.criacao.falhou', { requestId: req.id, actorId: req.user?.id_usuario, error });
        return responderErro(res, error, 'Ocorreu um erro no servidor ao criar o usuário.');
    }
}

module.exports = {
    statusCadastro,
    criarUsuario,
    criarUsuarioAdmin,
    atualizarUsuario,
    atualizarUsuarioAdmin,
    alterarSenha,
    buscarUsuarioPorId,
    buscarTodosUsuarios,
    deletarUsuario,
    verificarDisponibilidadeCadastro
};
