const db = require('../../config/database');

function erroDominio(message, status, code) {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    return error;
}

function traduzirIntegridade(error) {
    if (error?.errno === 1062) {
        return erroDominio('Já existe um curso com esse nome.', 409, 'CURSO_DUPLICADO');
    }
    if (error?.errno === 1451 || error?.errno === 1452) {
        return erroDominio('O curso possui vínculos incompatíveis com a operação.', 409, 'CURSO_COM_VINCULOS');
    }
    return error;
}

async function buscarCursos() {
    const [rows] = await db.query(
        'SELECT id_curso, nome_curso, descricao, carga_horaria FROM Cursos ORDER BY nome_curso, id_curso'
    );
    return rows;
}

async function buscarCursoPorId(id) {
    const [rows] = await db.query(
        'SELECT id_curso, nome_curso, descricao, carga_horaria FROM Cursos WHERE id_curso = ?',
        [id]
    );
    if (rows.length === 0) {
        throw erroDominio('Curso não encontrado.', 404, 'CURSO_NAO_ENCONTRADO');
    }
    return rows[0];
}

async function criarCurso(curso) {
    const nome_curso = curso.nome_curso.trim();
    const descricao = curso.descricao || null;
    const carga_horaria = Number(curso.carga_horaria);

    try {
        const [result] = await db.query(
            'INSERT INTO Cursos (nome_curso, descricao, carga_horaria) VALUES (?, ?, ?)',
            [nome_curso, descricao, carga_horaria]
        );
        return { id_curso: result.insertId, nome_curso, descricao, carga_horaria };
    } catch (error) {
        throw traduzirIntegridade(error);
    }
}

async function atualizarCurso(id, curso) {
    const nome_curso = curso.nome_curso.trim();
    const descricao = curso.descricao || null;
    const carga_horaria = Number(curso.carga_horaria);

    try {
        const [result] = await db.query(
            'UPDATE Cursos SET nome_curso = ?, descricao = ?, carga_horaria = ? WHERE id_curso = ?',
            [nome_curso, descricao, carga_horaria, id]
        );
        if (result.affectedRows === 0) {
            throw erroDominio('Curso não encontrado.', 404, 'CURSO_NAO_ENCONTRADO');
        }
        return { id_curso: Number(id), nome_curso, descricao, carga_horaria };
    } catch (error) {
        throw traduzirIntegridade(error);
    }
}

async function deletarCurso(id) {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [cursos] = await connection.query(
            'SELECT id_curso FROM Cursos WHERE id_curso = ? FOR UPDATE',
            [id]
        );
        if (cursos.length === 0) {
            throw erroDominio('Curso não encontrado.', 404, 'CURSO_NAO_ENCONTRADO');
        }

        const [turmas] = await connection.query(
            'SELECT id_turma FROM Turmas WHERE id_curso = ? LIMIT 1',
            [id]
        );
        if (turmas.length > 0) {
            throw erroDominio('Curso com turmas associadas não pode ser excluído.', 409, 'CURSO_COM_TURMAS');
        }

        await connection.query('DELETE FROM Cursos WHERE id_curso = ?', [id]);
        await connection.commit();
        return true;
    } catch (error) {
        await connection.rollback();
        throw traduzirIntegridade(error);
    } finally {
        connection.release();
    }
}

module.exports = {
    buscarCursos,
    buscarCursoPorId,
    criarCurso,
    atualizarCurso,
    deletarCurso
};
