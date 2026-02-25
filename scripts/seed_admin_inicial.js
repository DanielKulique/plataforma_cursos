/**
 * Script para criar usuário ADMIN inicial
 * 
 * Uso: node scripts/seed_admin_inicial.js
 * 
 * Credenciais padrão (podem ser alteradas via .env):
 * - Email: admin@plataforma.com
 * - Senha: Admin@123
 */

const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Cores para output no console
const cores = {
    reset: '\x1b[0m',
    verde: '\x1b[32m',
    vermelho: '\x1b[31m',
    amarelo: '\x1b[33m',
    cyan: '\x1b[36m'
};

function log(cor, mensagem) {
    console.log(`${cor}${mensagem}${cores.reset}`);
}

async function criarAdminInicial() {
    log(cores.cyan, '\n╔════════════════════════════════════════════════════════╗');
    log(cores.cyan, '║   SEED - USUÁRIO ADMIN INICIAL                           ║');
    log(cores.cyan, '╚════════════════════════════════════════════════════════╝\n');

    // Credenciais do admin (podem ser sobrescritas via .env)
    const email = process.env.INITIAL_ADMIN_EMAIL || 'admin@plataforma.com';
    const senha = process.env.INITIAL_ADMIN_PASSWORD || 'Admin@123';
    const nome = process.env.INITIAL_ADMIN_NOME || 'Administrador do Sistema';
    const cpf = process.env.INITIAL_ADMIN_CPF || '00000000000';
    const telefone = process.env.INITIAL_ADMIN_TELEFONE || '00000000000';

    log(cores.amarelo, 'Dados do Admin:');
    console.log(`  Email: ${email}`);
    console.log(`  Senha: ${senha}`);
    console.log(`  Nome: ${nome}`);
    console.log(`  CPF: ${cpf}`);
    console.log(`  Telefone: ${telefone}\n`);

    let conn;
    try {
        // Conectar ao banco
        log(cores.amarelo, 'Conectando ao banco de dados...');
        conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });
        log(cores.verde, '✓ Conexão estabelecida\n');

        // Verificar se já existe admin
        log(cores.amarelo, 'Verificando existência de admin...');
        const [admins] = await conn.query(
            "SELECT id_usuario, email, nome_completo FROM Usuarios WHERE tipo = 'ADMIN' LIMIT 1"
        );

        if (admins.length > 0) {
            log(cores.amarelo, '\n⚠ Já existe(m) administrador(es) no sistema:');
            admins.forEach(admin => {
                console.log(`   - ID: ${admin.id_usuario}, Email: ${admin.email}, Nome: ${admin.nome_completo}`);
            });
            log(cores.amarelo, '\nDeseja criar um admin adicional? (s/n)');
            log(cores.cyan, 'Nota: Este script sempre cria um novo admin, não substitui existentes.\n');
        }

        // Hash da senha
        log(cores.amarelo, 'Gerando hash da senha...');
        const senhaHash = await bcrypt.hash(senha, 10);
        log(cores.verde, '✓ Hash gerado\n');

        // Inserir admin
        log(cores.amarelo, 'Criando usuário ADMIN...');
        const [result] = await conn.query(
            `INSERT INTO Usuarios (nome_completo, cpf, email, senha, telefone, tipo) 
             VALUES (?, ?, ?, ?, ?, 'ADMIN')`,
            [nome, cpf, email, senhaHash, telefone]
        );

        if (result.affectedRows === 0) {
            throw new Error('Falha ao inserir usuário ADMIN');
        }

        const idAdmin = result.insertId;
        log(cores.verde, '\n✅ ADMIN criado com sucesso!\n');
        
        log(cores.cyan, '┌─────────────────────────────────────────────────────────┐');
        log(cores.cyan, '│              DADOS DE ACESSO DO ADMIN                   │');
        log(cores.cyan, '├─────────────────────────────────────────────────────────┤');
        log(cores.cyan, `│  Email: ${email.padEnd(45)} │`);
        log(cores.cyan, `│  Senha: ${senha.padEnd(45)} │`);
        log(cores.cyan, `│  ID:    ${String(idAdmin).padEnd(45)} │`);
        log(cores.cyan, '└─────────────────────────────────────────────────────────┘\n');

        log(cores.amarelo, '⚠ IMPORTANTE:');
        log(cores.reset, '   - Altere a senha padrão após o primeiro login!');
        log(cores.reset, '   - Em produção, use credenciais fortes e únicas.');
        log(cores.reset, '   - Nunca commit o .env com senhas no repositório.\n');

        return { sucesso: true, idAdmin, email };

    } catch (error) {
        log(cores.vermelho, '\n❌ ERRO ao criar admin:');
        console.error(error.message);
        
        if (error.errno === 1062) {
            if (error.message.includes('cpf_UNIQUE')) {
                log(cores.vermelho, '   CPF já cadastrado. Use um CPF diferente no .env.');
            }
            if (error.message.includes('email_UNIQUE')) {
                log(cores.vermelho, '   E-mail já cadastrado. Use um e-mail diferente no .env.');
            }
        }
        
        return { sucesso: false, erro: error.message };
    } finally {
        if (conn) {
            await conn.end();
            log(cores.amarelo, 'Conexão com banco fechada.\n');
        }
    }
}

// Executar
criarAdminInicial()
    .then(resultado => {
        if (resultado.sucesso) {
            log(cores.verde, 'Script executado com sucesso!\n');
            process.exit(0);
        } else {
            log(cores.vermelho, 'Script falhou. Verifique os erros acima.\n');
            process.exit(1);
        }
    })
    .catch(error => {
        log(cores.vermelho, `Erro fatal: ${error.message}\n`);
        process.exit(1);
    });
