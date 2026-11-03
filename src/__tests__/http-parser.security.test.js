'use strict';

const { fork } = require('node:child_process');
const { once } = require('node:events');
const http = require('node:http');
const path = require('node:path');
const zlib = require('node:zlib');

const credentials = { email: 'parser@example.test', senha: 'json-á-válido' };
const json = Buffer.from(JSON.stringify(credentials));
const limit = 256 * 1024;

describe('HTTP parser in a disposable process (no database)', () => {
    let child;
    let port;
    let output = '';

    beforeAll(async () => {
        child = fork(path.join(__dirname, 'fixtures/http-parser-server.js'), [], {
            // Deliberately do not inherit deployment credentials, E2E_RUN or NODE_OPTIONS.
            env: {
                NODE_ENV: 'test', APP_ENV: 'test', APP_PORT: '3000',
                DB_HOST: '127.0.0.1', DB_PORT: '33307', DB_USER: 'unused', DB_PASSWORD: 'unused',
                DB_NAME: 'plataforma_cursos_test', DB_ENVIRONMENT_IDENTITY: 'plataforma_cursos_test',
                JWT_SECRET: 'parser-fixture-only-secret-with-at-least-32-characters', LOG_LEVEL: 'silent'
            },
            stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
            execArgv: ['--unhandled-rejections=strict']
        });
        child.stdout.on('data', (data) => { output += data; });
        child.stderr.on('data', (data) => { output += data; });
        port = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`Fixture startup timeout: ${output}`)), 10000);
            child.once('message', (message) => { clearTimeout(timer); resolve(message.port); });
            child.once('exit', (code, signal) => {
                clearTimeout(timer);
                reject(new Error(`Fixture exited (${code}, ${signal}): ${output}`));
            });
            child.once('error', reject);
        });
    }, 15000);

    afterAll(async () => {
        if (!child || child.exitCode !== null || child.signalCode !== null) return;
        const exited = once(child, 'exit');
        const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
        child.send('stop');
        await exited;
        clearTimeout(timer);
        expect(child.exitCode).toBe(0);
    });

    function post(body = json, headers = {}, route = '/api/auth/login', trailing) {
        return new Promise((resolve, reject) => {
            let response;
            let requestFinished = false;
            let trailingTimer;
            // Keep the socket open when the server rejects before the body ends.
            const agent = new http.Agent({ keepAlive: true });
            const fail = (error) => {
                clearTimeout(deadline);
                clearTimeout(trailingTimer);
                agent.destroy();
                reject(error);
            };
            const deadline = setTimeout(() => fail(new Error('Local HTTP timeout')), 3000);
            const finish = () => {
                if (response && requestFinished) {
                    clearTimeout(deadline);
                    agent.destroy();
                    resolve(response);
                }
            };
            const req = http.request({
                host: '127.0.0.1', port, path: route, method: 'POST', agent,
                headers: {
                    'Content-Type': 'application/json',
                    ...(trailing ? {} : { 'Content-Length': body.length }),
                    ...headers
                }
            }, (res) => {
                const chunks = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('error', fail);
                res.on('end', () => {
                    const text = Buffer.concat(chunks).toString();
                    try {
                        response = { status: res.statusCode, headers: res.headers, body: text ? JSON.parse(text) : null };
                        finish();
                    } catch (error) { fail(error); }
                });
            });
            req.on('error', fail);
            req.on('finish', () => { requestFinished = true; finish(); });
            if (trailing) {
                // A complete compressed frame, then late junk in the same chunked body:
                // the lifecycle described by GHSA-27r3-jxmh-p828, confined to loopback.
                req.write(body);
                trailingTimer = setTimeout(() => req.end(trailing), 50);
            } else req.end(body);
        });
    }

    async function expectAliveAndNextRequest() {
        // Allow asynchronous decoder errors to surface before checking the next request.
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect({ code: child.exitCode, signal: child.signalCode, output }).toMatchObject({ code: null, signal: null });
        expect((await post()).status).toBe(200);
    }

    function expectControlled(response, status) {
        expect(response.status).toBe(status);
        expect(response.headers['content-type']).toMatch(/application\/json/);
        expect(response.body).toMatchObject({ error: expect.any(String), mensagem: expect.any(String) });
        expect(response.body).not.toHaveProperty('stack');
    }

    it('accepts ordinary UTF-8 JSON and explicit identity encoding', async () => {
        for (const headers of [{}, { 'Content-Encoding': 'identity' }]) {
            const response = await post(json, headers);
            expect(response.status).toBe(200);
            expect(response.body.usuario.email).toBe(credentials.email);
            expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
            expect(response.body.csrf_token).toEqual(expect.any(String));
        }
    });

    it.each(['{"email":', 'null', '42'])('returns a controlled 400 for invalid/strict JSON %s and recovers', async (invalid) => {
        expectControlled(await post(Buffer.from(invalid)), 400);
        await expectAliveAndNextRequest();
    });

    it('keeps the exact 256 KiB boundary and returns 413 above it, then recovers', async () => {
        const base = JSON.stringify({ ...credentials, padding: '' });
        const atLimit = Buffer.from(JSON.stringify({ ...credentials, padding: 'a'.repeat(limit - Buffer.byteLength(base)) }));
        expect(atLimit.length).toBe(limit);
        expect((await post(atLimit)).status).toBe(200);
        expectControlled(await post(Buffer.concat([atLimit, Buffer.from(' ')])), 413);
        await expectAliveAndNextRequest();
    });

    it.each([
        ['gzip', zlib.gzipSync], ['deflate', zlib.deflateSync], ['br', zlib.brotliCompressSync]
    ])('rejects valid and malformed %s bodies with 415, then recovers', async (encoding, compress) => {
        for (const body of [compress(json), Buffer.from('invalid compressed data')]) {
            expectControlled(await post(body, { 'Content-Encoding': encoding }), 415);
            await expectAliveAndNextRequest();
        }
    });

    it.each([
        ['gzip', zlib.gzipSync], ['deflate', zlib.deflateSync], ['br', zlib.brotliCompressSync]
    ])('rejects %s frame plus late trailing bytes on an unmatched route and stays alive', async (encoding, compress) => {
        expectControlled(await post(
            compress(json), { 'Content-Encoding': encoding }, '/api/no-matching-route', Buffer.from('trailing junk')
        ), 415);
        await expectAliveAndNextRequest();
    });

    it('preserves real authentication and cookie CSRF enforcement after parser errors', async () => {
        expect((await post(json, {}, '/api/auth/logout')).status).toBe(401);
        expect((await post(json, { Authorization: 'Bearer invalid' }, '/api/auth/logout')).status).toBe(401);
        const login = await post();
        const cookie = login.headers['set-cookie'][0].split(';')[0];
        expect((await post(json, { Cookie: cookie }, '/api/auth/logout')).status).toBe(403);
        expect((await post(json, { Cookie: cookie, 'X-CSRF-Token': 'wrong' }, '/api/auth/logout')).status).toBe(403);
        expect((await post(json, {
            Cookie: cookie, 'X-CSRF-Token': login.body.csrf_token
        }, '/api/auth/logout')).status).toBe(204);
        await expectAliveAndNextRequest();
    });
});
