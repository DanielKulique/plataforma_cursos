'use strict';

const fs = require('fs');
const path = require('path');

function loadPrivatePdf(defaultRequest = jest.fn()) {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'public', 'js', 'private-pdf.js'),
        'utf8'
    ).replace(/^import .*;\n/gm, '').replace(/\bexport\s+/g, '');
    return new Function(
        'authenticatedFetch',
        `${source}\nreturn { PrivatePdfError, fetchPrivatePdf };`
    )(defaultRequest);
}

function response(status, blob = { type: 'application/pdf' }) {
    return {
        ok: status >= 200 && status < 300,
        status,
        blob: jest.fn().mockResolvedValue(blob)
    };
}

describe('documentos PDF privados no frontend', () => {
    const { fetchPrivatePdf } = loadPrivatePdf();

    it('aceita PDF disponível', async () => {
        const pdf = { type: 'application/pdf' };
        await expect(fetchPrivatePdf('/api/documento', {
            request: jest.fn().mockResolvedValue(response(200, pdf))
        })).resolves.toBe(pdf);
    });

    it.each([
        [404, 'Este documento não existe.'],
        [503, 'Este documento está temporariamente indisponível.']
    ])('distingue HTTP %i sem tratar indisponibilidade como ausência', async (status, message) => {
        await expect(fetchPrivatePdf('/api/documento', {
            request: jest.fn().mockResolvedValue(response(status))
        })).rejects.toMatchObject({ status, message });
    });

    it('não mostra TypeError de rede ao usuário', async () => {
        await expect(fetchPrivatePdf('/api/documento', {
            request: jest.fn().mockRejectedValue(new TypeError('Failed to fetch'))
        })).rejects.toMatchObject({ status: 0, message: 'Não foi possível conectar ao servidor.' });
    });
});
