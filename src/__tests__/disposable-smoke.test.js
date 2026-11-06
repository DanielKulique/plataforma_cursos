'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { assertDisposableSmoke } = require('../../scripts/lib/disposable-smoke');

const lab = {
    NODE_ENV: 'test', APP_ENV: 'test', E2E_RUN: '1', DB_HOST: 'db', DB_PORT: '3306',
    DB_NAME: 'plataforma_cursos_test', DB_ENVIRONMENT_IDENTITY: 'plataforma_cursos_test',
    SMOKE_LAB_AUTHORIZATION: 'I_AUTHORIZE_DISPOSABLE_SMOKES', SMOKE_LAB_PROJECT: 'goal24-smoke-1234567890abcdef',
    STAGING_BASE_URL: 'http://app:3000', APP_BASE_URL: 'http://app:3000'
};

test('explicit disposable Docker lab is accepted', () => expect(() => assertDisposableSmoke(lab)).not.toThrow());
test.each([
    { NODE_ENV: 'production' }, { APP_ENV: 'production' }, { DB_NAME: 'plataforma_cursos' },
    { DB_ENVIRONMENT_IDENTITY: 'plataforma_cursos_prod' }, { DB_HOST: '127.0.0.1' },
    { DB_PORT: '33307' }, { SMOKE_LAB_PROJECT: 'real-project' }, { SMOKE_LAB_AUTHORIZATION: '' },
    { STAGING_BASE_URL: 'https://production.example.test' }, { APP_BASE_URL: 'https://production.example.test' },
    { RESEND_API_KEY: 'a-real-provider-must-not-be-used' }, { E2E_RUN: '' }
])('refuses unsafe target before network or database access: %j', change => {
    expect(() => assertDisposableSmoke({ ...lab, ...change })).toThrow('DISPOSABLE_SMOKE_REQUIRED');
});

const scripts = fs.readdirSync(path.join(__dirname, '../../scripts')).filter(name => /^smoke.*staging\.js$/.test(name));
test.each(scripts)('%s refuses production before importing database/browser modules', script => {
    const result = spawnSync(process.execPath, [path.join(__dirname, '../../scripts', script)], {
        env: { NODE_ENV: 'production', APP_ENV: 'production', DB_NAME: 'plataforma_cursos' }, encoding: 'utf8'
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DISPOSABLE_SMOKE_REQUIRED');
    expect(result.stdout).toBe('');
});
