'use strict';

const path = require('path');
const { Worker } = require('worker_threads');

const VALIDATION_TIMEOUT_MS = 10000;
const MAX_CONCURRENT_VALIDATIONS = 2;
let activeValidations = 0;

function pdfError(code, status, message) {
    return Object.assign(new Error(message), { code, status });
}

function hasCompleteEnding(buffer) {
    const eof = buffer.lastIndexOf('%%EOF');
    if (eof < 0 || eof < buffer.length - 1024) return false;
    if (!buffer.subarray(eof + 5).every((byte) => byte === 9 || byte === 10 || byte === 12 || byte === 13 || byte === 32)) return false;
    const startxref = buffer.lastIndexOf('startxref', eof);
    if (startxref <= 5) return false;
    const footer = buffer.toString('latin1', startxref, eof);
    const match = /^startxref\s+([0-9]+)\s*$/.exec(footer);
    if (!match) return false;
    const offset = Number(match[1]);
    if (!Number.isSafeInteger(offset) || offset <= 0 || offset >= startxref) return false;
    const anchor = buffer.toString('latin1', offset, Math.min(offset + 16384, startxref));
    if (/^xref(?=\s)/.test(anchor)) return true;
    if (!/^\d+\s+\d+\s+obj\b/.test(anchor)) return false;
    const dictionary = anchor.split(/\bstream\b/, 1)[0];
    return /\/Type\s*\/XRef\b/.test(dictionary);
}

async function validarEstruturaPdf(buffer) {
    if (!Buffer.isBuffer(buffer) || !hasCompleteEnding(buffer)) {
        throw pdfError('PDF_ESTRUTURA_INVALIDA', 422, 'O PDF está incompleto ou possui estrutura inválida.');
    }
    if (activeValidations >= MAX_CONCURRENT_VALIDATIONS) {
        throw pdfError('VALIDACAO_PDF_OCUPADA', 503, 'Validação de PDF temporariamente ocupada. Tente novamente.');
    }
    activeValidations += 1;
    try {
        return await new Promise((resolve, reject) => {
            const worker = new Worker(path.join(__dirname, 'pdf-validation.worker.js'), {
                workerData: buffer,
                resourceLimits: { maxOldGenerationSizeMb: 256 }
            });
            let settled = false;
            const finish = (error, pages) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (error) reject(error);
                else resolve(pages);
            };
            const timer = setTimeout(() => {
                worker.terminate().catch(() => {});
                finish(pdfError('PDF_VALIDACAO_TIMEOUT', 422, 'O PDF excedeu o tempo de validação permitido.'));
            }, VALIDATION_TIMEOUT_MS);
            worker.once('message', (result) => {
                if (result.ok) return finish(null, result.pages);
                if (result.encrypted) return finish(pdfError('PDF_CRIPTOGRAFADO', 422, 'PDF protegido por senha não é suportado.'));
                return finish(pdfError('PDF_ESTRUTURA_INVALIDA', 422, 'O PDF está incompleto ou possui estrutura inválida.'));
            });
            worker.once('error', () => finish(pdfError('PDF_ESTRUTURA_INVALIDA', 422, 'O PDF está incompleto ou possui estrutura inválida.')));
            worker.once('exit', (code) => {
                if (code !== 0) finish(pdfError('PDF_ESTRUTURA_INVALIDA', 422, 'O PDF está incompleto ou possui estrutura inválida.'));
            });
        });
    } finally {
        activeValidations -= 1;
    }
}

module.exports = { validarEstruturaPdf };
