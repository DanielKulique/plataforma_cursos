'use strict';

function assertDisposableSmoke(env = process.env) {
    const refuse = () => { throw new Error('DISPOSABLE_SMOKE_REQUIRED: use the authorized disposable Docker lab only.'); };
    if (env.NODE_ENV !== 'test' || env.APP_ENV !== 'test' || env.E2E_RUN !== '1'
        || env.DB_HOST !== 'db' || String(env.DB_PORT) !== '3306'
        || env.DB_NAME !== 'plataforma_cursos_test' || env.DB_ENVIRONMENT_IDENTITY !== 'plataforma_cursos_test'
        || env.SMOKE_LAB_AUTHORIZATION !== 'I_AUTHORIZE_DISPOSABLE_SMOKES'
        || !/^goal24-smoke-[a-f0-9]{16}$/.test(env.SMOKE_LAB_PROJECT || '')
        || env.RESEND_API_KEY) refuse();
    const candidates = [env.STAGING_BASE_URL, env.APP_BASE_URL].filter(Boolean);
    if (!candidates.length) refuse();
    for (const candidate of candidates) {
        let url;
        try { url = new URL(candidate); } catch { refuse(); }
        if (!['http://app:3000', 'http://127.0.0.1:3400'].includes(url.origin)
            || url.username || url.password || url.pathname !== '/' || url.search || url.hash) refuse();
    }
}

module.exports = { assertDisposableSmoke };
