'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

describe('armazenamento privado de certificados', () => {
    let diretorio;
    let storage;

    beforeEach(() => {
        diretorio = fs.mkdtempSync(path.join(os.tmpdir(), 'certificados-test-'));
        process.env.CERTIFICATE_STORAGE_DIR = diretorio;
        jest.resetModules();
        storage = require('../api/services/certificate-storage.service');
    });

    afterEach(() => {
        jest.restoreAllMocks();
        fs.rmSync(diretorio, { recursive: true, force: true });
        delete process.env.CERTIFICATE_STORAGE_DIR;
    });

    it('persiste somente o PDF final, com UUID v4, SHA-256 e permissões privadas', async () => {
        const pdf = Buffer.from('%PDF-1.7\ncertificado-final');
        const resultado = await storage.persistirPdfFinal(pdf);

        expect(storage.STORAGE_NAME_PATTERN.test(resultado.storage_name)).toBe(true);
        expect(resultado.sha256).toBe(crypto.createHash('sha256').update(pdf).digest('hex'));
        expect(resultado.tamanho_bytes).toBe(pdf.length);
        expect(fs.readFileSync(resultado.caminho_absoluto)).toEqual(pdf);
        expect(fs.statSync(resultado.caminho_absoluto).mode & 0o777).toBe(0o600);
        expect(path.dirname(resultado.caminho_absoluto)).toBe(path.resolve(diretorio));
        expect(fs.readdirSync(diretorio).some((nome) => nome.endsWith('.pending'))).toBe(false);
    });

    it('nunca sobrescreve o documento ao persistir duas vezes', async () => {
        const primeiro = await storage.persistirPdfFinal(Buffer.from('%PDF-primeiro'));
        const segundo = await storage.persistirPdfFinal(Buffer.from('%PDF-segundo'));

        expect(segundo.storage_name).not.toBe(primeiro.storage_name);
        expect(fs.readFileSync(primeiro.caminho_absoluto).toString()).toBe('%PDF-primeiro');
        expect(fs.readFileSync(segundo.caminho_absoluto).toString()).toBe('%PDF-segundo');
    });

    it('mantém o PDF após recriar o módulo, simulando restart da aplicação', async () => {
        const persistido = await storage.persistirPdfFinal(Buffer.from('%PDF-persistente'));
        jest.resetModules();
        const storageReiniciado = require('../api/services/certificate-storage.service');

        expect(fs.readFileSync(storageReiniciado.resolverCaminhoCertificado(persistido.storage_name)))
            .toEqual(Buffer.from('%PDF-persistente'));
    });

    it('não sobrescreve nem remove PDF existente mesmo se o UUID colidir', async () => {
        jest.spyOn(crypto, 'randomUUID').mockReturnValue('123e4567-e89b-42d3-a456-426614174000');
        const primeiro = await storage.persistirPdfFinal(Buffer.from('%PDF-original'));
        await expect(storage.persistirPdfFinal(Buffer.from('%PDF-substituto')))
            .rejects.toMatchObject({ code: 'EEXIST' });
        expect(fs.readFileSync(primeiro.caminho_absoluto).toString()).toBe('%PDF-original');
        expect(fs.readdirSync(diretorio)).toEqual([primeiro.storage_name]);
    });

    it('rejeita conteúdo que não é PDF e referências com path traversal', async () => {
        await expect(storage.persistirPdfFinal(Buffer.from('arquivo qualquer'))).rejects.toMatchObject({
            code: 'PDF_INVALIDO'
        });
        expect(() => storage.resolverCaminhoCertificado('../../src/public/segredo.pdf'))
            .toThrow(/referência de armazenamento inválida/i);
        expect(() => storage.resolverCaminhoCertificado('certificado.pdf'))
            .toThrow(/referência de armazenamento inválida/i);
    });

    it('gera Content-Disposition seguro para visualização e download', () => {
        expect(storage.formatarContentDisposition('CERT-ABC\r\nmalicioso', false))
            .toBe('inline; filename="certificado-CERT-ABCmalicioso.pdf"');
        expect(storage.formatarContentDisposition('CERT-ABC', true))
            .toBe('attachment; filename="certificado-CERT-ABC.pdf"');
    });
});
