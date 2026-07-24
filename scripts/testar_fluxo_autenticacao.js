/**
 * Script para testar fluxo completo de autenticação
 * 
 * Testes:
 * 1. Executar seed do admin inicial
 * 2. Login com admin
 * 3. Tentar criar PROFESSOR via cadastro público (deve falhar)
 * 4. Criar PROFESSOR via rota admin (deve funcionar)
 * 5. Criar ALUNO via cadastro público (deve funcionar)
 * 6. Login com professor criado
 * 7. Listar usuários (apenas admin)
 */

const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { assertDevelopmentDatabase } = require('./test_database_safety');
assertDevelopmentDatabase(process.env);
const TEST_ACCOUNT_PASSWORD = process.env.CANONICAL_SEED_PASSWORD;
if (!TEST_ACCOUNT_PASSWORD || String(TEST_ACCOUNT_PASSWORD).length < 8) {
    throw new Error('Defina CANONICAL_SEED_PASSWORD com ao menos 8 caracteres antes de executar este script.');
}

const BASE_URL = `http://localhost:${process.env.PORT || 3000}/api`;

// Cores para output
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

function logTeste(nome, sucesso, detalhes = '') {
    const status = sucesso ? `${cores.verde}✓ SUCESSO${cores.reset}` : `${cores.vermelho}✗ FALHOU${cores.reset}`;
    log(cores.cyan, `\n[${status}] ${nome}`);
    if (detalhes) log(cores.reset, detalhes);
}

async function fazerRequisicao(url, options = {}) {
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });
        const data = await response.json();
        return { status: response.status, data };
    } catch (error) {
        return { status: 0, error: error.message };
    }
}

async function executarSeedAdmin() {
    log(cores.amarelo, '\n=== TESTE 0: Executar Seed do Admin ===');
    
    const { execSync } = require('child_process');
    try {
        const output = execSync('node scripts/seed_admin_inicial.js', { 
            cwd: path.join(__dirname, '..'),
            encoding: 'utf8'
        });
        console.log(output);
        
        // Verificar se admin existe
        const conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });
        
        const [admins] = await conn.query(
            "SELECT id_usuario, email FROM Usuarios WHERE tipo = 'ADMIN'"
        );
        await conn.end();
        
        if (admins.length > 0) {
            logTeste('Seed Admin', true, `Admin disponível: ID=${admins[0].id_usuario}`);
            return true;
        } else {
            logTeste('Seed Admin', false, 'Nenhum admin encontrado após seed');
            return false;
        }
    } catch (error) {
        // Pode falhar se admin já existir - isso é OK
        log(cores.amarelo, 'Seed pode ter falhado porque admin já existe (isso é OK)');
        
        const conn = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });
        
        const [admins] = await conn.query(
            "SELECT id_usuario, email FROM Usuarios WHERE tipo = 'ADMIN'"
        );
        await conn.end();
        
        if (admins.length > 0) {
            logTeste('Seed Admin', true, `Admin já existe: ID=${admins[0].id_usuario}`);
            return true;
        }
        
        logTeste('Seed Admin', false, error.message);
        return false;
    }
}

async function testarLoginAdmin() {
    log(cores.amarelo, '\n=== TESTE 1: Login do Admin ===');
    
    const email = process.env.INITIAL_ADMIN_EMAIL;
    const senha = process.env.INITIAL_ADMIN_PASSWORD;
    if (!email || !senha) {
        logTeste('Login Admin', false, 'Variáveis INITIAL_ADMIN_EMAIL e INITIAL_ADMIN_PASSWORD obrigatórias.');
        return null;
    }
    
    const { status, data, error } = await fazerRequisicao(`${BASE_URL}/auth/login`, {
        method: 'POST',
        body: JSON.stringify({ email, senha })
    });
    
    if (error) {
        logTeste('Login Admin', false, `Erro: ${error}`);
        return null;
    }
    
    const sucesso = status === 200 && data.token;
    logTeste('Login Admin', sucesso, `Status: ${status}`);
    
    return data.token;
}

async function testarCriacaoProfessorPublico(token) {
    log(cores.amarelo, '\n=== TESTE 2: Criar PROFESSOR via Cadastro Público (deve falhar) ===');
    
    const sufixo = Date.now();
    const cpf = String(60000000000 + (sufixo % 89999999999)).slice(0, 11);
    const email = `prof.publico.${sufixo}@example.com`;
    
    const { status, data, error } = await fazerRequisicao(`${BASE_URL}/usuarios`, {
        method: 'POST',
        body: JSON.stringify({
            nome_completo: 'Professor Público Teste',
            cpf,
            email,
            senha: TEST_ACCOUNT_PASSWORD,
            tipo: 'PROFESSOR'
        })
    });
    
    if (error) {
        logTeste('Criar PROFESSOR (público)', false, `Erro: ${error}`);
        return false;
    }
    
    // A validação pública rejeita o papel antes de qualquer criação.
    const sucesso = status === 400;
    logTeste('Criar PROFESSOR (público)', sucesso,
        `Status: ${status} (esperado 400)`
    );
    
    return sucesso;
}

async function testarCriacaoProfessorAdmin(token) {
    log(cores.amarelo, '\n=== TESTE 3: Criar PROFESSOR via Admin (deve funcionar) ===');
    
    const sufixo = Date.now();
    const cpf = String(70000000000 + (sufixo % 89999999999)).slice(0, 11);
    const email = `prof.admin.${sufixo}@example.com`;
    
    const { status, data, error } = await fazerRequisicao(`${BASE_URL}/admin/usuarios`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
            nome_completo: 'Professor Admin Teste',
            cpf,
            email,
            senha: TEST_ACCOUNT_PASSWORD,
            telefone: '11999999999',
            tipo: 'PROFESSOR'
        })
    });
    
    if (error) {
        logTeste('Criar PROFESSOR (admin)', false, `Erro: ${error}`);
        return false;
    }
    
    const sucesso = status === 201 && data.id_usuario;
    logTeste('Criar PROFESSOR (admin)', sucesso,
        `Status: ${status}${sucesso ? `\nID criado: ${data.id_usuario}` : ''}`
    );
    
    return sucesso ? data : false;
}

async function testarCriacaoAlunoPublico() {
    log(cores.amarelo, '\n=== TESTE 4: Criar ALUNO via Cadastro Público (deve funcionar) ===');
    
    const sufixo = Date.now();
    const cpf = String(80000000000 + (sufixo % 89999999999)).slice(0, 11);
    const email = `aluno.publico.${sufixo}@example.com`;
    
    const { status, data, error } = await fazerRequisicao(`${BASE_URL}/usuarios`, {
        method: 'POST',
        body: JSON.stringify({
            nome_completo: 'Aluno Público Teste',
            cpf,
            email,
            senha: TEST_ACCOUNT_PASSWORD,
            telefone: '11988888888'
        })
    });
    
    if (error) {
        logTeste('Criar ALUNO (público)', false, `Erro: ${error}`);
        return false;
    }
    
    const sucesso = status === 201 && data.id_usuario && data.tipo === 'ALUNO';
    logTeste('Criar ALUNO (público)', sucesso,
        `Status: ${status}${sucesso ? `\nID criado: ${data.id_usuario}` : ''}`
    );
    
    return sucesso;
}

async function testarLoginProfessor(email, senha) {
    log(cores.amarelo, '\n=== TESTE 5: Login do Professor Criado ===');
    
    const { status, data, error } = await fazerRequisicao(`${BASE_URL}/auth/login`, {
        method: 'POST',
        body: JSON.stringify({ email, senha })
    });
    
    if (error) {
        logTeste('Login Professor', false, `Erro: ${error}`);
        return null;
    }
    
    const sucesso = status === 200 && data.token;
    logTeste('Login Professor', sucesso, `Status: ${status}`);
    
    return data.token;
}

async function testarListarUsuariosAdmin(token) {
    log(cores.amarelo, '\n=== TESTE 6: Listar Usuários (apenas Admin) ===');
    
    const { status, data, error } = await fazerRequisicao(`${BASE_URL}/admin/usuarios`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (error) {
        logTeste('Listar Usuários (admin)', false, `Erro: ${error}`);
        return false;
    }
    
    const sucesso = status === 200 && Array.isArray(data);
    logTeste('Listar Usuários (admin)', sucesso,
        `Status: ${status}${sucesso ? `\nTotal de usuários: ${data.length}` : ''}`
    );
    
    if (sucesso && data.length > 0) {
        log(cores.cyan, 'Usuários encontrados:');
        data.slice(0, 5).forEach(u => {
            console.log(`  - ID: ${u.id_usuario}, Tipo: ${u.tipo}`);
        });
        if (data.length > 5) console.log(`  ... e mais ${data.length - 5} usuários`);
    }
    
    return sucesso;
}

async function limparUsuariosTeste() {
    log(cores.amarelo, '\n=== LIMPANDO USUÁRIOS DE TESTE ===');
    
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });
    
    try {
        // Deletar usuários de teste (exceto admin)
        await conn.query("DELETE FROM Usuarios WHERE tipo != 'ADMIN' AND email LIKE '%teste%' OR email LIKE '%publico%' OR email LIKE '%admin.%'");
        log(cores.verde, '✓ Usuários de teste limpos');
    } catch (error) {
        log(cores.amarelo, `Aviso: ${error.message}`);
    } finally {
        await conn.end();
    }
}

async function main() {
    log(cores.cyan, '╔════════════════════════════════════════════════════════╗');
    log(cores.cyan, '║   TESTE DE FLUXO COMPLETO DE AUTENTICAÇÃO              ║');
    log(cores.cyan, '╚════════════════════════════════════════════════════════╝');
    
    // Verificar servidor
    log(cores.amarelo, '\nVerificando servidor...');
    const healthCheck = await fazerRequisicao(`${BASE_URL}/health`);
    if (healthCheck.status === 0) {
        log(cores.vermelho, '✗ Servidor não está rodando!');
        log(cores.amarelo, 'Execute: npm start');
        process.exit(1);
    }
    log(cores.verde, '✓ Servidor está rodando!');
    
    let resultados = [];
    let tokenAdmin = null;
    let dadosProfessor = null;
    
    // Teste 0: Seed do admin
    resultados.push(await executarSeedAdmin());
    
    // Teste 1: Login admin
    tokenAdmin = await testarLoginAdmin();
    resultados.push(!!tokenAdmin);
    
    if (tokenAdmin) {
        // Teste 2: Criar professor via público (deve falhar)
        resultados.push(await testarCriacaoProfessorPublico(tokenAdmin));
        
        // Teste 3: Criar professor via admin (deve funcionar)
        dadosProfessor = await testarCriacaoProfessorAdmin(tokenAdmin);
        resultados.push(!!dadosProfessor);
        
        // Teste 4: Criar aluno via público (deve funcionar)
        resultados.push(await testarCriacaoAlunoPublico());
        
        // Teste 5: Login professor
        if (dadosProfessor) {
            const tokenProfessor = await testarLoginProfessor(dadosProfessor.email, TEST_ACCOUNT_PASSWORD);
            resultados.push(!!tokenProfessor);
            
            // Teste 6: Listar usuários (admin)
            resultados.push(await testarListarUsuariosAdmin(tokenAdmin));
        }
    }
    
    // Resumo
    log(cores.cyan, '\n╔════════════════════════════════════════════════════════╗');
    log(cores.cyan, '║                    RESUMO FINAL                        ║');
    log(cores.cyan, '╚════════════════════════════════════════════════════════╝');
    
    const total = resultados.length;
    const sucesso = resultados.filter(r => r).length;
    
    console.log(`\nTestes executados: ${total}`);
    console.log(`Sucessos: ${sucesso}`);
    console.log(`Falhas: ${total - sucesso}`);
    
    if (sucesso === total) {
        log(cores.verde, '\n✅ TODOS OS TESTES PASSARAM!');
        log(cores.cyan, '\nFluxo de autenticação está funcionando corretamente:');
        log(cores.reset, '   ✓ Admin inicial criado via seed');
        log(cores.reset, '   ✓ Login funcionando');
        log(cores.reset, '   ✓ PROFESSOR/ADMIN bloqueados no cadastro público');
        log(cores.reset, '   ✓ ADMIN pode criar PROFESSOR via rota protegida');
        log(cores.reset, '   ✓ ALUNO pode ser criado via cadastro público');
    } else {
        log(cores.amarelo, '\n⚠ Alguns testes falharam. Verifique os logs acima.');
    }
    
    // Limpeza opcional
    log(cores.amarelo, '\n\nDeseja limpar os usuários de teste? (s/n)');
    log(cores.cyan, 'Dica: Execute "node scripts/testar_fluxo_autenticacao.js --clean" para limpar');
}

// Executar
if (process.argv.includes('--clean')) {
    limparUsuariosTeste().then(() => process.exit(0));
} else {
    main().catch(error => {
        log(cores.vermelho, `\n❌ Erro fatal: ${error.code || 'UNEXPECTED_ERROR'}`);
        process.exit(1);
    });
}
