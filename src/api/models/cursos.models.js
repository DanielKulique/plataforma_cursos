
const db = require('../../config/database');

async function findAll(){
	const [rows] = await db.query('SELECT * FROM Cursos');
	return rows;
}

async function findCursoById(id){
	const [rows] = await db.query('SELECT * FROM Cursos WHERE id_curso = ?', [id]);
	if (rows.length === 0){
		throw new Error('Curso não encontrado!');
	}else{
		return rows[0];
	}
}

async function CriarCurso(curso) {
	const { nome_curso, descricao, carga_horaria } = curso;
	const [result] = await db.query('INSERT INTO Cursos (nome_curso, descricao, carga_horaria) VALUES ( ?, ?, ?)', [nome_curso, descricao, cargaHoraria]);
	if (result.affectedRows === 0) {
		throw new Error('Erro ao criar curso');
	}
	return { id_curso: result.insertId, nome_curso, descricao, carga_horaria };
}

module.exports = {
	findAll,
	findCursoById,
	CriarCurso
};