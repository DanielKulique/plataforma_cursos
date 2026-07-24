const turmaModel = require('../models/turmas.models');
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

async function criarTurma(req, res) {
    if (responderValidacao(req, res)) return;
    try {
        const novaTurma = await turmaModel.criarTurma(req.body);
        logger.info('turma.criada', { requestId: req.id, actorId: req.user?.id_usuario, classId: novaTurma.id_turma });
        return res.status(201).json(novaTurma);
    } catch (error) {
        logger.error('turma.criacao.falhou', { requestId: req.id, actorId: req.user?.id_usuario, error });
        return responderErro(res, error, 'Ocorreu um erro no servidor ao criar a turma.');
    }
}

async function atualizarTurma(req, res) {
    if (responderValidacao(req, res)) return;
    if (Object.keys(req.body).length === 0) {
        return res.status(400).json({ message: 'Nenhum dado para atualizar.' });
    }
    try {
        const turma = await turmaModel.atualizarTurma(req.params.id, req.body);
        logger.info('turma.atualizada', { requestId: req.id, actorId: req.user?.id_usuario, classId: Number(req.params.id) });
        return res.status(200).json({ message: 'Turma atualizada com sucesso.', ...turma });
    } catch (error) {
        logger.error('turma.atualizacao.falhou', { requestId: req.id, classId: Number(req.params.id), error });
        return responderErro(res, error, 'Ocorreu um erro no servidor.');
    }
}

async function buscarTurmaPorId(req, res) {
    if (responderValidacao(req, res)) return;
    try {
        const turma = await turmaModel.buscarTurmaPorId(req.params.id);
        return res.status(200).json(turma);
    } catch (error) {
        logger.error('turma.consulta.falhou', { requestId: req.id, classId: Number(req.params.id), error });
        return responderErro(res, error, 'Ocorreu um erro no servidor.');
    }
}

async function buscarTodasTurmas(req, res) {
    try {
        const turmas = await turmaModel.buscarTodasTurmas();
        return res.status(200).json(turmas);
    } catch (error) {
        logger.error('turma.lista.falhou', { requestId: req.id, error });
        return res.status(500).json({ message: 'Ocorreu um erro no servidor.' });
    }
}

async function buscarTurmasDoProfessor(req, res) {
    if (responderValidacao(req, res)) return;
    try {
        if (Number(req.params.id) !== req.user.id_usuario) {
            return res.status(403).json({ mensagem: 'Acesso negado. Você só pode consultar suas próprias turmas.' });
        }
        const turmas = await turmaModel.buscarTurmasDoProfessor(req.params.id);
        return res.status(200).json({ turmas });
    } catch (error) {
        logger.error('turma.professor_lista.falhou', { requestId: req.id, actorId: req.user?.id_usuario, error });
        return res.status(500).json({ mensagem: 'Ocorreu um erro no servidor.' });
    }
}

async function deletarTurma(req, res) {
    if (responderValidacao(req, res)) return;
    try {
        await turmaModel.deletarTurma(req.params.id);
        logger.info('turma.removida', { requestId: req.id, actorId: req.user?.id_usuario, classId: Number(req.params.id) });
        return res.status(204).send();
    } catch (error) {
        logger.error('turma.remocao.falhou', { requestId: req.id, classId: Number(req.params.id), error });
        return responderErro(res, error, 'Ocorreu um erro no servidor.');
    }
}

module.exports = {
    criarTurma,
    atualizarTurma,
    buscarTurmaPorId,
    buscarTodasTurmas,
    buscarTurmasDoProfessor,
    deletarTurma
};
