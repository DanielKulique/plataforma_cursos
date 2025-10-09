const matriculaModel = require('../models/matricula.models');
const {validationResult} = require('express-validator');

//criar nova matricula (aluno entra em nova turma)

async function criarMatricula(req, res){
    const errors = validationResult(req);
    if(!errors.isEmpty()){
        return res.status(400).json({ errors: errors.array()});
    }

    try {
        const { id_turma } = req.body;
        const id_aluno = req.user.id_usuario;

        //verifica se ja esta matriculado
        const jaMatriculado = await matriculaModel.verificarMatriculaDuplicada(id_aluno, id_turma);
        if(jaMatriculado){
            return res.status(409).json({
                message: 'Você já está matriculado nesta turma!'
            })
        }

        const novaMatricula = await matriculaModel.criarMatricula({
            id_aluno,
            id_turma
        });

        res.status(201).json({
            message: 'Matrícula realizada com sucesso!',
            matricula: novaMatricula
        })
        console.log("Matrícula criada: ", novaMatricula);

    }catch(error){
        console.error("Erro ao criar matrícula:", error);
        res.status(500).json({
            message: "Ocorreu um erro no servidor ao criar a matrícula."
        });
    }
}

async function buscarMatriculasDoAluno(req, res){
    const id_aluno = req.params.id;

    try{
        const matriculas = await matriculaModel.buscarMatriculaPorAluno(id_aluno);

        if(matriculas.length === 0) {
            return res.status(404).json({
                message: 'Nenhuma matrícula encontrada para este aluno.'
            });
        }
        
        res.status(200).json(matriculas)
        console.log("Matrículas do aluno encontradas: ", matriculas.length);

    } catch(error){
        console.error("Erro ao buscar matrículas do aluno: ", error);
        res.status(500).json({
            message: "Ocorreu um erro no servidor."
        });
    }

}


// Buscar todas as matrículas de uma turma (para professores/admin)
async function buscarMatriculasDaTurma(req, res) {
    const id_turma = req.params.id_turma;

    try {
        const matriculas = await matriculaModel.buscarMatriculasPorTurma(id_turma);
        
        if (matriculas.length === 0) {
            return res.status(404).json({ 
                message: 'Nenhuma matrícula encontrada para esta turma.' 
            });
        }

        res.status(200).json(matriculas);
        console.log("Matrículas da turma encontradas:", matriculas.length);

    } catch (error) {
        console.error("Erro ao buscar matrículas da turma:", error);
        res.status(500).json({ 
            message: "Ocorreu um erro no servidor." 
        });
    }
}

// Buscar matrícula específica por ID
async function buscarMatriculaPorId(req, res) {
    const id = req.params.id;

    try {
        const matricula = await matriculaModel.buscarMatriculaPorId(id);
        res.status(200).json(matricula);
        console.log("Matrícula encontrada:", matricula);

    } catch (error) {
        console.error("Erro ao buscar matrícula:", error);
        if (error.message === 'Matrícula não encontrada!') {
            return res.status(404).json({ message: error.message });
        }
        res.status(500).json({ 
            message: "Ocorreu um erro no servidor." 
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
        
        res.status(200).json({ 
            message: 'Matrícula atualizada com sucesso!' 
        });
        console.log("Matrícula atualizada:", id);

    } catch (error) {
        console.error("Erro ao atualizar matrícula:", error);
        if (error.message === 'Matrícula não encontrada para atualizar!') {
            return res.status(404).json({ message: error.message });
        }
        res.status(500).json({ 
            message: "Ocorreu um erro no servidor." 
        });
    }
}

// Cancelar matrícula - Aluno ou Admin
async function cancelarMatricula(req, res) {
    const id = req.params.id;

    try {
        // Primeiro verifica se a matrícula existe e pega os dados
        const matricula = await matriculaModel.buscarMatriculaPorId(id);

        // Verifica permissão: usuário só pode cancelar sua própria matrícula
        // (a menos que seja ADMIN - isso é verificado no middleware)
        if (req.user.tipo !== 'ADMIN' && matricula.id_aluno !== req.user.id_usuario) {
            return res.status(403).json({ 
                message: 'Você não tem permissão para cancelar esta matrícula.' 
            });
        }

        await matriculaModel.cancelarMatricula(id);
        
        res.status(200).json({ 
            message: 'Matrícula cancelada com sucesso!' 
        });
        console.log("Matrícula cancelada:", id);

    } catch (error) {
        console.error("Erro ao cancelar matrícula:", error);
        if (error.message === 'Matrícula não encontrada para cancelar!' || 
            error.message === 'Matrícula não encontrada!') {
            return res.status(404).json({ 
                message: 'Matrícula não encontrada.' 
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