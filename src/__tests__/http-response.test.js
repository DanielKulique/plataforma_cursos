'use strict';

const { buildErrorResponse } = require('../utils/http-response');

describe('contrato mínimo de erros HTTP', () => {
    it('preserva mensagem e código de um erro de domínio seguro', () => {
        const error = Object.assign(new Error('Turma encerrada.'), {
            status: 409,
            code: 'TURMA_ENCERRADA'
        });
        expect(buildErrorResponse(error, { legacyKey: 'mensagem' })).toEqual({
            status: 409,
            body: {
                error: 'Turma encerrada.',
                mensagem: 'Turma encerrada.',
                code: 'TURMA_ENCERRADA'
            }
        });
    });

    it.each([
        new Error('ER_LOCK_DEADLOCK table Usuarios'),
        Object.assign(new Error('ECONNREFUSED mysql.internal'), { status: 500, code: 'DB_FAILURE' }),
        Object.assign(new Error('ENOENT /srv/private/file.pdf'), { status: 599 })
    ])('substitui erro interno inesperado por mensagem genérica', (error) => {
        const response = buildErrorResponse(error, { legacyKey: 'mensagem' });
        expect(response.status).toBe(error.status || 500);
        expect(response.body).toEqual({
            error: 'Erro interno do servidor.',
            mensagem: 'Erro interno do servidor.'
        });
        expect(JSON.stringify(response.body)).not.toMatch(/ER_LOCK|ECONNREFUSED|ENOENT|mysql|Usuarios|\/srv/);
    });
});
