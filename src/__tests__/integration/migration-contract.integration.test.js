const fs = require('fs');
const os = require('os');
const path = require('path');
const mysql = require('mysql2/promise');
const { setupDatabase } = require('../../../scripts/setup_database');
const { validateCanonicalSchema } = require('../../../scripts/schema_contract');
const {
    discoverMigrations,
    inspectMigrationStatus,
    runMigrations
} = require('../../../scripts/lib/migration-runner');
const {
    assertDatabaseConnectionEnvironment,
    isExplicitEphemeralCi
} = require('../../config/database-connection');

const root = path.join(__dirname, '..', '..', '..');
const productionMigrations = path.join(root, 'mysql', 'migrations');
const bootstrapSchemaPath = path.join(root, 'mysql', 'schema.sql');
const target = assertDatabaseConnectionEnvironment(process.env);
const temporaryDirectories = [];

jest.setTimeout(120000);

function runnerOptions(overrides = {}) {
    return {
        target,
        migrationsDir: productionMigrations,
        bootstrapSchemaPath,
        output: { log() {}, error() {} },
        ...overrides
    };
}

async function connection() {
    return mysql.createConnection({
        host: target.host,
        port: target.port,
        user: target.user,
        password: target.password,
        database: target.database,
        multipleStatements: true
    });
}

async function resetToCanonicalWithoutLedger() {
    await setupDatabase({ mode: 'test', env: process.env, output: { log() {} } });
}

async function resetToEmptyDatabase() {
    const db = await connection();
    try {
        const [tables] = await db.query(
            `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
             WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'`,
            [target.database]
        );
        await db.query('SET FOREIGN_KEY_CHECKS = 0');
        for (const row of tables) {
            const identifier = `\`${String(row.TABLE_NAME).replaceAll('`', '``')}\``;
            await db.query(`DROP TABLE ${identifier}`);
        }
        await db.query('SET FOREIGN_KEY_CHECKS = 1');
    } finally {
        await db.end();
    }
}

function migrationFixture(extraFiles = {}, edits = {}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-migration-integration-'));
    temporaryDirectories.push(directory);
    for (const migration of discoverMigrations(productionMigrations)) {
        const content = edits[migration.filename] ?? migration.bytes;
        fs.writeFileSync(path.join(directory, migration.filename), content);
    }
    for (const [filename, content] of Object.entries(extraFiles)) {
        fs.writeFileSync(path.join(directory, filename), content);
    }
    return directory;
}

describe('contrato de migrations no MySQL Docker 127.0.0.1:33307', () => {
    beforeAll(() => {
        expect(target.host).toBe('127.0.0.1');
        if (String(process.env.CI).toLowerCase() === 'true') {
            expect(isExplicitEphemeralCi(process.env, target.host, target.port, target.identity)).toBe(true);
        } else {
            expect(target.port).toBe(33307);
        }
        expect(target.database).toBe('plataforma_cursos_test');
    });

    afterEach(async () => {
        await resetToCanonicalWithoutLedger();
        for (const directory of temporaryDirectories.splice(0)) {
            fs.rmSync(directory, { recursive: true, force: true });
        }
    });

    afterAll(async () => {
        await resetToEmptyDatabase();
        await runMigrations(runnerOptions());
    });

    it('migra banco totalmente vazio de 001 até 013 e valida o schema final', async () => {
        await resetToEmptyDatabase();
        const result = await runMigrations(runnerOptions());
        expect(result.applied.map((item) => item.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
        expect(result.validation).toMatchObject({ status: 'ok', tablesChecked: 21, columnsChecked: 173 });
        const noOp = await runMigrations(runnerOptions());
        expect(noOp).toMatchObject({ noOp: true, latestVersion: 13 });
    });

    it('recusa banco existente sem histórico e aceita baseline explícito 001–011', async () => {
        await resetToCanonicalWithoutLedger();
        await expect(runMigrations(runnerOptions())).rejects.toMatchObject({ code: 'BASELINE_REQUIRED' });
        const baseline = await runMigrations(runnerOptions({ baselineVersion: 11 }));
        expect(baseline.applied.map((item) => item.version)).toEqual([12, 13]);
        const noOp = await runMigrations(runnerOptions());
        expect(noOp.noOp).toBe(true);
    });

    it('detecta checksum alterado e bloqueia novas migrations', async () => {
        await resetToEmptyDatabase();
        await runMigrations(runnerOptions());
        const alteredDirectory = migrationFixture({}, {
            '005_pdf_material_uploads.sql': `${fs.readFileSync(path.join(productionMigrations, '005_pdf_material_uploads.sql'), 'utf8')}\n-- drift`
        });
        const db = await connection();
        try {
            const status = await inspectMigrationStatus(db, target.database, alteredDirectory);
            expect(status.errors).toEqual(expect.arrayContaining([
                expect.objectContaining({ type: 'CHECKSUM_MISMATCH', version: 5 })
            ]));
        } finally {
            await db.end();
        }
        await expect(runMigrations(runnerOptions({ migrationsDir: alteredDirectory })))
            .rejects.toMatchObject({ code: 'CHECKSUM_MISMATCH' });
    });

    it('serializa dois runners concorrentes e aplica uma migration pendente uma vez', async () => {
        await resetToEmptyDatabase();
        const directory = migrationFixture({ '014_lock_probe.sql': 'DO SLEEP(0.4);\n' });
        const results = await Promise.all([
            runMigrations(runnerOptions({ migrationsDir: directory })),
            runMigrations(runnerOptions({ migrationsDir: directory }))
        ]);
        expect(results.flatMap((result) => result.applied).filter((item) => item.version === 14)).toHaveLength(1);
        const db = await connection();
        try {
            const [[row]] = await db.query('SELECT COUNT(*) AS total FROM schema_migrations WHERE version = 14');
            expect(Number(row.total)).toBe(1);
        } finally {
            await db.end();
        }
    });

    it('não registra migration inválida nem executa a seguinte', async () => {
        await resetToEmptyDatabase();
        const directory = migrationFixture({
            '014_invalid.sql': 'THIS IS NOT VALID SQL;\n',
            '015_must_not_run.sql': 'CREATE TABLE must_not_run (id INT PRIMARY KEY);\n'
        });
        await expect(runMigrations(runnerOptions({ migrationsDir: directory })))
            .rejects.toMatchObject({ code: 'MIGRATION_EXECUTION_FAILED' });
        const db = await connection();
        try {
            const [[ledger]] = await db.query('SELECT MAX(version) AS latest FROM schema_migrations');
            const [[table]] = await db.query(
                `SELECT COUNT(*) AS total FROM INFORMATION_SCHEMA.TABLES
                 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'must_not_run'`,
                [target.database]
            );
            expect(Number(ledger.latest)).toBe(13);
            expect(Number(table.total)).toBe(0);
        } finally {
            await db.end();
        }
    });

    it('detecta drift estrutural representativo de tipo, índice e FK', async () => {
        await resetToEmptyDatabase();
        await runMigrations(runnerOptions());
        const db = await connection();
        try {
            await db.query('ALTER TABLE Cursos MODIFY carga_horaria BIGINT NOT NULL');
            await db.query('ALTER TABLE Conteudos DROP FOREIGN KEY fk_conteudo_modulo');
            await db.query('ALTER TABLE Conteudos DROP INDEX idx_conteudo_modulo');
            const result = await validateCanonicalSchema(db, target.database);
            expect(result.errors).toEqual(expect.arrayContaining([
                expect.objectContaining({ type: 'COLUMN_DEFINITION_MISMATCH', table: 'Cursos', column: 'carga_horaria' }),
                expect.objectContaining({ type: 'INDEX_MISSING', table: 'Conteudos', name: 'idx_conteudo_modulo' }),
                expect.objectContaining({ type: 'FOREIGN_KEY_MISSING', table: 'Conteudos', name: 'fk_conteudo_modulo' })
            ]));
        } finally {
            await db.end();
        }
    });
});
