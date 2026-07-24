const db = require('../../config/database');

const STATUS_APROVACAO_PADRAO = 'CURSANDO';

function enrollmentError(code, status, message) {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    return error;
}

async function matricularAluno(id_aluno, id_turma) {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [classes] = await connection.query(
            'SELECT id_turma, status FROM Turmas WHERE id_turma = ? FOR UPDATE',
            [id_turma]
        );
        if (classes.length === 0) {
            throw enrollmentError('TURMA_NAO_ENCONTRADA', 404, 'Turma não encontrada.');
        }
        if (classes[0].status !== 'ABERTA') {
            throw enrollmentError('TURMA_NAO_ABERTA', 403, 'Esta turma não está aberta para matrículas.');
        }

        const [existing] = await connection.query(
            `SELECT id_matricula, status_aprovacao
             FROM Matriculas
             WHERE id_aluno = ? AND id_turma = ?
             FOR UPDATE`,
            [id_aluno, id_turma]
        );

        if (existing.length > 0 && existing[0].status_aprovacao !== 'CANCELADO') {
            throw enrollmentError('MATRICULA_DUPLICADA', 409, 'Você já está matriculado nesta turma.');
        }

        if (existing.length > 0) {
            const id_matricula = existing[0].id_matricula;
            await connection.query(
                `DELETE progresso
                 FROM ConteudosProgresso progresso
                 INNER JOIN Conteudos conteudo ON conteudo.id_conteudo = progresso.id_conteudo
                 WHERE progresso.id_aluno = ? AND conteudo.id_turma = ?`,
                [id_aluno, id_turma]
            );
            await connection.query(
                `UPDATE Matriculas
                 SET status_aprovacao = 'CURSANDO', progresso_percentual = 0,
                     nota_final = NULL, data_matricula = CURRENT_TIMESTAMP
                 WHERE id_matricula = ?`,
                [id_matricula]
            );
            await connection.commit();
            return {
                id_matricula,
                id_aluno,
                id_turma,
                status_aprovacao: STATUS_APROVACAO_PADRAO,
                progresso_percentual: 0,
                nota_final: null,
                reativada: true
            };
        }

        const [result] = await connection.query(
            'INSERT INTO Matriculas (id_aluno, id_turma) VALUES (?, ?)',
            [id_aluno, id_turma]
        );
        await connection.commit();
        return {
            id_matricula: result.insertId,
            id_aluno,
            id_turma,
            status_aprovacao: STATUS_APROVACAO_PADRAO,
            progresso_percentual: 0,
            nota_final: null,
            reativada: false
        };
    } catch (error) {
        await connection.rollback().catch(() => undefined);
        if (error.code === 'ER_DUP_ENTRY') {
            throw enrollmentError('MATRICULA_DUPLICADA', 409, 'Você já está matriculado nesta turma.');
        }
        throw error;
    } finally {
        connection.release();
    }
}

async function buscarMatriculaPorAluno(id_aluno) {
    const [rows] = await db.query(
        `
        SELECT
            m.id_matricula,
            m.id_aluno,
            m.id_turma,
            m.data_matricula,
            m.status_aprovacao,
            m.nota_final,
            m.progresso_percentual,
            t.nome_turma,
            c.nome_curso,
            c.carga_horaria
        FROM Matriculas m
        INNER JOIN Turmas t ON m.id_turma = t.id_turma
        INNER JOIN Cursos c ON t.id_curso = c.id_curso
        WHERE m.id_aluno = ?
        ORDER BY m.data_matricula DESC
        `,
        [id_aluno]
    );
    return rows;
}

async function buscarSalaVirtualDoAluno(id_aluno) {
    const [rows] = await db.query(
        `
        SELECT
            m.id_matricula,
            m.data_matricula,
            m.status_aprovacao,
            m.progresso_percentual,
            t.id_turma,
            t.nome_turma,
            t.status AS status_turma,
            t.data_inicio,
            t.data_fim,
            c.id_curso,
            c.nome_curso,
            c.descricao AS descricao_curso,
            c.carga_horaria
        FROM Matriculas m
        INNER JOIN Turmas t ON m.id_turma = t.id_turma
        INNER JOIN Cursos c ON t.id_curso = c.id_curso
        WHERE m.id_aluno = ?
          AND m.status_aprovacao <> 'CANCELADO'
          AND t.status IN ('ABERTA', 'FECHADA')
        ORDER BY m.data_matricula DESC
        `,
        [id_aluno]
    );

    return rows;
}

// Buscar todas as matrículas de uma turma específica
async function buscarMatriculaPorTurma(id_turma) {
    const [rows] = await db.query(
        `
        SELECT
            m.id_matricula,
            m.id_aluno,
            m.id_turma,
            m.data_matricula,
            m.status_aprovacao,
            m.nota_final,
            m.progresso_percentual,
            u.nome_completo,
            u.email
        FROM Matriculas m
        INNER JOIN Usuarios u ON m.id_aluno = u.id_usuario
        WHERE m.id_turma = ? AND m.status_aprovacao <> 'CANCELADO'
        ORDER BY u.nome_completo
        `,
        [id_turma]
    );
    return rows;
}

async function turmaExiste(id_turma) {
    const [rows] = await db.query('SELECT id_turma FROM Turmas WHERE id_turma = ?', [id_turma]);
    return rows.length > 0;
}

async function buscarMatriculaPorId(id) {
    const [rows] = await db.query(
        `
        SELECT
            m.*,
            u.nome_completo,
            u.email AS email_aluno,
            t.nome_turma,
            c.nome_curso
        FROM Matriculas m
        INNER JOIN Usuarios u ON m.id_aluno = u.id_usuario
        INNER JOIN Turmas t ON m.id_turma = t.id_turma
        INNER JOIN Cursos c ON t.id_curso = c.id_curso
        WHERE m.id_matricula = ?
        `,
        [id]
    );

    if (rows.length === 0) {
        throw new Error('Matrícula não encontrada!');
    }

    return rows[0];
}

async function atualizarMatricula(id, dadosParaAtualizar) {
    const camposPermitidos = ['nota_final', 'status_aprovacao', 'progresso_percentual'];
    const colunasParaAtualizar = Object.keys(dadosParaAtualizar).filter((coluna) => camposPermitidos.includes(coluna));

    if (colunasParaAtualizar.length === 0) {
        throw new Error('Nenhum campo válido para atualizar.');
    }

    const setClause = colunasParaAtualizar.map(coluna => `${coluna} = ?`).join(',');
    const valoresParaAtualizar = colunasParaAtualizar.map((coluna) => dadosParaAtualizar[coluna]);

    const [result] = await db.query(
        `UPDATE Matriculas SET ${setClause} WHERE id_matricula = ?`,
        [...valoresParaAtualizar, id]
    );
    if (result.affectedRows === 0) {
        throw new Error('Matrícula não encontrada para atualizar!');
    }

    return { affectedRows: result.affectedRows };
}

async function cancelarMatricula(id) {
    const [result] = await db.query(
        'UPDATE Matriculas SET status_aprovacao = ? WHERE id_matricula = ?',
        ['CANCELADO', id]
    );

    if (result.affectedRows === 0) {
        throw new Error('Matrícula não encontrada para cancelar!');
    }

    return { affectedRows: result.affectedRows };
}

async function professorPodeGerenciarMatricula(id_professor, id_matricula) {
    const [rows] = await db.query(
        `
        SELECT m.id_matricula
        FROM Matriculas m
        INNER JOIN Turmas t ON m.id_turma = t.id_turma
        WHERE m.id_matricula = ? AND t.id_professor = ?
        `,
        [id_matricula, id_professor]
    );

    return rows.length > 0;
}

async function buscarEscopoMatriculaPorId(id_matricula) {
    const [rows] = await db.query(
        `
        SELECT m.id_matricula, m.id_aluno, m.id_turma, t.id_professor
        FROM Matriculas m
        INNER JOIN Turmas t ON m.id_turma = t.id_turma
        WHERE m.id_matricula = ?
        `,
        [id_matricula]
    );

    if (rows.length === 0) {
        return null;
    }

    return rows[0];
}

module.exports = {
    matricularAluno,
    buscarMatriculaPorAluno,
    buscarSalaVirtualDoAluno,
    buscarMatriculaPorTurma,
    turmaExiste,
    buscarMatriculaPorId,
    atualizarMatricula,
    cancelarMatricula,
    professorPodeGerenciarMatricula,
    buscarEscopoMatriculaPorId
};
