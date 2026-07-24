const cursosModel = require('../models/cursos.models');
const { validationResult } = require('express-validator');
const logger = require('../../utils/logger');

function responderValidacao(req, res) {
    const errors = validationResult(req);
    if (errors.isEmpty()) return false;
    res.status(400).json({ message: errors.array()[0]?.msg || 'Dados inválidos.', errors: errors.array() });
    return true;
}

function responderErro(res, error, mensagemPadrao) {
    if (error?.status) {
        return res.status(error.status).json({ message: error.message, code: error.code });
    }
    return res.status(500).json({ message: mensagemPadrao });
}

async function listarTodos(req, res) {
    try {
        const cursos = await cursosModel.buscarCursos();
        logger.info('curso.lista.consultada', { requestId: req.id, total: cursos.length });
        return res.status(200).json(cursos);
    } catch (error) {
        logger.error('curso.lista.falhou', { requestId: req.id, error });
        return res.status(500).json({ message: 'Ocorreu um erro no servidor.' });
    }
}

async function listarCursoPorId(req, res) {
    if (responderValidacao(req, res)) return;
    try {
        const curso = await cursosModel.buscarCursoPorId(req.params.id);
        logger.info('curso.consultado', { requestId: req.id, courseId: Number(req.params.id) });
        return res.status(200).json(curso);
    } catch (error) {
        logger.error('curso.consulta.falhou', { requestId: req.id, courseId: Number(req.params.id), error });
        return responderErro(res, error, 'Ocorreu um erro no servidor.');
    }
}

async function criarCurso(req, res) {
    if (responderValidacao(req, res)) return;
    try {
        const novoCurso = await cursosModel.criarCurso(req.body);
        logger.info('curso.criado', { requestId: req.id, actorId: req.user?.id_usuario, courseId: novoCurso.id_curso });
        return res.status(201).json(novoCurso);
    } catch (error) {
        logger.error('curso.criacao.falhou', { requestId: req.id, actorId: req.user?.id_usuario, error });
        return responderErro(res, error, 'Ocorreu um erro no servidor ao criar curso.');
    }
}

async function atualizarCurso(req, res) {
    if (responderValidacao(req, res)) return;
    try {
        const curso = await cursosModel.atualizarCurso(req.params.id, req.body);
        logger.info('curso.atualizado', { requestId: req.id, actorId: req.user?.id_usuario, courseId: Number(req.params.id) });
        return res.status(200).json(curso);
    } catch (error) {
        logger.error('curso.atualizacao.falhou', { requestId: req.id, courseId: Number(req.params.id), error });
        return responderErro(res, error, 'Ocorreu um erro no servidor ao atualizar curso.');
    }
}

async function deletarCurso(req, res) {
    if (responderValidacao(req, res)) return;
    try {
        await cursosModel.deletarCurso(req.params.id);
        logger.info('curso.removido', { requestId: req.id, actorId: req.user?.id_usuario, courseId: Number(req.params.id) });
        return res.status(204).send();
    } catch (error) {
        logger.error('curso.remocao.falhou', { requestId: req.id, courseId: Number(req.params.id), error });
        return responderErro(res, error, 'Ocorreu um erro no servidor ao deletar curso.');
    }
}

module.exports = {
    listarTodos,
    listarCursoPorId,
    criarCurso,
    atualizarCurso,
    deletarCurso
};
