const usuariosModel = require('../models/usuarios.models');
const { validationResult } = require('express-validator');
const fatorCusto = 10;
const bcrypt = require('bcrypt');


//criar um novo usuário
async function criarUsuario(req, res) {
    const errors = validationResult(req); //verifica se houve erro de validação
    if (!errors.isEmpty()) {
        return res.status(400).json( { errors: errors.array() });
    }

    try {
        const totalUsuarios = await usuariosModel.count();

        if( totalUsuarios == 0) {
            req.body.tipo = 'ADMIN'; //define o primeiro usuário como admin
        } else {
            req.body.tipo = 'ALUNO'; //define os demais usuários como comum
        }

        const novoUsuario = await usuariosModel.criarUsuario(req.body);
        res.status(201).json(novoUsuario);
        console.log("Usuário criado com sucesso:", novoUsuario);
    } catch (error) {
        console.error("Erro ao criar usuário:", error);
        if(error.errno === 1062) {
            if(error.message.includes('cpf_UNIQUE')) {
                return res.status(409).json({ message: 'CPF já cadastrado.' });
            }
            if(error.message.includes('email_UNIQUE')) {
                return res.status(409).json({ message: 'E-mail já cadastrado.'});
            }
        }
        return res.status(500).json({message: "Ocorreu um erro no servidor ao criar o usuário." });
    }
}

async function atualizarUsuario(req, res) {
    const id = req.params.id;
    const dadosParaAtualizar = req.body;

    try {
        if (Object.keys(dadosParaAtualizar).length === 0) {
            return res.status(400).json( {message: 'Nenhum dado para atualizar.' });
        }
        if(dadosParaAtualizar.senha) {
            const hash = await bcrypt.hash(dadosParaAtualizar.senha, fatorCusto);
            dadosParaAtualizar.senha = hash;
        }
        await usuariosModel.atualizarUsuario(id, dadosParaAtualizar);
        res.status(200).json({ message: 'Usuário atualizado com sucesso.' });
        console.log("Usuário atualizado com sucesso:", id);
    }
    catch (error) {
        console.error("Erro ao atualizar usuário:", error);
        if (error.message === 'Nenhum campo válido para atualizar.') {
            return res.status(400).json({ message: error.message });
        }
        if (error.message === 'Usuário não encontrado!') {
            return res.status(404).json({ message: error.message });
        } else {
            return res.status(500).json({ message: "Ocorreu um erro no servidor." });
        }
    }
}

async function buscarUsuarioPorId(req, res) {
    const id = req.params.id;

    try {
        const usuario = await usuariosModel.buscarUsuarioPorId(id);
        res.status(200).json(usuario);
        console.log("Usuário encontrado:", usuario);
    } catch (error) {
        console.error("Erro ao buscar usuário:", error);
        if (error.message === 'Usuário não encontrado!') {
            return res.status(404).json({ message: error.message });
        } else{
            return res.status(500).json({ message: "Ocorreu um erro no servidor." });
        }
    }
}

async function buscarTodosUsuarios(req, res) {
    try {
        const usuarios = await usuariosModel.buscarTodosUsuarios();
        res.status(200).json(usuarios);
        console.log("Usuários encontrados:", usuarios);
    } catch (error) {
        console.error("Erro ao buscar usuários:", error);
        if (error.message === 'Nenhum usuário encontrado!') {
            return res.status(404).json({ message: error.message });
        }
        else {
            return res.status(500).json({ message: "Ocorreu um erro no servidor." });
        }
    }
}

async function deletarUsuario(req, res) {
    const id = req.params.id;
    try {
        await usuariosModel.deletarUsuario(id);
        console.log("Usuário deletado com sucesso:", id);
        return res.status(204).send();
    }
    catch (error) {
        console.error("Erro ao deletar usuário:", error);
        if (error.message === 'Usuário não encontrado para deletar!') {
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }
        return res.status(500).json({ message: "Ocorreu um erro no servidor." });
    }
}

module.exports = {
    criarUsuario,
    atualizarUsuario,
    buscarUsuarioPorId,
    buscarTodosUsuarios,
    deletarUsuario
}
