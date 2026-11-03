'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');

describe('E2E disposable environment contract', () => {
    const compose = fs.readFileSync(path.join(root, 'compose.e2e.yaml'), 'utf8');
    const runner = fs.readFileSync(path.join(root, 'scripts/run_e2e.js'), 'utf8');
    const seed = fs.readFileSync(path.join(root, 'scripts/seed_e2e_database.js'), 'utf8');
    const workflow = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');

    test('database stays inside the E2E project and migrations start from an empty schema', () => {
        const databaseService = compose.slice(compose.indexOf('\n  db:'), compose.indexOf('\n  migrate:'));
        expect(databaseService).not.toMatch(/^\s+ports:/m);
        expect(compose).toContain('DB_HOST: db');
        expect(compose).toContain('DB_PORT: "3306"');
        expect(compose).toContain('DB_NAME: plataforma_cursos_test');
        expect(databaseService).not.toContain('schema.sql');
        expect(runner).toContain("'node', 'scripts/migrate_database.js'");
        expect(runner).toContain("'down', '--volumes', '--remove-orphans'");
    });

    test('test environment disables email and external analysis', () => {
        expect(compose).toContain('EMAIL_DELIVERY_ENABLED: "false"');
        expect(compose).toContain('PUBLIC_REGISTRATION_EMAIL_VERIFICATION_REQUIRED: "false"');
        expect(compose).toContain('RESEND_API_KEY: ""');
        expect(compose).toContain('DETECTOR_ENABLED: "false"');
    });

    test('E2E seed refuses to run outside NODE_ENV=test and its disposable identity', () => {
        expect(seed).toContain("process.env.NODE_ENV !== 'test'");
        expect(seed).toContain("process.env.E2E_RUN !== '1'");
        expect(seed).toContain("target.database !== 'plataforma_cursos_test'");
        expect(seed).toContain('example.test');
    });

    test('CI installs all browsers and runs each complete suite without retry', () => {
        expect(workflow).toContain('playwright install --with-deps chromium');
        for (const project of ['chromium', 'firefox-critical', 'webkit-critical']) {
            expect(workflow).toContain(`npm run test:e2e:all -- --project=${project}`);
        }
        expect(runner).toContain("'--grep=.*', '--retries=0', '--forbid-only', '--fail-on-flaky-tests'");
    });
});
