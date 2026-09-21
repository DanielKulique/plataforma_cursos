'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { assertCanonicalSchema } = require('../schema_contract');
const { assertCertificateLegacyIntegrity } = require('../certificate_migration_preflight');
const {
    assertDatabaseIdentity,
    initializeDatabaseIdentity
} = require('../../src/config/database-identity');

const LEDGER_TABLE = 'schema_migrations';
const DEFAULT_LOCK_TIMEOUT_SECONDS = 30;
const MIGRATION_PATTERN = /^(\d{3})_([a-z0-9][a-z0-9_-]*)[.]sql$/;

function migrationError(code, message, details = {}) {
    return Object.assign(new Error(message), { code, details });
}

function checksum(bytes) {
    return crypto.createHash('sha256').update(bytes).digest('hex');
}

function discoverMigrations(migrationsDir) {
    const entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
    const sqlFiles = entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.sql'));
    const invalid = sqlFiles.filter((entry) => !MIGRATION_PATTERN.test(entry.name)).map((entry) => entry.name);
    if (invalid.length) {
        throw migrationError(
            'INVALID_MIGRATION_FILENAME',
            `Nome de migration inválido: ${invalid.join(', ')}. Use NNN_nome.sql.`
        );
    }

    const migrations = sqlFiles.map((entry) => {
        const match = entry.name.match(MIGRATION_PATTERN);
        const version = Number(match[1]);
        const filePath = path.join(migrationsDir, entry.name);
        const bytes = fs.readFileSync(filePath);
        return {
            version,
            filename: entry.name,
            path: filePath,
            bytes,
            sql: bytes.toString('utf8'),
            checksumSha256: checksum(bytes)
        };
    }).sort((left, right) => left.version - right.version || left.filename.localeCompare(right.filename));

    const seenVersions = new Set();
    const duplicateVersions = new Set();
    for (const migration of migrations) {
        if (seenVersions.has(migration.version)) duplicateVersions.add(migration.version);
        seenVersions.add(migration.version);
    }
    if (duplicateVersions.size) {
        throw migrationError(
            'DUPLICATE_MIGRATION_VERSION',
            `Versão de migration duplicada: ${[...duplicateVersions].sort((a, b) => a - b).join(', ')}.`
        );
    }

    for (let index = 0; index < migrations.length; index += 1) {
        const expected = index + 1;
        if (migrations[index].version !== expected) {
            throw migrationError(
                'MIGRATION_VERSION_GAP',
                `Sequência inválida: esperado ${String(expected).padStart(3, '0')}, encontrado ${String(migrations[index].version).padStart(3, '0')}.`
            );
        }
    }
    return migrations;
}

async function tableExists(connection, database, table) {
    const [[row]] = await connection.query(
        `SELECT COUNT(*) AS total
         FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND TABLE_TYPE = 'BASE TABLE'`,
        [database, table]
    );
    return Number(row.total) === 1;
}

async function listApplicationTables(connection, database) {
    const [rows] = await connection.query(
        `SELECT TABLE_NAME
         FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' AND TABLE_NAME <> ?
         ORDER BY TABLE_NAME`,
        [database, LEDGER_TABLE]
    );
    return rows.map((row) => row.TABLE_NAME);
}

async function ensureLedger(connection) {
    await connection.query(
        `CREATE TABLE IF NOT EXISTS schema_migrations (
            version INT UNSIGNED NOT NULL,
            filename VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
            checksum_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
            applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
            execution_ms INT UNSIGNED NOT NULL,
            PRIMARY KEY (version),
            UNIQUE KEY uk_schema_migrations_filename (filename),
            CONSTRAINT chk_schema_migrations_checksum
                CHECK (checksum_sha256 REGEXP '^[0-9a-f]{64}$')
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    );
}

async function readLedger(connection) {
    const [rows] = await connection.query(
        `SELECT version, filename, checksum_sha256, applied_at, execution_ms
         FROM schema_migrations
         ORDER BY version`
    );
    return rows.map((row) => ({
        version: Number(row.version),
        filename: String(row.filename),
        checksumSha256: String(row.checksum_sha256),
        appliedAt: row.applied_at,
        executionMs: Number(row.execution_ms)
    }));
}

function compareLedger(migrations, ledger) {
    const filesByVersion = new Map(migrations.map((migration) => [migration.version, migration]));
    const ledgerByVersion = new Map(ledger.map((entry) => [entry.version, entry]));
    const errors = [];
    const statuses = [];

    for (let index = 0; index < ledger.length; index += 1) {
        const expectedVersion = index + 1;
        const entry = ledger[index];
        if (entry.version !== expectedVersion) {
            errors.push({
                type: 'LEDGER_OUT_OF_ORDER',
                version: entry.version,
                filename: entry.filename,
                expectedVersion,
                actualVersion: entry.version
            });
            break;
        }
    }

    for (const entry of ledger) {
        const migration = filesByVersion.get(entry.version);
        if (!migration) {
            errors.push({
                type: 'MIGRATION_FILE_MISSING',
                version: entry.version,
                filename: entry.filename,
                expectedChecksum: entry.checksumSha256,
                actualChecksum: null
            });
            continue;
        }
        if (entry.filename !== migration.filename) {
            errors.push({
                type: 'MIGRATION_FILENAME_MISMATCH',
                version: entry.version,
                expected: entry.filename,
                actual: migration.filename
            });
        }
        if (entry.checksumSha256 !== migration.checksumSha256) {
            errors.push({
                type: 'CHECKSUM_MISMATCH',
                version: entry.version,
                filename: migration.filename,
                expectedChecksum: entry.checksumSha256,
                actualChecksum: migration.checksumSha256
            });
        }
    }

    for (const migration of migrations) {
        const entry = ledgerByVersion.get(migration.version);
        const error = errors.find((item) => item.version === migration.version);
        statuses.push({
            version: migration.version,
            filename: migration.filename,
            state: error?.type || (entry ? 'APPLIED_OK' : 'PENDING'),
            checksumSha256: migration.checksumSha256,
            appliedAt: entry?.appliedAt || null,
            executionMs: entry?.executionMs ?? null
        });
    }
    return { statuses, errors };
}

function lockName(database) {
    const suffix = crypto.createHash('sha256').update(database).digest('hex').slice(0, 24);
    return `plataforma-cursos:migrations:${suffix}`;
}

async function acquireMigrationLock(connection, database, timeoutSeconds = DEFAULT_LOCK_TIMEOUT_SECONDS) {
    const name = lockName(database);
    const [[row]] = await connection.query('SELECT GET_LOCK(?, ?) AS acquired', [name, timeoutSeconds]);
    if (Number(row.acquired) !== 1) {
        throw migrationError(
            'MIGRATION_LOCK_TIMEOUT',
            `Não foi possível obter o migration lock de ${database} em ${timeoutSeconds}s.`
        );
    }
    return name;
}

async function releaseMigrationLock(connection, name) {
    if (!name) return;
    const [[row]] = await connection.query('SELECT RELEASE_LOCK(?) AS released', [name]);
    if (Number(row.released) !== 1) {
        throw migrationError('MIGRATION_LOCK_RELEASE_FAILED', 'O migration lock não pôde ser liberado pela mesma conexão.');
    }
}

async function inspectMigrationStatus(connection, database, migrationsDir) {
    const migrations = discoverMigrations(migrationsDir);
    const hasLedger = await tableExists(connection, database, LEDGER_TABLE);
    const applicationTables = await listApplicationTables(connection, database);
    if (!hasLedger) {
        const statuses = migrations.map((migration) => ({
            version: migration.version,
            filename: migration.filename,
            state: 'PENDING',
            checksumSha256: migration.checksumSha256,
            appliedAt: null,
            executionMs: null
        }));
        const errors = applicationTables.length ? [{
            type: 'LEDGER_MISSING',
            message: 'Banco existente sem schema_migrations; baseline explícito é obrigatório.'
        }] : [];
        return { migrations, ledger: [], statuses, errors, hasLedger, applicationTables };
    }
    const ledger = await readLedger(connection);
    const comparison = compareLedger(migrations, ledger);
    if (ledger.length === 0 && applicationTables.length) {
        comparison.errors.unshift({
            type: 'LEDGER_EMPTY_WITH_EXISTING_SCHEMA',
            message: 'Banco existente com ledger vazio; baseline explícito é obrigatório.'
        });
    }
    return {
        migrations,
        ledger,
        ...comparison,
        hasLedger,
        applicationTables
    };
}

async function baselineExisting(connection, migrations, version, validateSchema, database) {
    if (!Number.isInteger(version) || version < 1) {
        throw migrationError('INVALID_BASELINE_VERSION', 'A versão de baseline deve ser um inteiro positivo.');
    }
    const selected = migrations.filter((migration) => migration.version <= version);
    if (selected.length !== version || selected.at(-1)?.version !== version) {
        throw migrationError('INVALID_BASELINE_VERSION', `As migrations 001–${String(version).padStart(3, '0')} devem existir sem gaps.`);
    }
    const ledger = await readLedger(connection);
    if (ledger.length) {
        throw migrationError('BASELINE_LEDGER_NOT_EMPTY', 'Baseline recusado: schema_migrations já possui registros.');
    }

    await validateSchema(connection, database, { allowMissingMigrationLedger: false });
    await connection.beginTransaction();
    try {
        for (const migration of selected) {
            await connection.query(
                `INSERT INTO schema_migrations
                    (version, filename, checksum_sha256, execution_ms)
                 VALUES (?, ?, ?, 0)`,
                [migration.version, migration.filename, migration.checksumSha256]
            );
        }
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    }
    return selected.length;
}

async function runMigrations({
    target,
    migrationsDir,
    bootstrapSchemaPath,
    baselineVersion = null,
    lockTimeoutSeconds = DEFAULT_LOCK_TIMEOUT_SECONDS,
    createConnection = mysql.createConnection,
    validateSchema = assertCanonicalSchema,
    validateCertificateLegacy = assertCertificateLegacyIntegrity,
    output = console
}) {
    const migrations = discoverMigrations(migrationsDir);
    const connection = await createConnection({
        host: target.host,
        port: target.port,
        user: target.user,
        password: target.password,
        database: target.database,
        multipleStatements: true
    });
    let acquiredLock;
    let operationError;
    let result;
    try {
        let server;
        let identityConfirmed = false;
        try {
            server = await assertDatabaseIdentity(connection, target);
            identityConfirmed = true;
        } catch (error) {
            if (error.code !== 'DATABASE_IDENTITY_MISMATCH') throw error;
            if (error.databaseFacts) throw error;
            const tablesBeforeLock = await listApplicationTables(connection, target.database);
            if (tablesBeforeLock.length) throw error;
        }

        acquiredLock = await acquireMigrationLock(connection, target.database, lockTimeoutSeconds);
        let applicationTables = await listApplicationTables(connection, target.database);
        const wasEmpty = applicationTables.length === 0;
        if (wasEmpty) {
            const bootstrapSql = fs.readFileSync(bootstrapSchemaPath, 'utf8');
            await connection.query(bootstrapSql);
            server = await initializeDatabaseIdentity(connection, target);
            applicationTables = await listApplicationTables(connection, target.database);
            output.log('Bootstrap canônico aplicado ao banco totalmente vazio.');
        } else if (!identityConfirmed) {
            server = await assertDatabaseIdentity(connection, target);
        }

        await ensureLedger(connection);
        let ledger = await readLedger(connection);
        if (!wasEmpty && ledger.length === 0 && baselineVersion === null) {
            throw migrationError(
                'BASELINE_REQUIRED',
                'Banco existente sem ledger histórico. Execute baseline explícito; nenhuma migration foi aplicada.'
            );
        }
        if (baselineVersion !== null) {
            if (wasEmpty) {
                throw migrationError('BASELINE_EMPTY_DATABASE', 'Baseline recusado: banco vazio deve executar migrations normalmente.');
            }
            const count = await baselineExisting(
                connection,
                migrations,
                baselineVersion,
                validateSchema,
                target.database
            );
            output.log(`Baseline explícito registrado até ${String(baselineVersion).padStart(3, '0')} (${count} checksums).`);
            ledger = await readLedger(connection);
        }

        const comparison = compareLedger(migrations, ledger);
        if (comparison.errors.length) {
            const first = comparison.errors[0];
            throw migrationError(first.type, `Drift de migration detectado na versão ${first.version || 'desconhecida'}.`, first);
        }

        const applied = [];
        const appliedVersions = new Set(ledger.map((entry) => entry.version));
        for (const migration of migrations) {
            if (appliedVersions.has(migration.version)) continue;
            if (migration.filename === '009_certificate_versioning.sql') {
                await validateCertificateLegacy(connection);
            }
            const startedAt = process.hrtime.bigint();
            try {
                await connection.query(migration.sql);
            } catch (error) {
                throw migrationError(
                    'MIGRATION_EXECUTION_FAILED',
                    `Migration ${migration.filename} falhou e não foi registrada. DDL MySQL pode ter sido parcialmente aplicado.`,
                    { version: migration.version, filename: migration.filename, causeCode: error.code || 'UNKNOWN' }
                );
            }
            const executionMs = Number((process.hrtime.bigint() - startedAt) / 1000000n);
            await connection.query(
                `INSERT INTO schema_migrations
                    (version, filename, checksum_sha256, execution_ms)
                 VALUES (?, ?, ?, ?)`,
                [migration.version, migration.filename, migration.checksumSha256, executionMs]
            );
            applied.push({ version: migration.version, filename: migration.filename, executionMs });
        }

        const validation = await validateSchema(connection, target.database, { allowMissingMigrationLedger: false });
        result = {
            status: 'ok',
            database: target.database,
            mysqlVersion: server.version,
            latestVersion: migrations.at(-1)?.version || 0,
            discovered: migrations.length,
            applied,
            noOp: applied.length === 0,
            baselineVersion,
            validation
        };
    } catch (error) {
        operationError = error;
    }

    let releaseError;
    try {
        await releaseMigrationLock(connection, acquiredLock);
    } catch (error) {
        releaseError = error;
        if (operationError) output.error(`Falha adicional ao liberar migration lock: ${error.message}`);
    }
    try {
        await connection.end();
    } catch (error) {
        if (!operationError && !releaseError) releaseError = error;
        else output.error(`Falha adicional ao encerrar conexão de migration: ${error.message}`);
    }
    if (operationError) throw operationError;
    if (releaseError) throw releaseError;
    return result;
}

module.exports = {
    DEFAULT_LOCK_TIMEOUT_SECONDS,
    LEDGER_TABLE,
    MIGRATION_PATTERN,
    acquireMigrationLock,
    baselineExisting,
    checksum,
    compareLedger,
    discoverMigrations,
    ensureLedger,
    inspectMigrationStatus,
    listApplicationTables,
    lockName,
    migrationError,
    readLedger,
    releaseMigrationLock,
    runMigrations,
    tableExists
};
