'use strict';

const privateStorage = require('./private-storage.service');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { validarEstruturaPdf } = require('./pdf-validation.service');
const {
    obterDiretorioMateriais,
    obterLimitePdfBytes,
    obterLimitePdfMb
} = require('../../config/material-storage');

const STORAGE_NAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/;

function uploadError(code, status, message) {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    return error;
}

function validarNomeOriginal(originalName) {
    const recebido = String(originalName || '');
    let decodificado = recebido;
    if ([...recebido].every((char) => char.codePointAt(0) <= 255)) {
        try {
            decodificado = new TextDecoder('utf-8', { fatal: true })
                .decode(Buffer.from(recebido, 'latin1'));
        } catch {
            decodificado = recebido;
        }
    }
    const nome = decodificado.normalize('NFC');
    if (!nome || nome.length > 255 || Buffer.byteLength(nome, 'utf8') > 512) {
        throw uploadError('NOME_ARQUIVO_INVALIDO', 422, 'O nome do PDF deve possuir no máximo 255 caracteres.');
    }
    const possuiControle = [...nome].some((char) => {
        const codepoint = char.codePointAt(0);
        return codepoint <= 31 || codepoint === 127;
    });
    if (possuiControle || nome.includes('/') || nome.includes('\\')) {
        throw uploadError('NOME_ARQUIVO_INVALIDO', 422, 'O nome do PDF contém caracteres não permitidos.');
    }
    if (!/\.pdf$/i.test(nome)) {
        throw uploadError('EXTENSAO_PDF_INVALIDA', 422, 'Selecione um arquivo com extensão .pdf.');
    }
    return nome;
}

const upload = multer({
    storage: multer.memoryStorage(),
    preservePath: true,
    limits: {
        fileSize: obterLimitePdfBytes(),
        files: 1,
        fields: 10,
        parts: 12,
        fieldNameSize: 100,
        fieldSize: 16 * 1024
    },
    fileFilter(req, file, callback) {
        try {
            file.originalname = validarNomeOriginal(file.originalname);
            if (file.mimetype !== 'application/pdf') {
                throw uploadError('MIME_PDF_INVALIDO', 422, 'O arquivo deve possuir MIME application/pdf.');
            }
            callback(null, true);
        } catch (error) {
            callback(error);
        }
    }
});

function receberPdf(req, res, next) {
    upload.single('arquivo')(req, res, (error) => {
        if (!error) return next();
        if (error instanceof multer.MulterError) {
            if (error.code === 'LIMIT_FILE_SIZE') {
                return next(uploadError(
                    'PDF_MUITO_GRANDE',
                    413,
                    `O PDF excede o limite de ${obterLimitePdfMb()} MB.`
                ));
            }
            return next(uploadError(
                'MULTIPART_INVALIDO',
                400,
                error.code === 'LIMIT_UNEXPECTED_FILE'
                    ? 'Envie exatamente um arquivo no campo arquivo.'
                    : 'O formulário de upload excedeu os limites permitidos.'
            ));
        }
        return next(error);
    });
}

async function removerArquivo(caminho) {
    if (!caminho) return;
    await fs.promises.unlink(caminho).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
    });
}

async function prepararArquivoPdf(file) {
    if (!file) throw uploadError('PDF_AUSENTE', 400, 'Selecione um arquivo PDF para enviar.');
    if (!file.size) throw uploadError('PDF_VAZIO', 422, 'O arquivo PDF está vazio.');
    if (file.size > obterLimitePdfBytes()) throw uploadError('PDF_MUITO_GRANDE', 413, 'O PDF excede o limite permitido.');
    if (!Buffer.isBuffer(file.buffer) || !file.buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
        throw uploadError('ASSINATURA_PDF_INVALIDA', 422, 'O arquivo não possui uma assinatura PDF válida.');
    }
    await validarEstruturaPdf(file.buffer);
    return {
        original_name: validarNomeOriginal(file.originalname),
        mime_type: 'application/pdf',
        size_bytes: file.size,
        buffer: file.buffer
    };
}

async function prepararStorage(arquivo, conexao) {
    const name = `${require('crypto').randomUUID()}.pdf`;
    const unlock = await privateStorage.lock(conexao, 'materials', name);
    if (!unlock) throw uploadError('STORAGE_OCUPADO', 503, 'Storage ocupado.');
    arquivo.unlock = unlock;
    Object.assign(arquivo, await privateStorage.stage(obterDiretorioMateriais(), arquivo.buffer, 'materials', name));
    delete arquivo.buffer;
}

async function publicarStorage(arquivo) {
    await privateStorage.publish(obterDiretorioMateriais(), arquivo, 'materials');
}

async function finalizarStorage(arquivo, commitIniciado, sucesso) {
    const root = obterDiretorioMateriais();
    if (!sucesso && arquivo.published && !commitIniciado) await privateStorage.compensate(root, arquivo.storage_name, 'materials');
    if (!sucesso && commitIniciado) privateStorage.event('commit_unknown', 'materials', arquivo.storage_name);
    await privateStorage.compensate(root, arquivo.pending, 'materials');
    if (arquivo.unlock) await arquivo.unlock();
}

function resolverCaminhoMaterial(storageName) {
    const nome = String(storageName || '');
    if (!STORAGE_NAME_PATTERN.test(nome)) {
        throw uploadError('REFERENCIA_MATERIAL_INVALIDA', 422, 'O PDF possui uma referência de armazenamento inválida.');
    }
    const diretorio = obterDiretorioMateriais();
    const caminho = path.resolve(diretorio, nome);
    if (path.dirname(caminho) !== diretorio) {
        throw uploadError('REFERENCIA_MATERIAL_INVALIDA', 422, 'O PDF possui uma referência de armazenamento inválida.');
    }
    return caminho;
}

function formatarContentDisposition(originalName) {
    const original = validarNomeOriginal(originalName);
    const fallback = original.normalize('NFKD')
        .replace(/[^\x20-\x7e]/g, '_')
        .replace(/["\\]/g, '_');
    const encoded = encodeURIComponent(original).replace(/[!'()*]/g, (char) => (
        `%${char.charCodeAt(0).toString(16).toUpperCase()}`
    ));
    return `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

module.exports = {
    prepararStorage, publicarStorage, finalizarStorage,
    STORAGE_NAME_PATTERN,
    formatarContentDisposition,
    prepararArquivoPdf,
    receberPdf,
    removerArquivo,
    resolverCaminhoMaterial,
    validarNomeOriginal
};
