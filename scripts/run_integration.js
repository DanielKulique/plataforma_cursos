'use strict';

const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');
const { assertDatabaseConnectionEnvironment } = require('../src/config/database-connection');

const root = process.cwd();
const composeProject = `plataforma-cursos-integration-${process.pid}`;
const isCi = String(process.env.CI).toLowerCase() === 'true';
const integrationFileEnv = isCi ? {} : dotenv.parse(fs.readFileSync('.env.test'));
const integrationEnv = { ...process.env, ...integrationFileEnv, NODE_ENV: 'test' };
const composeArgs = [
    'compose', '--project-name', composeProject, '--env-file', '.env.test',
    '--file', 'compose.integration.yaml'
];
const jestArgs = [
    'jest', '--config=jest.integration.config.js', '--runInBand', '--detectOpenHandles',
    ...process.argv.slice(2)
];

function run(command, args, allowFailure = false, env = integrationEnv) {
    const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env });
    if (result.error) throw result.error;
    if (!allowFailure && result.status !== 0) {
        throw new Error(`${command} ${args.join(' ')} terminou com código ${result.status}.`);
    }
    return result.status || 0;
}

async function waitForMySql() {
    const target = assertDatabaseConnectionEnvironment(integrationEnv);
    if (target.host !== '127.0.0.1' || target.port !== 33307
        || target.database !== 'plataforma_cursos_test'
        || target.identity !== 'plataforma_cursos_test') {
        throw new Error('Integração recusada: o alvo precisa ser o MySQL descartável 127.0.0.1:33307/plataforma_cursos_test.');
    }
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
        let connection;
        try {
            connection = await mysql.createConnection({
                host: target.host, port: target.port, user: target.user,
                password: target.password, database: target.database,
                connectTimeout: 1500
            });
            await connection.query('SELECT 1');
            return;
        } catch {
            await delay(500);
        } finally {
            await connection?.end().catch(() => undefined);
        }
    }
    throw new Error('MySQL de integração não ficou pronto no endereço de teste 127.0.0.1:33307.');
}

async function main() {
    if (isCi) {
        run('npx', jestArgs, false, process.env);
        return;
    }

    let failure;
    try {
        run('docker', [...composeArgs, 'up', '--detach', 'db']);
        await waitForMySql();
        run('node', ['scripts/migrate_database.js']);
        run('node', ['scripts/seed_test_database.js']);
        run('npx', jestArgs);
    } catch (error) {
        failure = error;
        console.error(error.message);
    } finally {
        const down = run('docker', [...composeArgs, 'down', '--volumes', '--remove-orphans'], true);
        if (down !== 0 && !failure) failure = new Error('Falha ao remover o MySQL de integração descartável.');
    }
    if (failure) process.exitCode = 1;
}

main();
