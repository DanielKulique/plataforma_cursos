'use strict';

const crypto = require('crypto');
const db = require('../../config/database');
const model = require('../models/certificados.models');
const pdfService = require('./certificate-pdf.service');
const storage = require('./certificate-storage.service');
const privateStorage = require('./private-storage.service');
const { buscarRequisitos } = require('./academic-progress.service');

const CODIGO_PUBLICO_PATTERN = /^CERT-[0-9A-F]{8}(?:-[0-9A-F]{8}){3}$/;

function certificateError(code, status, message) {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    return error;
}

function gerarCodigoPublico() {
    const hexadecimal = crypto.randomBytes(16).toString('hex').toUpperCase();
    return `CERT-${hexadecimal.match(/.{8}/g).join('-')}`;
}

function autorizarEmissao(usuario, contexto) {
    if (usuario?.tipo === 'ADMIN') return;
    if (
        usuario?.tipo === 'PROFESSOR'
        && Number(contexto.id_professor) === Number(usuario.id_usuario)
    ) return;
    throw certificateError(
        'EMISSAO_NAO_AUTORIZADA',
        403,
        'Você não possui permissão para emitir este certificado.'
    );
}

function respostaPrivada(certificado) {
    return {
        id_certificado: certificado.id_certificado,
        id_turma: certificado.id_turma,
        versao: certificado.versao,
        id_certificado_anterior: certificado.id_certificado_anterior,
        motivo_reemissao: certificado.motivo_reemissao,
        reemitido_em: certificado.reemitido_em,
        id_usuario_emissor: certificado.id_usuario_emissor,
        id_usuario_reemissor: certificado.id_usuario_reemissor,
        id_usuario_revogador: certificado.id_usuario_revogador,
        motivo_revogacao: certificado.motivo_revogacao,
        codigo_publico: certificado.codigo_publico,
        aluno_nome: certificado.aluno_nome,
        curso_nome: certificado.curso_nome,
        turma_nome: certificado.turma_nome,
        carga_horaria: certificado.carga_horaria,
        emitido_em: certificado.emitido_em,
        status: certificado.status,
        revogado_em: certificado.revogado_em
    };
}

function respostaPublica(certificado) {
    return {
        codigo: certificado.codigo_publico,
        versao: certificado.versao,
        aluno: certificado.aluno_nome,
        curso: certificado.curso_nome,
        turma: certificado.turma_nome,
        carga_horaria: certificado.carga_horaria,
        emitido_em: certificado.emitido_em
    };
}

function isDuplicateKey(error, keyName) {
    return error?.code === 'ER_DUP_ENTRY' && String(error.message || '').includes(keyName);
}

function selecionarDataCertificado(contexto, emitidoEm) {
    const encerramento = contexto.data_fim ? new Date(contexto.data_fim) : null;
    if (encerramento && !Number.isNaN(encerramento.getTime()) && encerramento <= emitidoEm) {
        return encerramento;
    }
    return emitidoEm;
}

async function emitirCertificado(idMatricula, usuario, reemissao = null) {
    if (reemissao) autorizarReemissao(usuario, reemissao.motivo);
    // Decode institutional assets and embed fonts before acquiring academic locks.
    const documentoPreparado = await pdfService.prepararDocumentoCertificado();
    const connection = await db.getConnection();
    let arquivoPersistido = null;
    let commitIniciado = false;

    try {
        // O model descobre a turma antes de iniciar a transação e adquirir seus locks.
        const contexto = await model.buscarContextoEmissao(connection, idMatricula);
        if (!contexto) {
            throw certificateError('MATRICULA_NAO_ENCONTRADA', 404, 'Matrícula não encontrada.');
        }
        autorizarEmissao(usuario, contexto);
        if (contexto.status_aprovacao !== 'APROVADO') {
            throw certificateError(
                'ALUNO_NAO_APROVADO',
                409,
                'O certificado somente pode ser emitido para uma matrícula aprovada.'
            );
        }

        const existente = await model.buscarPorAlunoTurma(
            connection,
            contexto.id_aluno,
            contexto.id_turma,
            true
        );
        if (reemissao) {
            if (!existente || existente.id_certificado !== Number(reemissao.id_certificado)) {
                throw certificateError('VERSAO_JA_SUBSTITUIDA', 409,
                    'Esta versão já foi substituída. Atualize o histórico antes de continuar.');
            }
        } else if (existente) {
            if (existente.status !== 'ATIVO') {
                throw certificateError('REEMISSAO_ADMIN_NECESSARIA', 409,
                    'Certificado revogado — correção/reemissão requer ADMIN.');
            }
            await connection.commit();
            return { certificado: respostaPrivada(existente), reutilizado: true };
        }

        const progresso = await buscarRequisitos(connection, contexto.id_aluno, contexto.id_turma);
        if (!progresso.conteudo_concluido) {
            throw certificateError(
                'CONTEUDOS_PENDENTES', 409,
                'Conclua todos os conteúdos atuais da turma antes de emitir o certificado.'
            );
        }

        if (!progresso.prova_final_aprovada) {
            throw certificateError('PROVA_FINAL_PENDENTE', 409, 'Conquiste pelo menos 75% na prova final antes de emitir o certificado.');
        }

        const emitidoEm = new Date();
        const conteudosAbordados = await model.listarConteudosAbordados(
            connection,
            contexto.id_turma
        );
        let certificado = null;
        for (let tentativa = 0; tentativa < 3; tentativa += 1) {
            const codigoPublico = gerarCodigoPublico();
            const snapshot = {
                versao: reemissao ? existente.versao + 1 : 1,
                id_certificado_anterior: reemissao ? existente.id_certificado : null,
                motivo_reemissao: reemissao?.motivo ?? null,
                reemitido_em: reemissao ? emitidoEm : null,
                id_usuario_reemissor: reemissao ? Number(usuario.id_usuario) : null,
                id_aluno: Number(contexto.id_aluno),
                id_turma: Number(contexto.id_turma),
                codigo_publico: codigoPublico,
                aluno_nome: contexto.aluno_nome,
                curso_nome: contexto.nome_curso,
                turma_nome: contexto.nome_turma,
                carga_horaria: Number(contexto.carga_horaria),
                emitido_em: emitidoEm,
                data_certificado: selecionarDataCertificado(contexto, emitidoEm),
                aluno_cpf: contexto.aluno_cpf,
                responsavel_nome: contexto.responsavel_nome,
                conteudos_abordados: conteudosAbordados,
                requisitos_academicos: progresso,
                status_aprovacao: contexto.status_aprovacao,
                nota_final: contexto.nota_final ?? null,
                id_usuario_emissor: Number(usuario.id_usuario)
            };
            const pdfFinal = await pdfService.gerarCertificadoPdf(snapshot, process.env, tentativa === 0 ? documentoPreparado : undefined);
            arquivoPersistido = await storage.persistirPdfFinal(pdfFinal, connection);

            try {
                // Only transition after the new, durable PDF has been prepared.
                // Rollback restores the predecessor if any later SQL operation fails.
                if (reemissao && existente.status === 'ATIVO') {
                    await model.revogar(connection, existente.id_certificado, usuario.id_usuario, reemissao.motivo);
                }
                const idCertificado = await model.inserir(connection, {
                    ...snapshot,
                    snapshot_json: snapshot,
                    ...arquivoPersistido
                });
                certificado = await model.buscarPorId(connection, idCertificado);
                break;
            } catch (error) {
                await storage.removerArquivo(arquivoPersistido.storage_name).catch((error) => privateStorage.event('compensation_failed', 'certificates', arquivoPersistido.storage_name, error));
                if (arquivoPersistido.unlock) await arquivoPersistido.unlock();
                arquivoPersistido = null;
                if (isDuplicateKey(error, 'uk_certificado_codigo_publico')) continue;
                throw error;
            }
        }

        if (!certificado) {
            throw certificateError(
                'CODIGO_PUBLICO_INDISPONIVEL',
                503,
                'Não foi possível gerar um código público único. Tente novamente.'
            );
        }

        commitIniciado = true;
        await connection.commit();
        if (arquivoPersistido?.unlock) await arquivoPersistido.unlock();
        arquivoPersistido = null;
        return { certificado: respostaPrivada(certificado), reutilizado: false };
    } catch (error) {
        await privateStorage.rollback(connection);
        // An interrupted COMMIT has an unknown outcome. Never delete a PDF that
        // may already belong to a committed version; retain for operator verification.
        if (arquivoPersistido && !commitIniciado) {
            await storage.removerArquivo(arquivoPersistido.storage_name).catch((error) => privateStorage.event('compensation_failed', 'certificates', arquivoPersistido.storage_name, error));
            if (arquivoPersistido.unlock) await arquivoPersistido.unlock();
        }
        if (arquivoPersistido && commitIniciado) {
            privateStorage.event('commit_unknown', 'certificates', arquivoPersistido.storage_name, error);
            if (arquivoPersistido.unlock) await arquivoPersistido.unlock();
        }
        if (reemissao && (error.code === 'ER_DUP_ENTRY' || error.code === 'ER_LOCK_DEADLOCK' || error.code === 'ER_LOCK_WAIT_TIMEOUT')) {
            throw certificateError('REEMISSAO_CONCORRENTE', 409, 'Outra operação alterou o certificado. Atualize o histórico.');
        }
        throw error;
    } finally {
        connection.release();
    }
}

function autorizarReemissao(usuario, motivo) {
    if (usuario?.tipo !== 'ADMIN') {
        throw certificateError('REEMISSAO_NAO_AUTORIZADA', 403, 'Somente administradores podem reemitir certificados.');
    }
    if (typeof motivo !== 'string' || motivo.trim().length < 3 || motivo.trim().length > 500) {
        throw certificateError('MOTIVO_INVALIDO', 400, 'Informe um motivo entre 3 e 500 caracteres.');
    }
}

async function reemitirCertificado(idCertificado, motivo, usuario) {
    autorizarReemissao(usuario, motivo);
    // Lookup outside the transaction: eligibility must observe data committed before
    // the enrollment/class lock is acquired, without an earlier consistent read view.
    const idMatricula = await model.buscarMatriculaDoCertificado(idCertificado);
    if (!idMatricula) throw certificateError('CERTIFICADO_NAO_ENCONTRADO', 404, 'Certificado não encontrado.');
    return emitirCertificado(idMatricula, usuario, { id_certificado: idCertificado, motivo: motivo.trim() });
}

async function listarHistorico(idCertificado, usuario) {
    await obterDownload(idCertificado, usuario);
    const certificado = await model.buscarPorId(db, idCertificado);
    return (await model.listarHistorico(db, certificado.id_aluno, certificado.id_turma)).map(respostaPrivada);
}

async function listarMeusCertificados(usuario) {
    if (usuario?.tipo !== 'ALUNO') {
        throw certificateError(
            'CONSULTA_NAO_AUTORIZADA',
            403,
            'Somente alunos podem consultar esta lista de certificados.'
        );
    }
    const certificados = await model.listarDoAluno(usuario.id_usuario);
    return certificados.map(respostaPrivada);
}

async function obterDownload(idCertificado, usuario) {
    const certificado = await model.buscarParaDownload(idCertificado);
    if (!certificado) {
        throw certificateError('CERTIFICADO_NAO_ENCONTRADO', 404, 'Certificado não encontrado.');
    }
    const autorizado = usuario?.tipo === 'ADMIN'
        || (usuario?.tipo === 'ALUNO' && Number(certificado.id_aluno) === Number(usuario.id_usuario))
        || (usuario?.tipo === 'PROFESSOR' && Number(certificado.id_professor) === Number(usuario.id_usuario));
    if (!autorizado) {
        throw certificateError(
            'DOWNLOAD_NAO_AUTORIZADO',
            403,
            'Você não possui permissão para acessar este certificado.'
        );
    }
    return {
        certificado: respostaPrivada(certificado),
        caminho: storage.resolverCaminhoCertificado(certificado.storage_name)
    };
}

async function revogarCertificado(idCertificado, motivo, usuario) {
    if (usuario?.tipo !== 'ADMIN') {
        throw certificateError(
            'REVOGACAO_NAO_AUTORIZADA',
            403,
            'Somente administradores podem revogar certificados.'
        );
    }
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const atual = await model.buscarPorId(connection, idCertificado, true);
        if (!atual) {
            throw certificateError('CERTIFICADO_NAO_ENCONTRADO', 404, 'Certificado não encontrado.');
        }
        if (atual.status === 'REVOGADO') {
            await connection.commit();
            return respostaPrivada(atual);
        }
        const revogado = await model.revogar(
            connection,
            idCertificado,
            usuario.id_usuario,
            motivo
        );
        await connection.commit();
        return respostaPrivada(revogado);
    } catch (error) {
        await privateStorage.rollback(connection);
        throw error;
    } finally {
        connection.release();
    }
}

async function validarPorCodigo(codigoRecebido) {
    const codigo = String(codigoRecebido || '').trim().toUpperCase();
    if (!CODIGO_PUBLICO_PATTERN.test(codigo)) return { resultado: 'NAO_ENCONTRADO' };
    const certificado = await model.buscarPorCodigo(codigo);
    if (!certificado) return { resultado: 'NAO_ENCONTRADO' };
    return {
        resultado: certificado.status === 'REVOGADO' ? 'REVOGADO' : 'VALIDO',
        certificado: respostaPublica(certificado)
    };
}

async function validarArquivo(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 5 || !buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
        throw certificateError('PDF_INVALIDO', 422, 'Selecione um arquivo PDF válido.');
    }
    const sha256 = storage.calcularSha256(buffer);
    const certificado = await model.buscarPorHash(sha256);
    if (!certificado) return { resultado: 'NAO_VALIDADO' };
    return {
        resultado: certificado.status === 'REVOGADO' ? 'REVOGADO' : 'AUTENTICO',
        certificado: respostaPublica(certificado)
    };
}

module.exports = {
    CODIGO_PUBLICO_PATTERN,
    emitirCertificado,
    reemitirCertificado,
    listarHistorico,
    gerarCodigoPublico,
    listarMeusCertificados,
    obterDownload,
    respostaPublica,
    revogarCertificado,
    selecionarDataCertificado,
    validarArquivo,
    validarPorCodigo
};
