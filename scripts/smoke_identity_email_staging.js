'use strict';

const db = require('../src/config/database');

function parseEnv(text) {
    const result = {};
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const separator = line.indexOf('=');
        if (separator < 1) continue;
        result[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    }
    return result;
}

async function readStdin() {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf8');
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function main() {
    assert(process.env.APP_ENV === 'staging', 'Smoke permitido somente com APP_ENV=staging.');
    const credentials = process.env.SMOKE_CREDENTIALS_STDIN === '1'
        ? parseEnv(await readStdin())
        : process.env;
    const baseUrl = String(process.env.STAGING_BASE_URL || process.env.APP_BASE_URL || '').replace(/\/$/, '');
    assert(baseUrl.startsWith('https://'), 'STAGING_BASE_URL/APP_BASE_URL deve usar HTTPS.');
    assert(credentials.BASIC_AUTH_USER && credentials.BASIC_AUTH_PASSWORD, 'Basic Auth ausente.');

    const basic = Buffer.from(
        `${credentials.BASIC_AUTH_USER}:${credentials.BASIC_AUTH_PASSWORD}`
    ).toString('base64');
    const headers = { Authorization: `Basic ${basic}` };
    const nonce = `${Date.now()}-${process.pid}`;
    const email = `identity-smoke-${nonce}@example.test`;
    const rateEmail = `identity-rate-${nonce}@example.test`;
    const cpf = String(Date.now() % 100000000000).padStart(11, '0');
    const senha = 'Smoke!Identity9';
    const results = [];

    async function request(path, options = {}, expected = 200) {
        const response = await fetch(`${baseUrl}${path}`, {
            ...options,
            headers: { ...headers, ...(options.headers || {}) }
        });
        const expectedStatuses = Array.isArray(expected) ? expected : [expected];
        assert(
            expectedStatuses.includes(response.status),
            `${options.method || 'GET'} ${path}: esperado ${expectedStatuses.join('/')}, recebido ${response.status}`
        );
        return response;
    }

    async function post(path, body, expected) {
        return request(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }, expected);
    }

    try {
        const cadastroResponse = await post('/api/usuarios', {
            nome_completo: 'Identity Smoke Staging',
            cpf,
            email: ` ${email.toUpperCase()} `,
            senha
        }, 201);
        const cadastro = await cadastroResponse.json();
        assert(cadastro.verificacao?.estado === 'PENDENTE', 'cadastro não retornou estado PENDENTE');
        const deliveryEnabled = String(process.env.EMAIL_DELIVERY_ENABLED || 'true').toLowerCase() !== 'false';
        if (!deliveryEnabled) {
            assert(cadastro.verificacao.email_enviado === false, 'staging sem provedor afirmou envio');
        }
        results.push(`cadastro atômico pendente; entrega=${cadastro.verificacao.email_enviado ? 'confirmada' : 'indisponível'}`);

        const [verificacoes] = await db.query(
            'SELECT codigo, verificado, expira_em FROM EmailVerificacoes WHERE email = ? LIMIT 1',
            [email]
        );
        assert(verificacoes.length === 1, 'EmailVerificacoes não foi criado');
        assert(Number(verificacoes[0].verificado) === 0, 'novo cadastro não começou pendente');
        assert(/^\d{6}$/.test(String(verificacoes[0].codigo)), 'código persistido inválido');

        await post('/api/auth/login', { email, senha }, 403);
        results.push('login pré-confirmação bloqueado');

        const confirmacoes = await Promise.all([
            post('/api/auth/verificar-codigo-email', { email, codigo: verificacoes[0].codigo }, 200),
            post('/api/auth/verificar-codigo-email', { email, codigo: verificacoes[0].codigo }, 200)
        ]);
        assert(confirmacoes.every((response) => response.status === 200), 'confirmação concorrente divergiu');
        results.push('confirmação concorrente consistente');

        const login = await post('/api/auth/login', { email, senha }, 200);
        assert((login.headers.get('set-cookie') || '').includes('plataforma_session='), 'login não emitiu cookie');
        results.push('login pós-confirmação permitido');

        const [[antesReenvio]] = await db.query(
            'SELECT codigo, verificado FROM EmailVerificacoes WHERE email = ? LIMIT 1',
            [email]
        );
        const reenvios = await Promise.all([
            post('/api/auth/enviar-codigo-verificacao', { email }, 202),
            post('/api/auth/enviar-codigo-verificacao', { email }, 202)
        ]);
        assert(reenvios.every((response) => response.status === 202), 'reenvio concorrente divergiu');
        const [[depoisReenvio]] = await db.query(
            'SELECT codigo, verificado FROM EmailVerificacoes WHERE email = ? LIMIT 1',
            [email]
        );
        assert(Number(depoisReenvio.verificado) === 1, 'reenvio desconfirmou a conta');
        assert(depoisReenvio.codigo === antesReenvio.codigo, 'reenvio alterou código de conta confirmada');
        results.push('reenvio concorrente idempotente após confirmação');

        const envios = [];
        for (let attempt = 0; attempt < 6; attempt += 1) {
            envios.push(await post(
                '/api/auth/enviar-codigo-verificacao',
                { email: rateEmail },
                attempt < 5 ? 202 : 429
            ));
        }
        assert(envios[5].status === 429, 'limite de envio não respondeu 429');

        const tentativas = [];
        for (let attempt = 0; attempt < 11; attempt += 1) {
            tentativas.push(await post(
                '/api/auth/verificar-codigo-email',
                { email: rateEmail, codigo: '000000' },
                attempt < 10 ? 400 : 429
            ));
        }
        assert(tentativas[10].status === 429, 'limite de verificação não respondeu 429');
        results.push('rate limits reais: envio 429 e verificação 429');

        console.log(`IDENTITY_EMAIL_STAGING_OK ${results.join(' | ')}`);
    } finally {
        await db.query('DELETE FROM EmailVerificacoes WHERE email = ?', [email]).catch(() => undefined);
        await db.query('DELETE FROM Usuarios WHERE email = ?', [email]).catch(() => undefined);
        await db.end();
    }
}

main().catch((error) => {
    console.error(`IDENTITY_EMAIL_STAGING_FAILED ${error.message}`);
    process.exitCode = 1;
});
