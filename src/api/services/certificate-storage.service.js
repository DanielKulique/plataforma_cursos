'use strict';

const crypto = require('crypto');
const privateStorage = require('./private-storage.service');
const path = require('path');
const { obterDiretorioCertificados } = require('../../config/certificate-storage');

const STORAGE_NAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/;

function storageError(code, status, message) {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    return error;
}

function calcularSha256(buffer) {
    if (!Buffer.isBuffer(buffer)) {
        throw storageError('PDF_INVALIDO', 500, 'O gerador não produziu um PDF válido.');
    }
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

function validarPdf(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 5 || !buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
        throw storageError('PDF_INVALIDO', 500, 'O gerador não produziu um PDF válido.');
    }
}

function resolverCaminhoCertificado(storageName) {
    const nome = String(storageName || '');
    if (!STORAGE_NAME_PATTERN.test(nome)) {
        throw storageError(
            'REFERENCIA_CERTIFICADO_INVALIDA',
            422,
            'O certificado possui uma referência de armazenamento inválida.'
        );
    }
    const diretorio = obterDiretorioCertificados();
    const caminho = path.resolve(diretorio, nome);
    if (path.dirname(caminho) !== diretorio) {
        throw storageError(
            'REFERENCIA_CERTIFICADO_INVALIDA',
            422,
            'O certificado possui uma referência de armazenamento inválida.'
        );
    }
    return caminho;
}

async function persistirPdfFinal(buffer, connection) {
    validarPdf(buffer);
    const root = obterDiretorioCertificados();
    const name = `${crypto.randomUUID()}.pdf`;
    const unlock = connection ? await privateStorage.lock(connection, 'certificates', name) : null;
    if (connection && !unlock) throw storageError('STORAGE_OCUPADO', 503, 'Storage ocupado.');
    let file;
    try {
        file = await privateStorage.stage(root, buffer, 'certificates', name);
        await privateStorage.publish(root, file, 'certificates');
        return { storage_name: name, sha256: file.sha256, tamanho_bytes: buffer.length,
            caminho_absoluto: path.join(root, name), unlock };
    } catch (error) {
        if (file?.published) await privateStorage.compensate(root, name, 'certificates');
        if (file) await privateStorage.compensate(root, file.pending, 'certificates');
        if (unlock) await unlock();
        throw error;
    }
}

async function removerArquivo(storageName) {
    if (!storageName) return;
    resolverCaminhoCertificado(storageName);
    await privateStorage.compensate(obterDiretorioCertificados(), storageName, 'certificates');
}

function formatarContentDisposition(codigoPublico, baixar = false) {
    const codigo = String(codigoPublico || '').replace(/[^A-Z0-9-]/gi, '');
    const modo = baixar ? 'attachment' : 'inline';
    return `${modo}; filename="certificado-${codigo || 'emitido'}.pdf"`;
}

module.exports = {
    STORAGE_NAME_PATTERN,
    calcularSha256,
    formatarContentDisposition,
    persistirPdfFinal,
    removerArquivo,
    resolverCaminhoCertificado,
    validarPdf
};
