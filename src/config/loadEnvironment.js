'use strict';

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const {
    DATABASE_CONNECTION_KEYS,
    assertDatabaseConnectionEnvironment
} = require('./database-connection');

// Capturado antes de qualquer dotenv: variáveis fornecidas pelo processo sempre vencem.
const STARTUP_ENVIRONMENT = Object.freeze({ ...process.env });

function captureDatabaseEnvironment(env) {
    return Object.fromEntries(DATABASE_CONNECTION_KEYS.map((key) => [key, env[key]]));
}

function restoreDatabaseEnvironment(snapshot, env) {
    for (const [key, value] of Object.entries(snapshot)) {
        if (value === undefined) delete env[key];
        else env[key] = value;
    }
}

function loadEnvironment(mode, root = path.join(__dirname, '..', '..')) {
    const basePath = path.join(root, '.env');
    const specificPath = path.join(root, `.env.${mode}`);
    const base = fs.existsSync(basePath) ? dotenv.parse(fs.readFileSync(basePath)) : {};
    const specific = fs.existsSync(specificPath) ? dotenv.parse(fs.readFileSync(specificPath)) : {};
    const merged = { ...base, ...specific, ...STARTUP_ENVIRONMENT };

    // Um arquivo de teste existente deve declarar o endpoint de banco completo; jamais
    // completar uma configuração parcial usando o banco de desenvolvimento.
    if (mode === 'test' && fs.existsSync(specificPath)) {
        for (const key of DATABASE_CONNECTION_KEYS) {
            if (STARTUP_ENVIRONMENT[key] === undefined && specific[key] === undefined) delete merged[key];
        }
        if (STARTUP_ENVIRONMENT.APP_ENV === undefined && specific.APP_ENV === undefined) {
            delete merged.APP_ENV;
            delete process.env.APP_ENV;
        }
    }

    Object.assign(process.env, merged);

    assertDatabaseConnectionEnvironment(process.env);
    return process.env;
}

module.exports = {
    DATABASE_CONNECTION_KEYS,
    captureDatabaseEnvironment,
    loadEnvironment,
    restoreDatabaseEnvironment,
    STARTUP_ENVIRONMENT
};
