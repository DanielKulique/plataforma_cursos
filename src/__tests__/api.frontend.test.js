const fs = require('fs');
const path = require('path');

function response(status, payload = {}) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: jest.fn().mockResolvedValue(payload)
    };
}

class TestAbortController {
    static instances = [];

    constructor() {
        const listeners = [];
        this.signal = {
            aborted: false,
            addEventListener: (event, listener) => {
                if (event === 'abort') listeners.push(listener);
            }
        };
        this.listeners = listeners;
        TestAbortController.instances.push(this);
    }

    abort() {
        this.signal.aborted = true;
        this.listeners.forEach((listener) => listener());
    }
}

function loadApi(fetchImpl) {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'public', 'js', 'api.js'),
        'utf8'
    )
        .replace(/^import .*;\n/gm, '')
        .replace(/\bexport\s+/g, '');
    const clearToken = jest.fn();
    const cacheManager = {
        get: jest.fn().mockReturnValue(null),
        set: jest.fn(),
        delete: jest.fn(),
        clear: jest.fn()
    };
    const testConsole = { warn: jest.fn(), error: jest.fn() };
    const factory = new Function(
        'getToken',
        'clearToken',
        'cacheManager',
        'fetch',
        'AbortController',
        'console',
        `${source}\nreturn { APIError, apiRequest, get, post, put, patch, del };`
    );
    return {
        client: factory(
            jest.fn().mockReturnValue('token-de-teste'),
            clearToken,
            cacheManager,
            fetchImpl,
            TestAbortController,
            testConsole
        ),
        clearToken,
        cacheManager,
        testConsole
    };
}

describe('cliente HTTP do frontend', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        TestAbortController.instances = [];
    });

    afterEach(() => {
        jest.clearAllTimers();
        jest.useRealTimers();
    });

    it('repete GET após falha transitória e usa um AbortController por tentativa', async () => {
        const fetchImpl = jest.fn()
            .mockRejectedValueOnce(new TypeError('falha de rede'))
            .mockResolvedValueOnce(response(200, { ok: true }));
        const { client } = loadApi(fetchImpl);

        const resultPromise = client.get('/cursos', { retries: 2, timeout: 5000 });
        await jest.advanceTimersByTimeAsync(1000);

        await expect(resultPromise).resolves.toEqual({ ok: true });
        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(TestAbortController.instances).toHaveLength(2);
        expect(fetchImpl.mock.calls[0][1].signal).not.toBe(fetchImpl.mock.calls[1][1].signal);
    });

    it.each([
        ['POST', (client) => client.post('/matriculas', { id_turma: 1 }, { retries: 3 })],
        ['PUT', (client) => client.put('/conteudos/1/progresso', { status: 'CONCLUIDO' }, { retries: 3 })],
        ['PATCH', (client) => client.patch('/admin/usuarios/1', { tipo: 'ALUNO' }, { retries: 3 })],
        ['DELETE', (client) => client.del('/cursos/1', { retries: 3 })]
    ])('não repete %s automaticamente em falha transitória', async (_method, invoke) => {
        const fetchImpl = jest.fn().mockRejectedValue(new TypeError('conexão interrompida'));
        const { client } = loadApi(fetchImpl);

        await expect(invoke(client)).rejects.toMatchObject({ status: 0 });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(TestAbortController.instances).toHaveLength(1);
    });

    it.each([400, 401, 403, 404, 409])('não repete GET quando o HTTP é %i', async (status) => {
        const fetchImpl = jest.fn().mockResolvedValue(response(status));
        const { client, clearToken } = loadApi(fetchImpl);

        await expect(client.get('/recurso', { retries: 3 })).rejects.toMatchObject({ status });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(clearToken).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
    });

    it('repete GET em HTTP transitório e preserva a mensagem de domínio final', async () => {
        const fetchImpl = jest.fn()
            .mockResolvedValueOnce(response(503))
            .mockResolvedValueOnce(response(409, { mensagem: 'Matrícula já existente.' }));
        const { client } = loadApi(fetchImpl);

        const resultPromise = client.get('/recurso', { retries: 3 });
        const rejection = expect(resultPromise).rejects.toMatchObject({
            status: 409,
            message: 'Matrícula já existente.'
        });
        await jest.advanceTimersByTimeAsync(1000);

        await rejection;
        expect(fetchImpl).toHaveBeenCalledTimes(2);
    });

    it('isola um timeout abortado da tentativa seguinte', async () => {
        const fetchImpl = jest.fn()
            .mockImplementationOnce((_url, { signal }) => new Promise((_resolve, reject) => {
                signal.addEventListener('abort', () => {
                    const error = new Error('abortada');
                    error.name = 'AbortError';
                    reject(error);
                });
            }))
            .mockResolvedValueOnce(response(200, { recuperado: true }));
        const { client } = loadApi(fetchImpl);

        const resultPromise = client.get('/lento', { retries: 2, timeout: 20 });
        await jest.advanceTimersByTimeAsync(20);
        await jest.advanceTimersByTimeAsync(1000);

        await expect(resultPromise).resolves.toEqual({ recuperado: true });
        expect(TestAbortController.instances).toHaveLength(2);
        expect(TestAbortController.instances[0].signal.aborted).toBe(true);
        expect(TestAbortController.instances[1].signal.aborted).toBe(false);
        expect(jest.getTimerCount()).toBe(0);
    });
});
