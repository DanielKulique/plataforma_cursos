'use strict';

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
    {
        ignores: ['node_modules/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'goal*/**', 'audit-autoria.js']
    },
    js.configs.recommended,
    {
        files: ['**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            globals: {
                ...globals.node,
                ...globals.browser,
                ...globals.jest
            }
        },
        rules: {
            'no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrors: 'none'
            }]
        }
    },
    {
        files: ['src/public/js/**/*.js'],
        languageOptions: { sourceType: 'module' }
    },
    {
        files: ['index.js', 'src/**/*.js', 'scripts/**/*.js', '*.config.js'],
        ignores: ['src/public/js/**/*.js'],
        languageOptions: { sourceType: 'commonjs' }
    },
    {
        files: ['src/__tests__/**/*.js', 'scripts/testar*.js', 'scripts/seed_usuarios_teste.js'],
        rules: { 'no-unused-vars': 'off', 'no-empty': 'off' }
    }
];
