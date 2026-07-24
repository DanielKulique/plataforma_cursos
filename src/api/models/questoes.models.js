const db = require('../../config/database');

const TIPOS_PERGUNTA_SUPORTADOS = new Set(['MULTIPLA_ESCOLHA', 'VERDADEIRO_FALSO']);

function questionnaireError(code, status, message) {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    return error;
}

async function buscarTurma(idTurma) {
    const [rows] = await db.query(
        'SELECT id_turma, id_professor FROM Turmas WHERE id_turma = ?',
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

async function matriculado(idAluno, idTurma) {
    const [rows] = await db.query(
        `SELECT 1 FROM Matriculas
         WHERE id_aluno = ? AND id_turma = ? AND status_aprovacao <> 'CANCELADO'`,
        [idAluno, idTurma]
    );
    return rows.length > 0;
}

async function criarQuestionario(idTurma, dados) {
    const [result] = await db.query(
        `INSERT INTO Questionarios (id_curso, id_turma, titulo, descricao, tipo, ativo)
         SELECT id_curso, ?, ?, ?, ?, ? FROM Turmas WHERE id_turma = ?`,
        [idTurma, dados.titulo, dados.descricao || '', dados.tipo, dados.ativo ?? true, idTurma]
    );
    return result.affectedRows
        ? { id_questionario: result.insertId, id_turma: Number(idTurma), ...dados }
        : null;
}

async function criarPergunta(idQuestionario, dados) {
    const conexao = await db.getConnection();
    try {
        await conexao.beginTransaction();
        const [pergunta] = await conexao.query(
            `INSERT INTO Q_Perguntas
             (id_questionario, texto_pergunta, tipo_pergunta, ordem, pontos)
             VALUES (?, ?, ?, ?, ?)`,
            [
                idQuestionario,
                dados.texto_pergunta,
                dados.tipo_pergunta || 'MULTIPLA_ESCOLHA',
                dados.ordem,
                dados.pontos || 1
            ]
        );
        for (const opcao of dados.opcoes) {
            await conexao.query(
                `INSERT INTO Q_Opcoes (id_pergunta, texto_opcao, ordem, correta)
                 VALUES (?, ?, ?, ?)`,
                [pergunta.insertId, opcao.texto_opcao, opcao.ordem, opcao.correta]
            );
        }
        await conexao.commit();
        return { id_pergunta: pergunta.insertId };
    } catch (error) {
        await conexao.rollback().catch(() => undefined);
        throw error;
    } finally {
        conexao.release();
    }
}

async function escopoQuestionario(idQuestionario) {
    const [rows] = await db.query(
        `SELECT q.id_questionario, q.id_turma, q.ativo, q.tipo, t.id_professor
         FROM Questionarios q
         INNER JOIN Turmas t ON t.id_turma = q.id_turma
         WHERE q.id_questionario = ?`,
        [idQuestionario]
    );
    return rows[0] || null;
}

async function escopoPergunta(idPergunta) {
    const [rows] = await db.query(
        `SELECT p.id_pergunta, q.id_turma, t.id_professor
         FROM Q_Perguntas p
         INNER JOIN Questionarios q ON q.id_questionario = p.id_questionario
         INNER JOIN Turmas t ON t.id_turma = q.id_turma
         WHERE p.id_pergunta = ?`,
        [idPergunta]
    );
    return rows[0] || null;
}

async function listarMetadadosTurma(idTurma) {
    const [rows] = await db.query(
        `SELECT q.id_questionario, q.id_turma, q.titulo, q.descricao, q.tipo, q.ativo,
                COUNT(p.id_pergunta) AS total_perguntas
         FROM Questionarios q
         LEFT JOIN Q_Perguntas p ON p.id_questionario = q.id_questionario
         WHERE q.id_turma = ?
         GROUP BY q.id_questionario, q.id_turma, q.titulo, q.descricao, q.tipo, q.ativo
         ORDER BY q.tipo, q.titulo, q.id_questionario`,
        [idTurma]
    );
    return rows;
}

async function listarAluno(idTurma, tipo) {
    const [questionarios] = await db.query(
        `SELECT id_questionario, id_turma, titulo, descricao, tipo
         FROM Questionarios
         WHERE id_turma = ? AND tipo = ? AND ativo = 1
         ORDER BY id_questionario DESC
         LIMIT 1`,
        [idTurma, tipo]
    );
    if (!questionarios.length) return null;

    const questionario = questionarios[0];
    const [perguntas] = await db.query(
        `SELECT id_pergunta, texto_pergunta, tipo_pergunta, ordem, pontos
         FROM Q_Perguntas
         WHERE id_questionario = ?
         ORDER BY ordem, id_pergunta`,
        [questionario.id_questionario]
    );
    if (perguntas.some((pergunta) => !TIPOS_PERGUNTA_SUPORTADOS.has(pergunta.tipo_pergunta))) {
        throw questionnaireError(
            'TIPO_PERGUNTA_NAO_SUPORTADO',
            409,
            'Este questionário contém um tipo de pergunta ainda não suportado.'
        );
    }

    if (perguntas.length) {
        const ids = perguntas.map((pergunta) => pergunta.id_pergunta);
        const [opcoes] = await db.query(
            `SELECT id_opcao, id_pergunta, texto_opcao, ordem
             FROM Q_Opcoes
             WHERE id_pergunta IN (${ids.map(() => '?').join(', ')})
             ORDER BY id_pergunta, ordem, id_opcao`,
            ids
        );
        for (const pergunta of perguntas) {
            pergunta.opcoes = opcoes.filter(
                (opcao) => Number(opcao.id_pergunta) === Number(pergunta.id_pergunta)
            ).map(({ id_opcao, texto_opcao, ordem }) => ({ id_opcao, texto_opcao, ordem }));
        }
    }

    return { ...questionario, perguntas };
}

async function atualizarPergunta(idPergunta, dados) {
    const permitidos = ['texto_pergunta', 'tipo_pergunta', 'ordem', 'pontos'];
    const campos = Object.keys(dados).filter((campo) => permitidos.includes(campo));
    if (!campos.length) return false;
    const [result] = await db.query(
        `UPDATE Q_Perguntas
         SET ${campos.map((campo) => `${campo} = ?`).join(', ')}
         WHERE id_pergunta = ?`,
        [...campos.map((campo) => dados[campo]), idPergunta]
    );
    return result.affectedRows > 0;
}

async function removerPergunta(idPergunta) {
    const [result] = await db.query('DELETE FROM Q_Perguntas WHERE id_pergunta = ?', [idPergunta]);
    return result.affectedRows > 0;
}

function validarRespostas(perguntas, respostas) {
    const idsEsperados = new Set(perguntas.map((pergunta) => Number(pergunta.id_pergunta)));
    const idsRecebidos = respostas.map((resposta) => Number(resposta.id_pergunta));
    const idsUnicos = new Set(idsRecebidos);

    if (idsUnicos.size !== idsRecebidos.length) {
        throw questionnaireError(
            'RESPOSTA_DUPLICADA',
            400,
            'Cada pergunta aceita no máximo uma resposta.'
        );
    }
    if (respostas.length !== perguntas.length
        || idsRecebidos.some((id) => !idsEsperados.has(id))
        || perguntas.some((pergunta) => !idsUnicos.has(Number(pergunta.id_pergunta)))) {
        throw questionnaireError(
            'RESPOSTAS_INCOMPLETAS',
            400,
            'Envie exatamente uma resposta para cada pergunta do questionário.'
        );
    }
}

async function submeter(idQuestionario, idAluno, respostas) {
    const conexao = await db.getConnection();
    try {
        await conexao.beginTransaction();

        const [questionarios] = await conexao.query(
            `SELECT id_questionario, id_turma, ativo
             FROM Questionarios
             WHERE id_questionario = ?
             FOR UPDATE`,
            [idQuestionario]
        );
        if (!questionarios.length || !questionarios[0].ativo) {
            throw questionnaireError(
                'QUESTIONARIO_INDISPONIVEL',
                404,
                'Questionário inexistente ou inativo.'
            );
        }
        const idTurma = questionarios[0].id_turma;

        const [matriculas] = await conexao.query(
            `SELECT id_matricula
             FROM Matriculas
             WHERE id_aluno = ? AND id_turma = ? AND status_aprovacao <> 'CANCELADO'
             FOR UPDATE`,
            [idAluno, idTurma]
        );
        if (!matriculas.length) {
            throw questionnaireError(
                'ALUNO_NAO_MATRICULADO',
                403,
                'Aluno não matriculado nesta turma.'
            );
        }

        const [perguntas] = await conexao.query(
            `SELECT id_pergunta, tipo_pergunta, pontos
             FROM Q_Perguntas
             WHERE id_questionario = ?
             ORDER BY ordem, id_pergunta`,
            [idQuestionario]
        );
        if (!perguntas.length) {
            throw questionnaireError(
                'QUESTIONARIO_SEM_PERGUNTAS',
                409,
                'O questionário ainda não possui perguntas respondíveis.'
            );
        }
        if (perguntas.some((pergunta) => !TIPOS_PERGUNTA_SUPORTADOS.has(pergunta.tipo_pergunta))) {
            throw questionnaireError(
                'TIPO_PERGUNTA_NAO_SUPORTADO',
                409,
                'Este questionário contém um tipo de pergunta ainda não suportado.'
            );
        }

        validarRespostas(perguntas, respostas);

        const idsOpcoes = respostas.map((resposta) => Number(resposta.id_opcao));
        const [opcoes] = await conexao.query(
            `SELECT id_opcao, id_pergunta, correta
             FROM Q_Opcoes
             WHERE id_opcao IN (${idsOpcoes.map(() => '?').join(', ')})`,
            idsOpcoes
        );
        const opcoesPorId = new Map(opcoes.map((opcao) => [Number(opcao.id_opcao), opcao]));
        for (const resposta of respostas) {
            const opcao = opcoesPorId.get(Number(resposta.id_opcao));
            if (!opcao || Number(opcao.id_pergunta) !== Number(resposta.id_pergunta)) {
                throw questionnaireError(
                    'OPCAO_INVALIDA',
                    400,
                    'Uma opção enviada não pertence à pergunta correspondente.'
                );
            }
        }

        const [tentativa] = await conexao.query(
            `INSERT INTO Q_Tentativas
             (id_questionario, id_usuario, id_turma, total_perguntas)
             VALUES (?, ?, ?, ?)`,
            [idQuestionario, idAluno, idTurma, perguntas.length]
        );

        let acertos = 0;
        let pontuacao = 0;
        let pontosTotais = 0;
        const respostaPorPergunta = new Map(
            respostas.map((resposta) => [Number(resposta.id_pergunta), resposta])
        );
        for (const pergunta of perguntas) {
            const resposta = respostaPorPergunta.get(Number(pergunta.id_pergunta));
            const opcao = opcoesPorId.get(Number(resposta.id_opcao));
            const correta = Boolean(opcao.correta);
            pontosTotais += Number(pergunta.pontos);
            if (correta) {
                acertos += 1;
                pontuacao += Number(pergunta.pontos);
            }
            await conexao.query(
                `INSERT INTO Q_Respostas
                 (id_pergunta, id_usuario, id_questionario, id_tentativa, resposta_opcao, correta)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    pergunta.id_pergunta,
                    idAluno,
                    idQuestionario,
                    tentativa.insertId,
                    resposta.id_opcao,
                    correta
                ]
            );
        }

        const percentual = pontosTotais
            ? Number(((pontuacao / pontosTotais) * 100).toFixed(2))
            : 0;
        await conexao.query(
            `UPDATE Q_Tentativas
             SET acertos = ?, pontuacao = ?, percentual = ?, finalizada_em = NOW()
             WHERE id_tentativa = ?`,
            [acertos, pontuacao, percentual, tentativa.insertId]
        );
        await conexao.commit();

        return {
            id_tentativa: tentativa.insertId,
            acertos,
            total_perguntas: perguntas.length,
            pontuacao,
            percentual
        };
    } catch (error) {
        await conexao.rollback().catch(() => undefined);
        throw error;
    } finally {
        conexao.release();
    }
}

async function historico(idAluno, idQuestionario = null) {
    const params = [idAluno];
    let filtro = '';
    if (idQuestionario) {
        filtro = ' AND t.id_questionario = ?';
        params.push(idQuestionario);
    }
    const [rows] = await db.query(
        `SELECT t.id_tentativa, t.id_questionario, q.id_turma, q.titulo, q.tipo,
                t.pontuacao, t.percentual, t.acertos, t.total_perguntas,
                t.iniciada_em, t.finalizada_em
         FROM Q_Tentativas t
         INNER JOIN Questionarios q ON q.id_questionario = t.id_questionario
         WHERE t.id_usuario = ?${filtro}
         ORDER BY t.iniciada_em DESC, t.id_tentativa DESC`,
        params
    );
    return rows;
}

async function resultadosTurma(idTurma) {
    const [rows] = await db.query(
        `SELECT t.id_tentativa, t.id_questionario, t.id_usuario, t.id_turma,
                t.pontuacao, t.percentual, t.acertos, t.total_perguntas,
                t.iniciada_em, t.finalizada_em, u.nome_completo, q.titulo, q.tipo
         FROM Q_Tentativas t
         INNER JOIN Usuarios u ON u.id_usuario = t.id_usuario
         INNER JOIN Questionarios q ON q.id_questionario = t.id_questionario
         WHERE t.id_turma = ?
         ORDER BY t.iniciada_em DESC, t.id_tentativa DESC`,
        [idTurma]
    );
    return rows;
}

module.exports = {
    buscarTurma,
    professorEhDaTurma,
    matriculado,
    criarQuestionario,
    criarPergunta,
    escopoQuestionario,
    escopoPergunta,
    listarMetadadosTurma,
    listarAluno,
    atualizarPergunta,
    removerPergunta,
    submeter,
    historico,
    resultadosTurma
};
