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
const { assertTestDatabaseIsDisposable } = require('../../../scripts/test_database_safety');
const { loadEnvironment } = require('../../config/loadEnvironment');
const { databaseClientConfig, describeDatabaseTarget } = require('../../config/database-connection');
const { assertDatabaseIdentity } = require('../../config/database-identity');
const { SESSION_COOKIE_NAME } = require('../../config/session');
loadEnvironment('test');

// Configuração do banco de dados de teste
const testDbConfig = databaseClientConfig(process.env, {
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 10
});

// Pool de conexão para testes
let testPool = null;
let cachedSeedPassword = null;
let cachedSeedHash = null;

async function getSeedPasswordHash(password) {
    if (cachedSeedHash && cachedSeedPassword === password) return cachedSeedHash;
    const bcrypt = require('bcrypt');
    cachedSeedHash = await bcrypt.hash(password, 10);
    cachedSeedPassword = password;
    return cachedSeedHash;
}

/**
 * Inicializa o pool de conexões de teste
 */
async function initTestPool() {
    if (!testPool) {
        assertTestDatabaseIsDisposable(process.env);
        testPool = mysql.createPool(testDbConfig);
        
        // Testa conexão
        try {
            const connection = await testPool.getConnection();
            await assertDatabaseIdentity(connection, {
                database: testDbConfig.database,
                identity: process.env.DB_ENVIRONMENT_IDENTITY
            });
            connection.release();
            console.log(`✓ Pool de testes validado: ${JSON.stringify(describeDatabaseTarget(process.env))}`);
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
    assertTestDatabaseIsDisposable(process.env);
    const connection = await pool.getConnection();
    let transactionStarted = false;
    
    try {
        // Desabilita checks de chave estrangeira temporariamente
        await connection.query('SET FOREIGN_KEY_CHECKS = 0');
        await connection.beginTransaction();
        transactionStarted = true;
        
        // Limpa tabelas em uma única transação (ignora se não existir).
        // DELETE evita o lock/flush de DDL que TRUNCATE impõe milhares de vezes
        // durante a suíte completa, sem reduzir o isolamento entre os testes.
        const tables = [
            'AnalisesContextuais', 'AnalisesPlagio', 'PasswordResetTokens', 'ConteudosProgresso', 'ProgressoAluno', 'Certificados', 'Conteudos', 'Modulos',
            'Q_Respostas', 'Q_Tentativas', 'Q_Opcoes', 'Q_Perguntas', 'Questionarios',
            'Matriculas', 'ReplicacoesTurma', 'Turmas', 'Cursos', 'ArquivosMateriais', 'EmailVerificacoes', 'Usuarios'
        ];
        
        for (const table of tables) {
            try {
                await connection.query(`DELETE FROM ${table}`);
            } catch (err) {
                // Ignora erro de tabela inexistente
                if (err.code !== 'ER_NO_SUCH_TABLE') {
                    console.warn(`   Aviso: Não foi possível limpar ${table}: ${err.message}`);
                }
            }
        }

        await connection.commit();
        transactionStarted = false;

        // Os tokens reutilizados pelas suítes apontam para os três usuários fixos
        // do seed (IDs 1, 2 e 3). Somente essa sequência precisa ser reiniciada.
        await connection.query('ALTER TABLE Usuarios AUTO_INCREMENT = 1');
        
        console.log('✓ Banco de dados limpo');
    } catch (error) {
        if (transactionStarted) await connection.rollback().catch(() => undefined);
        console.error('✗ Erro ao limpar banco:', error.message);
        throw error;
    } finally {
        await connection.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => undefined);
        connection.release();
    }
}

/**
 * Seed básico para testes
 * Cria usuários de cada tipo (ADMIN, PROFESSOR, ALUNO)
 */
async function seedBasicData() {
    const pool = await initTestPool();
    const testPassword = String(process.env.TEST_SEED_PASSWORD || '');

    if (testPassword.length < 8) {
        throw new Error('TEST_SEED_PASSWORD deve conter ao menos 8 caracteres para o seed descartável.');
    }

    try {
        const senhaHash = await getSeedPasswordHash(testPassword);

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

function getSessionToken(response) {
    const cookies = response.headers['set-cookie'] || [];
    const prefix = `${SESSION_COOKIE_NAME}=`;
    const sessionCookie = cookies.find((cookie) => cookie.startsWith(prefix));

    if (!sessionCookie) {
        throw new Error(`Resposta não contém o cookie de sessão ${SESSION_COOKIE_NAME}.`);
    }

    return decodeURIComponent(sessionCookie.slice(prefix.length).split(';')[0]);
}

// Exporta para uso nos testes
module.exports = {
    initTestPool,
    clearDatabase,
    seedBasicData,
    closeTestPool,
    testDbConfig,
    getSessionToken,
    getTestPassword: () => {
        const password = String(process.env.TEST_SEED_PASSWORD || '');
        if (password.length < 8) throw new Error('TEST_SEED_PASSWORD não configurada.');
        return password;
    }
};
