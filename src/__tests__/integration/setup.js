/**
 * Setup para testes de integração
 * 
 * Este arquivo é executado antes de cada suite de testes de integração.
 * Responsabilidades:
 * - Configurar conexão com banco de dados de teste
 * - Limpar banco entre testes
 * - Criar dados de seed
 */

const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env.test' });

// Configuração do banco de dados de teste
const testDbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'appuser',
    password: process.env.DB_PASSWORD || 'tPJ"~s04_4K5',
    database: process.env.DB_NAME || 'site_cursos_test',
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0
};

// Pool de conexão para testes
let testPool = null;

/**
 * Inicializa o pool de conexões de teste
 */
async function initTestPool() {
    if (!testPool) {
        testPool = mysql.createPool(testDbConfig);
        
        // Testa conexão
        try {
            const connection = await testPool.getConnection();
            await connection.ping();
            connection.release();
            console.log('✓ Pool de testes conectado com sucesso');
        } catch (error) {
            console.error('✗ Erro ao conectar pool de testes:', error.message);
            console.error('Certifique-se de rodar: npm run db:test:setup');
            throw error;
        }
    }
    return testPool;
}

/**
 * Limpa todas as tabelas do banco de dados de teste
 * (na ordem correta para evitar violações de chave estrangeira)
 */
async function clearDatabase() {
    const pool = await initTestPool();
    
    try {
        // Desabilita checks de chave estrangeira temporariamente
        await pool.query('SET FOREIGN_KEY_CHECKS = 0');
        
        // Limpa tabelas na ordem correta (ignora se não existir)
        const tables = ['Matriculas', 'Turmas', 'Cursos', 'Usuarios', 'verificacao_email'];
        
        for (const table of tables) {
            try {
                await pool.query(`DELETE FROM ${table}`);
            } catch (err) {
                // Ignora erro de tabela inexistente
                if (err.code !== 'ER_NO_SUCH_TABLE') {
                    console.warn(`   Aviso: Não foi possível limpar ${table}: ${err.message}`);
                }
            }
        }
        
        // Reseta auto-increment
        await pool.query('SET FOREIGN_KEY_CHECKS = 1');
        
        console.log('✓ Banco de dados limpo');
    } catch (error) {
        console.error('✗ Erro ao limpar banco:', error.message);
        throw error;
    }
}

/**
 * Seed básico para testes
 * Cria usuários de cada tipo (ADMIN, PROFESSOR, ALUNO)
 */
async function seedBasicData() {
    const pool = await initTestPool();
    const bcrypt = require('bcrypt');

    try {
        // Remove usuários e verificações existentes
        await pool.query("DELETE FROM Usuarios WHERE email IN ('admin@teste.com', 'professor@teste.com', 'aluno@teste.com')");
        await pool.query("DELETE FROM EmailVerificacoes WHERE email IN ('admin@teste.com', 'professor@teste.com', 'aluno@teste.com')");
        
        const senhaHash = await bcrypt.hash('Teste@123', 10);

        // Cria usuários de teste
        await pool.query(`
            INSERT INTO Usuarios (nome_completo, cpf, email, senha, telefone, tipo) VALUES
            ('Admin Teste', '11111111111', 'admin@teste.com', ?, '11999999999', 'ADMIN'),
            ('Professor Teste', '22222222222', 'professor@teste.com', ?, '11999999998', 'PROFESSOR'),
            ('Aluno Teste', '33333333333', 'aluno@teste.com', ?, '11999999997', 'ALUNO')
        `, [senhaHash, senhaHash, senhaHash]);

        // Cria registros de verificação de e-mail como VERIFICADOS para todos
        await pool.query(`
            INSERT INTO EmailVerificacoes (email, codigo, verificado, expira_em, criado_em) VALUES
            ('admin@teste.com', '000000', 1, NOW() + INTERVAL 1 YEAR, NOW()),
            ('professor@teste.com', '000000', 1, NOW() + INTERVAL 1 YEAR, NOW()),
            ('aluno@teste.com', '000000', 1, NOW() + INTERVAL 1 YEAR, NOW())
        `);

        console.log('✓ Seed básico executado');

        // Retorna IDs dos usuários criados para uso nos testes
        const [rows] = await pool.query(
            'SELECT id_usuario, tipo, email FROM Usuarios WHERE email IN (?, ?, ?)',
            ['admin@teste.com', 'professor@teste.com', 'aluno@teste.com']
        );

        console.log(`✓ Usuários criados: ${rows.length}`);

        return {
            admin: rows.find(u => u.tipo === 'ADMIN'),
            professor: rows.find(u => u.tipo === 'PROFESSOR'),
            aluno: rows.find(u => u.tipo === 'ALUNO')
        };
    } catch (error) {
        console.error('✗ Erro ao executar seed:', error.message);
        throw error;
    }
}

/**
 * Fecha o pool de conexões
 */
async function closeTestPool() {
    if (testPool) {
        await testPool.end();
        testPool = null;
        console.log('✓ Pool de testes fechado');
    }
}

// Exporta para uso nos testes
module.exports = {
    initTestPool,
    clearDatabase,
    seedBasicData,
    closeTestPool,
    testDbConfig
};
