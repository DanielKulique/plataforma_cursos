const { iniciarTransacaoMatricula, exigirGestaoEstrutural } = require('../services/academic-access.service');
const db = require('../../config/database');

const STATUS_APROVACAO_PADRAO = 'CURSANDO';

const { COLUNAS_PROGRESSO_DERIVADO, normalizarProgresso, buscarRequisitos, avaliarAprovacao } = require('../services/academic-progress.service');
const certificateService = require('../services/certificate.service');

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
            `SELECT id_matricula, status_aprovacao, ciclo_atual
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
                     nota_final = NULL, data_matricula = CURRENT_TIMESTAMP,
                     ciclo_atual = ciclo_atual + 1
                 WHERE id_matricula = ? AND status_aprovacao = 'CANCELADO'`,
                [id_matricula]
            );
            const requisitos = await avaliarAprovacao(connection, id_aluno, id_turma);
            await connection.commit();
            if (requisitos.aprovacao_atualizada) {
                await certificateService.emitirCertificadoAutomaticamente(id_aluno, id_turma);
            }
            return {
                id_matricula,
                id_aluno,
                id_turma,
                status_aprovacao: requisitos.status_aprovacao || STATUS_APROVACAO_PADRAO,
                progresso_percentual: 0,
                nota_final: null,
                ciclo_atual: Number(existing[0].ciclo_atual) + 1,
                reativada: true
            };
        }

        const [result] = await connection.query(
            'INSERT INTO Matriculas (id_aluno, id_turma) VALUES (?, ?)',
            [id_aluno, id_turma]
        );
        const requisitos = await avaliarAprovacao(connection, id_aluno, id_turma);
        await connection.commit();
        if (requisitos.aprovacao_atualizada) {
            await certificateService.emitirCertificadoAutomaticamente(id_aluno, id_turma);
        }
        return {
            id_matricula: result.insertId,
            id_aluno,
            id_turma,
            status_aprovacao: requisitos.status_aprovacao || STATUS_APROVACAO_PADRAO,
            progresso_percentual: 0,
            nota_final: null,
            ciclo_atual: 1,
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
            m.ciclo_atual,
            ${COLUNAS_PROGRESSO_DERIVADO},
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
    return rows.map(normalizarProgresso);
}

async function buscarSalaVirtualDoAluno(id_aluno) {
    const [rows] = await db.query(
        `
        SELECT
            m.id_matricula,
            m.data_matricula,
            m.status_aprovacao,
            m.ciclo_atual,
            ${COLUNAS_PROGRESSO_DERIVADO},
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

    return rows.map(normalizarProgresso);
}

// Buscar todas as matrículas de uma turma específica
async function buscarMatriculaPorTurma(id_turma, pagination) {
    const [[count]] = await db.query(
        `SELECT COUNT(*) AS total FROM Matriculas
         WHERE id_turma = ? AND status_aprovacao <> 'CANCELADO'`,
        [id_turma]
    );
    const [rows] = await db.query(
        `
        SELECT
            m.id_matricula,
            m.id_aluno,
            m.id_turma,
            m.data_matricula,
            m.status_aprovacao,
            m.nota_final,
            m.ciclo_atual,
            ${COLUNAS_PROGRESSO_DERIVADO},
            u.nome_completo,
            u.email,
            certificado.id_certificado,
            certificado.codigo_publico,
            certificado.status AS status_certificado,
            certificado.versao AS certificado_versao,
            certificado.emitido_em AS certificado_emitido_em
        FROM Matriculas m
        INNER JOIN Usuarios u ON m.id_aluno = u.id_usuario
        LEFT JOIN Certificados certificado
          ON certificado.id_certificado = (
              SELECT c.id_certificado FROM Certificados c
              WHERE c.id_aluno = m.id_aluno AND c.id_turma = m.id_turma
              ORDER BY c.versao DESC LIMIT 1
          )
        WHERE m.id_turma = ? AND m.status_aprovacao <> 'CANCELADO'
        ORDER BY u.nome_completo, m.id_matricula
        LIMIT ? OFFSET ?
        `,
        [id_turma, pagination.limit, pagination.offset]
    );
    return { items: rows.map(normalizarProgresso), total: Number(count.total) };
}

async function turmaExiste(id_turma) {
    const [rows] = await db.query('SELECT id_turma FROM Turmas WHERE id_turma = ?', [id_turma]);
    return rows.length > 0;
}

async function buscarMatriculaPorId(id) {
    const [rows] = await db.query(
        `
        SELECT
            m.id_matricula,
            m.id_aluno,
            m.id_turma,
            m.data_matricula,
            m.nota_final,
            m.status_aprovacao,
            m.ciclo_atual,
            ${COLUNAS_PROGRESSO_DERIVADO},
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

    return normalizarProgresso(rows[0]);
}

async function atualizarMatricula(id, dadosParaAtualizar, usuario) {
    const camposPermitidos = ['nota_final', 'status_aprovacao'];
    const colunasParaAtualizar = Object.keys(dadosParaAtualizar).filter((coluna) => camposPermitidos.includes(coluna));

    if (colunasParaAtualizar.length === 0) {
        throw new Error('Nenhum campo válido para atualizar.');
    }

    const connection = await db.getConnection();
    let emitirCertificadoAprovado = null;
    try {
        const turma = await iniciarTransacaoMatricula(connection, id);
        if (turma) exigirGestaoEstrutural(usuario, turma);
        const [matriculas] = await connection.query(
            `SELECT m.id_matricula, m.id_aluno, m.id_turma, m.nota_final, m.status_aprovacao, m.ciclo_atual
             FROM Matriculas m
             INNER JOIN Turmas t ON t.id_turma = m.id_turma
             WHERE m.id_matricula = ?
             FOR UPDATE`,
            [id]
        );
        if (!matriculas.length) {
            throw enrollmentError('MATRICULA_NAO_ENCONTRADA', 404, 'Matrícula não encontrada.');
        }
        const atual = matriculas[0];
        const notaFinal = Object.prototype.hasOwnProperty.call(dadosParaAtualizar, 'nota_final')
            ? dadosParaAtualizar.nota_final
            : atual.nota_final;
        const statusFinal = dadosParaAtualizar.status_aprovacao || atual.status_aprovacao;

        if (atual.status_aprovacao === 'CANCELADO' && statusFinal !== 'CANCELADO') {
            throw enrollmentError(
                'REMATRICULA_OBRIGATORIA',
                409,
                'A matrícula cancelada deve ser reativada pelo fluxo de rematrícula.'
            );
        }

        if (statusFinal === 'APROVADO') {
            const progresso = await buscarRequisitos(connection, atual.id_aluno, atual.id_turma);
            if (!progresso.prova_final_aprovada) {
                throw enrollmentError('PROVA_FINAL_PENDENTE', 409, 'Conquiste pelo menos 75% na prova final.');
            }
        } else if (statusFinal === 'REPROVADO') {
            const progresso = await buscarRequisitos(connection, atual.id_aluno, atual.id_turma);
            if (!progresso.conteudo_concluido) {
                throw enrollmentError(
                    'CONTEUDOS_PENDENTES',
                    409,
                    'A situação REPROVADO manual exige a conclusão de todos os conteúdos.'
                );
            }
            if (notaFinal === null || notaFinal === undefined || !Number.isFinite(Number(notaFinal))) {
                throw enrollmentError(
                    'NOTA_FINAL_OBRIGATORIA',
                    409,
                    'Informe a nota final antes de definir a situação acadêmica.'
                );
            }
        }

        if (atual.status_aprovacao === 'APROVADO' && statusFinal !== 'APROVADO') {
            const [certificadosAtivos] = await connection.query(
                `SELECT id_certificado
                 FROM Certificados
                 WHERE id_aluno = ? AND id_turma = ? AND status = 'ATIVO'
                 LIMIT 1 FOR UPDATE`,
                [atual.id_aluno, atual.id_turma]
            );
            if (certificadosAtivos.length) {
                throw enrollmentError(
                    'CERTIFICADO_ATIVO',
                    409,
                    'Revogue o certificado ativo antes de alterar a situação acadêmica.'
                );
            }
        }

        const setClause = colunasParaAtualizar.map((coluna) => `${coluna} = ?`).join(',');
        const valoresParaAtualizar = colunasParaAtualizar.map((coluna) => dadosParaAtualizar[coluna]);
        const [result] = await connection.query(
            `UPDATE Matriculas SET ${setClause} WHERE id_matricula = ?`,
            [...valoresParaAtualizar, id]
        );
        await connection.commit();
        if (statusFinal === 'APROVADO') {
            emitirCertificadoAprovado = { idAluno: atual.id_aluno, idTurma: atual.id_turma };
        }
        return { affectedRows: result.affectedRows };
    } catch (error) {
        await connection.rollback().catch(() => undefined);
        throw error;
    } finally {
        connection.release();
        if (emitirCertificadoAprovado) {
            await certificateService.emitirCertificadoAutomaticamente(
                emitirCertificadoAprovado.idAluno,
                emitirCertificadoAprovado.idTurma
            );
        }
    }
}

async function cancelarMatricula(id) {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [matriculas] = await connection.query(
            `SELECT id_matricula, id_aluno, id_turma
             FROM Matriculas
             WHERE id_matricula = ?
             FOR UPDATE`,
            [id]
        );
        if (!matriculas.length) {
            throw enrollmentError('MATRICULA_NAO_ENCONTRADA', 404, 'Matrícula não encontrada.');
        }
        const matricula = matriculas[0];
        const [certificadosAtivos] = await connection.query(
            `SELECT id_certificado
             FROM Certificados
             WHERE id_aluno = ? AND id_turma = ? AND status = 'ATIVO'
             LIMIT 1 FOR UPDATE`,
            [matricula.id_aluno, matricula.id_turma]
        );
        if (certificadosAtivos.length) {
            throw enrollmentError(
                'CERTIFICADO_ATIVO',
                409,
                'Revogue o certificado ativo antes de cancelar a matrícula.'
            );
        }
        const [result] = await connection.query(
            'UPDATE Matriculas SET status_aprovacao = ? WHERE id_matricula = ?',
            ['CANCELADO', id]
        );
        await connection.commit();
        return { affectedRows: result.affectedRows };
    } catch (error) {
        await connection.rollback().catch(() => undefined);
        throw error;
    } finally {
        connection.release();
    }
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
