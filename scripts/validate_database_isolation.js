#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCANNED_ROOTS = ['.github', 'scripts', 'src/config', 'mysql/init'];
const SCANNED_FILES = [
    '.env', '.env.test', '.env.example', '.env.test.example', '.env.production.example', '.env.staging.example',
    'compose.yaml', 'compose.staging.yaml', 'compose.local-db.yaml', 'compose.e2e.yaml', 'Dockerfile', 'package.json'
];
const SKIPPED = new Set([
    'scripts/validate_database_isolation.js',
    'scripts/validate_production_assets.js'
]);

const RULES = Object.freeze([
    ['host-service-start', /\b(?:systemctl\s+(?:start|restart|unmask)\s+mysql|service\s+mysql\s+start)\b/i],
    ['native-recovery', /\b(?:mysqld|innodb_force_recovery)\b/i],
    ['host-mysql-config', /\/etc\/mysql(?:\/|\b)/i],
    ['forbidden-local-endpoint', /(?:localhost|127[.]0[.]0[.]1|\[?::1\]?):3306\b/i],
    ['reserved-goal12-port', /\b33306\b/],
    ['silent-host-fallback', /DB_HOST\s*\|\|/],
    ['silent-port-fallback', /DB_PORT\s*\|\|/],
    ['host-datadir-reference', /\/var\/lib\/mysql(?:\/|\b)/],
    ['literal-db-port', /DB_PORT\s*[:=]\s*['"]?3306\b/]
]);

function walk(directory) {
    if (!fs.existsSync(directory)) return [];
    const files = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) files.push(...walk(full));
        else if (entry.isFile() && /[.](?:js|sh|ya?ml)$/.test(entry.name)) files.push(full);
    }
    return files;
}

function isAllowed(relative, rule, content, line) {
    if (rule === 'host-datadir-reference') {
        return (relative === 'compose.yaml' && /^\s*-\s*mysql_data:\/var\/lib\/mysql\s*$/.test(line))
            || (relative === 'compose.e2e.yaml' && /^\s*-\s*e2e_db:\/var\/lib\/mysql\s*$/.test(line));
    }
    if (rule === 'literal-db-port') {
        if (['compose.yaml', '.env.production.example', '.env.staging.example', 'scripts/configure_staging_env.sh']
            .includes(relative)) return /DB_HOST\s*[:=]\s*['"]?db\b/.test(content);
        if (relative === 'compose.e2e.yaml') {
            return /DB_HOST:\s*db\b/.test(content)
                && /DB_ENVIRONMENT_IDENTITY:\s*plataforma_cursos_test\b/.test(content)
                && /DB_NAME:\s*plataforma_cursos_test\b/.test(content)
                && /MYSQL_DATABASE:\s*plataforma_cursos_test\b/.test(content);
        }
        if (relative === '.github/workflows/ci.yml') {
            return content.includes('ALLOW_EPHEMERAL_CI_MYSQL: I_UNDERSTAND_EPHEMERAL_CI_MYSQL')
                && content.includes('CI_EPHEMERAL_MYSQL_ID: plataforma-cursos-ci-');
        }
    }
    return false;
}

function inspectContent(relative, content) {
    if (SKIPPED.has(relative) || relative.startsWith('src/__tests__/')) return [];
    const violations = [];
    content.split(/\r?\n/).forEach((line, index) => {
        for (const [rule, pattern] of RULES) {
            if (pattern.test(line) && !isAllowed(relative, rule, content, line)) {
                violations.push({ file: relative, line: index + 1, rule });
            }
        }
    });
    return violations;
}

function repositoryFiles(root = ROOT) {
    const fromRoots = SCANNED_ROOTS.flatMap((entry) => walk(path.join(root, entry)));
    const individual = SCANNED_FILES.map((entry) => path.join(root, entry)).filter(fs.existsSync);
    return [...new Set([...fromRoots, ...individual])].sort();
}

function scanRepository(root = ROOT) {
    return repositoryFiles(root).flatMap((file) => {
        const relative = path.relative(root, file).split(path.sep).join('/');
        return inspectContent(relative, fs.readFileSync(file, 'utf8'));
    });
}

if (require.main === module) {
    const violations = scanRepository();
    if (violations.length) {
        for (const violation of violations) {
            console.error(`${violation.file}:${violation.line} [${violation.rule}]`);
        }
        process.exitCode = 1;
    } else {
        console.log('Isolamento estático do banco validado.');
    }
}

module.exports = { inspectContent, scanRepository };
