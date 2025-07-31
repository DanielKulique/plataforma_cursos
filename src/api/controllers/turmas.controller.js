const turmaModel = require('../models/turmas.models');
const { validationResult } = require('express-validator');

async function criarTurma(req, res) {
    const errors = validationResult(req);
    if(!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    try {
        const novaTurma = await turmaModel.criarTurma(req.body);
        res.status(201).json(novaTurma);
        console.log("Turma criada com sucesso:", novaTurma);
    } catch (error) {
        console.error("Erro ao criar turma:", error);
        if(error.errno === 1062) {
            if(error.message.includes('nome_turma_UNIQUE')) {
                return res.status(409).json({message: 'Nome da turma já cadastrado.'});
            }
        }
        res.status(500).json({message: "Ocorreu um erro no servidor ao criar a turma."});
    }
}
async function atualizarTurma(req, res) {
    const id = req.params.id;
    const dadosParaAtualizar = req.body;

    try {
        if(Object.keys(dadosParaAtualizar).length === 0){
            return res.status(400).json({ message: 'Nenhum dado para atualizar.' });
        }
        const affectedRows = await turmaModel.atualizarTurma(id, dadosParaAtualizar);
        res.status(200).json({message: 'Turma atualizada com sucesso.'});
        console.log("Turma atualizada com sucesso:", id);
        }
    catch (error) {
        console.error("Erro ao atualizar turma:", error);
        return res.status(500).json({message: "Ocorreu um erro no servidor."});
    }
}

async function buscarTurmaPorId(req, res){
    const id = req.params.id;
    try{
        const turma = await turmaModel.buscarTurmaPorId(id);
        res.status(200).json(turma);
        console.log("Turma encontrada:", turma);
    }
    catch (error){
        console.error("Erro ao buscar turma:", error);
        if(error.message === 'Turma não encontrada'){
            return res.status(404).json({message:error.message});
        }
        else{
            return res.status(500).json({message: "Ocorreu um erro no servidor."});
        }
    }
}

async function buscarTodasTurmas(req, res){
    try {
        const turmas = await turmaModel.buscarTodasTurmas();
        res.status(200).json(turmas);
        console.log("Turmas encontradas:", turmas);
    }catch (error) {
        console.error("Erro ao buscar turmas:", error);
        if(error.message === 'Nenhuma turma encontrada!') {
            return res.status(404).json({message: error.message});
        } else {
            return res.status(500).json({message: "Ocorreu um erro no servidor."});
        }
    }
}

async function deletarTurma(req, res) {
    const id = req.params.id;
    try {
        const result = await turmaModel.deletarTurmar(id);
        res.status(200).json({message: 'Turma deletada com sucesso.'});
        console.log("Turma deletada com sucesso:", id);
    } catch (error) {
        console.error("Erro ao deletar turma:", error);
        if(error.message === 'Turma não encontrada para deletar!') {
            return res.status(404).json({message: error.message});
        } else {
            return res.status(500).json({message: "Ocorreu um erro no servidor."});
        }
    }
}

module.exports = {
    criarTurma,
    atualizarTurma,
    buscarTurmaPorId,
    buscarTodasTurmas,
    deletarTurma
};