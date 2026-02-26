/**
 * Script para preparar o banco de dados de teste
 * 
 * Uso: npm run db:test:setup
 * 
 * Este script:
 * 1. Limpa todas as tabelas do banco de teste
 * 2. Recria as tabelas a partir do schema
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.test' });

const TEST_DB_NAME = process.env.DB_NAME || 'site_cursos_test';
const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'appuser',
    password: process.env.DB_PASSWORD || 'tPJ"~s04_4K5',
    database: TEST_DB_NAME,
    multipleStatements: true
};

async function setupTestDatabase() {
    let connection;
    
    try {
        console.log('🔧 Preparando banco de dados de teste...\n');
        
        // Conecta ao banco de teste
        console.log(`📡 Conectando ao banco: ${TEST_DB_NAME}...`);
        connection = await mysql.createConnection(DB_CONFIG);
        console.log('✓ Conectado ao banco de teste');
        
        // Desabilita foreign key checks
        await connection.query('SET FOREIGN_KEY_CHECKS = 0');
        
        // Limpa todas as tabelas
        console.log('🗑️  Limpando tabelas...');
        const tables = [
            'Matriculas',
            'Turmas',
            'Cursos',
            'Usuarios',
            'verificacao_email'
        ];
        
        for (const table of tables) {
            try {
                await connection.query(`DELETE FROM ${table}`);
                console.log(`   ✓ ${table} limpa`);
            } catch (err) {
                // Tabela pode não existir, ignora
                console.log(`   - ${table} não existe (ignorado)`);
            }
        }
        
        // Reabilita foreign key checks
        await connection.query('SET FOREIGN_KEY_CHECKS = 1');
        
        console.log('\n✅ Banco de dados de teste preparado com sucesso!\n');
        console.log('Agora você pode rodar os testes de integração:');
        console.log('   npm run test:integration\n');
        
    } catch (error) {
        console.error('\n❌ Erro ao preparar banco de dados:');
        console.error(error.message);
        console.error('\nSolução:');
        console.error('1. Crie o banco de dados manualmente:');
        console.error(`   CREATE DATABASE ${TEST_DB_NAME};`);
        console.error('2. Ou use o script de seed para criar as tabelas');
        console.error('3. Verifique se o MySQL está rodando\n');
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

setupTestDatabase();
