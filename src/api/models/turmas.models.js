const db = require('../../config/database');
const { route } = require('../routes/usuarios.routes');

async function criarTurma(turma) {
    const {nome_turma, id_curso, id_professor, status } = turma;
    const [result] = await db.query('INSERT INTO Turmas (nome_turma = ?, id_curso = ?, id_professor = ?, status = ?)', 
        [nome_turma, id_curso, id_professor, status]);
        if(result.affectedRows === 0) {
            throw new Error('Erro ao criar turma');
        }
        else{
            return { id_turma: result.insertId, nome_turma, id_curso, id_professor, status };
        }
}

async function atualizarTurma(id, dadosParaAtualizar) {
    const colunasParaAtualizar = Object.keys(dadosParaAtualizar);
    const setClause = colunasParaAtualizar.map(coluna=> `${coluna} = ?`).join(',');
    const valoresParaAtualizar = Object.values(dadosParaAtualizar);
    const [result] = await db.query(`UPDATE Turmas SET ${setClause} WHERE id_turma = ?`, [...valoresParaAtualizar, id]);
    return { affectedRows: result.affectedRows };
}

async function buscarTurmaPorId(id) {
    const [reult] = await db.query('SELECT * FROM Turmas WHERE id_turma = ?', [id]);
    if(result.length === 0) {
        console.error("Turma não encontrada:", error);
        throw new Error('Turma não encontrada!');
    }
    else{
        console.log("Turma encontrada:", result[0]);
        return result[0];
    }
}

async function buscarTodasTurmas() {
    const [result] = await db.query('SELECT * FROM Turmas');
    if(result.length === 0){
        console.error("Nenhuma turma encontrada.");
        throw new Error('Nenhuma turma encontrada!');
    }
    else{
        console.log("Turmas encontradas:", result);
        return result;
    }
}

async function deletarTurmar(id){
    const [result] = await db.query('DELETE FROM Turmas WHERE id_turma = ?', [id]);
    if(result.affectedRows === 0) {
        console.error("Turma não encontrada para deletar.");
        throw new Error('Turma não encontrada para deletar!');
    }
    else{
        console.log("Turma deletada com sucesso:", id);
        return { affectedRows: result.affectedRows };
    }
}

modules.exports = {
    criarTurma,
    atualizarTurma,
    buscarTurmaPorId,
    buscarTodasTurmas,
    deletarTurmar
};