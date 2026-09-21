'use strict';

const path = require('path');

const DEFAULT_CERTIFICATE_UPLOAD_MAX_SIZE_MB = 10;

function configurationError(message) {
    const error = new Error(message);
    error.code = 'CONFIGURACAO_INVALIDA';
    return error;
}

function obterDiretorioCertificados(env = process.env) {
    const configurado = String(env.CERTIFICATE_STORAGE_DIR || '').trim();
    const diretorio = path.resolve(
        configurado || path.join(__dirname, '..', '..', 'storage', 'certificates')
    );
    const publicRoot = path.resolve(__dirname, '..', 'public');
    const relativoAoPublico = path.relative(publicRoot, diretorio);
    if (relativoAoPublico === '' || (!relativoAoPublico.startsWith('..') && !path.isAbsolute(relativoAoPublico))) {
        throw configurationError('CERTIFICATE_STORAGE_DIR deve ficar fora de src/public.');
    }
    return diretorio;
}

function obterLimiteUploadCertificadoMb(env = process.env) {
    const limite = Number(
        env.CERTIFICATE_UPLOAD_MAX_SIZE_MB || DEFAULT_CERTIFICATE_UPLOAD_MAX_SIZE_MB
    );
    if (!Number.isInteger(limite) || limite < 1 || limite > 25) {
        throw configurationError('CERTIFICATE_UPLOAD_MAX_SIZE_MB deve ser um inteiro entre 1 e 25.');
    }
    return limite;
}

function obterLimiteUploadCertificadoBytes(env = process.env) {
    return obterLimiteUploadCertificadoMb(env) * 1024 * 1024;
}

module.exports = {
    DEFAULT_CERTIFICATE_UPLOAD_MAX_SIZE_MB,
    obterDiretorioCertificados,
    obterLimiteUploadCertificadoBytes,
    obterLimiteUploadCertificadoMb
};
