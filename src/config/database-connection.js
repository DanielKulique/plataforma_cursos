'use strict';

const DATABASE_CONNECTION_KEYS = Object.freeze([
    'DB_HOST',
    'DB_PORT',
    'DB_USER',
    'DB_PASSWORD',
    'DB_NAME',
    'DB_ENVIRONMENT_IDENTITY'
]);

const DATABASE_IDENTITIES = Object.freeze({
    plataforma_cursos_dev: 'plataforma_cursos_dev',
    plataforma_cursos_test: 'plataforma_cursos_test',
    plataforma_cursos_staging: 'plataforma_cursos_staging',
    plataforma_cursos: 'plataforma_cursos_prod'
});

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const CI_CONFIRMATION = 'I_UNDERSTAND_EPHEMERAL_CI_MYSQL';

function configurationError(message) {
    return Object.assign(new Error(message), { code: 'DATABASE_CONFIGURATION_INVALID' });
}

function required(env, key) {
    const value = env[key];
    if (value === undefined || value === null || String(value).trim() === '') {
        throw configurationError(`Variável obrigatória de banco ausente: ${key}. Não há fallback automático.`);
    }
    return String(value).trim();
}

function expectedIdentityForDatabase(database) {
    const identity = DATABASE_IDENTITIES[database];
    if (!identity) {
        throw configurationError(
            `DB_NAME não reconhecido: ${database}. Use um banco canônico da plataforma.`
        );
    }
    return identity;
}

function isExplicitEphemeralCi(env, host, port, identity) {
    return String(env.CI).toLowerCase() === 'true'
        && String(env.NODE_ENV).toLowerCase() === 'test'
        && host === '127.0.0.1'
        && port === 3306
        && identity === DATABASE_IDENTITIES.plataforma_cursos_test
        && env.ALLOW_EPHEMERAL_CI_MYSQL === CI_CONFIRMATION
        && /^plataforma-cursos-ci-[A-Za-z0-9_.-]+$/.test(String(env.CI_EPHEMERAL_MYSQL_ID || ''));
}

function assertDatabaseConnectionEnvironment(env = process.env) {
    const host = required(env, 'DB_HOST').toLowerCase();
    const rawPort = required(env, 'DB_PORT');
    const port = Number(rawPort);
    const user = required(env, 'DB_USER');
    const password = required(env, 'DB_PASSWORD');
    const database = required(env, 'DB_NAME');
    const identity = required(env, 'DB_ENVIRONMENT_IDENTITY');

    if (!Number.isInteger(port) || port < 1 || port > 65535 || String(port) !== rawPort) {
        throw configurationError('DB_PORT deve ser uma porta TCP inteira e explícita entre 1 e 65535.');
    }

    const expectedIdentity = expectedIdentityForDatabase(database);
    if (identity !== expectedIdentity) {
        throw configurationError(
            `DB_ENVIRONMENT_IDENTITY incompatível: esperado ${expectedIdentity} para ${database}.`
        );
    }

    const nodeEnvironment = String(env.NODE_ENV || '').trim().toLowerCase();
    const applicationEnvironment = String(env.APP_ENV || '').trim().toLowerCase();
    const identityForRuntime = nodeEnvironment === 'test'
        ? DATABASE_IDENTITIES.plataforma_cursos_test
        : nodeEnvironment === 'development'
            ? DATABASE_IDENTITIES.plataforma_cursos_dev
            : nodeEnvironment === 'production' && applicationEnvironment === 'development'
                ? DATABASE_IDENTITIES.plataforma_cursos_dev
                : nodeEnvironment === 'production' && applicationEnvironment === 'staging'
                    ? DATABASE_IDENTITIES.plataforma_cursos_staging
                : nodeEnvironment === 'production'
                    ? DATABASE_IDENTITIES.plataforma_cursos
                    : null;
    if (identityForRuntime && identity !== identityForRuntime) {
        throw configurationError(
            `Ambiente de execução incompatível: NODE_ENV=${nodeEnvironment}, APP_ENV=${applicationEnvironment || 'não definido'} `
            + `exige ${identityForRuntime}.`
        );
    }

    if (LOCAL_HOSTS.has(host) && port === 3306
        && !isExplicitEphemeralCi(env, host, port, identity)) {
        throw configurationError(
            'Refusing connection to host MySQL on port 3306. '
            + 'Use the dedicated plataforma_cursos database container on 127.0.0.1:33307.'
        );
    }

    return Object.freeze({ host, port, user, password, database, identity });
}

function databaseClientConfig(env = process.env, additions = {}) {
    const config = assertDatabaseConnectionEnvironment(env);
    return {
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        ...additions
    };
}

function describeDatabaseTarget(env = process.env) {
    const config = assertDatabaseConnectionEnvironment(env);
    let instanceType = 'rede externa explicitamente configurada';
    let container = 'deve ser confirmado pelo operador';
    if (config.host === 'db' && config.port === 3306) {
        instanceType = 'Docker Compose interno';
        container = 'serviço db da plataforma_cursos';
    } else if (config.host === '127.0.0.1' && config.port === 33307) {
        instanceType = 'Docker Compose publicado apenas no loopback';
        container = 'serviço db da plataforma_cursos via compose.local-db.yaml';
    } else if (isExplicitEphemeralCi(env, config.host, config.port, config.identity)) {
        instanceType = 'CI efêmero explicitamente identificado';
        container = String(env.CI_EPHEMERAL_MYSQL_ID);
    }
    return {
        host: config.host,
        port: config.port,
        database: config.database,
        identity: config.identity,
        instanceType,
        container
    };
}

module.exports = {
    CI_CONFIRMATION,
    DATABASE_CONNECTION_KEYS,
    DATABASE_IDENTITIES,
    LOCAL_HOSTS,
    assertDatabaseConnectionEnvironment,
    databaseClientConfig,
    describeDatabaseTarget,
    expectedIdentityForDatabase,
    isExplicitEphemeralCi
};
