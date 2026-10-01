'use strict';

const { spawnSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');

const composeFile = 'compose.e2e.yaml';
const project = `plataforma-cursos-e2e-${process.pid}`;
const compose = ['compose', '--project-name', project, '--file', composeFile];
const mode = process.argv[2] || 'full';
const testArgs = ['playwright', 'test'];
testArgs.push(...process.argv.slice(3));
if (mode === 'smoke') testArgs.push('--project=chromium', '--grep', '@smoke');
if (mode === 'full') testArgs.push('--project=chromium', '--grep', '@smoke|@full');
if (mode === 'mobile') testArgs.push('--project=chromium', '--grep', '@full');
if (mode === 'firefox') testArgs.push('--project=firefox-critical', '--grep', '@smoke');
if (mode === 'webkit') testArgs.push('--project=webkit-critical', '--grep', '@smoke');
if (mode === 'headed') testArgs.push('--headed');
if (mode === 'ui') testArgs.push('--ui');

function run(command, args, { allowFailure = false } = {}) {
    const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
    if (result.error) throw result.error;
    if (!allowFailure && result.status !== 0) {
        throw new Error(`${command} ${args.join(' ')} terminou com código ${result.status}.`);
    }
    return result.status || 0;
}

async function waitUntilReady() {
    const url = process.env.E2E_BASE_URL || 'http://127.0.0.1:3400';
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1500);
        try {
            const response = await fetch(`${url}/readyz`, { signal: controller.signal });
            if (response.ok) return;
        } catch {
            // Readiness polling is event driven by the application endpoint.
        } finally {
            clearTimeout(timeout);
        }
        await delay(500);
    }
    throw new Error('A aplicação E2E não ficou pronta em 90 segundos.');
}

async function main() {
    let failure;
    try {
        run('docker', [...compose, 'up', '--detach', 'db']);
        run('docker', [...compose, 'run', '--rm', 'migrate', 'node', 'scripts/migrate_database.js']);
        run('docker', [...compose, 'run', '--rm', 'migrate', 'node', 'scripts/migrate_database.js']);
        run('docker', [...compose, 'run', '--rm', 'migrate', 'node', 'scripts/seed_e2e_database.js']);
        run('docker', [...compose, 'run', '--rm', 'migrate', 'node', 'scripts/seed_e2e_database.js']);
        run('docker', [...compose, 'up', '--detach', 'app']);
        await waitUntilReady();
        run('npx', testArgs);
    } catch (error) {
        failure = error;
        console.error(error.message);
    } finally {
        const downStatus = run('docker', [...compose, 'down', '--volumes', '--remove-orphans'], { allowFailure: true });
        if (downStatus !== 0 && !failure) failure = new Error('Falha ao remover recursos E2E descartáveis.');
    }
    if (failure) process.exitCode = 1;
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
