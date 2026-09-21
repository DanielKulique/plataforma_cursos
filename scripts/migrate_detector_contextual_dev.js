'use strict';

const path = require('path');
const mysql = require('mysql2/promise');
const { loadEnvironment } = require('../src/config/loadEnvironment');
const { assertDevelopmentDatabase } = require('./test_database_safety');
const { assertCanonicalSchema } = require('./schema_contract');
const { assertDatabaseConnectionEnvironment, describeDatabaseTarget } = require('../src/config/database-connection');
const { assertDatabaseIdentity } = require('../src/config/database-identity');

loadEnvironment('development', path.join(__dirname, '..'));
const database = assertDevelopmentDatabase(process.env);
const target = assertDatabaseConnectionEnvironment(process.env);

async function migrate() {
    const connection = await mysql.createConnection({
        host: target.host,
        port: target.port,
        user: target.user,
        password: target.password,
        database
    });
    try {
        await assertDatabaseIdentity(connection, target);
        await connection.query(`
            CREATE TABLE IF NOT EXISTS AnalisesContextuais (
              id INT NOT NULL AUTO_INCREMENT,
              id_usuario INT NOT NULL,
              status VARCHAR(30) NOT NULL,
              total_segmentos INT UNSIGNED NOT NULL,
              segmentos_analisados INT UNSIGNED NOT NULL,
              total_alertas INT UNSIGNED NOT NULL,
              gravidade_maxima ENUM('INFORMATIVA', 'BAIXA', 'MEDIA', 'ALTA') NULL,
              versao_contrato VARCHAR(20) NOT NULL,
              tempo_total_ms DECIMAL(12,3) NULL,
              parametros_json JSON NOT NULL,
              criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (id),
              KEY idx_analises_contextuais_usuario_criado (id_usuario, criado_em),
              CONSTRAINT fk_analises_contextuais_usuario
                FOREIGN KEY (id_usuario) REFERENCES Usuarios (id_usuario) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        await assertCanonicalSchema(connection, database);
        console.log(`Migração contextual idempotente aplicada em ${database}.`);
    } finally {
        await connection.end();
    }
}

console.log(JSON.stringify(describeDatabaseTarget(process.env), null, 2));
migrate().catch((error) => {
    console.error(`Falha na migração contextual: ${error.message}`);
    process.exitCode = 1;
});
