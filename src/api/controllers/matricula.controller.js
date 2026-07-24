const matriculaModel = require('../models/matricula.models');
const { validationResult } = require('express-validator');
const logger = require('../../utils/logger');

// Criar nova matrícula (aluno entra em nova turma)
async function criarMatricula(req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { id_turma } = req.body;
        const id_aluno = req.user.id_usuario;

        const novaMatricula = await matriculaModel.matricularAluno(id_aluno, id_turma);

        return res.status(novaMatricula.reativada ? 200 : 201).json({
            message: novaMatricula.reativada
                ? 'Matrícula reativada com sucesso! Nota e progresso foram reiniciados.'
                : 'Matrícula realizada com sucesso!',
            matricula: novaMatricula
        });
    } catch (error) {
        if (error.status && error.status < 500) {
            return res.status(error.status).json({ message: error.message, code: error.code });
        }
        logger.error('matricula.criacao.falhou', { requestId: req.id, actorId: req.user?.id_usuario, error });
        return res.status(500).json({
            message: 'Ocorreu um erro no servidor ao criar a matrícula.'
        });
    }
}

async function buscarMatriculasDoAluno(req, res) {
    const id_aluno = req.params.id;

    try {
        const matriculas = await matriculaModel.buscarMatriculaPorAluno(id_aluno);

        return res.status(200).json(matriculas);
    } catch (error) {
        logger.error('matricula.aluno_lista.falhou', { requestId: req.id, actorId: req.user?.id_usuario, error });
        return res.status(500).json({
            message: 'Ocorreu um erro no servidor.'
        });
    }
}

async function buscarMinhaSalaVirtual(req, res) {
    const id_aluno = req.user.id_usuario;

    try {
        const salas = await matriculaModel.buscarSalaVirtualDoAluno(id_aluno);

        return res.status(200).json({
            total: salas.length,
            turmas: salas
        });
    } catch (error) {
        logger.error('matricula.sala_virtual.falhou', { requestId: req.id, actorId: req.user?.id_usuario, error });
        return res.status(500).json({
            message: 'Ocorreu um erro no servidor.'
        });
    }
}

// Buscar todas as matrículas de uma turma (para professores/admin)
async function buscarMatriculasDaTurma(req, res) {
    const id_turma = req.params.id_turma;

    try {
        // O middleware checkProfessorTurmaPermission já garantiu que o professor
        // tem permissão para acessar esta turma
        if (!await matriculaModel.turmaExiste(id_turma)) {
            return res.status(404).json({ message: 'Turma não encontrada.' });
        }
        const matriculas = await matriculaModel.buscarMatriculaPorTurma(id_turma);

        return res.status(200).json({ matriculas });
    } catch (error) {
        logger.error('matricula.turma_lista.falhou', { requestId: req.id, actorId: req.user?.id_usuario, error });
        return res.status(500).json({
            message: 'Ocorreu um erro no servidor.'
        });
    }
}

// Buscar matrícula específica por ID
async function buscarMatriculaPorId(req, res) {
    const id = req.params.id;

    try {
        const matricula = await matriculaModel.buscarMatriculaPorId(id);
        return res.status(200).json(matricula);
    } catch (error) {
        logger.error('matricula.consulta.falhou', { requestId: req.id, actorId: req.user?.id_usuario, error });
        if (error.message === 'Matrícula não encontrada!') {
            return res.status(404).json({ message: error.message });
        }
        return res.status(500).json({
            message: 'Ocorreu um erro no servidor.'
        });
    }
}

// Atualizar matrícula (nota final, status) - Professor/Admin
async function atualizarMatricula(req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const id = req.params.id;
    const dadosParaAtualizar = req.body;

    try {
        if (Object.keys(dadosParaAtualizar).length === 0) {
            return res.status(400).json({
                message: 'Nenhum dado para atualizar.'
            });
        }

        await matriculaModel.atualizarMatricula(id, dadosParaAtualizar);

        return res.status(200).json({
            message: 'Matrícula atualizada com sucesso!'
        });
    } catch (error) {
        logger.error('matricula.atualizacao.falhou', { requestId: req.id, actorId: req.user?.id_usuario, error });
        if (error.message === 'Nenhum campo válido para atualizar.') {
            return res.status(400).json({ message: error.message });
        }
        if (error.message === 'Matrícula não encontrada para atualizar!') {
            return res.status(404).json({ message: error.message });
        }
        return res.status(500).json({
            message: 'Ocorreu um erro no servidor.'
        });
    }
}

// Cancelar matrícula - Aluno ou Admin
async function cancelarMatricula(req, res) {
    const id = req.params.id;

    try {
        await matriculaModel.cancelarMatricula(id);

        return res.status(200).json({
            message: 'Matrícula cancelada com sucesso!'
        });
    } catch (error) {
        logger.error('matricula.cancelamento.falhou', { requestId: req.id, actorId: req.user?.id_usuario, error });
        if (
            error.message === 'Matrícula não encontrada para cancelar!' ||
            error.message === 'Matrícula não encontrada!'
        ) {
            return res.status(404).json({
                message: 'Matrícula não encontrada.'
            });
        }
        return res.status(500).json({
            message: 'Ocorreu um erro no servidor.'
        });
    }
}

module.exports = {
    criarMatricula,
    buscarMatriculasDoAluno,
    buscarMinhaSalaVirtual,
    buscarMatriculasDaTurma,
    buscarMatriculaPorId,
    atualizarMatricula,
    cancelarMatricula
};
