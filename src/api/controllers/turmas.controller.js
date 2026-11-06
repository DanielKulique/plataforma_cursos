const turmaModel = require('../models/turmas.models');
const turmaReplicationService = require('../services/turma-replication.service');
const { validationResult } = require('express-validator');
const logger = require('../../utils/logger');
const { sendHttpError } = require('../../utils/http-response');
const { paginated, parsePagination } = require('../../utils/pagination');
const { parseListFilters } = require('../../utils/list-filters');

function responderValidacao(req, res) {
    const errors = validationResult(req);
    if (errors.isEmpty()) return false;
    res.status(400).json({ message: errors.array()[0]?.msg || 'Dados inválidos.', errors: errors.array() });
    return true;
}

function responderErro(res, error, mensagemPadrao) {
    return sendHttpError(res, error, { internalMessage: mensagemPadrao, legacyKey: 'message' });
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
        const pagination = parsePagination(req.query);
        const filters = parseListFilters(req.query, { status: ['ABERTA', 'FECHADA', 'ENCERRADA'] });
        const turmas = await turmaModel.buscarTodasTurmas({ ...pagination, ...filters });
        return res.status(200).json(paginated(turmas.items, turmas.total, pagination));
    } catch (error) {
        logger.error('turma.lista.falhou', { requestId: req.id, error });
        if (error.status === 400) return responderErro(res, error, error.message);
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

async function buscarResumoReplicacao(req, res) {
    if (responderValidacao(req, res)) return;
    try {
        const resumo = await turmaReplicationService.buscarResumo(req.params.id);
        return res.status(200).json(resumo);
    } catch (error) {
        logger.error('turma.replicacao_resumo.falhou', {
            requestId: req.id,
            actorId: req.user?.id_usuario,
            classId: Number(req.params.id),
            error
        });
        return responderErro(res, error, 'Não foi possível consultar a estrutura da turma.');
    }
}

async function replicarTurma(req, res) {
    if (responderValidacao(req, res)) return;
    try {
        const resultado = await turmaReplicationService.replicarTurma(req.params.id, req.body, {
            id_usuario_admin: req.user.id_usuario,
            chave_idempotencia: req.get('Idempotency-Key')
        });
        logger.info('turma.replicada', {
            requestId: req.id,
            actorId: req.user?.id_usuario,
            sourceClassId: Number(req.params.id),
            classId: resultado.turma.id_turma,
            reused: resultado.reutilizada
        });
        return res.status(resultado.reutilizada ? 200 : 201).json({
            message: 'Turma replicada com sucesso.',
            ...resultado
        });
    } catch (error) {
        logger.error('turma.replicacao.falhou', {
            requestId: req.id,
            actorId: req.user?.id_usuario,
            sourceClassId: Number(req.params.id),
            error
        });
        return responderErro(res, error, 'Ocorreu um erro no servidor ao replicar a turma.');
    }
}

module.exports = {
    criarTurma,
    atualizarTurma,
    buscarTurmaPorId,
    buscarTodasTurmas,
    buscarTurmasDoProfessor,
    deletarTurma,
    buscarResumoReplicacao,
    replicarTurma
};
