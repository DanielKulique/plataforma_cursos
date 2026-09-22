const storage = require('../services/material-upload.service');
const { reterSeSemReferencias } = require('../services/material-lifecycle.service');
const db = require('../../config/database');
const { buscarProgresso, normalizarProgresso, avaliarAprovacao } = require('../services/academic-progress.service');
const { lockTurmaParaMutacao, iniciarMutacaoRecurso, localizarRecurso, bloquearTurma, bloquearRecurso } = require('../services/academic-access.service');
const { normalizeYouTubeEmbedUrl } = require('../../public/js/security-utils');

function flowError(code, status, message) {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    return error;
}

function validarReferenciaConteudo(dados) {
    const tipo = String(dados.tipo || '').toUpperCase();
    const url = String(dados.url || '').trim();
    const possuiArquivo = Number.isInteger(Number(dados.id_arquivo_material))
        && Number(dados.id_arquivo_material) > 0;
    if (tipo === 'PDF' && !possuiArquivo && !/^\/assets\/materiais\/[a-z0-9][a-z0-9._-]*\.pdf$/i.test(url)) {
        throw flowError(
            'PDF_INVALIDO',
            422,
            'Conteúdos PDF devem referenciar um arquivo local em /assets/materiais/.'
        );
    }
    if (tipo === 'VIDEO' && normalizeYouTubeEmbedUrl(url) !== url) {
        throw flowError(
            'VIDEO_INVALIDO',
            422,
            'Videoaulas devem utilizar uma URL incorporável do YouTube.'
        );
    }
}

async function recalcularProgressoTurma(conexao, idTurma) {
    await conexao.query(
        `UPDATE Matriculas matricula
         LEFT JOIN (
             SELECT matricula_base.id_matricula,
                    COUNT(conteudo.id_conteudo) AS total,
                    COALESCE(SUM(progresso.status = 'CONCLUIDO'), 0) AS concluidos
             FROM Matriculas matricula_base
             LEFT JOIN Conteudos conteudo ON conteudo.id_turma = matricula_base.id_turma
             LEFT JOIN ConteudosProgresso progresso
               ON progresso.id_conteudo = conteudo.id_conteudo
              AND progresso.id_aluno = matricula_base.id_aluno
             WHERE matricula_base.id_turma = ?
               AND matricula_base.status_aprovacao <> 'CANCELADO'
             GROUP BY matricula_base.id_matricula
         ) resumo ON resumo.id_matricula = matricula.id_matricula
         SET matricula.progresso_percentual = CASE
             WHEN COALESCE(resumo.total, 0) = 0 THEN 0
             ELSE LEAST(100, GREATEST(0, ROUND((resumo.concluidos / resumo.total) * 100)))
         END
         WHERE matricula.id_turma = ?
           AND matricula.status_aprovacao <> 'CANCELADO'`,
        [idTurma, idTurma]
    );
}

async function validarModuloDaTurma(conexao, idModulo, idTurma) {
    if (idModulo === null || idModulo === undefined || idModulo === '') return null;
    const [modulos] = await conexao.query(
        'SELECT id_modulo FROM Modulos WHERE id_modulo = ? AND id_turma = ? FOR UPDATE',
        [idModulo, idTurma]
    );
    if (!modulos.length) {
        throw flowError(
            'MODULO_FORA_DA_TURMA',
            409,
            'O módulo informado não pertence à turma do conteúdo.'
        );
    }
    return Number(idModulo);
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

async function criarModulo(idTurma, dados, usuario) {
    const conexao = await db.getConnection();
    try {
        await conexao.beginTransaction();
        await lockTurmaParaMutacao(conexao, idTurma, usuario);
        const [result] = await conexao.query(
            `INSERT INTO Modulos (id_turma, titulo, descricao, ordem)
             VALUES (?, ?, ?, ?)`,
            [idTurma, dados.titulo, dados.descricao || null, dados.ordem]
        );
        await conexao.commit();
        return { id_modulo: result.insertId, id_turma: Number(idTurma), ...dados };
    } catch (error) {
        await conexao.rollback().catch(() => undefined);
        if (error?.errno === 1062) {
            throw flowError('ORDEM_MODULO_DUPLICADA', 409, 'Já existe um módulo nesta ordem.');
        }
        throw error;
    } finally {
        conexao.release();
    }
}

async function buscarEscopoModulo(idModulo) {
    const [rows] = await db.query(
        `SELECT modulo.id_modulo, modulo.id_turma, turma.id_professor,
                turma.status AS status_turma
         FROM Modulos modulo
         INNER JOIN Turmas turma ON turma.id_turma = modulo.id_turma
         WHERE modulo.id_modulo = ?`,
        [idModulo]
    );
    return rows[0] || null;
}

async function atualizarModulo(idModulo, dados, usuario) {
    const campos = Object.keys(dados).filter((campo) => ['titulo', 'descricao', 'ordem'].includes(campo));
    if (!campos.length) return false;
    const conexao = await db.getConnection();
    try {
        await iniciarMutacaoRecurso(conexao, 'modulo', idModulo, usuario);
        await conexao.query(
            `UPDATE Modulos SET ${campos.map((campo) => `${campo} = ?`).join(', ')} WHERE id_modulo = ?`,
            [...campos.map((campo) => dados[campo]), idModulo]
        );
        await conexao.commit();
        return true;
    } catch (error) {
        await conexao.rollback().catch(() => undefined);
        if (error?.errno === 1062) throw flowError('ORDEM_MODULO_DUPLICADA', 409, 'Já existe um módulo nesta ordem.');
        throw error;
    } finally { conexao.release(); }
}

async function removerModulo(idModulo, usuario) {
    const conexao = await db.getConnection();
    try {
        await iniciarMutacaoRecurso(conexao, 'modulo', idModulo, usuario);
        const [conteudos] = await conexao.query(
            'SELECT id_conteudo FROM Conteudos WHERE id_modulo = ? LIMIT 1 FOR UPDATE',
            [idModulo]
        );
        if (conteudos.length) {
            throw flowError(
                'MODULO_COM_CONTEUDOS',
                409,
                'Módulo com conteúdos associados não pode ser excluído.'
            );
        }
        const [avaliacoes] = await conexao.query('SELECT id_questionario FROM Questionarios WHERE id_modulo = ? LIMIT 1 FOR UPDATE', [idModulo]);
        if (avaliacoes.length) throw flowError('MODULO_COM_AVALIACOES', 409, 'Aula com avaliações associadas não pode ser excluída.');
        await conexao.query('DELETE FROM Modulos WHERE id_modulo = ?', [idModulo]);
        await conexao.commit();
        return true;
    } catch (error) {
        await conexao.rollback().catch(() => undefined);
        throw error;
    } finally {
        conexao.release();
    }
}

async function listar(idTurma, idAluno = null) {
    const [rows] = await db.query(
        `SELECT c.id_conteudo, c.id_turma, c.id_modulo, c.titulo, c.descricao, c.tipo,
                c.url, c.corpo, c.duracao_minutos, c.ordem, c.id_arquivo_material,
                arquivo.original_name AS arquivo_original_name,
                arquivo.size_bytes AS arquivo_size_bytes,
                COALESCE(p.status, 'NAO_INICIADO') AS status_progresso,
                COALESCE(p.status = 'CONCLUIDO', 0) AS concluido,
                COALESCE(p.status = 'INICIADO', 0) AS em_andamento
         FROM Conteudos c
         LEFT JOIN ArquivosMateriais arquivo
           ON arquivo.id_arquivo_material = c.id_arquivo_material
         LEFT JOIN ConteudosProgresso p
           ON p.id_conteudo = c.id_conteudo AND p.id_aluno = ?
         WHERE c.id_turma = ?
         ORDER BY c.ordem, c.id_conteudo`,
        [idAluno, idTurma]
    );
    return rows;
}

async function criar(idTurma, dados, usuario) {
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
    validarReferenciaConteudo(dados);
    const conexao = await db.getConnection();
    try {
        await conexao.beginTransaction();
        await lockTurmaParaMutacao(conexao, idTurma, usuario);
        const moduloValidado = await validarModuloDaTurma(conexao, id_modulo, idTurma);
        const [result] = await conexao.query(
            `INSERT INTO Conteudos
             (id_turma, id_modulo, titulo, descricao, tipo, url, corpo, duracao_minutos, ordem)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [idTurma, moduloValidado, titulo, descricao, tipo, url, corpo, duracao_minutos, ordem]
        );
        await recalcularProgressoTurma(conexao, idTurma);
        await conexao.commit();
        return { id_conteudo: result.insertId, id_turma: Number(idTurma), ...dados };
    } catch (error) {
        await conexao.rollback().catch(() => undefined);
        if (error?.errno === 1062) {
            throw flowError('ORDEM_CONTEUDO_DUPLICADA', 409, 'Já existe um conteúdo nesta ordem.');
        }
        throw error;
    } finally {
        conexao.release();
    }
}

async function atualizar(idConteudo, dados, usuario) {
    const permitidos = ['id_modulo', 'titulo', 'descricao', 'tipo', 'url', 'corpo', 'duracao_minutos', 'ordem'];
    const campos = Object.keys(dados).filter((campo) => permitidos.includes(campo));
    if (!campos.length) return false;
    const conexao = await db.getConnection();
    try {
        const conteudos = [await iniciarMutacaoRecurso(conexao, 'conteudo', idConteudo, usuario)];
        if (Object.prototype.hasOwnProperty.call(dados, 'id_modulo')) {
            dados.id_modulo = await validarModuloDaTurma(
                conexao,
                dados.id_modulo,
                conteudos[0].id_turma
            );
        }
        const referenciaFinal = { ...conteudos[0], ...dados };
        if (referenciaFinal.tipo !== 'PDF') referenciaFinal.id_arquivo_material = null;
        validarReferenciaConteudo(referenciaFinal);
        if (referenciaFinal.tipo !== 'PDF' && conteudos[0].id_arquivo_material) {
            campos.push('id_arquivo_material');
            dados.id_arquivo_material = null;
        }
        const [result] = await conexao.query(
            `UPDATE Conteudos SET ${campos.map((campo) => `${campo} = ?`).join(', ')} WHERE id_conteudo = ?`,
            [...campos.map((campo) => dados[campo]), idConteudo]
        );
        await reterSeSemReferencias(conexao, conteudos[0].id_arquivo_material);
        await conexao.commit();
        return result.affectedRows > 0;
    } catch (error) {
        await conexao.rollback().catch(() => undefined);
        if (error?.errno === 1062) {
            throw flowError('ORDEM_CONTEUDO_DUPLICADA', 409, 'Já existe um conteúdo nesta ordem.');
        }
        throw error;
    } finally {
        conexao.release();
    }
}

async function remover(idConteudo, usuario) {
    const conexao = await db.getConnection();
    try {
        const conteudos = [await iniciarMutacaoRecurso(conexao, 'conteudo', idConteudo, usuario)];
        const [historico] = await conexao.query(
            'SELECT id_progresso FROM ConteudosProgresso WHERE id_conteudo = ? LIMIT 1 FOR UPDATE',
            [idConteudo]
        );
        if (historico.length) {
            throw flowError(
                'CONTEUDO_COM_HISTORICO',
                409,
                'Conteúdo com progresso acadêmico não pode ser excluído.'
            );
        }
        const [result] = await conexao.query(
            'DELETE FROM Conteudos WHERE id_conteudo = ?',
            [idConteudo]
        );
        await recalcularProgressoTurma(conexao, conteudos[0].id_turma);
        await reterSeSemReferencias(conexao, conteudos[0].id_arquivo_material);
        await conexao.commit();
        return result.affectedRows > 0;
    } catch (error) {
        await conexao.rollback().catch(() => undefined);
        throw error;
    } finally {
        conexao.release();
    }
}

async function buscarEscopo(idConteudo) {
    const [rows] = await db.query(
        `SELECT c.id_conteudo, c.id_turma, t.id_professor, t.status AS status_turma
         FROM Conteudos c
         INNER JOIN Turmas t ON t.id_turma = c.id_turma
         WHERE c.id_conteudo = ?`,
        [idConteudo]
    );
    return rows[0] || null;
}

async function buscarMaterial(idConteudo) {
    const [rows] = await db.query(
        `SELECT c.id_conteudo, c.id_turma, c.tipo, c.url, c.id_arquivo_material,
                a.storage_name, a.original_name, a.mime_type, a.size_bytes, a.sha256,
                a.status AS status_arquivo,
                t.id_professor, t.status AS status_turma
         FROM Conteudos c
         INNER JOIN Turmas t ON t.id_turma = c.id_turma
         LEFT JOIN ArquivosMateriais a ON a.id_arquivo_material = c.id_arquivo_material
         WHERE c.id_conteudo = ?`,
        [idConteudo]
    );
    return rows[0] || null;
}

async function criarPdfComArquivo(idTurma, dados, arquivo, usuario) {
    const conexao = await db.getConnection();
    let commitIniciado = false;
    let sucesso = false;
    try {
        await storage.prepararStorage(arquivo, conexao);
        await conexao.beginTransaction();
        await lockTurmaParaMutacao(conexao, idTurma, usuario);
        const modulo = await validarModuloDaTurma(conexao, dados.id_modulo, idTurma);
        await storage.publicarStorage(arquivo);
        const [asset] = await conexao.query(
            `INSERT INTO ArquivosMateriais
             (storage_name, original_name, mime_type, size_bytes, sha256, id_usuario_upload)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [arquivo.storage_name, arquivo.original_name, arquivo.mime_type,
                arquivo.size_bytes, arquivo.sha256, usuario.id_usuario]
        );
        const [conteudo] = await conexao.query(
            `INSERT INTO Conteudos
             (id_turma, id_modulo, titulo, descricao, tipo, id_arquivo_material,
              url, corpo, duracao_minutos, ordem)
             VALUES (?, ?, ?, ?, 'PDF', ?, NULL, ?, ?, ?)`,
            [idTurma, modulo, dados.titulo, dados.descricao || null,
                asset.insertId, dados.corpo || null, dados.duracao_minutos || null, dados.ordem]
        );
        await recalcularProgressoTurma(conexao, idTurma);
        commitIniciado = true;
        await conexao.commit();
        sucesso = true;
        return {
            id_conteudo: conteudo.insertId,
            id_turma: Number(idTurma),
            id_arquivo_material: asset.insertId,
            tipo: 'PDF',
            titulo: dados.titulo,
            descricao: dados.descricao || null,
            ordem: Number(dados.ordem),
            arquivo_atual: { nome_original: arquivo.original_name, tamanho_bytes: arquivo.size_bytes }
        };
    } catch (error) {
        await require('../services/private-storage.service').rollback(conexao);
        if (error?.errno === 1062) {
            throw flowError('ORDEM_CONTEUDO_DUPLICADA', 409, 'Já existe um conteúdo nesta ordem.');
        }
        throw error;
    } finally {
        await storage.finalizarStorage(arquivo, commitIniciado, sucesso);
        conexao.release();
    }
}

async function substituirPdfComArquivo(idConteudo, dados, arquivo, usuario) {
    const conexao = await db.getConnection();
    let commitIniciado = false;
    let sucesso = false;
    try {
        await storage.prepararStorage(arquivo, conexao);
        const conteudos = [await iniciarMutacaoRecurso(conexao, 'conteudo', idConteudo, usuario)];
        const atual = conteudos[0];
        const idModulo = Object.prototype.hasOwnProperty.call(dados, 'id_modulo')
            ? await validarModuloDaTurma(conexao, dados.id_modulo, atual.id_turma)
            : atual.id_modulo;
        await storage.publicarStorage(arquivo);
        const [asset] = await conexao.query(
            `INSERT INTO ArquivosMateriais
             (storage_name, original_name, mime_type, size_bytes, sha256, id_usuario_upload)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [arquivo.storage_name, arquivo.original_name, arquivo.mime_type,
                arquivo.size_bytes, arquivo.sha256, usuario.id_usuario]
        );
        await conexao.query(
            `UPDATE Conteudos
             SET id_modulo = ?, titulo = ?, descricao = ?, tipo = 'PDF',
                 id_arquivo_material = ?, url = NULL, corpo = ?, duracao_minutos = ?, ordem = ?
             WHERE id_conteudo = ?`,
            [idModulo, dados.titulo ?? atual.titulo, dados.descricao ?? atual.descricao,
                asset.insertId, dados.corpo ?? atual.corpo,
                dados.duracao_minutos ?? atual.duracao_minutos,
                dados.ordem ?? atual.ordem, idConteudo]
        );
        await reterSeSemReferencias(conexao, atual.id_arquivo_material);
        commitIniciado = true;
        await conexao.commit();
        sucesso = true;
        return {
            id_conteudo: Number(idConteudo),
            id_turma: Number(atual.id_turma),
            id_arquivo_material: asset.insertId,
            tipo: 'PDF',
            arquivo_atual: { nome_original: arquivo.original_name, tamanho_bytes: arquivo.size_bytes }
        };
    } catch (error) {
        await require('../services/private-storage.service').rollback(conexao);
        if (error?.errno === 1062) {
            throw flowError('ORDEM_CONTEUDO_DUPLICADA', 409, 'Já existe um conteúdo nesta ordem.');
        }
        throw error;
    } finally {
        await storage.finalizarStorage(arquivo, commitIniciado, sucesso);
        conexao.release();
    }
}

async function registrarProgresso(idAluno, idConteudo, novoStatus) {
    const conexao = await db.getConnection();
    try {
        const contexto = await localizarRecurso(conexao, 'conteudo', idConteudo);
        await conexao.beginTransaction();
        const turma = await bloquearTurma(conexao, contexto.idTurma);
        const conteudo = await bloquearRecurso(conexao, contexto);
        const conteudos = [{ ...conteudo, status_turma: turma.status }];

        if (conteudos[0].status_turma === 'ENCERRADA') {
            throw flowError(
                'TURMA_ENCERRADA',
                403,
                'A turma está encerrada e não aceita novas alterações de progresso.'
            );
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

        const resumo = await buscarProgresso(conexao, idAluno, idTurma);
        const percentual = resumo.progresso_percentual;

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

        const requisitos = await avaliarAprovacao(conexao, idAluno, idTurma);
        await conexao.commit();
        return {
            requisitos,
            id_conteudo: Number(idConteudo),
            status: progresso[0].status,
            ...resumo,
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
        `SELECT m.id_aluno, u.nome_completo,
                COUNT(c.id_conteudo) AS total_conteudos,
                COALESCE(SUM(p.status = 'CONCLUIDO'), 0) AS conteudos_concluidos
         FROM Matriculas m
         INNER JOIN Usuarios u ON u.id_usuario = m.id_aluno
         LEFT JOIN Conteudos c ON c.id_turma = m.id_turma
         LEFT JOIN ConteudosProgresso p
           ON p.id_conteudo = c.id_conteudo AND p.id_aluno = m.id_aluno
         WHERE m.id_turma = ? AND m.status_aprovacao <> 'CANCELADO'
         GROUP BY m.id_matricula, m.id_aluno, u.nome_completo
         ORDER BY u.nome_completo`,
        [idTurma]
    );
    return rows.map(normalizarProgresso);
}

module.exports = {
    buscarTurma,
    professorEhDaTurma,
    alunoEstaMatriculado,
    listarModulos,
    criarModulo,
    buscarEscopoModulo,
    atualizarModulo,
    removerModulo,
    listar,
    criar,
    atualizar,
    remover,
    buscarEscopo,
    buscarMaterial,
    criarPdfComArquivo,
    substituirPdfComArquivo,
    registrarProgresso,
    listarProgressoTurma,
    recalcularProgressoTurma
};
