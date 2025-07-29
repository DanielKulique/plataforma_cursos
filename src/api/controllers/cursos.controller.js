const cursosModel = require('../models/cursos.models');
const { validationResult } = require('express-validator');

//lista todos cursos

async function listarTodos(req, res){
	console.log("controller listarTodos chamado");
	try {
		const cursos = await cursosModel.buscarCursos();
		res.json(cursos);
	}catch (error){
		console.error("Erro ao listar cursos:", error);
		res.status(500).json({ message: "Ocorreu um erro no servidor."})
	}
}

async function listarCursoPorId(req, res) {
	console.log("controller ListarCursoPorId chamado");
	const id = req.params.id;
	try{
		const curso = await cursosModel.buscarCursoPorId(id);
		res.json(curso);
	}catch(error){
		console.error("Erro ao listar curso por ID:", error);
		if (error.message === 'Curso não encontrado!') {
			res.status(404).json({ message: error.message });
		} else {
			res.status(500).json({ message: "Ocorreu um erro no servidor." });
		}
	}
}

async function criarCurso(req, res) {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({ errors: errors.array() });
	}

	try {
		const novoCurso = await cursosModel.criarCurso(req.body);
		res.status(201).json(novoCurso);
	} catch (error) {
		console.error("Erro ao criar curso:", error);
		if (error.message === 'Erro ao criar curso') {
			res.status(400).json({ message: error.message });
		}
		else {
			res.status(500).json({ message: "Ocorreu um erro no servidor." });
		}
	}
}

async function atualizarCurso(req, res) {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({ errors: errors.array() });
	}
	console.log("controller atualizarCurso chamado");
	const id = req.params.id;
	try {
		const affectedRows = await cursosModel.atualizarCurso(id, req.body);
		if(affectedRows === 0) {
			return res.status(404).json({ message: 'Curso não encontrado para atualizar!' });
		}
		res.json({id_curso: id, ...req.body});
	} catch (error) {
		console.error("Erro ao atualizar curso:", error);
		if (error.message === 'Erro ao atualizar curso') {
			return res.status(400).json({ message: error.message });
		}
		res.status(500).json({ message: "Ocorreu um erro no servidor ao atualizar curso." });
	}
}

async function deletarCurso(req, res) {
	const id = req.params.id;
	try {
		const affectedRows = await cursosModel.deletarCurso(id);
		if(affectedRows === 0){
			return res.status(404).json({ message: 'Curso não encontrado para deletar!' });
		}
		res.status(204).send(); // 204 No Content
	}catch(error){
		console.error("Erro ao deletar curso:", error);
		if (error.message === 'Erro ao deletar curso') {
			return res.status(400).json({ message: error.message });
		}
		res.status(500).json({ message: "Ocorreu um erro no servidor ao deletar curso." });
	}
}

module.exports = {
	listarTodos,
	listarCursoPorId,
	criarCurso,
	atualizarCurso,
	deletarCurso
};