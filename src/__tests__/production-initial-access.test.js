'use strict';

const { verifyLogin } = require('../../scripts/production_initial_access');

function reply(body, { cookie = false, status = 200 } = {}) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: (name) => cookie && name === 'set-cookie'
            ? 'plataforma_session=opaque; Path=/; HttpOnly; Secure; SameSite=Lax'
            : null },
        json: async () => body
    };
}

describe('smoke de acesso inicial', () => {
    afterEach(() => { delete global.fetch; });

    test('valida login ADMIN, cookie seguro, CSRF, curso e turma sem expor senha', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce(reply({ usuario: { tipo: 'ADMIN' } }, { cookie: true }))
            .mockResolvedValueOnce(reply({ usuario: { id_usuario: 1, tipo: 'ADMIN', email: 'admin@example.test' } }))
            .mockResolvedValueOnce(reply({ csrf_token: 'x'.repeat(32) }))
            .mockResolvedValueOnce(reply({ dados: [{ email: 'admin@example.test' }] }))
            .mockResolvedValueOnce(reply([{ nome_curso: 'Plágio: não copie essa ideia 4.0' }]))
            .mockResolvedValueOnce(reply([{ nome_turma: 'Turma 2026/2' }]))
            .mockResolvedValueOnce(reply(null, { status: 204 }));

        await expect(verifyLogin('https://prod.example.test', {
            email: 'admin@example.test', role: 'ADMIN'
        }, 'Senha@123', 'Turma 2026/2')).resolves.toEqual({
            role: 'ADMIN', authenticated: true, cookieSecure: true, csrf: true
        });
        expect(JSON.stringify(global.fetch.mock.results)).not.toContain('Senha@123');
    });

    test('valida que o PROFESSOR visualiza somente a turma vinculada', async () => {
        global.fetch = jest.fn()
            .mockResolvedValueOnce(reply({ usuario: { tipo: 'PROFESSOR' } }, { cookie: true }))
            .mockResolvedValueOnce(reply({ usuario: { id_usuario: 2, tipo: 'PROFESSOR', email: 'prof@example.test' } }))
            .mockResolvedValueOnce(reply({ csrf_token: 'y'.repeat(32) }))
            .mockResolvedValueOnce(reply([{ nome_turma: 'Turma 2026/2' }]))
            .mockResolvedValueOnce(reply(null, { status: 204 }));

        await expect(verifyLogin('https://prod.example.test', {
            email: 'prof@example.test', role: 'PROFESSOR'
        }, 'Senha@123', 'Turma 2026/2')).resolves.toMatchObject({ authenticated: true });
        expect(global.fetch.mock.calls[3][0]).toContain('/api/turmas/professor/2');
    });
});
