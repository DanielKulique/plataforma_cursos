const { iniciarTransacaoMatricula } = require('../services/academic-access.service');
'use strict';

const db = require('../../config/database');

const CAMPOS_CERTIFICADO = `
    certificado.id_certificado,
    certificado.id_aluno,
    certificado.id_turma,
    certificado.codigo_publico,
    certificado.aluno_nome,
    certificado.curso_nome,
    certificado.turma_nome,
    certificado.carga_horaria,
    certificado.emitido_em,
    certificado.status,
    certificado.sha256,
    certificado.storage_name,
    certificado.tamanho_bytes,
    certificado.id_usuario_emissor,
    certificado.revogado_em,
    certificado.id_usuario_revogador,
    certificado.motivo_revogacao,
    certificado.criado_em,
    certificado.versao, certificado.id_certificado_anterior,
    certificado.motivo_reemissao, certificado.reemitido_em,
    certificado.id_usuario_reemissor, certificado.snapshot_json`;

function normalizar(row) {
    if (!row) return null;
    return {
        ...row,
        id_certificado: Number(row.id_certificado),
        id_aluno: Number(row.id_aluno),
        id_turma: Number(row.id_turma),
        versao: Number(row.versao),
        carga_horaria: Number(row.carga_horaria),
        tamanho_bytes: Number(row.tamanho_bytes),
        id_usuario_emissor: Number(row.id_usuario_emissor),
        id_usuario_revogador: row.id_usuario_revogador === null
            ? null
            : Number(row.id_usuario_revogador)
    };
}

async function buscarContextoEmissao(connection, idMatricula) {
    await iniciarTransacaoMatricula(connection, idMatricula);
    const [rows] = await connection.query(
        `SELECT m.id_matricula, m.id_aluno, m.id_turma, m.status_aprovacao,
                m.nota_final, u.nome_completo AS aluno_nome, u.cpf AS aluno_cpf,
                t.nome_turma, t.id_professor, t.status AS status_turma,
                t.data_inicio, t.data_fim,
                professor.nome_completo AS responsavel_nome,
                c.nome_curso, c.carga_horaria
         FROM Matriculas m
         INNER JOIN Usuarios u ON u.id_usuario = m.id_aluno
         INNER JOIN Turmas t ON t.id_turma = m.id_turma
         INNER JOIN Usuarios professor ON professor.id_usuario = t.id_professor
         INNER JOIN Cursos c ON c.id_curso = t.id_curso
         WHERE m.id_matricula = ?
         FOR UPDATE`,
        [idMatricula]
    );
    return rows[0] || null;
}

async function listarConteudosAbordados(connection, idTurma) {
    const [modulos] = await connection.query(
        `SELECT titulo
         FROM Modulos
         WHERE id_turma = ?
         ORDER BY ordem, id_modulo`,
        [idTurma]
    );
    if (modulos.length) return modulos.map((item) => item.titulo);

    const [conteudos] = await connection.query(
        `SELECT titulo
         FROM Conteudos
         WHERE id_turma = ?
         ORDER BY ordem, id_conteudo`,
        [idTurma]
    );
    return conteudos.map((item) => item.titulo);
}

async function buscarPorAlunoTurma(connection, idAluno, idTurma, bloquear = false) {
    const [rows] = await connection.query(
        `SELECT ${CAMPOS_CERTIFICADO}
         FROM Certificados certificado
         WHERE certificado.id_aluno = ? AND certificado.id_turma = ? ORDER BY certificado.versao DESC LIMIT 1${bloquear ? ' FOR UPDATE' : ''}`,
        [idAluno, idTurma]
    );
    return normalizar(rows[0]);
}

async function inserir(connection, dados) {
    const [result] = await connection.query(
        `INSERT INTO Certificados
         (id_aluno, id_turma, codigo_publico, aluno_nome, curso_nome, turma_nome,
          carga_horaria, emitido_em, status, sha256, storage_name, tamanho_bytes,
          id_usuario_emissor, versao, id_certificado_anterior, motivo_reemissao,
          reemitido_em, id_usuario_reemissor, snapshot_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ATIVO', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            dados.id_aluno,
            dados.id_turma,
            dados.codigo_publico,
            dados.aluno_nome,
            dados.curso_nome,
            dados.turma_nome,
            dados.carga_horaria,
            dados.emitido_em,
            dados.sha256,
            dados.storage_name,
            dados.tamanho_bytes,
            dados.id_usuario_emissor,
            dados.versao,
            dados.id_certificado_anterior ?? null,
            dados.motivo_reemissao ?? null,
            dados.reemitido_em ?? null,
            dados.id_usuario_reemissor ?? null,
            JSON.stringify(dados.snapshot_json)
        ]
    );
    return Number(result.insertId);
}

async function buscarPorId(connection, idCertificado, bloquear = false) {
    const [rows] = await connection.query(
        `SELECT ${CAMPOS_CERTIFICADO}
         FROM Certificados certificado
         WHERE certificado.id_certificado = ?${bloquear ? ' FOR UPDATE' : ''}`,
        [idCertificado]
    );
    return normalizar(rows[0]);
}

async function listarDoAluno(idAluno) {
    const [rows] = await db.query(
        `SELECT ${CAMPOS_CERTIFICADO}
         FROM Certificados certificado
         WHERE certificado.id_aluno = ?
         ORDER BY certificado.id_turma, certificado.versao DESC`,
        [idAluno]
    );
    return rows.map(normalizar);
}

async function buscarPorCodigo(codigoPublico) {
    const [rows] = await db.query(
        `SELECT ${CAMPOS_CERTIFICADO}
         FROM Certificados certificado
         WHERE certificado.codigo_publico = ?`,
        [codigoPublico]
    );
    return normalizar(rows[0]);
}

async function buscarPorHash(sha256) {
    const [rows] = await db.query(
        `SELECT ${CAMPOS_CERTIFICADO}
         FROM Certificados certificado
         WHERE certificado.sha256 = ?
         ORDER BY certificado.id_certificado
         LIMIT 1`,
        [sha256]
    );
    return normalizar(rows[0]);
}

async function buscarParaDownload(idCertificado) {
    const [rows] = await db.query(
        `SELECT ${CAMPOS_CERTIFICADO}, turma.id_professor
         FROM Certificados certificado
         INNER JOIN Turmas turma ON turma.id_turma = certificado.id_turma
         WHERE certificado.id_certificado = ?`,
        [idCertificado]
    );
    return normalizar(rows[0]);
}

async function revogar(connection, idCertificado, idRevogador, motivo) {
    await connection.query(
        `UPDATE Certificados
         SET status = 'REVOGADO', revogado_em = CURRENT_TIMESTAMP,
             id_usuario_revogador = ?, motivo_revogacao = ?
         WHERE id_certificado = ? AND status = 'ATIVO'`,
        [idRevogador, motivo, idCertificado]
    );
    return buscarPorId(connection, idCertificado, false);
}

async function buscarMatriculaDoCertificado(idCertificado) {
    const [rows] = await db.query(
        `SELECT m.id_matricula FROM Certificados c
         INNER JOIN Matriculas m ON m.id_aluno = c.id_aluno AND m.id_turma = c.id_turma
         WHERE c.id_certificado = ?`, [idCertificado]
    );
    return rows[0]?.id_matricula || null;
}

async function listarHistorico(connection, idAluno, idTurma) {
    const [rows] = await connection.query(
        `SELECT ${CAMPOS_CERTIFICADO} FROM Certificados certificado
         WHERE certificado.id_aluno = ? AND certificado.id_turma = ?
         ORDER BY certificado.versao DESC`, [idAluno, idTurma]
    );
    return rows.map(normalizar);
}

module.exports = {
    buscarMatriculaDoCertificado,
    listarHistorico,
    buscarContextoEmissao,
    buscarParaDownload,
    buscarPorAlunoTurma,
    buscarPorCodigo,
    buscarPorHash,
    buscarPorId,
    inserir,
    listarDoAluno,
    listarConteudosAbordados,
    normalizar,
    revogar
};
