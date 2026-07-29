'use strict';

const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../public/js/incremental-editor.js'), 'utf8');

function helpers() {
    const executable = source.replace(/\bexport\s+/g, '');
    return new Function(`${executable}
        return {
            INCREMENTAL_DEBOUNCE_MS,
            splitEditorSegments,
            reconcileEditorSegments,
            segmentAtCursor,
            currentReferences,
            responseMatchesSegment,
            createIncrementalCoordinator
        };`)();
}

describe('editor incremental por segmento', () => {
    test('mantém IDs estáveis, incrementa versão e trata divisão, união e exclusão', () => {
        const { reconcileEditorSegments } = helpers();
        let sequence = 0;
        const createId = () => `id-${++sequence}`;
        const first = reconcileEditorSegments([], 'Primeiro.\n\nSegundo.', createId);
        const edited = reconcileEditorSegments(first, 'Primeiro alterado.\n\nSegundo.', createId);
        expect(edited[0]).toMatchObject({ segmento_id: first[0].segmento_id, versao: 2 });
        expect(edited[1]).toMatchObject({ segmento_id: first[1].segmento_id, versao: 1 });

        const split = reconcileEditorSegments(edited, 'Primeiro alterado.\n\nNovo.\n\nSegundo.', createId);
        expect(split[0].segmento_id).toBe(first[0].segmento_id);
        expect(split[2].segmento_id).toBe(first[1].segmento_id);
        expect(split[1].segmento_id).not.toBe(first[0].segmento_id);

        const joined = reconcileEditorSegments(split, 'Primeiro alterado e novo.\n\nSegundo.', createId);
        expect(joined[0].segmento_id).toBe(first[0].segmento_id);
        expect(joined[1].segmento_id).toBe(first[1].segmento_id);
    });

    test('identifica referências e não as marca como segmento analisável', () => {
        const { splitEditorSegments, currentReferences } = helpers();
        const segments = splitEditorSegments('Corpo.\n\nReferências\n\nSILVA, Ana. Obra. 2024.');
        expect(segments.map((item) => item.tipo)).toEqual(['PARAGRAFO', 'TITULO', 'REFERENCIA']);
        expect(segments.at(-1).analisavel).toBe(false);
        expect(currentReferences(segments)).toEqual(['SILVA, Ana. Obra. 2024.']);
    });

    test('debounce produz somente uma requisição após sequência de alterações', async () => {
        const { createIncrementalCoordinator } = helpers();
        const timers = [];
        const send = jest.fn(async (payload) => ({ data: payload }));
        let current = { segmento_id: 's1', versao: 3 };
        const coordinator = createIncrementalCoordinator({
            sessionId: 'session',
            send,
            getCurrentSegment: () => current,
            onState: jest.fn(),
            onResult: jest.fn(),
            setTimer: (callback) => { timers.push(callback); return timers.length - 1; },
            clearTimer: (id) => { timers[id] = null; }
        });
        for (const version of [1, 2, 3]) {
            current = { segmento_id: 's1', versao: version };
            coordinator.schedule(current, () => ({
                sessao_id: 'session', segmento_id: 's1', versao: version
            }));
        }
        expect(send).not.toHaveBeenCalled();
        await timers.at(-1)();
        expect(send).toHaveBeenCalledTimes(1);
        expect(send.mock.calls[0][0].versao).toBe(3);
    });

    test('cancela segmento removido e descarta resposta antiga fora de ordem', async () => {
        const { createIncrementalCoordinator } = helpers();
        const timers = [];
        const requests = [];
        let current = { segmento_id: 's1', versao: 10 };
        const onResult = jest.fn();
        const onDiscard = jest.fn();
        const coordinator = createIncrementalCoordinator({
            sessionId: 'session',
            send: (payload) => new Promise((resolve) => requests.push({ payload, resolve })),
            getCurrentSegment: () => current,
            onState: jest.fn(),
            onResult,
            onDiscard,
            setTimer: (callback) => { timers.push(callback); return timers.length - 1; },
            clearTimer: (id) => { timers[id] = null; }
        });
        coordinator.schedule(current, () => ({ sessao_id: 'session', segmento_id: 's1', versao: 10 }));
        const firstPending = timers[0]();
        current = { segmento_id: 's1', versao: 11 };
        coordinator.schedule(current, () => ({ sessao_id: 'session', segmento_id: 's1', versao: 11 }));
        const secondPending = timers[1]();
        requests[1].resolve({ data: requests[1].payload });
        await secondPending;
        requests[0].resolve({ data: requests[0].payload });
        await firstPending;
        expect(onResult).toHaveBeenCalledTimes(1);
        expect(onResult.mock.calls[0][1].versao).toBe(11);
        expect(onDiscard).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ versao: 10 }));

        coordinator.schedule(current, () => ({}));
        coordinator.retain([]);
        expect(coordinator.pending.size).toBe(0);
    });

    test('dois segmentos mantêm requisições e estados independentes', async () => {
        const { createIncrementalCoordinator } = helpers();
        const timers = [];
        const current = new Map([
            ['a', { segmento_id: 'a', versao: 1 }],
            ['b', { segmento_id: 'b', versao: 4 }]
        ]);
        const results = [];
        const coordinator = createIncrementalCoordinator({
            sessionId: 'session',
            send: async (payload) => ({ data: payload }),
            getCurrentSegment: (id) => current.get(id),
            onState: jest.fn(),
            onResult: (segment) => results.push(segment.segmento_id),
            setTimer: (callback) => { timers.push(callback); return timers.length - 1; },
            clearTimer: (id) => { timers[id] = null; }
        });
        for (const segment of current.values()) {
            coordinator.schedule(segment, () => ({
                sessao_id: 'session', segmento_id: segment.segmento_id, versao: segment.versao
            }));
        }
        await Promise.all(timers.map((callback) => callback()));
        expect(results.sort()).toEqual(['a', 'b']);
    });

    test('não contém persistência local, requisição por tecla nem sink HTML', () => {
        expect(source).toContain('INCREMENTAL_DEBOUNCE_MS = 900');
        expect(source).not.toMatch(/localStorage|sessionStorage|document\.cookie|innerHTML|insertAdjacentHTML/);
        expect(source).toContain('responseMatchesSegment');
        expect(source).toContain('item.controller?.abort()');
    });
});
