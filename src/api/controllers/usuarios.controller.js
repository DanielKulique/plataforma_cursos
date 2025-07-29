const usuariosModel = require('../models/usuarios.models');
const { validationResult } = require('express-validator');
const fatorCusto = 10;
const bcrypt = require('bcrypt');


//criar um novo usuário
async function criarUsuario(req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json( { errors: errors.array() });
    }

    try {
        const novoUsuario = await usuariosModel.criarUsuario(req.body);
        res.status(201).json(novoUsuario);
        console.log("Usuário criado com sucesso:", novoUsuario);
    } catch (error) {
        console.error("Erro ao criar usuário:", error);
        if (error.message === 'Erro ao criar usuário') {
            res.status(400).json({ message: error.message });
        }
        else {
            res.status(500).json({ message: "Ocorreu um erro no servidor." });
        }
    }
}

async function atualizarUsuario(req, res) {
    const id = req.params.id;
    const dadosParaAtualizar = req.body;

    try {
        if (Object.keys(dadosParaAtulizar).length === 0) {
            return res.status(400).json( {message: 'Nenhum dado para atualizar.' });
        }
        if(dadosParaAtualizar.senha) {
            const hash = await bcrypt.hash(dadosParaAtualizar.senha, fatorCusto);
            dadosParaAtualizar.senha = hash;
        }
        const affectedRows = await usuariosModel.atualizarUsuario(id, dadosParaAtualizar);
        
        if(affectedRows === 0){
            return res.status(404).json({ message: 'Usuário não encontrado.' });
        }
        res.status(200).json({ message: 'Usuário atualizado com sucesso.' });
        console.log("Usuário atualizado com sucesso:", id);
    }
    catch (error) {
        console.error("Erro ao atualizar usuário:", error);
        if (error.message === 'Usuário não encontrado!') {
            res.status(404).json({ message: error.message });
        } else {
            res.status(500).json({ message: "Ocorreu um erro no servidor." });
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
            res.status(404).json({ message: error.message });
        } else{
            res.status(500).json({ message: "Ocorreu um erro no servidor." });
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
            res.status(404).json({ message: error.message });
        }
        else {
            res.status(500).json({ message: "Ocorreu um erro no servidor." });
        }
    }
}

async function deletarUsuario(req, res) {
    const id = req.params.id;
}

module.exports = {
    criarUsuario,
    atualizarUsuario,
    buscarUsuarioPorId,
    buscarTodosUsuarios
}
