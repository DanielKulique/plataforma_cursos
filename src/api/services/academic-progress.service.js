'use strict';

const PERCENTUAL_LIBERACAO_PROVA = 80;

// Todos os registros de Conteudos contam, independentemente do tipo ou módulo.
// Questionarios (exercícios/provas) não participam deste progresso.
const COLUNAS_PROGRESSO_DERIVADO = `
    (SELECT COUNT(*) FROM Conteudos c WHERE c.id_turma = m.id_turma) AS total_conteudos,
    (SELECT COUNT(*) FROM Conteudos c
     INNER JOIN ConteudosProgresso p ON p.id_conteudo = c.id_conteudo
       AND p.id_aluno = m.id_aluno AND p.status = 'CONCLUIDO'
     WHERE c.id_turma = m.id_turma) AS conteudos_concluidos`;

function resumirProgresso(total, concluidos) {
    total = Number(total || 0);
    concluidos = Number(concluidos || 0);
    return {
        total_conteudos: total,
        conteudos_concluidos: concluidos,
        progresso_percentual: total > 0
            ? Math.min(100, Math.max(0, Math.round(concluidos / total * 100))) : 0,
        conteudo_concluido: total > 0 && concluidos === total
    };
}

function normalizarProgresso(row) {
    const normalizada = { ...row, ...resumirProgresso(row.total_conteudos, row.conteudos_concluidos) };
    if (Object.prototype.hasOwnProperty.call(row, 'ciclo_atual')) {
        normalizada.ciclo_atual = Number(row.ciclo_atual);
    }
    if (Object.prototype.hasOwnProperty.call(row, 'nota_final')) {
        normalizada.nota_final = row.nota_final === null ? null : Number(row.nota_final);
    }
    return normalizada;
}

// Em operações de escrita, chamar após o bloqueio da turma/matrícula,
// na mesma transação, antes de qualquer efeito de emissão.
async function buscarProgresso(connection, idAluno, idTurma) {
    const [rows] = await connection.query(
        `SELECT COUNT(c.id_conteudo) AS total,
                COALESCE(SUM(p.status = 'CONCLUIDO'), 0) AS concluidos
         FROM Conteudos c
         LEFT JOIN ConteudosProgresso p
           ON p.id_conteudo = c.id_conteudo AND p.id_aluno = ?
         WHERE c.id_turma = ?`,
        [idAluno, idTurma]
    );
    return resumirProgresso(rows[0].total, rows[0].concluidos);
}

function resumirRequisitos(progresso, totalExercicios, exerciciosRealizados, provaFinalAprovada) {
    const total = progresso.total_conteudos + Number(totalExercicios || 0);
    const realizados = progresso.conteudos_concluidos + Number(exerciciosRealizados || 0);
    return {
        ...progresso,
        total_exercicios: Number(totalExercicios || 0),
        exercicios_realizados: Number(exerciciosRealizados || 0),
        total_trilha: total, trilha_realizada: realizados,
        progresso_para_prova: total ? Math.round(realizados / total * 100) : 0,
        requisito_percentual_prova: PERCENTUAL_LIBERACAO_PROVA,
        prova_liberada: total > 0 && realizados * 100 >= total * PERCENTUAL_LIBERACAO_PROVA,
        prova_final_aprovada: Boolean(Number(provaFinalAprovada)),
        elegivel_aprovacao: progresso.conteudo_concluido && Boolean(Number(provaFinalAprovada))
    };
}

async function buscarRequisitos(connection, idAluno, idTurma) {
    const progresso = await buscarProgresso(connection, idAluno, idTurma);
    const [rows] = await connection.query(
        `SELECT m.status_aprovacao, m.ciclo_atual,
                (SELECT COUNT(*) FROM Questionarios q
                 WHERE q.id_turma = ? AND q.tipo = 'EXERCICIO' AND q.ativo = 1) AS total_exercicios,
                (SELECT COUNT(*) FROM Questionarios q
                 WHERE q.id_turma = ? AND q.tipo = 'EXERCICIO' AND q.ativo = 1
                   AND EXISTS(SELECT 1 FROM Q_Tentativas t
                       WHERE t.id_questionario = q.id_questionario AND t.id_usuario = m.id_aluno
                         AND t.id_turma = m.id_turma AND t.ciclo_matricula = m.ciclo_atual
                         AND t.finalizada_em IS NOT NULL)) AS exercicios_realizados,
                EXISTS(SELECT 1 FROM Questionarios f INNER JOIN Q_Tentativas t
                    ON t.id_questionario = f.id_questionario AND t.id_turma = f.id_turma
                    WHERE f.id_turma = ? AND f.tipo = 'PROVA' AND f.prova_final = 1 AND f.ativo = 1
                      AND t.id_usuario = m.id_aluno AND t.ciclo_matricula = m.ciclo_atual
                      AND t.finalizada_em IS NOT NULL AND t.percentual >= 75) AS prova_final_aprovada
         FROM Matriculas m WHERE m.id_aluno = ? AND m.id_turma = ?`,
        [idTurma, idTurma, idTurma, idAluno, idTurma]
    );
    const row = rows[0] || {};
    return {
        ...resumirRequisitos(progresso, row.total_exercicios, row.exercicios_realizados, row.prova_final_aprovada),
        status_aprovacao: row.status_aprovacao,
        ciclo_atual: row.ciclo_atual == null ? null : Number(row.ciclo_atual)
    };
}

function exigirProvaLiberada(requisitos) {
    if (!requisitos.prova_liberada) {
        throw Object.assign(new Error('Disponível após concluir 80% da trilha.'), {
            code: 'PROVA_FINAL_BLOQUEADA', status: 409
        });
    }
}

async function avaliarAprovacao(connection, idAluno, idTurma) {
    // Chamadores já detêm os locks da turma/matrícula; não abre outra transação.
    const requisitos = await buscarRequisitos(connection, idAluno, idTurma);
    if (requisitos.elegivel_aprovacao) {
        const [result] = await connection.query(
            `UPDATE Matriculas SET status_aprovacao = 'APROVADO'
             WHERE id_aluno = ? AND id_turma = ? AND status_aprovacao = 'CURSANDO'`,
            [idAluno, idTurma]
        );
        if (result.affectedRows) requisitos.status_aprovacao = 'APROVADO';
    }
    return requisitos;
}

module.exports = { buscarRequisitos, resumirRequisitos, exigirProvaLiberada, avaliarAprovacao, COLUNAS_PROGRESSO_DERIVADO, resumirProgresso, normalizarProgresso, buscarProgresso, PERCENTUAL_LIBERACAO_PROVA };
