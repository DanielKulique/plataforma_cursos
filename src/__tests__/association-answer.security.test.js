'use strict';

const crypto = require('node:crypto');
jest.mock('../config/database', () => ({ getConnection: jest.fn() }));
const db = require('../config/database');
const questions = require('../api/models/questoes.models');

// Existing UUIDs deliberately have no lexical relationship to authored order.
const leftIds = [
    'f35d5b86-6179-49fe-a13c-c4153036e2bb', '18bc7d79-b872-4356-8f65-a1a49151b9ec',
    'b1b7de33-617f-40ea-9dc8-e52bc00aa49d', '624c4ace-031e-4f67-8d07-76d20bbfb023'
];
const rightIds = [
    '69322cec-37f8-4ab4-8e38-4a7f026a0958', 'fbc51528-6877-45ce-93da-834a780a2f38',
    '1a8e3c6c-7ffa-4ae3-a272-a98ca83a4606', 'b55b14eb-4dc1-42be-aedf-df38a3d793bd'
];

function permutations(values) {
    if (values.length === 0) return [[]];
    return values.flatMap((value, index) => permutations(values.filter((_, i) => i !== index))
        .map((rest) => [value, ...rest]));
}

function rngPaths(size) {
    if (size < 2) return [[]];
    return Array.from({ length: size }, (_, choice) => rngPaths(size - 1).map((rest) => [choice, ...rest])).flat();
}

function fixture(size, answerKey = rightIds.slice(0, size)) {
    const items = leftIds.slice(0, size).map((id_item, index) => ({
        id_item, id_pergunta: 7, lado: 'ESQUERDA', texto: `Termo ${id_item}`, ordem: index * 10 + 3
    })).concat(answerKey.map((id_item, index) => ({
        id_item, id_pergunta: 7, lado: 'DIREITA', texto: `Conceito ${id_item}`, ordem: index * 10 + 3
    })));
    const connection = {
        beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
        query: jest.fn(async (sql) => {
            if (sql.includes('FROM Questionarios')) return [[{ id_questionario: 8, tipo: 'EXERCICIO', prova_final: null }]];
            if (sql.includes('FROM Turmas')) return [[{ status: 'ABERTA' }]];
            if (sql.includes('FROM Q_Perguntas')) return [[{
                id_pergunta: 7, texto_pergunta: 'Associe', tipo_pergunta: 'ASSOCIACAO',
                resposta_booleana: null, ordem: 1, pontos: 2
            }]];
            if (sql.includes('FROM Q_Opcoes')) return [[]];
            if (sql.includes('FROM Q_AssociacaoItens')) return [structuredClone(items)];
            throw new Error(`Unexpected query in student serialization: ${sql}`);
        })
    };
    db.getConnection.mockResolvedValue(connection);
    return { connection, items };
}

async function present(path) {
    const random = jest.spyOn(crypto, 'randomInt');
    const remaining = [...path];
    random.mockImplementation((max) => {
        expect(max).toBe(remaining.length + 1);
        const choice = remaining.shift();
        expect(choice).toBeLessThan(max);
        return choice;
    });
    try {
        const payload = await questions.listarAluno(1, 'EXERCICIO', 8, 3);
        expect(remaining).toEqual([]);
        return payload;
    } finally { random.mockRestore(); }
}

describe('association presentation does not encode its answer key', () => {
    afterEach(() => jest.restoreAllMocks());

    it.each([2, 3, 4])('allows every one of the %i-item permutations exactly once over all bounded RNG paths', async (size) => {
        const { items, connection } = fixture(size);
        const before = structuredClone(items);
        const seen = new Map();
        for (const path of rngPaths(size)) {
            const payload = await present(path);
            const question = payload.perguntas[0];
            expect(Object.keys(question).sort()).toEqual([
                'formato_resposta', 'id_pergunta', 'itens_direita', 'itens_esquerda',
                'ordem', 'pontos', 'texto_pergunta', 'tipo_pergunta'
            ]);
            for (const item of [...question.itens_esquerda, ...question.itens_direita]) {
                expect(Object.keys(item).sort()).toEqual(['id_item', 'texto']);
            }
            expect(question.itens_esquerda.map((item) => item.id_item)).toEqual(leftIds.slice(0, size));
            expect(question.itens_direita.map((item) => item.id_item).sort()).toEqual(rightIds.slice(0, size).sort());
            const permutation = JSON.stringify(question.itens_direita.map((item) => item.id_item));
            seen.set(permutation, (seen.get(permutation) || 0) + 1);
        }
        expect([...seen.keys()].sort()).toEqual(permutations(rightIds.slice(0, size)).map((value) => JSON.stringify(value)).sort());
        expect([...seen.values()]).toEqual(Array(seen.size).fill(1));
        expect(items).toEqual(before);
        expect(connection.query.mock.calls.every(([sql]) => !sql.includes('Q_AssociacaoGabaritos'))).toBe(true);
    });

    it.each([2, 3])('has the identical complete student-payload distribution for every possible %i-pair answer key', async (size) => {
        let reference;
        // Right-side persistence order intentionally encodes each candidate key,
        // as it does for existing rows. Observe full JSON, including IDs/text/metadata.
        for (const key of permutations(rightIds.slice(0, size))) {
            fixture(size, key);
            const distribution = [];
            for (const path of rngPaths(size)) distribution.push(JSON.stringify(await present(path)));
            distribution.sort();
            if (!reference) reference = distribution;
            expect(distribution).toEqual(reference);
        }
    });

    it('keeps existing item IDs stable across different presentations for saved drafts and submissions', async () => {
        fixture(2);
        const identity = (await present([1])).perguntas[0];
        const swapped = (await present([0])).perguntas[0];
        expect(identity.itens_direita.map((item) => item.id_item)).toEqual(rightIds.slice(0, 2));
        expect(swapped.itens_direita.map((item) => item.id_item)).toEqual(rightIds.slice(0, 2).reverse());
        expect(identity.itens_esquerda).toEqual(swapped.itens_esquerda);
    });
});
