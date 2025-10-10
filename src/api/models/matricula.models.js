const db = require('../..config/database');


async function criarMatricula(matricula) {
	const {id_aluno, id_turma} = matricula;


	const [result] = await db.query(
		'INSERT INT Matriculas (id_aluno, id_turma, data_matricula, status) VALUES (?, ?, NOW(), ?)',
		[id_aluno, id_turma, 'MATRICULADO']
		);
	if (result.affectedRows === 0){
		throw new Error('Erro ao criar matricula');
	}
	return {
		id_matricula: result.insertId,
		id_aluno,
		id_turma,
		status: 'MATRICULADO'
	};
}

async function buscarMatriculaPorAluno(id_aluno) {
	const [rows] = await db.query(`
		SELECT
			m.id_matricula,
			m.data_matricula,
			m.status,
			m.nota_final,
			t.nome_turma,
			c.nome_curso,
			c.carga_horaria
		FROM matriculas m
		INNER JOIN Turmas t ON m.id_turma = t.id_turma
		INNER JOIN Cursos c ON t.id_curso = c.id_curso
		WHERE m.id_aluno = ?
		ORDER BY m.data_matricula DESC`,
		[id_aluno]
		);
	return rows;
}

//buscar todas as matriculas de uma turma especifica
async function buscarMatriculaPorTurma(id_turma){
	const [rows] = await db.query(`
		SELECT
			m.id_matricula,
			m.data_matricula,
			m.status,
			m.nota_final,
			u.nome_completo,
			u.email,
			u.cpf
		FROM Matriculas m
		INNER JOIN Usuarios u ON m.id_aluno = u.id_usuario
		WHERE m.id_turma = ?
		ORDER BY u.nome_completo`,
		[id_turma]
		);
	return rows;
}

async function buscarMatriculaPorId(id){
	const [rows] = await db.query(`
		SELECT
			m.*,
			u.nome_completo
			u.email as email_aluno,
			t.nome_turma,
			c.nome_curso
		FROM Matriculas matricula
		INNER JOIN Usuarios u ON m.id_aluno = u.id_usuario
		INNER JOIN Turmas t ON m.id_turma = t.id_turma
		INNER JOIN Cursos c ON t.id_turma = c.id_curso
		WHERE m.id_matricula = ?
	`, [id]);

	if (rows.length === 0){
		throw new Error('Matrícula não encontrada!');
	}
	
	return rows[0];
}

async function atualizarMatricula(id, dadosParaAtualizar) {
	const colunasParaAtualizar = Object.keys(dadosParaAtualizar);
	const setClause = colunasParaAtualizar.map(coluna => `${coluna} = ?`).join(',');
	const valoresParaAtualizar = Object.values(dadosParaAtualizar);

	const [result] = await db.query(
		`UPDATE Matriculas SET ${setClause} WHERE id_matricula = ?`,
		[...valoresParaAtualizar, id]
		);
	if(result.affectedRows === 0) {
		throw new Error('Matrícula não encontrada para atualizar!');
	}

	return { affectedRows: result.affectedRows };
}

async function verificarMatriculaDuplicada(id_aluno, id_turma) {
	const [rows] = await db.query(
		'SELECT id_matricula FROM Matriculas WHERE id_aluno = ? AND id_turma',
		[id_aluno, id_turma]
		);

		return rows.length > 0;

}

async function cancelarMatricula(id){
	const [result] = await db.query('DELETE FROM Matriculas WHERE id_matricula = ?', [id]);

	if (result.affectedRows === 0){
		throw new Error('Matrícula não encontrada para cancelar!');
	}

	return {affectedRows: result.affectedRows};

}

modules.exports = {
	criarMatricula,
	buscarMatriculaPorAluno,
	buscarMatriculaPorTurma,
	buscarMatriculaPorId,
	atualizarMatricula,
	cancelarMatricula,
	verificarMatriculaDuplicada
};