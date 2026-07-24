'use strict';

const LEGACY_DATABASE = 'site_cursos';
const DEVELOPMENT_DATABASE = 'plataforma_cursos_dev';
const TEST_DATABASE = 'plataforma_cursos_test';

function normalizeEnvironment(env) {
    return {
        nodeEnv: String(env.NODE_ENV || '').trim().toLowerCase(),
        database: String(env.DB_NAME || '').trim()
    };
}

function refuseLegacyDatabase(database) {
    if (database === LEGACY_DATABASE) {
        throw new Error(`Operação recusada: ${LEGACY_DATABASE} é o banco legado protegido e não pode ser alterado.`);
    }
}

function assertTestDatabaseIsDisposable(env = process.env) {
    const { nodeEnv, database } = normalizeEnvironment(env);

    if (nodeEnv !== 'test') {
        throw new Error('Operação recusada: NODE_ENV deve ser test para manipular o banco de integração.');
    }
    if (!database) {
        throw new Error('Operação recusada: DB_NAME do banco de teste é obrigatório.');
    }

    refuseLegacyDatabase(database);
    if (database !== TEST_DATABASE) {
        throw new Error(`Operação recusada: o banco de teste deve ser exatamente ${TEST_DATABASE}.`);
    }

    return database;
}

function assertDevelopmentDatabase(env = process.env) {
    const { nodeEnv, database } = normalizeEnvironment(env);

    if (nodeEnv !== 'development') {
        throw new Error('Operação recusada: NODE_ENV deve ser development para preparar o banco de desenvolvimento.');
    }
    if (!database) {
        throw new Error('Operação recusada: DB_NAME do banco de desenvolvimento é obrigatório.');
    }

    refuseLegacyDatabase(database);
    if (database !== DEVELOPMENT_DATABASE) {
        throw new Error(`Operação recusada: o banco de desenvolvimento deve ser exatamente ${DEVELOPMENT_DATABASE}.`);
    }

    return database;
}

function assertLegacyDatabaseReadOnly(env = process.env) {
    const { database } = normalizeEnvironment(env);

    if (database !== LEGACY_DATABASE) {
        throw new Error(`Operação recusada: a auditoria legada deve apontar exatamente para ${LEGACY_DATABASE}.`);
    }

    return database;
}

function assertCanonicalWritableDatabase(env = process.env) {
    const { database } = normalizeEnvironment(env);
    refuseLegacyDatabase(database);
    if (database === DEVELOPMENT_DATABASE) return assertDevelopmentDatabase(env);
    if (database === TEST_DATABASE) return assertTestDatabaseIsDisposable(env);
    throw new Error(
        `Operação recusada: escrita permitida somente em ${DEVELOPMENT_DATABASE} ou ${TEST_DATABASE}.`
    );
}

module.exports = {
    LEGACY_DATABASE,
    DEVELOPMENT_DATABASE,
    TEST_DATABASE,
    assertTestDatabaseIsDisposable,
    assertDevelopmentDatabase,
    assertLegacyDatabaseReadOnly,
    assertCanonicalWritableDatabase
};
