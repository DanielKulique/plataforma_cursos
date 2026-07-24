'use strict';

const path = require('path');
const dotenv = require('dotenv');

const DATABASE_CONNECTION_KEYS = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD'];

function loadEnvironment(mode, root = path.join(__dirname, '..', '..')) {
    dotenv.config({ path: path.join(root, '.env'), override: true, quiet: true });
    const localConnection = Object.fromEntries(
        DATABASE_CONNECTION_KEYS.map((key) => [key, process.env[key]])
    );

    if (mode === 'test') {
        dotenv.config({ path: path.join(root, '.env.test'), override: true, quiet: true });
        for (const [key, value] of Object.entries(localConnection)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }

    return process.env;
}

module.exports = { DATABASE_CONNECTION_KEYS, loadEnvironment };
