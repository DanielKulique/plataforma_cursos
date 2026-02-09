const db = require('../../config/database');

const STATUS_APROVACAO_PADRAO = 'CURSANDO';

async function criarMatricula(matricula) {
    const {
        id_matricula,
        id_aluno,
        id_turma,
        status_aprovacao,
        progresso_percentual,
        nota_final
    } = matricula;

    const colunas = ['id_aluno', 'id_turma'];
    const valores = [id_aluno, id_turma];

    if (id_matricula !== undefined && id_matricula !== null) {
        colunas.unshift('id_matricula');
        valores.unshift(id_matricula);
    }
    if (status_aprovacao) {
        colunas.push('status_aprovacao');
        valores.push(status_aprovacao);
    }
    if (progresso_percentual !== undefined && progresso_percentual !== null) {
        colunas.push('progresso_percentual');
        valores.push(progresso_percentual);
    }
    if (nota_final !== undefined && nota_final !== null) {
        colunas.push('nota_final');
        valores.push(nota_final);
    }

    const placeholders = colunas.map(() => '?').join(', ');
    const sql = `INSERT INTO Matriculas (${colunas.join(', ')}) VALUES (${placeholders})`;

    const [result] = await db.query(sql, valores);
    if (result.affectedRows === 0) {
        throw new Error('Erro ao criar matricula');
    }

    return {
        id_matricula: result.insertId || id_matricula,
        id_aluno,
        id_turma,
        status_aprovacao: status_aprovacao || STATUS_APROVACAO_PADRAO,
        progresso_percentual: progresso_percentual ?? 0,
        nota_final: nota_final ?? null
    };
}

async function buscarMatriculaPorAluno(id_aluno) {
    const [rows] = await db.query(
        `
        SELECT
            m.id_matricula,
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

//buscar todas as matriculas de uma turma especifica
async function buscarMatriculaPorTurma(id_turma) {
    const [rows] = await db.query(
        `
        SELECT
            m.id_matricula,
            m.data_matricula,
            m.status_aprovacao,
            m.nota_final,
            m.progresso_percentual,
            u.nome_completo,
            u.email,
            u.cpf
        FROM Matriculas m
        INNER JOIN Usuarios u ON m.id_aluno = u.id_usuario
        WHERE m.id_turma = ?
        ORDER BY u.nome_completo
        `,
        [id_turma]
    );
    return rows;
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
        throw new Error('MatrÃ­cula nÃ£o encontrada!');
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
        throw new Error('MatrÃ­cula nÃ£o encontrada para atualizar!');
    }

    return { affectedRows: result.affectedRows };
}

async function verificarMatriculaDuplicada(id_aluno, id_turma) {
    const [rows] = await db.query(
        'SELECT id_matricula FROM Matriculas WHERE id_aluno = ? AND id_turma = ?',
        [id_aluno, id_turma]
    );

    return rows.length > 0;
}

async function cancelarMatricula(id) {
    const [result] = await db.query(
        'UPDATE Matriculas SET status_aprovacao = ? WHERE id_matricula = ?',
        ['CANCELADO', id]
    );

    if (result.affectedRows === 0) {
        throw new Error('MatrÃ­cula nÃ£o encontrada para cancelar!');
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
    criarMatricula,
    buscarMatriculaPorAluno,
    buscarMatriculaPorTurma,
    buscarMatriculaPorId,
    atualizarMatricula,
    cancelarMatricula,
    verificarMatriculaDuplicada,
    professorPodeGerenciarMatricula,
    buscarEscopoMatriculaPorId
};
