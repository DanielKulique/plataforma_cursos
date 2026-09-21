'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const required = [
    'Dockerfile',
    'compose.yaml',
    'compose.local-db.yaml',
    'Caddyfile',
    '.dockerignore',
    '.env.production.example',
    'mysql/schema.sql',
    'scripts/backup_database.sh',
    'scripts/restore_database.sh'
];

const missing = required.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) throw new Error(`Artefatos de produção ausentes: ${missing.join(', ')}`);

const compose = fs.readFileSync(path.join(root, 'compose.yaml'), 'utf8');
if (/['"]?3306:3306['"]?/.test(compose)) {
    throw new Error('O Compose não pode publicar a porta do MySQL.');
}
if (!compose.includes('mysql_data:/var/lib/mysql')) {
    throw new Error('O volume persistente do MySQL não está configurado.');
}
const databaseService = compose.slice(compose.indexOf('  db:'), compose.indexOf('\n  app:'));
if (/^\s+ports:\s*$/m.test(databaseService)) {
    throw new Error('O Compose base não pode publicar a porta do MySQL no host.');
}
if (!compose.includes('DB_HOST: db') || !compose.includes('DB_PORT: 3306')) {
    throw new Error('A aplicação no Compose deve usar o endpoint interno db:3306.');
}
if (!compose.includes('DB_ENVIRONMENT_IDENTITY') || !compose.includes('002-environment-identity.sh')) {
    throw new Error('O marcador persistente de identidade não está configurado no Compose.');
}
if ((compose.match(/max-size: 10m/g) || []).length !== 3
    || (compose.match(/max-file: "3"/g) || []).length !== 3) {
    throw new Error('A rotação de logs deve cobrir db, app e caddy.');
}
const localCompose = fs.readFileSync(path.join(root, 'compose.local-db.yaml'), 'utf8');
if (!localCompose.includes('127.0.0.1:33307:3306')
    || !localCompose.includes('plataforma_cursos_local_mysql84_data')) {
    throw new Error('O override local deve publicar somente 33307 no loopback e usar volume exclusivo.');
}
if (!compose.includes('material_uploads:/app/storage/materials')
    || !compose.includes('MATERIAL_STORAGE_DIR: /app/storage/materials')) {
    throw new Error('O volume privado persistente de PDFs não está configurado.');
}
if (!compose.includes('certificate_uploads:/app/storage/certificates')
    || !compose.includes('CERTIFICATE_STORAGE_DIR: /app/storage/certificates')) {
    throw new Error('O volume privado persistente de certificados não está configurado.');
}
const caddyService = compose.slice(compose.indexOf('  caddy:'), compose.indexOf('\nnetworks:'));
if (caddyService.includes('material_uploads') || caddyService.includes('certificate_uploads')) {
    throw new Error('O proxy público não pode montar volumes privados de PDFs.');
}

const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
if (!dockerfile.includes('FROM node:20-') || !dockerfile.includes('USER node')) {
    throw new Error('A imagem deve usar Node 20 e usuário não-root.');
}
if (!dockerfile.includes('/app/storage/materials') || !dockerfile.includes('/app/storage/certificates')) {
    throw new Error('A imagem não prepara os diretórios privados de PDFs.');
}

const caddyfile = fs.readFileSync(path.join(root, 'Caddyfile'), 'utf8');
if (!caddyfile.includes('{$APP_DOMAIN}') || !caddyfile.includes('reverse_proxy app:{$APP_PORT}')) {
    throw new Error('A configuração do Caddy não está parametrizada corretamente.');
}
if (!compose.includes('APP_PORT: ${APP_PORT:-3000}')
    || !compose.includes("process.env.APP_PORT + '/readyz'")) {
    throw new Error('Compose, healthcheck e runtime devem compartilhar APP_PORT e readiness.');
}

console.log('Artefatos de produção validados.');
