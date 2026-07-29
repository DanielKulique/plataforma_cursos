'use strict';

jest.mock('../config/database', () => ({ query: jest.fn() }));

const db = require('../config/database');
const model = require('../api/models/analise-contextual.model');
const { validDetectorResponse } = require('./fixtures/detector-contextual.fixture');

describe('persistência mínima da análise contextual', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('insere usuário, resumo, duração e parâmetros sem textos integrais', async () => {
        db.query.mockResolvedValue([{ affectedRows: 1, insertId: 42 }]);
        const result = validDetectorResponse();

        await expect(model.salvarResumo({
            usuarioId: 7,
            resultado: result,
            duracaoMs: 125
        })).resolves.toEqual({ id: 42 });

        const [sql, values] = db.query.mock.calls[0];
        expect(sql).toContain('INSERT INTO AnalisesContextuais');
        expect(values).toEqual([
            7, 'CONCLUIDO', 1, 1, 1, 'ALTA', '1.0', 125,
            JSON.stringify(result.parametros_aplicados)
        ]);
        expect(sql).not.toMatch(/documento|fonte_comparada|segmentos_json/i);
        expect(JSON.stringify(values)).not.toContain('Trecho sintético.');
    });

    test('não inventa duração e propaga erro do banco sem persistência parcial', async () => {
        db.query.mockResolvedValueOnce([{ affectedRows: 1, insertId: 8 }]);
        await model.salvarResumo({
            usuarioId: 3,
            resultado: validDetectorResponse(),
            duracaoMs: Number.NaN
        });
        expect(db.query.mock.calls[0][1][7]).toBeNull();

        const databaseError = new Error('falha sintética');
        db.query.mockRejectedValueOnce(databaseError);
        await expect(model.salvarResumo({
            usuarioId: 3,
            resultado: validDetectorResponse(),
            duracaoMs: 10
        })).rejects.toBe(databaseError);
    });

    test('rejeita inserção sem linha afetada', async () => {
        db.query.mockResolvedValue([{ affectedRows: 0, insertId: 0 }]);
        await expect(model.salvarResumo({
            usuarioId: 3,
            resultado: validDetectorResponse(),
            duracaoMs: 10
        })).rejects.toThrow('Não foi possível registrar o resumo da análise.');
    });
});
