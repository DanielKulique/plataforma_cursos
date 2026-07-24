const db = require('../../config/database');

const STATUS_TURMA = ['ABERTA', 'FECHADA', 'ENCERRADA'];
const STATUS_TURMA_PADRAO = 'ABERTA';

function erroDominio(message, status, code) {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    return error;
}

function traduzirIntegridade(error) {
    if (error?.errno === 1062) {
        return erroDominio('Já existe uma turma com esse nome.', 409, 'TURMA_DUPLICADA');
    }
    if (error?.errno === 1451 || error?.errno === 1452) {
        return erroDominio('A turma possui vínculos incompatíveis com a operação.', 409, 'TURMA_COM_VINCULOS');
    }
    return error;
}

function dataSomente(valor) {
    if (!valor) return null;
    if (valor instanceof Date) return valor.toISOString().slice(0, 10);
    return String(valor).slice(0, 10);
}

function validarDatas(dataInicio, dataFim) {
    if (dataFim && dataSomente(dataFim) < dataSomente(dataInicio)) {
        throw erroDominio('A data final deve ser igual ou posterior à data inicial.', 400, 'DATAS_INVALIDAS');
    }
}

async function validarReferencias(connection, idCurso, idProfessor) {
    const [cursos] = await connection.query(
        'SELECT id_curso FROM Cursos WHERE id_curso = ? FOR UPDATE',
        [idCurso]
    );
    if (cursos.length === 0) {
        throw erroDominio('Curso não encontrado.', 404, 'CURSO_NAO_ENCONTRADO');
    }

    const [usuarios] = await connection.query(
        'SELECT id_usuario, tipo FROM Usuarios WHERE id_usuario = ? FOR UPDATE',
        [idProfessor]
    );
    if (usuarios.length === 0) {
        throw erroDominio('Professor não encontrado.', 404, 'PROFESSOR_NAO_ENCONTRADO');
    }
    if (usuarios[0].tipo !== 'PROFESSOR') {
        throw erroDominio('O usuário associado à turma deve possuir papel PROFESSOR.', 409, 'USUARIO_NAO_PROFESSOR');
    }
}

async function criarTurma(turma) {
    const dados = {
        nome_turma: turma.nome_turma.trim(),
        id_curso: Number(turma.id_curso),
        id_professor: Number(turma.id_professor),
        data_inicio: dataSomente(turma.data_inicio),
        data_fim: dataSomente(turma.data_fim),
        status: turma.status || STATUS_TURMA_PADRAO
    };
    if (!STATUS_TURMA.includes(dados.status)) {
        throw erroDominio('Status de turma inválido.', 400, 'STATUS_INVALIDO');
    }
    validarDatas(dados.data_inicio, dados.data_fim);

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        await validarReferencias(connection, dados.id_curso, dados.id_professor);
        const [result] = await connection.query(
            'INSERT INTO Turmas (nome_turma, id_curso, id_professor, data_inicio, data_fim, status) VALUES (?, ?, ?, ?, ?, ?)',
            [dados.nome_turma, dados.id_curso, dados.id_professor, dados.data_inicio, dados.data_fim, dados.status]
        );
        await connection.commit();
        return { id_turma: result.insertId, ...dados };
    } catch (error) {
        await connection.rollback();
        throw traduzirIntegridade(error);
    } finally {
        connection.release();
    }
}

async function atualizarTurma(id, dadosParaAtualizar) {
    const camposPermitidos = ['nome_turma', 'id_curso', 'id_professor', 'data_inicio', 'data_fim', 'status'];
    const colunas = Object.keys(dadosParaAtualizar).filter((campo) => camposPermitidos.includes(campo));
    if (colunas.length === 0) {
        throw erroDominio('Nenhum campo válido para atualizar.', 400, 'SEM_CAMPOS_VALIDOS');
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [rows] = await connection.query(
            'SELECT id_turma, nome_turma, id_curso, id_professor, data_inicio, data_fim, status FROM Turmas WHERE id_turma = ? FOR UPDATE',
            [id]
        );
        if (rows.length === 0) {
            throw erroDominio('Turma não encontrada.', 404, 'TURMA_NAO_ENCONTRADA');
        }

        const atual = rows[0];
        const final = {
            nome_turma: dadosParaAtualizar.nome_turma?.trim() || atual.nome_turma,
            id_curso: Number(dadosParaAtualizar.id_curso ?? atual.id_curso),
            id_professor: Number(dadosParaAtualizar.id_professor ?? atual.id_professor),
            data_inicio: dataSomente(dadosParaAtualizar.data_inicio ?? atual.data_inicio),
            data_fim: Object.prototype.hasOwnProperty.call(dadosParaAtualizar, 'data_fim')
                ? dataSomente(dadosParaAtualizar.data_fim)
                : dataSomente(atual.data_fim),
            status: dadosParaAtualizar.status || atual.status
        };
        if (!STATUS_TURMA.includes(final.status)) {
            throw erroDominio('Status de turma inválido.', 400, 'STATUS_INVALIDO');
        }
        validarDatas(final.data_inicio, final.data_fim);
        await validarReferencias(connection, final.id_curso, final.id_professor);

        const setClause = colunas.map((coluna) => `${coluna} = ?`).join(', ');
        const valores = colunas.map((coluna) => final[coluna]);
        await connection.query(
            `UPDATE Turmas SET ${setClause} WHERE id_turma = ?`,
            [...valores, id]
        );
        await connection.commit();
        return { id_turma: Number(id), ...final };
    } catch (error) {
        await connection.rollback();
        throw traduzirIntegridade(error);
    } finally {
        connection.release();
    }
}

const SELECT_TURMA_ENRIQUECIDA = `
    SELECT t.*, c.nome_curso, u.nome_completo AS nome_professor
    FROM Turmas t
    INNER JOIN Cursos c ON c.id_curso = t.id_curso
    INNER JOIN Usuarios u ON u.id_usuario = t.id_professor`;

async function buscarTurmaPorId(id) {
    const [rows] = await db.query(`${SELECT_TURMA_ENRIQUECIDA} WHERE t.id_turma = ?`, [id]);
    if (rows.length === 0) {
        throw erroDominio('Turma não encontrada.', 404, 'TURMA_NAO_ENCONTRADA');
    }
    return rows[0];
}

async function buscarTodasTurmas() {
    const [rows] = await db.query(`${SELECT_TURMA_ENRIQUECIDA} ORDER BY t.data_inicio DESC, t.id_turma DESC`);
    return rows;
}

async function buscarTurmasDoProfessor(id_professor) {
    const query = `
        SELECT t.*, c.nome_curso, c.descricao AS descricao_curso,
               COUNT(m.id_matricula) AS total_alunos
        FROM Turmas t
        LEFT JOIN Cursos c ON t.id_curso = c.id_curso
        LEFT JOIN Matriculas m
          ON t.id_turma = m.id_turma AND m.status_aprovacao <> 'CANCELADO'
        WHERE t.id_professor = ?
        GROUP BY t.id_turma, c.nome_curso, c.descricao
        ORDER BY t.data_inicio DESC
    `;
    const [rows] = await db.query(query, [id_professor]);
    return rows;
}

async function deletarTurma(id) {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [turmas] = await connection.query(
            'SELECT id_turma FROM Turmas WHERE id_turma = ? FOR UPDATE',
            [id]
        );
        if (turmas.length === 0) {
            throw erroDominio('Turma não encontrada.', 404, 'TURMA_NAO_ENCONTRADA');
        }
        const [matriculas] = await connection.query(
            'SELECT id_matricula FROM Matriculas WHERE id_turma = ? LIMIT 1 FOR UPDATE',
            [id]
        );
        if (matriculas.length > 0) {
            throw erroDominio('Turma com matrículas não pode ser excluída.', 409, 'TURMA_COM_MATRICULAS');
        }

        await connection.query('DELETE FROM Turmas WHERE id_turma = ?', [id]);
        await connection.commit();
        return true;
    } catch (error) {
        await connection.rollback();
        throw traduzirIntegridade(error);
    } finally {
        connection.release();
    }
}

async function professorEhDaTurma(id_professor, id_turma) {
    const [rows] = await db.query(
        'SELECT id_turma FROM Turmas WHERE id_turma = ? AND id_professor = ?',
        [id_turma, id_professor]
    );
    return rows.length > 0;
}

module.exports = {
    criarTurma,
    atualizarTurma,
    buscarTurmaPorId,
    buscarTodasTurmas,
    buscarTurmasDoProfessor,
    deletarTurma,
    professorEhDaTurma
};
