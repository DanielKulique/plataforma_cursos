const turmaModel = require('../models/turmas.models');
const { validationResult } = require('express-validator');

async function criarTurma(req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const novaTurma = await turmaModel.criarTurma(req.body);
        return res.status(201).json(novaTurma);
    } catch (error) {
        console.error('Erro ao criar turma:', error);
        if (error.errno === 1062 && error.message.includes('nome_turma_UNIQUE')) {
            return res.status(409).json({ message: 'Nome da turma já cadastrado.' });
        }
        return res.status(500).json({ message: 'Ocorreu um erro no servidor ao criar a turma.' });
    }
}

async function atualizarTurma(req, res) {
    const id = req.params.id;
    const dadosParaAtualizar = req.body;

    try {
        if (Object.keys(dadosParaAtualizar).length === 0) {
            return res.status(400).json({ message: 'Nenhum dado para atualizar.' });
        }

        await turmaModel.atualizarTurma(id, dadosParaAtualizar);
        return res.status(200).json({ message: 'Turma atualizada com sucesso.' });
    } catch (error) {
        console.error('Erro ao atualizar turma:', error);
        if (error.message === 'Nenhum campo válido para atualizar.') {
            return res.status(400).json({ message: error.message });
        }
        if (error.message === 'Turma não encontrada para atualizar!') {
            return res.status(404).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Ocorreu um erro no servidor.' });
    }
}

async function buscarTurmaPorId(req, res) {
    const id = req.params.id;
    try {
        const turma = await turmaModel.buscarTurmaPorId(id);
        return res.status(200).json(turma);
    } catch (error) {
        console.error('Erro ao buscar turma:', error);
        if (error.message === 'Turma não encontrada!') {
            return res.status(404).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Ocorreu um erro no servidor.' });
    }
}

async function buscarTodasTurmas(req, res) {
    try {
        const turmas = await turmaModel.buscarTodasTurmas();
        return res.status(200).json(turmas);
    } catch (error) {
        console.error('Erro ao buscar turmas:', error);
        return res.status(500).json({ message: 'Ocorreu um erro no servidor.' });
    }
}

async function buscarTurmasDoProfessor(req, res) {
    const { id } = req.params;

    try {
        // Verificar se o ID do professor na URL corresponde ao usuário logado
        if (parseInt(id) !== req.user.id_usuario) {
            return res.status(403).json({ mensagem: 'Acesso negado. Você só pode consultar suas próprias turmas.' });
        }

        const turmas = await turmaModel.buscarTurmasDoProfessor(id);
        res.status(200).json({ turmas });
    } catch (error) {
        console.error('Erro ao buscar turmas do professor:', error);
        res.status(500).json({ mensagem: error.message });
    }
}

async function deletarTurma(req, res) {
    const id = req.params.id;
    try {
        await turmaModel.deletarTurma(id);
        return res.status(204).send();
    } catch (error) {
        console.error('Erro ao deletar turma:', error);
        if (error.message === 'Turma não encontrada para deletar!') {
            return res.status(404).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Ocorreu um erro no servidor.' });
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