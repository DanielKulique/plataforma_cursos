const db = require('../../config/database');

const STATUS_TURMA_PADRAO = 'INSCRI\u00C7\u00D5ES ABERTAS';

async function criarTurma(turma) {
    const { nome_turma, id_curso, id_professor, data_inicio, data_fim, status } = turma;
    const statusFinal = status || STATUS_TURMA_PADRAO;

    const [result] = await db.query(
        'INSERT INTO Turmas (nome_turma, id_curso, id_professor, data_inicio, data_fim, status) VALUES (?, ?, ?, ?, ?, ?)',
        [nome_turma, id_curso, id_professor, data_inicio, data_fim || null, statusFinal]
    );

    if (result.affectedRows === 0) {
        throw new Error('Erro ao criar turma');
    }

    return {
        id_turma: result.insertId,
        nome_turma,
        id_curso,
        id_professor,
        data_inicio,
        data_fim: data_fim || null,
        status: statusFinal
    };
}

async function atualizarTurma(id, dadosParaAtualizar) {
    const camposPermitidos = ['nome_turma', 'id_curso', 'id_professor', 'data_inicio', 'data_fim', 'status'];
    const colunasParaAtualizar = Object.keys(dadosParaAtualizar).filter((coluna) => camposPermitidos.includes(coluna));

    if (colunasParaAtualizar.length === 0) {
        throw new Error('Nenhum campo válido para atualizar.');
    }

    const setClause = colunasParaAtualizar.map(coluna => `${coluna} = ?`).join(',');
    const valoresParaAtualizar = colunasParaAtualizar.map((coluna) => dadosParaAtualizar[coluna]);
    const [result] = await db.query(`UPDATE Turmas SET ${setClause} WHERE id_turma = ?`, [...valoresParaAtualizar, id]);

    if (result.affectedRows === 0) {
        throw new Error('Turma não encontrada para atualizar!');
    }

    return { affectedRows: result.affectedRows };
}

async function buscarTurmaPorId(id) {
    const [result] = await db.query('SELECT * FROM Turmas WHERE id_turma = ?', [id]);
    if (result.length === 0) {
        throw new Error('Turma nÃ£o encontrada!');
    }
    return result[0];
}

async function buscarTodasTurmas() {
    const [result] = await db.query('SELECT * FROM Turmas');
    if (result.length === 0) {
        throw new Error('Nenhuma turma encontrada!');
    }
    return result;
}

async function deletarTurma(id) {
    const [result] = await db.query('DELETE FROM Turmas WHERE id_turma = ?', [id]);
    if (result.affectedRows === 0) {
        throw new Error('Turma nÃ£o encontrada para deletar!');
    }
    return { affectedRows: result.affectedRows };
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
    deletarTurma,
    professorEhDaTurma
};
