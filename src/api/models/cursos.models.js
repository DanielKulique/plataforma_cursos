
const db = require('../../config/database');

async function buscarCursos(){
	const [rows] = await db.query('SELECT * FROM Cursos');
	return rows;
}

async function buscarCursoPorId(id){
	const [rows] = await db.query('SELECT * FROM Cursos WHERE id_curso = ?', [id]);
	if (rows.length === 0){
		throw new Error('Curso não encontrado!');
	}else{
		return rows[0];
	}
}

async function criarCurso(curso) {
	const { nome_curso, descricao, carga_horaria } = curso;
	const [result] = await db.query('INSERT INTO Cursos (nome_curso, descricao, carga_horaria) VALUES ( ?, ?, ?)', [nome_curso, descricao, carga_horaria]);
	if (result.affectedRows === 0) {
		throw new Error('Erro ao criar curso');
	}
	return { id_curso: result.insertId, nome_curso, descricao, carga_horaria };
}

async function atualizarCurso(id, curso) {
	const { nome_curso, descricao, carga_horaria } = curso;
	const [result] = await db.query('UPDATE Cursos SET nome_curso = ?, descricao = ?, carga_horaria = ? WHERE id_curso = ?', [nome_curso, descricao, carga_horaria, id]);
	if (result.affectedRows === 0) {
		throw new Error('Erro ao atualizar curso ou curso não encontrado');
	}
	return { id_curso: id, nome_curso, descricao, carga_horaria};
}

async function deletarCurso(id) {
	const [result] = await db.query('DELETE FROM Cursos WHERE id_curso = ?', [id]);
	if (result.affectedRows === 0) {
		throw new Error('Erro ao deletar curso ou curso não encontrado');
	}
	return { message: 'Curso deletado com sucesso' };
}

module.exports = {
	buscarCursos,
	buscarCursoPorId,
	criarCurso,
	atualizarCurso,
	deletarCurso
};