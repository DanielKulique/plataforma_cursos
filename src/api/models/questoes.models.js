const crypto = require('crypto');
const db = require('../../config/database');
const { lockTurmaParaMutacao, localizarRecurso, bloquearTurma, bloquearRecurso } = require('../services/academic-access.service');
const { buscarRequisitos, exigirProvaLiberada, avaliarAprovacao } = require('../services/academic-progress.service');
const { TIPOS_QUESTAO, validarAutoriaPergunta } = require('../services/question-types.service');
const certificateService = require('../services/certificate.service');

const TIPOS_PERGUNTA_SUPORTADOS = new Set(TIPOS_QUESTAO);

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

async function persistirConteudoPergunta(conexao, idPergunta, dados, tipo) {
    if (tipo === 'MULTIPLA_ESCOLHA') {
        for (const opcao of dados.opcoes) {
            await conexao.query(
                `INSERT INTO Q_Opcoes (id_pergunta, texto_opcao, ordem, correta)
                 VALUES (?, ?, ?, ?)`,
                [idPergunta, opcao.texto_opcao.trim(), Number(opcao.ordem), opcao.correta]
            );
        }
        return;
    }

    if (tipo !== 'ASSOCIACAO') return;

    for (const par of dados.pares) {
        const idEsquerda = crypto.randomUUID();
        const idDireita = crypto.randomUUID();
        const ordem = Number(par.ordem);
        await conexao.query(
            `INSERT INTO Q_AssociacaoItens (id_item, id_pergunta, lado, texto, ordem)
             VALUES (?, ?, 'ESQUERDA', ?, ?), (?, ?, 'DIREITA', ?, ?)`,
            [idEsquerda, idPergunta, par.esquerda.trim(), ordem,
                idDireita, idPergunta, par.direita.trim(), ordem]
        );
        await conexao.query(
            `INSERT INTO Q_AssociacaoGabaritos (id_pergunta, id_item_esquerda, id_item_direita)
             VALUES (?, ?, ?)`,
            [idPergunta, idEsquerda, idDireita]
        );
    }
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
    const validado = validarAutoriaPergunta(dados);
    const conexao = await db.getConnection();
    try {
        await iniciarAutoria(conexao, 'questionario', idQuestionario, usuario);
        const [pergunta] = await conexao.query(
            `INSERT INTO Q_Perguntas
             (id_questionario, texto_pergunta, tipo_pergunta, resposta_booleana, ordem, pontos)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                idQuestionario,
                dados.texto_pergunta.trim(),
                validado.tipo,
                validado.tipo === 'VERDADEIRO_FALSO' ? Number(dados.resposta_booleana) : null,
                dados.ordem,
                validado.pontos
            ]
        );
        await persistirConteudoPergunta(conexao, pergunta.insertId, dados, validado.tipo);
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
        `SELECT p.id_pergunta, p.tipo_pergunta, q.id_turma, t.id_professor, t.status AS status_turma
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
        `SELECT opcao.id_opcao, pergunta.id_pergunta, pergunta.tipo_pergunta, questionario.id_turma,
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
        const pergunta = await iniciarAutoria(conexao, 'pergunta', idPergunta, usuario);
        if (pergunta.tipo_pergunta !== 'MULTIPLA_ESCOLHA') {
            throw questionnaireError('TIPO_OPCAO_INVALIDO', 409, 'Somente perguntas de múltipla escolha aceitam alternativas.');
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
        const [[pergunta]] = await conexao.query(
            'SELECT tipo_pergunta FROM Q_Perguntas WHERE id_pergunta = ? FOR UPDATE',
            [opcoes[0].id_pergunta]
        );
        if (pergunta?.tipo_pergunta !== 'MULTIPLA_ESCOLHA') {
            throw questionnaireError('TIPO_OPCAO_INVALIDO', 409, 'Somente perguntas de múltipla escolha aceitam alternativas.');
        }
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
            const [gabarito] = await conexao.query(
                'SELECT id_opcao FROM Q_Opcoes WHERE id_pergunta = ? AND correta = 1 FOR UPDATE',
                [opcoes[0].id_pergunta]
            );
            if (gabarito.length <= 1) {
                throw questionnaireError('GABARITO_OBRIGATORIO', 409, 'Mantenha pelo menos uma alternativa correta.');
            }
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
        const [[pergunta]] = await conexao.query(
            'SELECT tipo_pergunta FROM Q_Perguntas WHERE id_pergunta = ? FOR UPDATE',
            [opcoes[0].id_pergunta]
        );
        if (pergunta?.tipo_pergunta !== 'MULTIPLA_ESCOLHA') {
            throw questionnaireError('TIPO_OPCAO_INVALIDO', 409, 'Somente perguntas de múltipla escolha aceitam alternativas.');
        }
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
            const [gabarito] = await conexao.query(
                'SELECT id_opcao FROM Q_Opcoes WHERE id_pergunta = ? AND correta = 1 FOR UPDATE',
                [opcoes[0].id_pergunta]
            );
            if (gabarito.length <= 1) {
                throw questionnaireError('GABARITO_OBRIGATORIO', 409, 'Mantenha pelo menos uma alternativa correta.');
            }
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

async function carregarParesAssociacao(conexao, idsPerguntas) {
    if (!idsPerguntas.length) return [];
    const [rows] = await conexao.query(
        `SELECT g.id_pergunta,
                esquerda.id_item AS id_item_esquerda, esquerda.texto AS esquerda, esquerda.ordem,
                direita.id_item AS id_item_direita, direita.texto AS direita
         FROM Q_AssociacaoGabaritos g
         INNER JOIN Q_AssociacaoItens esquerda ON esquerda.id_item = g.id_item_esquerda
         INNER JOIN Q_AssociacaoItens direita ON direita.id_item = g.id_item_direita
         WHERE g.id_pergunta IN (${idsPerguntas.map(() => '?').join(', ')})
         ORDER BY g.id_pergunta, esquerda.ordem, esquerda.id_item`,
        idsPerguntas
    );
    return rows;
}

function embaralharAssociacao(items) {
    const resultado = [...items];
    for (let index = resultado.length - 1; index > 0; index -= 1) {
        const outro = crypto.randomInt(index + 1);
        [resultado[index], resultado[outro]] = [resultado[outro], resultado[index]];
    }
    // Preserve every Fisher-Yates outcome, including identity: excluding it leaks the key.
    return resultado;
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
        `SELECT id_pergunta, id_questionario, texto_pergunta, tipo_pergunta, resposta_booleana, ordem, pontos
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
    const paresAssociacao = await carregarParesAssociacao(db, perguntas
        .filter((pergunta) => pergunta.tipo_pergunta === 'ASSOCIACAO').map((pergunta) => pergunta.id_pergunta));

    return questionarios.map((questionario) => {
        const perguntasDoQuestionario = perguntas
            .filter((pergunta) => Number(pergunta.id_questionario) === Number(questionario.id_questionario))
            .map((pergunta) => ({
                ...pergunta,
                opcoes: opcoes.filter((opcao) => Number(opcao.id_pergunta) === Number(pergunta.id_pergunta)),
                pares: paresAssociacao.filter((par) => Number(par.id_pergunta) === Number(pergunta.id_pergunta))
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
        `SELECT q.id_questionario, q.id_turma, q.id_modulo, q.ordem, q.titulo, q.descricao, q.tipo, q.ativo, q.prova_final,
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
        concluido: row.prova_final ? requisitos.prova_final_tentada : row.concluido,
        bloqueada: Boolean(row.prova_final) && !requisitos.prova_final_tentada && !requisitos.prova_liberada }));
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
    const permiteResultadoFinalizado = Boolean(idQuestionario && idAluno);
    const filtroResultadoInativo = permiteResultadoFinalizado
        ? ` OR (Questionarios.prova_final = 1 AND EXISTS(
            SELECT 1 FROM Q_Tentativas t
            WHERE t.id_questionario = Questionarios.id_questionario
              AND t.id_usuario = ? AND t.finalizada_em IS NOT NULL
        ))`
        : '';
    const [questionarios] = await connection.query(
        `SELECT id_questionario, id_turma, id_modulo, ordem, titulo, descricao, tipo, prova_final,
                (SELECT titulo FROM Modulos m WHERE m.id_modulo = Questionarios.id_modulo) AS titulo_aula,
                (SELECT COUNT(*) FROM Modulos m WHERE m.id_turma = Questionarios.id_turma
                 AND m.ordem <= (SELECT ordem FROM Modulos atual WHERE atual.id_modulo = Questionarios.id_modulo)) AS numero_aula
         FROM Questionarios
         WHERE id_turma = ? AND tipo = ?
           AND (ativo = 1${filtroResultadoInativo})${idQuestionario ? " AND id_questionario = ?" : ""}
         ORDER BY ordem DESC, titulo
         LIMIT 1`,
        [idTurma, tipo, ...(permiteResultadoFinalizado ? [idAluno] : []), ...(idQuestionario ? [idQuestionario] : [])]
    );
    if (!questionarios.length) return null;

    const questionario = questionarios[0];
    let requisitos;
    if (questionario.prova_final) {
        const [[turma]] = await connection.query('SELECT status FROM Turmas WHERE id_turma = ?', [idTurma]);
        requisitos = await buscarRequisitos(connection, idAluno, idTurma);
        if (requisitos.prova_final_tentada) {
            return {
                ...questionario,
                tentativa_finalizada: true,
                resultado_final: {
                    id_tentativa: requisitos.prova_final_id_tentativa,
                    percentual: requisitos.prova_final_percentual,
                    aprovado: requisitos.prova_final_aprovada,
                    status_certificado: requisitos.status_certificado
                },
                requisitos,
                perguntas: []
            };
        }
        if (!turma || turma.status === 'ENCERRADA') throw questionnaireError('TURMA_ENCERRADA', 403, 'Esta turma está encerrada.');
        exigirProvaLiberada(requisitos);
    } else {
        const [[turma]] = await connection.query('SELECT status FROM Turmas WHERE id_turma = ?', [idTurma]);
        if (!turma || turma.status === 'ENCERRADA') throw questionnaireError('TURMA_ENCERRADA', 403, 'Esta turma está encerrada.');
    }
    const [perguntas] = await connection.query(
        `SELECT id_pergunta, texto_pergunta, tipo_pergunta, resposta_booleana, ordem, pontos
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
        const itensAssociacao = await carregarItensAssociacao(connection, perguntas
            .filter((pergunta) => pergunta.tipo_pergunta === 'ASSOCIACAO').map((pergunta) => pergunta.id_pergunta));
        for (const pergunta of perguntas) {
            const respostaCorreta = pergunta.resposta_booleana;
            delete pergunta.resposta_booleana;
            const opcoesPergunta = opcoes.filter(
                (opcao) => Number(opcao.id_pergunta) === Number(pergunta.id_pergunta)
            ).map(({ id_opcao, texto_opcao, ordem }) => ({ id_opcao, texto_opcao, ordem }));
            const itens = itensAssociacao.filter((item) => Number(item.id_pergunta) === Number(pergunta.id_pergunta));
            if (pergunta.tipo_pergunta === 'ASSOCIACAO') {
                pergunta.itens_esquerda = itens.filter((item) => item.lado === 'ESQUERDA')
                    .sort((a, b) => Number(a.ordem) - Number(b.ordem))
                    .map(({ id_item, texto }) => ({ id_item, texto }));
                pergunta.itens_direita = embaralharAssociacao(
                    itens.filter((item) => item.lado === 'DIREITA')
                        .map(({ id_item, texto }) => ({ id_item, texto }))
                );
                pergunta.formato_resposta = 'ASSOCIACAO';
                delete pergunta.opcoes;
            } else if (pergunta.tipo_pergunta === 'VERDADEIRO_FALSO' && respostaCorreta !== null) {
                pergunta.formato_resposta = 'BOOLEANO';
                delete pergunta.opcoes;
            } else {
                pergunta.opcoes = opcoesPergunta;
                pergunta.formato_resposta = 'OPCOES';
            }
        }
    }

    return { ...questionario, requisitos, perguntas };
}

async function carregarItensAssociacao(conexao, idsPerguntas) {
    if (!idsPerguntas.length) return [];
    const [itens] = await conexao.query(
        `SELECT id_item, id_pergunta, lado, texto, ordem
         FROM Q_AssociacaoItens
         WHERE id_pergunta IN (${idsPerguntas.map(() => '?').join(', ')})
         ORDER BY id_pergunta, lado, ordem`,
        idsPerguntas
    );
    return itens;
}

async function atualizarPergunta(idPergunta, dados, usuario) {
    const permitidos = ['texto_pergunta', 'tipo_pergunta', 'ordem', 'pontos', 'opcoes', 'resposta_booleana', 'pares'];
    const campos = Object.keys(dados).filter((campo) => permitidos.includes(campo));
    if (!campos.length) return false;
    const conexao = await db.getConnection();
    try {
        const pergunta = await iniciarAutoria(conexao, 'pergunta', idPergunta, usuario);
        const tipoNovo = dados.tipo_pergunta || pergunta.tipo_pergunta;
        const alterandoConteudo = ['opcoes', 'resposta_booleana', 'pares'].some((campo) => Object.hasOwn(dados, campo));
        const tipoMudou = tipoNovo !== pergunta.tipo_pergunta;
        if (tipoMudou && !alterandoConteudo) {
            throw questionnaireError(
                'CONTEUDO_TIPO_OBRIGATORIO', 400,
                'Envie a estrutura completa da pergunta ao trocar seu tipo.'
            );
        }
        let conteudoValidado = null;
        if (alterandoConteudo || tipoMudou) {
            conteudoValidado = validarAutoriaPergunta({
                texto_pergunta: dados.texto_pergunta ?? pergunta.texto_pergunta,
                tipo_pergunta: tipoNovo,
                ordem: dados.ordem ?? pergunta.ordem,
                pontos: dados.pontos ?? pergunta.pontos,
                ...(alterandoConteudo ? {
                    ...(Object.hasOwn(dados, 'opcoes') ? { opcoes: dados.opcoes } : {}),
                    ...(Object.hasOwn(dados, 'resposta_booleana') ? { resposta_booleana: dados.resposta_booleana } : {}),
                    ...(Object.hasOwn(dados, 'pares') ? { pares: dados.pares } : {})
                } : {})
            });
        }
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
        const colunasParaAtualizar = campos.filter((campo) => ['texto_pergunta', 'tipo_pergunta', 'ordem', 'pontos'].includes(campo));
        if (conteudoValidado && !colunasParaAtualizar.includes('tipo_pergunta')) colunasParaAtualizar.push('tipo_pergunta');
        const valores = colunasParaAtualizar.map((campo) => {
            if (campo === 'tipo_pergunta') return tipoNovo;
            if (campo === 'pontos') return conteudoValidado?.pontos ?? dados[campo];
            return dados[campo];
        });
        if (conteudoValidado) {
            colunasParaAtualizar.push('resposta_booleana');
            valores.push(tipoNovo === 'VERDADEIRO_FALSO' ? Number(dados.resposta_booleana) : null);
        }
        const [result] = await conexao.query(
            `UPDATE Q_Perguntas
             SET ${colunasParaAtualizar.map((campo) => `${campo} = ?`).join(', ')}
             WHERE id_pergunta = ?`,
            [...valores, idPergunta]
        );
        if (perguntaTrocada) {
            await conexao.query(
                'UPDATE Q_Perguntas SET ordem = ? WHERE id_pergunta = ?',
                [pergunta.ordem, perguntaTrocada]
            );
        }
        if (conteudoValidado) {
            await conexao.query('DELETE FROM Q_AssociacaoGabaritos WHERE id_pergunta = ?', [idPergunta]);
            await conexao.query('DELETE FROM Q_AssociacaoItens WHERE id_pergunta = ?', [idPergunta]);
            await conexao.query('DELETE FROM Q_Opcoes WHERE id_pergunta = ?', [idPergunta]);
            await persistirConteudoPergunta(conexao, idPergunta, dados, tipoNovo);
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
    if (!Array.isArray(respostas)) {
        throw questionnaireError('RESPOSTAS_INVALIDAS', 400, 'Envie uma lista de respostas.');
    }
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
    const porId = new Map(respostas.map((resposta) => [Number(resposta.id_pergunta), resposta]));
    const normalizadas = new Map();
    for (const pergunta of perguntas) {
        const resposta = porId.get(Number(pergunta.id_pergunta));
        if (pergunta.tipo_pergunta === 'MULTIPLA_ESCOLHA') {
            const selecionadas = Array.isArray(resposta.selected_option_ids)
                ? resposta.selected_option_ids.map(Number)
                : resposta.id_opcao !== undefined ? [Number(resposta.id_opcao)] : [];
            if (!selecionadas.length || selecionadas.some((id) => !Number.isInteger(id) || id <= 0)
                || new Set(selecionadas).size !== selecionadas.length
                || (resposta.selected_option_ids !== undefined && resposta.id_opcao !== undefined)) {
                throw questionnaireError('OPCOES_INVALIDAS', 400, 'Selecione uma ou mais alternativas sem repetir IDs.');
            }
            normalizadas.set(Number(pergunta.id_pergunta), { tipo: 'OPCOES', selecionadas });
        } else if (pergunta.tipo_pergunta === 'VERDADEIRO_FALSO' && pergunta.resposta_booleana !== null
            && pergunta.resposta_booleana !== undefined) {
            if (typeof resposta.resposta_booleana !== 'boolean' || resposta.id_opcao !== undefined) {
                throw questionnaireError('RESPOSTA_BOOLEAN_INVALIDA', 400, 'Responda verdadeiro ou falso.');
            }
            normalizadas.set(Number(pergunta.id_pergunta), {
                tipo: 'BOOLEANO', valor: resposta.resposta_booleana
            });
        } else if (pergunta.tipo_pergunta === 'VERDADEIRO_FALSO') {
            const idOpcao = Number(resposta.id_opcao);
            if (!Number.isInteger(idOpcao) || idOpcao <= 0) {
                throw questionnaireError('OPCAO_INVALIDA', 400, 'Selecione uma das alternativas desta pergunta.');
            }
            normalizadas.set(Number(pergunta.id_pergunta), { tipo: 'OPCAO_LEGADA', selecionadas: [idOpcao] });
        } else {
            if (!Array.isArray(resposta.matches) || !resposta.matches.length) {
                throw questionnaireError('ASSOCIACAO_INVALIDA', 400, 'Associe todos os itens da pergunta.');
            }
            if (resposta.matches.some((match) => !match || typeof match !== 'object')) {
                throw questionnaireError('ASSOCIACAO_INVALIDA', 400, 'Envie pares de associação válidos.');
            }
            const matches = resposta.matches.map((match) => ({
                left_id: match.left_id, right_id: match.right_id
            }));
            if (matches.some((match) => typeof match.left_id !== 'string' || typeof match.right_id !== 'string')) {
                throw questionnaireError('ASSOCIACAO_INVALIDA', 400, 'Envie IDs válidos para os pares.');
            }
            normalizadas.set(Number(pergunta.id_pergunta), { tipo: 'ASSOCIACAO', matches });
        }
    }
    return normalizadas;
}

async function prepararCorrecao(conexao, perguntas, respostasNormalizadas) {
    const questoesComOpcoes = perguntas.filter((pergunta) => pergunta.tipo_pergunta === 'MULTIPLA_ESCOLHA'
        || (pergunta.tipo_pergunta === 'VERDADEIRO_FALSO' && pergunta.resposta_booleana == null));
    let opcoes = [];
    if (questoesComOpcoes.length) {
        const ids = questoesComOpcoes.map((pergunta) => pergunta.id_pergunta);
        [opcoes] = await conexao.query(
            `SELECT id_opcao, id_pergunta, correta FROM Q_Opcoes
             WHERE id_pergunta IN (${ids.map(() => '?').join(', ')})`, ids
        );
    }
    const opcoesPorId = new Map(opcoes.map((opcao) => [Number(opcao.id_opcao), opcao]));
    const idsAssociacao = perguntas.filter((pergunta) => pergunta.tipo_pergunta === 'ASSOCIACAO')
        .map((pergunta) => pergunta.id_pergunta);
    const itensAssociacao = await carregarItensAssociacao(conexao, idsAssociacao);
    const paresCorretos = await carregarParesAssociacao(conexao, idsAssociacao);
    const correcao = new Map();
    for (const pergunta of perguntas) {
        const idPergunta = Number(pergunta.id_pergunta);
        const resposta = respostasNormalizadas.get(idPergunta);
        if (resposta.tipo === 'BOOLEANO') {
            correcao.set(idPergunta, { ...resposta, correta: resposta.valor === Boolean(pergunta.resposta_booleana) });
            continue;
        }
        if (resposta.tipo === 'ASSOCIACAO') {
            const itens = itensAssociacao.filter((item) => Number(item.id_pergunta) === idPergunta);
            const esquerdas = new Set(itens.filter((item) => item.lado === 'ESQUERDA').map((item) => item.id_item));
            const direitas = new Set(itens.filter((item) => item.lado === 'DIREITA').map((item) => item.id_item));
            const esquerdaRecebida = resposta.matches.map((match) => match.left_id);
            const direitaRecebida = resposta.matches.map((match) => match.right_id);
            if (resposta.matches.length !== esquerdas.size || esquerdas.size < 2
                || new Set(esquerdaRecebida).size !== resposta.matches.length
                || new Set(direitaRecebida).size !== resposta.matches.length
                || esquerdaRecebida.some((id) => !esquerdas.has(id))
                || direitaRecebida.some((id) => !direitas.has(id))) {
                throw questionnaireError('ASSOCIACAO_INVALIDA', 400, 'Use uma vez cada item desta pergunta.');
            }
            const gabarito = new Map(paresCorretos.filter((par) => Number(par.id_pergunta) === idPergunta)
                .map((par) => [par.id_item_esquerda, par.id_item_direita]));
            correcao.set(idPergunta, {
                ...resposta,
                correta: resposta.matches.every((match) => gabarito.get(match.left_id) === match.right_id)
            });
            continue;
        }
        for (const idOpcao of resposta.selecionadas) {
            const opcao = opcoesPorId.get(idOpcao);
            if (!opcao || Number(opcao.id_pergunta) !== idPergunta) {
                throw questionnaireError('OPCAO_INVALIDA', 400, 'Uma opção enviada não pertence à pergunta correspondente.');
            }
        }
        const gabarito = new Set(opcoes.filter((opcao) => Number(opcao.id_pergunta) === idPergunta
            && Boolean(opcao.correta)).map((opcao) => Number(opcao.id_opcao)));
        const correta = resposta.tipo === 'OPCAO_LEGADA'
            ? gabarito.has(resposta.selecionadas[0])
            : gabarito.size === resposta.selecionadas.length
                && resposta.selecionadas.every((idOpcao) => gabarito.has(idOpcao));
        correcao.set(idPergunta, { ...resposta, correta });
    }
    return correcao;
}

async function submeter(idQuestionario, idAluno, respostas, chaveIdempotencia) {
    const conexao = await db.getConnection();
    try {
        const contexto = await localizarRecurso(conexao, 'questionario', idQuestionario);
        await conexao.beginTransaction();
        const turma = await bloquearTurma(conexao, contexto.idTurma);
        const questionario = await bloquearRecurso(conexao, contexto);
        const questionarios = [{ ...questionario, status_turma: turma.status }];
        const idTurma = questionarios[0].id_turma;

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
             WHERE id_questionario = ? AND id_usuario = ? AND id_turma = ?
               ${questionarios[0].prova_final ? '' : 'AND ciclo_matricula = ?'}
               AND chave_idempotencia = ?
               AND finalizada_em IS NOT NULL
             LIMIT 1
             FOR UPDATE`,
            questionarios[0].prova_final
                ? [idQuestionario, idAluno, idTurma, chaveIdempotencia]
                : [idQuestionario, idAluno, idTurma, matriculas[0].ciclo_atual, chaveIdempotencia]
        );
        if (tentativasExistentes.length) {
            const requisitos = questionarios[0].prova_final
                ? await avaliarAprovacao(conexao, idAluno, idTurma) : undefined;
            await conexao.commit();
            const emissao = questionarios[0].prova_final
                && Number(tentativasExistentes[0].percentual) >= 75
                && requisitos?.status_aprovacao === 'APROVADO'
                ? await certificateService.emitirCertificadoAutomaticamente(idAluno, idTurma)
                : undefined;
            return {
                requisitos, prova_final: Boolean(questionarios[0].prova_final),
                id_tentativa: Number(tentativasExistentes[0].id_tentativa),
                acertos: Number(tentativasExistentes[0].acertos),
                total_perguntas: Number(tentativasExistentes[0].total_perguntas),
                pontuacao: Number(tentativasExistentes[0].pontuacao),
                percentual: Number(tentativasExistentes[0].percentual),
                reutilizada: true,
                status_certificado: emissao?.status || requisitos?.status_certificado
            };
        }

        if (questionarios[0].prova_final) {
            const [tentativaFinalizada] = await conexao.query(
                `SELECT id_tentativa FROM Q_Tentativas
                 WHERE id_questionario = ? AND id_usuario = ? AND id_turma = ?
                   AND finalizada_em IS NOT NULL
                 LIMIT 1 FOR UPDATE`,
                [idQuestionario, idAluno, idTurma]
            );
            if (tentativaFinalizada.length) {
                throw questionnaireError(
                    'PROVA_FINAL_JA_TENTADA',
                    409,
                    'O Teste Final permite uma única tentativa finalizada.'
                );
            }
        }

        if (!questionarios[0].ativo) {
            throw questionnaireError(
                'QUESTIONARIO_INDISPONIVEL',
                404,
                'Questionário inexistente ou inativo.'
            );
        }
        if (questionarios[0].status_turma === 'ENCERRADA') {
            throw questionnaireError(
                'TURMA_ENCERRADA',
                403,
                'A turma está encerrada e não aceita novas tentativas.'
            );
        }

        if (questionarios[0].prova_final) {
            exigirProvaLiberada(await buscarRequisitos(conexao, idAluno, idTurma));
        }

        const [perguntas] = await conexao.query(
            `SELECT id_pergunta, tipo_pergunta, resposta_booleana, pontos
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

        const respostasNormalizadas = validarRespostas(perguntas, respostas);
        const correcao = await prepararCorrecao(conexao, perguntas, respostasNormalizadas);

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
        for (const pergunta of perguntas) {
            const resposta = correcao.get(Number(pergunta.id_pergunta));
            const correta = resposta.correta;
            // Pontos vêm de DECIMAL(...,2); usar unidades inteiras evita erro na fronteira.
            const centavos = Number(Number(pergunta.pontos).toFixed(2).replace('.', ''));
            pontosTotais += centavos;
            if (correta) {
                acertos += 1;
                pontosObtidosCentavos += centavos;
                pontuacao += Number(pergunta.pontos);
            }
            const [respostaPersistida] = await conexao.query(
                `INSERT INTO Q_Respostas
                 (id_pergunta, id_usuario, id_questionario, id_tentativa,
                  resposta_opcao, resposta_booleana, correta)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    pergunta.id_pergunta,
                    idAluno,
                    idQuestionario,
                    tentativa.insertId,
                    resposta.tipo === 'OPCAO_LEGADA' || (resposta.tipo === 'OPCOES' && resposta.selecionadas.length === 1)
                        ? resposta.selecionadas[0] : null,
                    resposta.tipo === 'BOOLEANO' ? Number(resposta.valor) : null,
                    correta
                ]
            );
            if (resposta.tipo === 'OPCOES') {
                for (const idOpcao of resposta.selecionadas) {
                    await conexao.query(
                        'INSERT INTO Q_RespostaOpcoes (id_resposta, id_opcao) VALUES (?, ?)',
                        [respostaPersistida.insertId, idOpcao]
                    );
                }
            } else if (resposta.tipo === 'ASSOCIACAO') {
                for (const match of resposta.matches) {
                    await conexao.query(
                        `INSERT INTO Q_RespostaAssociacoes
                         (id_resposta, id_item_esquerda, id_item_direita) VALUES (?, ?, ?)`,
                        [respostaPersistida.insertId, match.left_id, match.right_id]
                    );
                }
            }
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

        const emissao = questionarios[0].prova_final
            && percentual >= 75
            && requisitos?.status_aprovacao === 'APROVADO'
            ? await certificateService.emitirCertificadoAutomaticamente(idAluno, idTurma)
            : undefined;
        if (emissao?.status) requisitos.status_certificado = emissao.status;

        return {
            requisitos,
            prova_final: Boolean(questionarios[0].prova_final),
            requisito_prova_atendido: Boolean(questionarios[0].prova_final) && percentual >= 75,
            id_tentativa: tentativa.insertId,
            acertos,
            total_perguntas: perguntas.length,
            pontuacao,
            percentual,
            reutilizada: false,
            status_certificado: emissao?.status || requisitos?.status_certificado
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
