const cursosModel = require('../models/cursos.models');


//lista todos cursos

async function listarTodos(req, res){
	console.log("controller listarTodos chamado");
	try {
		const cursos = await cursosModel.findAll();
		res.json(cursos);
	}catch (error){
		res.status(500).json({ message: "Ocorreu um erro no servidor."})
	}
}
async function ListarCursoPorId(req, res) {
	console.log("controller ListarCursoPorId chamado");
	const id = req.params.id;
	try{
		const curso = await cursosModel.findCursoById(id);
		res.json(curso);
	}catch(error){
		if (error.message === 'Curso não encontrado!') {
			res.status(404).json({ message: error.message });
		} else {
			res.status(500).json({ message: "Ocorreu um erro no servidor." });
		}
	}
}

async function CriarCurso(req, res) {
	try {
		const novoCurso = await cursosModel.CriarCurso(req.body);
		res.status(201).json(novoCurso);
	} catch (error) {
		if (error.message === 'Erro ao criar curso') {
			res.status(400).json({ message: error.message });
		}
		else {
			res.status(500).json({ message: "Ocorreu um erro no servidor." });
		}
	}
}

module.exports = {
	listarTodos,
	ListarCursoPorId,
	CriarCurso
};