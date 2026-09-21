'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    CI_CONFIRMATION,
    assertDatabaseConnectionEnvironment
} = require('../config/database-connection');
const { DATABASE_CONNECTION_KEYS } = require('../config/loadEnvironment');
const { assertDatabaseIdentity } = require('../config/database-identity');
const { migrate } = require('../../scripts/migrate_database');
const { setupDatabase } = require('../../scripts/setup_database');
const { inspectContent, scanRepository } = require('../../scripts/validate_database_isolation');

const root = path.join(__dirname, '..', '..');
const validDev = Object.freeze({
    NODE_ENV: 'development',
    DB_HOST: '127.0.0.1',
    DB_PORT: '33307',
    DB_USER: 'app',
    DB_PASSWORD: 'password',
    DB_NAME: 'plataforma_cursos_dev',
    DB_ENVIRONMENT_IDENTITY: 'plataforma_cursos_dev'
});

function metadata(database = 'plataforma_cursos_dev') {
    return [[{
        database_name: database,
        version: '8.4.6',
        hostname: 'platform-db',
        port: 3306
    }]];
}

describe('configuração fail-closed do banco', () => {
    it.each(['DB_HOST', 'DB_PORT'])('falha sem %s', (key) => {
        const env = { ...validDev };
        delete env[key];
        expect(() => assertDatabaseConnectionEnvironment(env)).toThrow(key);
    });

    it.each(['localhost', '127.0.0.1', '::1'])('recusa %s na porta nativa', (host) => {
        expect(() => assertDatabaseConnectionEnvironment({ ...validDev, DB_HOST: host, DB_PORT: '3306' }))
            .toThrow('Refusing connection to host MySQL on port 3306');
    });

    it('só aceita a exceção de CI quando ela é efêmera e explicitamente identificada', () => {
        const ci = {
            ...validDev,
            NODE_ENV: 'test',
            CI: 'true',
            DB_PORT: '3306',
            DB_NAME: 'plataforma_cursos_test',
            DB_ENVIRONMENT_IDENTITY: 'plataforma_cursos_test',
            ALLOW_EPHEMERAL_CI_MYSQL: CI_CONFIRMATION,
            CI_EPHEMERAL_MYSQL_ID: 'plataforma-cursos-ci-123'
        };
        expect(assertDatabaseConnectionEnvironment(ci).port).toBe(3306);
        expect(() => assertDatabaseConnectionEnvironment({ ...ci, CI_EPHEMERAL_MYSQL_ID: '' }))
            .toThrow('Refusing connection');
    });
});

describe('.env.test autocontido', () => {
    const original = {};
    let loadEnvironment;
    beforeEach(() => {
        for (const key of DATABASE_CONNECTION_KEYS) {
            original[key] = process.env[key];
            delete process.env[key];
        }
        // The loader intentionally snapshots startup variables. File-only tests must
        // import it after clearing the runner's explicit DB configuration.
        jest.isolateModules(() => {
            ({ loadEnvironment } = require('../config/loadEnvironment'));
        });
    });
    afterEach(() => {
        for (const [key, value] of Object.entries(original)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    });

    it('não herda endpoint do .env comum', () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'plataforma-env-'));
        fs.writeFileSync(path.join(directory, '.env'), [
            'DB_HOST=host-comum', 'DB_PORT=4444', 'DB_USER=comum', 'DB_PASSWORD=comum',
            'DB_NAME=plataforma_cursos_dev', 'DB_ENVIRONMENT_IDENTITY=plataforma_cursos_dev'
        ].join('\n'));
        fs.writeFileSync(path.join(directory, '.env.test'), [
            'DB_HOST=127.0.0.1', 'DB_PORT=33307', 'DB_USER=teste', 'DB_PASSWORD=teste',
            'DB_NAME=plataforma_cursos_test', 'DB_ENVIRONMENT_IDENTITY=plataforma_cursos_test'
        ].join('\n'));
        loadEnvironment('test', directory);
        expect(process.env.DB_HOST).toBe('127.0.0.1');
        expect(process.env.DB_PORT).toBe('33307');
        fs.rmSync(directory, { recursive: true, force: true });
    });

    it('falha se .env.test omitir a porta, mesmo que .env a defina', () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'plataforma-env-'));
        fs.writeFileSync(path.join(directory, '.env'), 'DB_HOST=host-comum\nDB_PORT=4444\n');
        fs.writeFileSync(path.join(directory, '.env.test'), [
            'DB_HOST=127.0.0.1', 'DB_USER=teste', 'DB_PASSWORD=teste',
            'DB_NAME=plataforma_cursos_test', 'DB_ENVIRONMENT_IDENTITY=plataforma_cursos_test'
        ].join('\n'));
        expect(() => loadEnvironment('test', directory)).toThrow('DB_PORT');
        fs.rmSync(directory, { recursive: true, force: true });
    });
});

describe('marcador persistente antes de operações estruturais', () => {
    it('recusa identidade diferente', async () => {
        const connection = { query: jest.fn()
            .mockResolvedValueOnce(metadata())
            .mockResolvedValueOnce([[{
                identity_key: 'plataforma_cursos_test',
                database_name: 'plataforma_cursos_test'
            }]]) };
        await expect(assertDatabaseIdentity(connection, {
            database: validDev.DB_NAME,
            identity: validDev.DB_ENVIRONMENT_IDENTITY
        })).rejects.toThrow('Identidade do banco recusada');
    });

    it('migration aborta antes de aplicar SQL quando o marcador diverge', async () => {
        const connection = {
            query: jest.fn()
                .mockResolvedValueOnce(metadata())
                .mockResolvedValueOnce([[{
                    identity_key: 'plataforma_cursos_test',
                    database_name: 'plataforma_cursos_test'
                }]]),
            end: jest.fn().mockResolvedValue(undefined)
        };
        await expect(migrate({ env: validDev, createConnection: jest.fn().mockResolvedValue(connection) }))
            .rejects.toThrow('Identidade do banco recusada');
        expect(connection.query).toHaveBeenCalledTimes(2);
    });

    it('setup/reset aborta antes de DROP quando o marcador diverge', async () => {
        const testEnv = {
            ...validDev,
            NODE_ENV: 'test',
            DB_NAME: 'plataforma_cursos_test',
            DB_ENVIRONMENT_IDENTITY: 'plataforma_cursos_test'
        };
        const server = {
            query: jest.fn(async (sql) => {
                if (sql.startsWith('SELECT DATABASE()')) return metadata(null);
                if (sql.includes('INFORMATION_SCHEMA.SCHEMATA')) return [[{ total: 1 }]];
                throw new Error(`Operação inesperada: ${sql}`);
            }),
            end: jest.fn().mockResolvedValue(undefined)
        };
        const database = {
            query: jest.fn()
                .mockResolvedValueOnce([[{ TABLE_NAME: 'Usuarios' }]])
                .mockResolvedValueOnce(metadata('plataforma_cursos_test'))
                .mockResolvedValueOnce([[{
                    identity_key: 'plataforma_cursos_dev',
                    database_name: 'plataforma_cursos_dev'
                }]]),
            end: jest.fn().mockResolvedValue(undefined)
        };
        const createConnection = jest.fn()
            .mockResolvedValueOnce(server)
            .mockResolvedValueOnce(database);
        await expect(setupDatabase({ mode: 'test', env: testEnv, createConnection, schema: '' }))
            .rejects.toThrow('Identidade do banco recusada');
        expect(server.query.mock.calls.some(([sql]) => sql.includes('DROP DATABASE'))).toBe(false);
    });
});

describe('contrato estático de isolamento', () => {
    it('mantém Docker interno e desenvolvimento host nos endpoints corretos', () => {
        const compose = fs.readFileSync(path.join(root, 'compose.yaml'), 'utf8');
        const databaseService = compose.slice(compose.indexOf('  db:'), compose.indexOf('\n  app:'));
        const local = fs.readFileSync(path.join(root, 'compose.local-db.yaml'), 'utf8');
        const development = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
        expect(compose).toMatch(/DB_HOST:\s*db/);
        expect(compose).toMatch(/DB_PORT:\s*3306/);
        expect(databaseService).not.toMatch(/^\s+ports:\s*$/m);
        expect(local).toContain('127.0.0.1:33307:3306');
        expect(development).toContain('DB_HOST=127.0.0.1');
        expect(development).toContain('DB_PORT=33307');
    });

    it('não encontra configuração operacional proibida no repositório', () => {
        expect(scanRepository(root)).toEqual([]);
    });

    it('detecta padrões novos sem bloquear fixtures de teste', () => {
        expect(inspectContent('scripts/novo.sh', 'DB_HOST=x\nDB_PORT=3306\n')).toEqual([
            { file: 'scripts/novo.sh', line: 2, rule: 'literal-db-port' }
        ]);
        expect(inspectContent('src/__tests__/fixture.js', '127.0.0.1:3306')).toEqual([]);
    });
});
