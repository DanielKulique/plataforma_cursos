// Fixture explícita: provas legadas não são inferidas como finais.
async function seedProvaFinalAprovada(pool, idAluno, idTurma) {
    const [[turma]] = await pool.query('SELECT id_curso FROM Turmas WHERE id_turma = ?', [idTurma]);
    const [prova] = await pool.query(
        `INSERT INTO Questionarios (id_curso,id_turma,titulo,descricao,tipo,prova_final)
         VALUES (?,?,'Prova final explícita','Fixture acadêmica','PROVA',1)`, [turma.id_curso,idTurma]);
    await pool.query(
        `INSERT INTO Q_Tentativas (id_questionario,id_usuario,id_turma,total_perguntas,percentual,finalizada_em,chave_idempotencia)
         VALUES (?,?,?,1,75,NOW(),UUID())`, [prova.insertId,idAluno,idTurma]);
    return prova.insertId;
}
module.exports={seedProvaFinalAprovada};
