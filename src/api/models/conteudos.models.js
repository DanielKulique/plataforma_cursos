const db = require('../../config/database');

function flowError(code, status, message) {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    return error;
}

async function buscarTurma(idTurma) {
    const [rows] = await db.query(
        'SELECT id_turma, id_professor, status FROM Turmas WHERE id_turma = ?',
        [idTurma]
    );
    return rows[0] || null;
}

async function professorEhDaTurma(idProfessor, idTurma) {
    const [rows] = await db.query(
        'SELECT 1 FROM Turmas WHERE id_turma = ? AND id_professor = ?',
        [idTurma, idProfessor]
    );
    return rows.length > 0;
}

async function alunoEstaMatriculado(idAluno, idTurma) {
    const [rows] = await db.query(
        `SELECT id_matricula
         FROM Matriculas
         WHERE id_aluno = ? AND id_turma = ? AND status_aprovacao <> 'CANCELADO'`,
        [idAluno, idTurma]
    );
    return rows.length > 0;
}

async function listarModulos(idTurma) {
    const [rows] = await db.query(
        `SELECT id_modulo, id_turma, titulo, descricao, ordem
         FROM Modulos
         WHERE id_turma = ?
         ORDER BY ordem, id_modulo`,
        [idTurma]
    );
    return rows;
}

async function listar(idTurma, idAluno = null) {
    const [rows] = await db.query(
        `SELECT c.id_conteudo, c.id_turma, c.id_modulo, c.titulo, c.descricao, c.tipo,
                c.url, c.corpo, c.duracao_minutos, c.ordem,
                COALESCE(p.status, 'NAO_INICIADO') AS status_progresso,
                COALESCE(p.status = 'CONCLUIDO', 0) AS concluido,
                COALESCE(p.status = 'INICIADO', 0) AS em_andamento
         FROM Conteudos c
         LEFT JOIN ConteudosProgresso p
           ON p.id_conteudo = c.id_conteudo AND p.id_aluno = ?
         WHERE c.id_turma = ?
         ORDER BY c.ordem, c.id_conteudo`,
        [idAluno, idTurma]
    );
    return rows;
}

async function criar(idTurma, dados) {
    const {
        id_modulo = null,
        titulo,
        descricao = null,
        tipo,
        url = null,
        corpo = null,
        duracao_minutos = null,
        ordem
    } = dados;
    const [result] = await db.query(
        `INSERT INTO Conteudos
         (id_turma, id_modulo, titulo, descricao, tipo, url, corpo, duracao_minutos, ordem)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [idTurma, id_modulo, titulo, descricao, tipo, url, corpo, duracao_minutos, ordem]
    );
    return { id_conteudo: result.insertId, id_turma: Number(idTurma), ...dados };
}

async function atualizar(idConteudo, dados) {
    const permitidos = ['id_modulo', 'titulo', 'descricao', 'tipo', 'url', 'corpo', 'duracao_minutos', 'ordem'];
    const campos = Object.keys(dados).filter((campo) => permitidos.includes(campo));
    if (!campos.length) return false;
    const [result] = await db.query(
        `UPDATE Conteudos SET ${campos.map((campo) => `${campo} = ?`).join(', ')} WHERE id_conteudo = ?`,
        [...campos.map((campo) => dados[campo]), idConteudo]
    );
    return result.affectedRows > 0;
}

async function remover(idConteudo) {
    const [result] = await db.query('DELETE FROM Conteudos WHERE id_conteudo = ?', [idConteudo]);
    return result.affectedRows > 0;
}

async function buscarEscopo(idConteudo) {
    const [rows] = await db.query(
        `SELECT c.id_conteudo, c.id_turma, t.id_professor
         FROM Conteudos c
         INNER JOIN Turmas t ON t.id_turma = c.id_turma
         WHERE c.id_conteudo = ?`,
        [idConteudo]
    );
    return rows[0] || null;
}

async function registrarProgresso(idAluno, idConteudo, novoStatus) {
    const conexao = await db.getConnection();
    try {
        await conexao.beginTransaction();

        const [conteudos] = await conexao.query(
            'SELECT id_conteudo, id_turma FROM Conteudos WHERE id_conteudo = ? FOR UPDATE',
            [idConteudo]
        );
        if (!conteudos.length) {
            throw flowError('CONTEUDO_NAO_ENCONTRADO', 404, 'Conteúdo não encontrado.');
        }

        const idTurma = conteudos[0].id_turma;
        const [matriculas] = await conexao.query(
            `SELECT id_matricula
             FROM Matriculas
             WHERE id_aluno = ? AND id_turma = ? AND status_aprovacao <> 'CANCELADO'
             FOR UPDATE`,
            [idAluno, idTurma]
        );
        if (!matriculas.length) {
            throw flowError('ALUNO_NAO_MATRICULADO', 403, 'Aluno não matriculado nesta turma.');
        }

        await conexao.query(
            `INSERT INTO ConteudosProgresso
             (id_aluno, id_conteudo, status, iniciado_em, concluido_em)
             VALUES (?, ?, ?, NOW(), IF(? = 'CONCLUIDO', NOW(), NULL))
             ON DUPLICATE KEY UPDATE
                status = IF(status = 'CONCLUIDO', status, VALUES(status)),
                iniciado_em = COALESCE(iniciado_em, NOW()),
                concluido_em = IF(
                    VALUES(status) = 'CONCLUIDO',
                    COALESCE(concluido_em, NOW()),
                    concluido_em
                )`,
            [idAluno, idConteudo, novoStatus, novoStatus]
        );

        const [totais] = await conexao.query(
            `SELECT COUNT(c.id_conteudo) AS total,
                    COALESCE(SUM(p.status = 'CONCLUIDO'), 0) AS concluidos
             FROM Conteudos c
             LEFT JOIN ConteudosProgresso p
               ON p.id_conteudo = c.id_conteudo AND p.id_aluno = ?
             WHERE c.id_turma = ?`,
            [idAluno, idTurma]
        );
        const total = Number(totais[0].total);
        const concluidos = Number(totais[0].concluidos);
        const percentual = total ? Math.round((concluidos / total) * 100) : 0;

        await conexao.query(
            'UPDATE Matriculas SET progresso_percentual = ? WHERE id_matricula = ?',
            [percentual, matriculas[0].id_matricula]
        );
        const [progresso] = await conexao.query(
            `SELECT status, iniciado_em, concluido_em
             FROM ConteudosProgresso
             WHERE id_aluno = ? AND id_conteudo = ?`,
            [idAluno, idConteudo]
        );

        await conexao.commit();
        return {
            id_conteudo: Number(idConteudo),
            status: progresso[0].status,
            progresso_percentual: percentual,
            iniciado_em: progresso[0].iniciado_em,
            concluido_em: progresso[0].concluido_em
        };
    } catch (error) {
        await conexao.rollback().catch(() => undefined);
        throw error;
    } finally {
        conexao.release();
    }
}

async function listarProgressoTurma(idTurma) {
    const [rows] = await db.query(
        `SELECT m.id_aluno, u.nome_completo, m.progresso_percentual
         FROM Matriculas m
         INNER JOIN Usuarios u ON u.id_usuario = m.id_aluno
         WHERE m.id_turma = ? AND m.status_aprovacao <> 'CANCELADO'
         ORDER BY u.nome_completo`,
        [idTurma]
    );
    return rows;
}

module.exports = {
    buscarTurma,
    professorEhDaTurma,
    alunoEstaMatriculado,
    listarModulos,
    listar,
    criar,
    atualizar,
    remover,
    buscarEscopo,
    registrarProgresso,
    listarProgressoTurma
};
