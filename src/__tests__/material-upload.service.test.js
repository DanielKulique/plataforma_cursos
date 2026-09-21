'use strict';

const fs = require('fs');
const path = require('path');
const {
    STORAGE_NAME_PATTERN,
    formatarContentDisposition,
    resolverCaminhoMaterial,
    validarNomeOriginal,
    prepararArquivoPdf
} = require('../api/services/material-upload.service');

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name));

describe('validações do armazenamento de materiais', () => {
    it('aceita nomes Unicode seguros e rejeita nomes longos, extensão e travessia', () => {
        expect(validarNomeOriginal('ação final.PDF')).toBe('ação final.PDF');
        expect(() => validarNomeOriginal(`${'a'.repeat(256)}.pdf`)).toThrow(/255/);
        expect(() => validarNomeOriginal('arquivo.txt')).toThrow(/extensão/);
        expect(() => validarNomeOriginal('../segredo.pdf')).toThrow(/caracteres/);
        expect(() => validarNomeOriginal('pasta\\segredo.pdf')).toThrow(/caracteres/);
    });

    it('resolve somente UUID v4 com extensão PDF dentro do diretório privado', () => {
        const nome = '123e4567-e89b-42d3-a456-426614174000.pdf';
        expect(STORAGE_NAME_PATTERN.test(nome)).toBe(true);
        expect(resolverCaminhoMaterial(nome)).toMatch(new RegExp(`${nome.replaceAll('.', '\\.')}$$`));
        expect(() => resolverCaminhoMaterial('../../public/segredo.pdf')).toThrow(/referência/);
        expect(() => resolverCaminhoMaterial('nome-previsivel.pdf')).toThrow(/referência/);
    });

    it('gera Content-Disposition sem injeção e preserva nome internacional em RFC 5987', () => {
        const header = formatarContentDisposition('guia ação.pdf');
        expect(header).toContain('filename="guia ac_a_o.pdf"');
        expect(header).toContain("filename*=UTF-8''guia%20a%C3%A7%C3%A3o.pdf");
        expect(() => formatarContentDisposition('x\r\nmalicioso.pdf')).toThrow(/caracteres/);
    });

    it('aceita PDF estrutural e preserva bytes originais', async () => {
        const buffer = fixture('valid-material.pdf');
        const preparado = await prepararArquivoPdf({
            originalname: 'guia.pdf', size: buffer.length, buffer
        });
        expect(preparado.buffer).toBe(buffer);
        expect(preparado.size_bytes).toBe(buffer.length);
        const classic = fixture('valid-xref-table.pdf');
        await expect(prepararArquivoPdf({ originalname: 'classico.pdf', size: classic.length, buffer: classic }))
            .resolves.toMatchObject({ size_bytes: classic.length });
    });

    it('recusa PDF falso, truncado, vazio, criptografado e acima do limite', async () => {
        const valido = fixture('valid-material.pdf');
        const arquivo = (buffer) => ({ originalname: 'guia.pdf', size: buffer.length, buffer });
        await expect(prepararArquivoPdf(arquivo(Buffer.from('texto'))))
            .rejects.toMatchObject({ code: 'ASSINATURA_PDF_INVALIDA', status: 422 });
        await expect(prepararArquivoPdf(arquivo(Buffer.from('%PDF-1.4\n%%EOF'))))
            .rejects.toMatchObject({ code: 'PDF_ESTRUTURA_INVALIDA', status: 422 });
        await expect(prepararArquivoPdf(arquivo(Buffer.from('%PDF-1.4\nstartxref\n0\n%%EOF\n'))))
            .rejects.toMatchObject({ code: 'PDF_ESTRUTURA_INVALIDA', status: 422 });
        await expect(prepararArquivoPdf(arquivo(valido.subarray(0, valido.length - 16))))
            .rejects.toMatchObject({ code: 'PDF_ESTRUTURA_INVALIDA', status: 422 });
        const wrongXref = Buffer.from(valido.toString('latin1').replace(
            /startxref\s+\d+\s+%%EOF/, 'startxref\n0\n%%EOF'
        ), 'latin1');
        await expect(prepararArquivoPdf(arquivo(wrongXref)))
            .rejects.toMatchObject({ code: 'PDF_ESTRUTURA_INVALIDA', status: 422 });
        await expect(prepararArquivoPdf(arquivo(Buffer.alloc(0))))
            .rejects.toMatchObject({ code: 'PDF_VAZIO', status: 422 });
        await expect(prepararArquivoPdf(arquivo(fixture('encrypted-material.pdf'))))
            .rejects.toMatchObject({ code: 'PDF_CRIPTOGRAFADO', status: 422 });
        await expect(prepararArquivoPdf(arquivo(Buffer.alloc(21 * 1024 * 1024))))
            .rejects.toMatchObject({ code: 'PDF_MUITO_GRANDE', status: 413 });
    });
});
