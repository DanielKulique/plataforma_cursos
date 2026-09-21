'use strict';

const path = require('path');

const DEFAULT_PDF_MAX_SIZE_MB = 20;

function obterLimitePdfMb(env = process.env) {
    const limite = Number(env.PDF_MAX_SIZE_MB || DEFAULT_PDF_MAX_SIZE_MB);
    if (!Number.isInteger(limite) || limite < 1 || limite > 100) {
        const error = new Error('PDF_MAX_SIZE_MB deve ser um inteiro entre 1 e 100.');
        error.code = 'CONFIGURACAO_INVALIDA';
        throw error;
    }
    return limite;
}

function obterDiretorioMateriais(env = process.env) {
    const configurado = String(env.MATERIAL_STORAGE_DIR || '').trim();
    const diretorio = path.resolve(
        configurado || path.join(__dirname, '..', '..', 'storage', 'materials')
    );
    const publicRoot = path.resolve(__dirname, '..', 'public');
    const relativoAoPublico = path.relative(publicRoot, diretorio);
    if (relativoAoPublico === '' || (!relativoAoPublico.startsWith('..') && !path.isAbsolute(relativoAoPublico))) {
        const error = new Error('MATERIAL_STORAGE_DIR deve ficar fora de src/public.');
        error.code = 'CONFIGURACAO_INVALIDA';
        throw error;
    }
    return diretorio;
}

function obterLimitePdfBytes(env = process.env) {
    return obterLimitePdfMb(env) * 1024 * 1024;
}

module.exports = {
    DEFAULT_PDF_MAX_SIZE_MB,
    obterDiretorioMateriais,
    obterLimitePdfBytes,
    obterLimitePdfMb
};
