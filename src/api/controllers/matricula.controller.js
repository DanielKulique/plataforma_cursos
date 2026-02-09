const matriculaModel = require('../models/matricula.models');
const { validationResult } = require('express-validator');

//criar nova matricula (aluno entra em nova turma)
async function criarMatricula(req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { id_turma } = req.body;
        const id_aluno = req.user.id_usuario;

        const jaMatriculado = await matriculaModel.verificarMatriculaDuplicada(id_aluno, id_turma);
        if (jaMatriculado) {
            return res.status(409).json({
                message: 'VocÃª jÃ¡ estÃ¡ matriculado nesta turma!'
            });
        }

        const novaMatricula = await matriculaModel.criarMatricula({
            id_aluno,
            id_turma
        });

        res.status(201).json({
            message: 'MatrÃ­cula realizada com sucesso!',
            matricula: novaMatricula
        });
        console.log("MatrÃ­cula criada: ", novaMatricula);
    } catch (error) {
        console.error("Erro ao criar matrÃ­cula:", error);
        res.status(500).json({
            message: "Ocorreu um erro no servidor ao criar a matrÃ­cula."
        });
    }
}

async function buscarMatriculasDoAluno(req, res) {
    const id_aluno = req.params.id;

    try {
        const matriculas = await matriculaModel.buscarMatriculaPorAluno(id_aluno);

        if (matriculas.length === 0) {
            return res.status(404).json({
                message: 'Nenhuma matrÃ­cula encontrada para este aluno.'
            });
        }

        res.status(200).json(matriculas);
        console.log("MatrÃ­culas do aluno encontradas: ", matriculas.length);
    } catch (error) {
        console.error("Erro ao buscar matrÃ­culas do aluno: ", error);
        res.status(500).json({
            message: "Ocorreu um erro no servidor."
        });
    }
}

// Buscar todas as matrÃ­culas de uma turma (para professores/admin)
async function buscarMatriculasDaTurma(req, res) {
    const id_turma = req.params.id_turma;

    try {
        const matriculas = await matriculaModel.buscarMatriculaPorTurma(id_turma);

        if (matriculas.length === 0) {
            return res.status(404).json({
                message: 'Nenhuma matrÃ­cula encontrada para esta turma.'
            });
        }

        res.status(200).json(matriculas);
        console.log("MatrÃ­culas da turma encontradas:", matriculas.length);
    } catch (error) {
        console.error("Erro ao buscar matrÃ­culas da turma:", error);
        res.status(500).json({
            message: "Ocorreu um erro no servidor."
        });
    }
}

// Buscar matrÃ­cula especÃ­fica por ID
async function buscarMatriculaPorId(req, res) {
    const id = req.params.id;

    try {
        const matricula = await matriculaModel.buscarMatriculaPorId(id);
        res.status(200).json(matricula);
        console.log("MatrÃ­cula encontrada:", matricula);
    } catch (error) {
        console.error("Erro ao buscar matrÃ­cula:", error);
        if (error.message === 'MatrÃ­cula nÃ£o encontrada!') {
            return res.status(404).json({ message: error.message });
        }
        res.status(500).json({
            message: "Ocorreu um erro no servidor."
        });
    }
}

// Atualizar matrÃ­cula (nota final, status) - Professor/Admin
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

        res.status(200).json({
            message: 'MatrÃ­cula atualizada com sucesso!'
        });
        console.log("MatrÃ­cula atualizada:", id);
    } catch (error) {
        console.error("Erro ao atualizar matrÃ­cula:", error);
        if (error.message === 'Nenhum campo válido para atualizar.') {
            return res.status(400).json({ message: error.message });
        }
        if (error.message === 'MatrÃ­cula nÃ£o encontrada para atualizar!') {
            return res.status(404).json({ message: error.message });
        }
        return res.status(500).json({
            message: "Ocorreu um erro no servidor."
        });
    }
}

// Cancelar matrÃ­cula - Aluno ou Admin
async function cancelarMatricula(req, res) {
    const id = req.params.id;

    try {
        const matricula = await matriculaModel.buscarMatriculaPorId(id);

        if (req.user.tipo !== 'ADMIN' && matricula.id_aluno !== req.user.id_usuario) {
            return res.status(403).json({
                message: 'VocÃª nÃ£o tem permissÃ£o para cancelar esta matrÃ­cula.'
            });
        }

        await matriculaModel.cancelarMatricula(id);

        res.status(200).json({
            message: 'MatrÃ­cula cancelada com sucesso!'
        });
        console.log("MatrÃ­cula cancelada:", id);
    } catch (error) {
        console.error("Erro ao cancelar matrÃ­cula:", error);
        if (
            error.message === 'MatrÃ­cula nÃ£o encontrada para cancelar!' ||
            error.message === 'MatrÃ­cula nÃ£o encontrada!'
        ) {
            return res.status(404).json({
                message: 'MatrÃ­cula nÃ£o encontrada.'
            });
        }
        res.status(500).json({
            message: "Ocorreu um erro no servidor."
        });
    }
}

module.exports = {
    criarMatricula,
    buscarMatriculasDoAluno,
    buscarMatriculasDaTurma,
    buscarMatriculaPorId,
    atualizarMatricula,
    cancelarMatricula
};
