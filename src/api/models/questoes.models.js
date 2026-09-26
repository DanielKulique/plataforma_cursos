const db = require('../../config/database');
const { lockTurmaParaMutacao, localizarRecurso, bloquearTurma, bloquearRecurso } = require('../services/academic-access.service');
const { buscarRequisitos, exigirProvaLiberada, avaliarAprovacao } = require('../services/academic-progress.service');

const TIPOS_PERGUNTA_SUPORTADOS = new Set(['MULTIPLA_ESCOLHA', 'VERDADEIRO_FALSO']);

function questionnaireError(code, status, message) {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    return error;
}

async function exigirAvaliacaoSemHistorico(conexao, idQuestionario, code = 'QUESTIONARIO_COM_HISTORICO') {
    const [tentativas] = await conexao.query(
        'SELECT id_tentativa FROM Q_Tentativas WHERE id_questionario = ? LIMIT 1 FOR UPDATE', [idQuestionario]
    );
    const [respostas] = await conexao.query(
        'SELECT id_resposta FROM Q_Respostas WHERE id_questionario = ? LIMIT 1 FOR UPDATE', [idQuestionario]
    );
    if (tentativas.length || respostas.length) throw questionnaireError(
        code, 409,
        'Avaliação com histórico não permite alterar enunciado, tipo, perguntas, alternativas ou gabarito; somente disponibilidade, aula e ordem podem ser ajustadas.'
    );
}

async function iniciarAutoria(conexao, tipo, id, usuario, congelar = true) {
    const contexto = await localizarRecurso(conexao, tipo, id);
    await conexao.beginTransaction();
    const turma = await lockTurmaParaMutacao(conexao, contexto.idTurma, usuario);
    const recurso = await bloquearRecurso(conexao, contexto);
    if (congelar) await exigirAvaliacaoSemHistorico(conexao, contexto.cadeia[0].row.id_questionario,
        tipo === 'questionario' ? 'QUESTIONARIO_COM_HISTORICO' : 'PERGUNTA_COM_HISTORICO');
    return { ...recurso, id_turma: turma.id_turma };
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

async function matriculado(idAluno, idTurma) {
    const [rows] = await db.query(
        `SELECT 1 FROM Matriculas
         WHERE id_aluno = ? AND id_turma = ? AND status_aprovacao <> 'CANCELADO'`,
        [idAluno, idTurma]
    );
    return rows.length > 0;
}

async function validarAula(conexao, idModulo, idTurma) {
    if (idModulo == null) return;
    const [rows] = await conexao.query(
        'SELECT id_modulo FROM Modulos WHERE id_modulo = ? AND id_turma = ? FOR UPDATE',
        [idModulo, idTurma]
    );
    if (!rows.length) throw questionnaireError('MODULO_FORA_DA_TURMA', 409, 'A aula informada não pertence à turma.');
}

async function criarQuestionario(idTurma, dados, usuario) {
    const conexao = await db.getConnection();
    try {
        await conexao.beginTransaction();
        await lockTurmaParaMutacao(conexao, idTurma, usuario);
        await validarAula(conexao, dados.id_modulo, idTurma);
        const [result] = await conexao.query(
            `INSERT INTO Questionarios (id_curso, id_turma, titulo, descricao, tipo, ativo, id_modulo, ordem, prova_final)
             SELECT id_curso, ?, ?, ?, ?, ?, ?, ?, ? FROM Turmas WHERE id_turma = ?`,
            [idTurma, dados.titulo, dados.descricao || '', dados.tipo, dados.ativo ?? true,
                dados.id_modulo ?? null, dados.ordem ?? 0, dados.prova_final ? 1 : null, idTurma]
        );
        await conexao.commit();
        return { id_questionario: result.insertId, id_turma: Number(idTurma), ...dados };
    } catch (error) {
        await conexao.rollback().catch(() => undefined);
        if (error.code === 'ER_DUP_ENTRY' && String(error.message).includes('uk_prova_final_turma')) {
            throw questionnaireError('PROVA_FINAL_DUPLICADA', 409, 'A turma já possui uma prova final.');
        }
        if (error.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
            throw questionnaireError('PROVA_FINAL_INVALIDA', 400, 'Somente uma PROVA pode ser marcada como final.');
        }
        throw error;
    } finally {
        conexao.release();
    }
}

async function criarPergunta(idQuestionario, dados, usuario) {
    const conexao = await db.getConnection();
    try {
        await iniciarAutoria(conexao, 'questionario', idQuestionario, usuario);
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
        if (error?.errno === 1062) {
            const alternativa = String(error.message).includes('uk_opcao_pergunta_ordem');
            throw questionnaireError(
                alternativa ? 'ORDEM_OPCAO_DUPLICADA' : 'ORDEM_PERGUNTA_DUPLICADA',
                409,
                alternativa
                    ? 'As alternativas devem possuir ordens diferentes.'
                    : 'Já existe uma pergunta nesta ordem.'
            );
        }
        throw error;
    } finally {
        conexao.release();
    }
}

async function escopoQuestionario(idQuestionario) {
    const [rows] = await db.query(
        `SELECT q.id_questionario, q.id_turma, q.ativo, q.tipo, q.prova_final, t.id_professor,
                t.status AS status_turma
         FROM Questionarios q
         INNER JOIN Turmas t ON t.id_turma = q.id_turma
         WHERE q.id_questionario = ?`,
        [idQuestionario]
    );
    return rows[0] || null;
}

async function atualizarQuestionario(idQuestionario, dados, usuario) {
    if (Object.prototype.hasOwnProperty.call(dados, 'prova_final')) dados.prova_final = dados.prova_final ? 1 : null;
    const campos = Object.keys(dados).filter(
        (campo) => ['titulo', 'descricao', 'tipo', 'ativo', 'id_modulo', 'ordem', 'prova_final'].includes(campo)
    );
    if (!campos.length) return false;
    const conexao = await db.getConnection();
    try {
        const questionarios = [await iniciarAutoria(conexao, 'questionario', idQuestionario, usuario, campos.some((campo) => !['ativo', 'id_modulo', 'ordem'].includes(campo)))];
        await validarAula(conexao, dados.id_modulo, questionarios[0].id_turma);
        const [result] = await conexao.query(
            `UPDATE Questionarios
             SET ${campos.map((campo) => `${campo} = ?`).join(', ')}
             WHERE id_questionario = ?`,
            [...campos.map((campo) => dados[campo]), idQuestionario]
        );
        await conexao.commit();
        return result.affectedRows > 0;
    } catch (error) {
        await conexao.rollback().catch(() => undefined);
        if (error.code === 'ER_DUP_ENTRY' && String(error.message).includes('uk_prova_final_turma')) throw questionnaireError('PROVA_FINAL_DUPLICADA', 409, 'A turma já possui uma prova final.');
        if (error.code === 'ER_CHECK_CONSTRAINT_VIOLATED') throw questionnaireError('PROVA_FINAL_INVALIDA', 400, 'Somente uma PROVA pode ser marcada como final.');
        throw error;
    } finally {
        conexao.release();
    }
}

async function removerQuestionario(idQuestionario, usuario) {
    const conexao = await db.getConnection();
    try {
        await iniciarAutoria(conexao, 'questionario', idQuestionario, usuario);
        await conexao.query('DELETE FROM Questionarios WHERE id_questionario = ?', [idQuestionario]);
        await conexao.commit();
        return true;
    } catch (error) {
        await conexao.rollback().catch(() => undefined);
        throw error;
    } finally {
        conexao.release();
    }
}

async function escopoPergunta(idPergunta) {
    const [rows] = await db.query(
        `SELECT p.id_pergunta, q.id_turma, t.id_professor, t.status AS status_turma
         FROM Q_Perguntas p
         INNER JOIN Questionarios q ON q.id_questionario = p.id_questionario
         INNER JOIN Turmas t ON t.id_turma = q.id_turma
         WHERE p.id_pergunta = ?`,
        [idPergunta]
    );
    return rows[0] || null;
}

async function escopoOpcao(idOpcao) {
    const [rows] = await db.query(
        `SELECT opcao.id_opcao, pergunta.id_pergunta, questionario.id_turma,
                turma.id_professor, turma.status AS status_turma
         FROM Q_Opcoes opcao
         INNER JOIN Q_Perguntas pergunta ON pergunta.id_pergunta = opcao.id_pergunta
         INNER JOIN Questionarios questionario
           ON questionario.id_questionario = pergunta.id_questionario
         INNER JOIN Turmas turma ON turma.id_turma = questionario.id_turma
         WHERE opcao.id_opcao = ?`,
        [idOpcao]
    );
    return rows[0] || null;
}

async function criarOpcao(idPergunta, dados, usuario) {
    const conexao = await db.getConnection();
    try {
        await iniciarAutoria(conexao, 'pergunta', idPergunta, usuario);
        if (dados.correta) {
            await conexao.query('UPDATE Q_Opcoes SET correta = 0 WHERE id_pergunta = ?', [idPergunta]);
        }
        const [result] = await conexao.query(
            `INSERT INTO Q_Opcoes (id_pergunta, texto_opcao, ordem, correta)
             VALUES (?, ?, ?, ?)`,
            [idPergunta, dados.texto_opcao, dados.ordem, dados.correta]
        );
        await conexao.commit();
        return { id_opcao: result.insertId, id_pergunta: Number(idPergunta), ...dados };
    } catch (error) {
        await conexao.rollback().catch(() => undefined);
        if (error?.errno === 1062) {
            throw questionnaireError('ORDEM_OPCAO_DUPLICADA', 409, 'Já existe uma alternativa nesta ordem.');
        }
        throw error;
    } finally {
        conexao.release();
    }
}

async function atualizarOpcao(idOpcao, dados, usuario) {
    const campos = Object.keys(dados).filter(
        (campo) => ['texto_opcao', 'ordem', 'correta'].includes(campo)
    );
    if (!campos.length) return false;
    const conexao = await db.getConnection();
    try {
        const opcoes = [await iniciarAutoria(conexao, 'opcao', idOpcao, usuario)];
        let opcaoTrocada = null;
        if (Object.prototype.hasOwnProperty.call(dados, 'ordem')
            && Number(dados.ordem) !== Number(opcoes[0].ordem)) {
            const [[conflito]] = await conexao.query(
                `SELECT id_opcao FROM Q_Opcoes
                 WHERE id_pergunta = ? AND ordem = ? AND id_opcao <> ? FOR UPDATE`,
                [opcoes[0].id_pergunta, dados.ordem, idOpcao]
            );
            if (conflito) {
                opcaoTrocada = conflito.id_opcao;
                await conexao.query('UPDATE Q_Opcoes SET ordem = -1 WHERE id_opcao = ?', [opcaoTrocada]);
            }
        }
        if (dados.correta === false && Boolean(opcoes[0].correta)) {
            throw questionnaireError(
                'GABARITO_OBRIGATORIO', 409,
                'Defina outra alternativa como correta antes de desmarcar esta.'
            );
        }
        if (dados.correta === true) {
            await conexao.query(
                'UPDATE Q_Opcoes SET correta = 0 WHERE id_pergunta = ? AND id_opcao <> ?',
                [opcoes[0].id_pergunta, idOpcao]
            );
        }
        const [result] = await conexao.query(
            `UPDATE Q_Opcoes SET ${campos.map((campo) => `${campo} = ?`).join(', ')}
             WHERE id_opcao = ?`,
            [...campos.map((campo) => dados[campo]), idOpcao]
        );
        if (opcaoTrocada) {
            await conexao.query(
                'UPDATE Q_Opcoes SET ordem = ? WHERE id_opcao = ?',
                [opcoes[0].ordem, opcaoTrocada]
            );
        }
        await conexao.commit();
        return result.affectedRows > 0;
    } catch (error) {
        await conexao.rollback().catch(() => undefined);
        if (error?.errno === 1062) {
            throw questionnaireError('ORDEM_OPCAO_DUPLICADA', 409, 'Já existe uma alternativa nesta ordem.');
        }
        throw error;
    } finally {
        conexao.release();
    }
}

async function removerOpcao(idOpcao, usuario) {
    const conexao = await db.getConnection();
    try {
        const opcoes = [await iniciarAutoria(conexao, 'opcao', idOpcao, usuario)];
        const [alternativas] = await conexao.query(
            'SELECT id_opcao FROM Q_Opcoes WHERE id_pergunta = ? FOR UPDATE',
            [opcoes[0].id_pergunta]
        );
        if (alternativas.length <= 2) {
            throw questionnaireError(
                'MINIMO_OPCOES', 409,
                'A pergunta deve manter pelo menos duas alternativas.'
            );
        }
        if (opcoes[0].correta) {
            throw questionnaireError(
                'GABARITO_OBRIGATORIO', 409,
                'Defina outra alternativa como correta antes de excluir esta.'
            );
        }
        await conexao.query('DELETE FROM Q_Opcoes WHERE id_opcao = ?', [idOpcao]);
        await conexao.commit();
        return true;
    } catch (error) {
        await conexao.rollback().catch(() => undefined);
        throw error;
    } finally {
        conexao.release();
    }
}

async function listarMetadadosTurma(idTurma) {
    const [questionarios] = await db.query(
        `SELECT q.id_questionario, q.id_turma, q.titulo, q.descricao, q.tipo, q.ativo,
                q.id_modulo, q.ordem, q.prova_final,
                (EXISTS(SELECT 1 FROM Q_Tentativas t WHERE t.id_questionario = q.id_questionario)
                 OR EXISTS(SELECT 1 FROM Q_Respostas r WHERE r.id_questionario = q.id_questionario)) AS possui_historico
         FROM Questionarios q
         WHERE q.id_turma = ?
         ORDER BY q.ordem, q.tipo, q.titulo`,
        [idTurma]
    );
    if (!questionarios.length) return [];

    const idsQuestionarios = questionarios.map((questionario) => questionario.id_questionario);
    const [perguntas] = await db.query(
        `SELECT id_pergunta, id_questionario, texto_pergunta, tipo_pergunta, ordem, pontos
         FROM Q_Perguntas
         WHERE id_questionario IN (${idsQuestionarios.map(() => '?').join(', ')})
         ORDER BY id_questionario, ordem, id_pergunta`,
        idsQuestionarios
    );
    let opcoes = [];
    if (perguntas.length) {
        const idsPerguntas = perguntas.map((pergunta) => pergunta.id_pergunta);
        [opcoes] = await db.query(
            `SELECT id_opcao, id_pergunta, texto_opcao, ordem, correta
             FROM Q_Opcoes
             WHERE id_pergunta IN (${idsPerguntas.map(() => '?').join(', ')})
             ORDER BY id_pergunta, ordem, id_opcao`,
            idsPerguntas
        );
    }

    return questionarios.map((questionario) => {
        const perguntasDoQuestionario = perguntas
            .filter((pergunta) => Number(pergunta.id_questionario) === Number(questionario.id_questionario))
            .map((pergunta) => ({
                ...pergunta,
                opcoes: opcoes.filter((opcao) => Number(opcao.id_pergunta) === Number(pergunta.id_pergunta))
            }));
        return {
            ...questionario,
            possui_historico: Boolean(questionario.possui_historico),
            total_perguntas: perguntasDoQuestionario.length,
            perguntas: perguntasDoQuestionario
        };
    });
}

async function listarTrilhaAluno(idTurma, idAluno) {
    const [rows] = await db.query(
        `SELECT q.id_questionario, q.id_turma, q.id_modulo, q.ordem, q.titulo, q.descricao, q.tipo, q.prova_final, q.ativo,
                EXISTS(SELECT 1 FROM Q_Tentativas t WHERE t.id_questionario = q.id_questionario
                       AND t.id_usuario = m.id_aluno AND t.ciclo_matricula = m.ciclo_atual
                       AND t.finalizada_em IS NOT NULL) AS concluido,
                (SELECT COUNT(*) FROM Q_Perguntas p WHERE p.id_questionario = q.id_questionario) AS total_perguntas
         FROM Questionarios q
         INNER JOIN Matriculas m ON m.id_aluno = ? AND m.id_turma = q.id_turma
         WHERE q.id_turma = ? AND q.ativo = 1
         ORDER BY q.ordem, q.tipo, q.titulo`, [idAluno, idTurma]
    );
    const requisitos = await buscarRequisitos(db, idAluno, idTurma);
    return rows.map(row => ({ ...row, requisitos,
        concluido: row.prova_final ? requisitos.prova_final_aprovada : row.concluido,
        bloqueada: Boolean(row.prova_final) && !requisitos.prova_liberada }));
}

async function listarAluno(idTurma, tipo, idQuestionario = null, idAluno = null) {
    const connection = await db.getConnection();
    try {
    await connection.beginTransaction();
    const resultado = await carregarQuestionario(connection, idTurma, tipo, idQuestionario, idAluno);
    await connection.commit();
    return resultado;
    } catch (error) {
        await connection.rollback().catch(() => undefined);
        throw error;
    } finally { connection.release(); }
}

async function carregarQuestionario(connection, idTurma, tipo, idQuestionario, idAluno) {
    const [questionarios] = await connection.query(
        `SELECT id_questionario, id_turma, id_modulo, ordem, titulo, descricao, tipo, prova_final,
                (SELECT titulo FROM Modulos m WHERE m.id_modulo = Questionarios.id_modulo) AS titulo_aula,
                (SELECT COUNT(*) FROM Modulos m WHERE m.id_turma = Questionarios.id_turma
                 AND m.ordem <= (SELECT ordem FROM Modulos atual WHERE atual.id_modulo = Questionarios.id_modulo)) AS numero_aula
         FROM Questionarios
         WHERE id_turma = ? AND tipo = ? AND ativo = 1${idQuestionario ? " AND id_questionario = ?" : ""}
         ORDER BY ordem DESC, titulo
         LIMIT 1`,
        [idTurma, tipo, ...(idQuestionario ? [idQuestionario] : [])]
    );
    if (!questionarios.length) return null;

    const questionario = questionarios[0];
    let requisitos;
    if (questionario.prova_final) {
        const [[turma]] = await connection.query('SELECT status FROM Turmas WHERE id_turma = ?', [idTurma]);
        if (!turma || turma.status === 'ENCERRADA') throw questionnaireError('TURMA_ENCERRADA', 403, 'Esta turma está encerrada.');
        requisitos = await buscarRequisitos(connection, idAluno, idTurma);
        exigirProvaLiberada(requisitos);
    }
    const [perguntas] = await connection.query(
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
        const [opcoes] = await connection.query(
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

    return { ...questionario, requisitos, perguntas };
}

async function atualizarPergunta(idPergunta, dados, usuario) {
    const permitidos = ['texto_pergunta', 'tipo_pergunta', 'ordem', 'pontos'];
    const campos = Object.keys(dados).filter((campo) => permitidos.includes(campo));
    if (!campos.length) return false;
    const conexao = await db.getConnection();
    try {
        const pergunta = await iniciarAutoria(conexao, 'pergunta', idPergunta, usuario);
        let perguntaTrocada = null;
        if (Object.prototype.hasOwnProperty.call(dados, 'ordem')
            && Number(dados.ordem) !== Number(pergunta.ordem)) {
            const [[conflito]] = await conexao.query(
                `SELECT id_pergunta FROM Q_Perguntas
                 WHERE id_questionario = ? AND ordem = ? AND id_pergunta <> ? FOR UPDATE`,
                [pergunta.id_questionario, dados.ordem, idPergunta]
            );
            if (conflito) {
                perguntaTrocada = conflito.id_pergunta;
                await conexao.query('UPDATE Q_Perguntas SET ordem = -1 WHERE id_pergunta = ?', [perguntaTrocada]);
            }
        }
        const [result] = await conexao.query(
            `UPDATE Q_Perguntas
             SET ${campos.map((campo) => `${campo} = ?`).join(', ')}
             WHERE id_pergunta = ?`,
            [...campos.map((campo) => dados[campo]), idPergunta]
        );
        if (perguntaTrocada) {
            await conexao.query(
                'UPDATE Q_Perguntas SET ordem = ? WHERE id_pergunta = ?',
                [pergunta.ordem, perguntaTrocada]
            );
        }
        await conexao.commit();
        return result.affectedRows > 0;
    } catch (error) {
        await conexao.rollback().catch(() => undefined);
        if (error?.errno === 1062) {
            throw questionnaireError(
                'ORDEM_PERGUNTA_DUPLICADA', 409, 'Já existe uma pergunta nesta ordem.'
            );
        }
        throw error;
    } finally {
        conexao.release();
    }
}

async function removerPergunta(idPergunta, usuario) {
    const conexao = await db.getConnection();
    try {
        await iniciarAutoria(conexao, 'pergunta', idPergunta, usuario);
        const [result] = await conexao.query(
            'DELETE FROM Q_Perguntas WHERE id_pergunta = ?',
            [idPergunta]
        );
        await conexao.commit();
        return result.affectedRows > 0;
    } catch (error) {
        await conexao.rollback().catch(() => undefined);
        throw error;
    } finally {
        conexao.release();
    }
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

async function submeter(idQuestionario, idAluno, respostas, chaveIdempotencia) {
    const conexao = await db.getConnection();
    try {
        const contexto = await localizarRecurso(conexao, 'questionario', idQuestionario);
        await conexao.beginTransaction();
        const turma = await bloquearTurma(conexao, contexto.idTurma);
        const questionario = await bloquearRecurso(conexao, contexto);
        const questionarios = [{ ...questionario, status_turma: turma.status }];
        if (!questionarios.length || !questionarios[0].ativo) {
            throw questionnaireError(
                'QUESTIONARIO_INDISPONIVEL',
                404,
                'Questionário inexistente ou inativo.'
            );
        }
        const idTurma = questionarios[0].id_turma;
        if (questionarios[0].status_turma === 'ENCERRADA') {
            throw questionnaireError(
                'TURMA_ENCERRADA',
                403,
                'A turma está encerrada e não aceita novas tentativas.'
            );
        }

        const [matriculas] = await conexao.query(
            `SELECT id_matricula, ciclo_atual
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

        const [tentativasExistentes] = await conexao.query(
            `SELECT id_tentativa, acertos, total_perguntas, pontuacao, percentual
             FROM Q_Tentativas
             WHERE id_questionario = ? AND id_usuario = ? AND ciclo_matricula = ?
               AND chave_idempotencia = ?
               AND finalizada_em IS NOT NULL
             LIMIT 1
             FOR UPDATE`,
            [idQuestionario, idAluno, matriculas[0].ciclo_atual, chaveIdempotencia]
        );
        if (tentativasExistentes.length) {
            const requisitos = questionarios[0].prova_final
                ? await avaliarAprovacao(conexao, idAluno, idTurma) : undefined;
            await conexao.commit();
            return {
                requisitos, prova_final: Boolean(questionarios[0].prova_final),
                id_tentativa: Number(tentativasExistentes[0].id_tentativa),
                acertos: Number(tentativasExistentes[0].acertos),
                total_perguntas: Number(tentativasExistentes[0].total_perguntas),
                pontuacao: Number(tentativasExistentes[0].pontuacao),
                percentual: Number(tentativasExistentes[0].percentual),
                reutilizada: true
            };
        }

        if (questionarios[0].prova_final) {
            exigirProvaLiberada(await buscarRequisitos(conexao, idAluno, idTurma));
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
             (id_questionario, id_usuario, id_turma, total_perguntas, chave_idempotencia, ciclo_matricula)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [idQuestionario, idAluno, idTurma, perguntas.length, chaveIdempotencia, matriculas[0].ciclo_atual]
        );

        let acertos = 0;
        let pontuacao = 0;
        let pontosTotais = 0;
        let pontosObtidosCentavos = 0;
        const respostaPorPergunta = new Map(
            respostas.map((resposta) => [Number(resposta.id_pergunta), resposta])
        );
        for (const pergunta of perguntas) {
            const resposta = respostaPorPergunta.get(Number(pergunta.id_pergunta));
            const opcao = opcoesPorId.get(Number(resposta.id_opcao));
            const correta = Boolean(opcao.correta);
            // Pontos vêm de DECIMAL(...,2); usar unidades inteiras evita erro na fronteira.
            const centavos = Number(Number(pergunta.pontos).toFixed(2).replace('.', ''));
            pontosTotais += centavos;
            if (correta) {
                acertos += 1;
                pontosObtidosCentavos += centavos;
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

        const percentualCalculado = pontosTotais ? pontosObtidosCentavos * 10000 / pontosTotais : 0;
        // Somente a prova final precisa de truncamento conservador na persistência:
        // um resultado real abaixo de 75 nunca pode ser arredondado para 75.
        const percentual = questionarios[0].prova_final
            ? Math.floor(percentualCalculado) / 100
            : Number((percentualCalculado / 100).toFixed(2));
        await conexao.query(
            `UPDATE Q_Tentativas
             SET acertos = ?, pontuacao = ?, percentual = ?, finalizada_em = NOW()
             WHERE id_tentativa = ?`,
            [acertos, pontuacao, percentual, tentativa.insertId]
        );
        const requisitos = questionarios[0].prova_final
            ? await avaliarAprovacao(conexao, idAluno, idTurma) : undefined;
        await conexao.commit();

        return {
            requisitos,
            prova_final: Boolean(questionarios[0].prova_final),
            requisito_prova_atendido: Boolean(questionarios[0].prova_final) && percentual >= 75,
            id_tentativa: tentativa.insertId,
            acertos,
            total_perguntas: perguntas.length,
            pontuacao,
            percentual,
            reutilizada: false
        };
    } catch (error) {
        await conexao.rollback().catch(() => undefined);
        throw error;
    } finally {
        conexao.release();
    }
}

async function historico(idAluno, idQuestionario = null, pagination) {
    const params = [idAluno];
    let filtro = '';
    if (idQuestionario) {
        filtro = ' AND t.id_questionario = ?';
        params.push(idQuestionario);
    }
    const [[count]] = await db.query(
        `SELECT COUNT(*) AS total FROM Q_Tentativas t WHERE t.id_usuario = ?${filtro}`,
        params
    );
    const [rows] = await db.query(
        `SELECT t.id_tentativa, t.id_questionario, q.id_turma, q.titulo, q.tipo, t.ciclo_matricula,
                t.pontuacao, t.percentual, t.acertos, t.total_perguntas,
                t.iniciada_em, t.finalizada_em
         FROM Q_Tentativas t
         INNER JOIN Questionarios q ON q.id_questionario = t.id_questionario
         WHERE t.id_usuario = ?${filtro}
         ORDER BY t.iniciada_em DESC, t.id_tentativa DESC
         LIMIT ? OFFSET ?`,
        [...params, pagination.limit, pagination.offset]
    );
    return { items: rows, total: Number(count.total) };
}

async function resultadosTurma(idTurma, pagination) {
    const [[count]] = await db.query(
        'SELECT COUNT(*) AS total FROM Q_Tentativas WHERE id_turma = ?',
        [idTurma]
    );
    const [rows] = await db.query(
        `SELECT t.id_tentativa, t.id_questionario, t.id_usuario, t.id_turma, t.ciclo_matricula,
                t.pontuacao, t.percentual, t.acertos, t.total_perguntas,
                t.iniciada_em, t.finalizada_em, u.nome_completo, q.titulo, q.tipo
         FROM Q_Tentativas t
         INNER JOIN Usuarios u ON u.id_usuario = t.id_usuario
         INNER JOIN Questionarios q ON q.id_questionario = t.id_questionario
         WHERE t.id_turma = ?
         ORDER BY t.iniciada_em DESC, t.id_tentativa DESC
         LIMIT ? OFFSET ?`,
        [idTurma, pagination.limit, pagination.offset]
    );
    return { items: rows, total: Number(count.total) };
}

module.exports = {
    buscarTurma,
    professorEhDaTurma,
    matriculado,
    criarQuestionario,
    criarPergunta,
    escopoQuestionario,
    atualizarQuestionario,
    removerQuestionario,
    escopoPergunta,
    escopoOpcao,
    criarOpcao,
    atualizarOpcao,
    removerOpcao,
    listarMetadadosTurma,
    listarTrilhaAluno,
    listarAluno,
    atualizarPergunta,
    removerPergunta,
    submeter,
    historico,
    resultadosTurma
};
