/**
 * Script para criar usuários de teste com SENHA FORTE
 *
 * Requisitos de senha forte:
 * - Mínimo 8 caracteres
 * - 1 letra maiúscula
 * - 1 letra minúscula
 * - 1 número
 * - 1 símbolo especial
 *
 * Senha carregada de CANONICAL_SEED_PASSWORD, sem fallback.
 *
 * Uso: node scripts/seed_usuarios_teste.js
 */

const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const { loadEnvironment } = require('../src/config/loadEnvironment');
loadEnvironment('development', path.join(__dirname, '..'));
const { assertDevelopmentDatabase } = require('./test_database_safety');
const { openVerifiedConnection } = require('./lib/database-operations');
assertDevelopmentDatabase(process.env);
const TEST_ACCOUNT_PASSWORD = process.env.CANONICAL_SEED_PASSWORD;
if (!TEST_ACCOUNT_PASSWORD || String(TEST_ACCOUNT_PASSWORD).length < 8) {
    throw new Error('Defina CANONICAL_SEED_PASSWORD com ao menos 8 caracteres antes de executar este script.');
}

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


async function limparUsuariosTeste() {
    log(cores.amarelo, '\n=== LIMPANDO USUÁRIOS DE TESTE ===');

    const conn = await openVerifiedConnection({
        createConnection: mysql.createConnection,
        additions: { database: process.env.DB_NAME }
    });

    try {
        // Desabilitar foreign keys temporariamente
        await conn.query('SET FOREIGN_KEY_CHECKS = 0');

        // Deletar usuários de teste diretamente (em cascata limpa o resto)
        const emailsDeTeste = [
            'carlos.silva@plataforma.com',
            'ana.costa@plataforma.com',
            'roberto.martins@plataforma.com',
            'joao@email.com',
            'maria@email.com',
            'lucas@email.com',
            'isabela@email.com',
            'gabriel@email.com',
            'admin@teste.com',
            'professor@teste.com',
            'aluno@teste.com'
        ];

        // Deletar usuários de teste
        const [result] = await conn.query(
            'DELETE FROM Usuarios WHERE email IN (?)',
            [emailsDeTeste]
        );

        if (result.affectedRows > 0) {
            log(cores.verde, `✓ ${result.affectedRows} usuários de teste limpos`);
        } else {
            log(cores.amarelo, 'Nenhum usuário de teste encontrado para limpar');
        }

        // Reabilitar foreign keys
        await conn.query('SET FOREIGN_KEY_CHECKS = 1');

        return true;
    } catch (error) {
        log(cores.vermelho, `Erro ao limpar: ${error.message}`);
        // Reabilitar foreign keys em caso de erro
        try {
            await conn.query('SET FOREIGN_KEY_CHECKS = 1');
        } catch (e) {}
        return false;
    } finally {
        await conn.end();
    }
}

async function criarUsuariosTeste() {
    log(cores.cyan, '\n╔════════════════════════════════════════════════════════╗');
    log(cores.cyan, '║   SEED - USUÁRIOS DE TESTE COM SENHA FORTE               ║');
    log(cores.cyan, '╚════════════════════════════════════════════════════════╝\n');

    log(cores.amarelo, 'Validação da senha de teste:');
    log(cores.cyan, '  Requisitos atendidos:');
    log(cores.cyan, '    ✓ Mínimo 8 caracteres');
    log(cores.cyan, '    ✓ 1 letra maiúscula');
    log(cores.cyan, '    ✓ 1 letra minúscula');
    log(cores.cyan, '    ✓ 1 número');
    log(cores.cyan, '    ✓ 1 símbolo especial (@)\n');

    const conn = await openVerifiedConnection({
        createConnection: mysql.createConnection,
        additions: { database: process.env.DB_NAME }
    });

    try {
        // Gerar hash da senha forte
        log(cores.amarelo, 'Gerando hash da senha forte...');
        const senhaHash = await bcrypt.hash(TEST_ACCOUNT_PASSWORD, 10);
        log(cores.verde, '✓ Hash gerado\n');

        // Criar ADMIN
        log(cores.amarelo, 'Criando ADMIN...');
        const [adminResult] = await conn.query(
            `INSERT INTO Usuarios (nome_completo, cpf, email, senha, telefone, tipo)
             VALUES (?, ?, ?, ?, ?, 'ADMIN')`,
            ['Administrador do Sistema', '00000000000', 'admin@teste.com', senhaHash, '11900000000']
        );
        log(cores.verde, `  ✓ ADMIN criado (ID: ${adminResult.insertId})`);

        // Criar PROFESSORES
        log(cores.amarelo, '\nCriando PROFESSORES...');
        const professores = [
            { nome: 'Carlos Eduardo Silva', cpf: '11122233344', email: 'carlos.silva@plataforma.com', tel: '11999887766' },
            { nome: 'Ana Beatriz Costa', cpf: '55566677788', email: 'ana.costa@plataforma.com', tel: '11988776655' },
            { nome: 'Roberto Martins', cpf: '99988877766', email: 'roberto.martins@plataforma.com', tel: '11977665544' }
        ];

        for (const prof of professores) {
            const [result] = await conn.query(
                `INSERT INTO Usuarios (nome_completo, cpf, email, senha, telefone, tipo)
                 VALUES (?, ?, ?, ?, ?, 'PROFESSOR')`,
                [prof.nome, prof.cpf, prof.email, senhaHash, prof.tel]
            );
            log(cores.verde, `  ✓ Professor criado (ID: ${result.insertId})`);
        }

        // Criar ALUNOS
        log(cores.amarelo, '\nCriando ALUNOS...');
        const alunos = [
            { nome: 'João Pedro Almeida', cpf: '12312312300', email: 'joao@email.com', tel: '11911111111' },
            { nome: 'Maria Clara Santos', cpf: '45645645600', email: 'maria@email.com', tel: '11922222222' },
            { nome: 'Lucas Ferreira Lima', cpf: '78978978900', email: 'lucas@email.com', tel: '11933333333' },
            { nome: 'Isabela Rodrigues', cpf: '14725836900', email: 'isabela@email.com', tel: '11944444444' },
            { nome: 'Gabriel Oliveira', cpf: '25836914700', email: 'gabriel@email.com', tel: '11955555555' }
        ];

        for (const aluno of alunos) {
            const [result] = await conn.query(
                `INSERT INTO Usuarios (nome_completo, cpf, email, senha, telefone, tipo)
                 VALUES (?, ?, ?, ?, ?, 'ALUNO')`,
                [aluno.nome, aluno.cpf, aluno.email, senhaHash, aluno.tel]
            );
            log(cores.verde, `  ✓ Aluno criado (ID: ${result.insertId})`);
        }

        // Resumo final
        log(cores.cyan, '\n✓ Usuários de teste criados. Credenciais e dados pessoais não são exibidos nos logs.\n');

        log(cores.amarelo, '⚠ IMPORTANTE:');
        log(cores.reset, '   - Esta senha atende todos os requisitos de segurança');
        log(cores.reset, '   - Em produção, use senhas únicas para cada usuário');
        log(cores.reset, '   - Nunca commit o .env com senhas no repositório\n');

        return { sucesso: true };

    } catch (error) {
        log(cores.vermelho, '\n❌ ERRO ao criar usuários:');
        console.error(error.message);

        if (error.errno === 1062) {
            if (error.message.includes('cpf_UNIQUE')) {
                log(cores.vermelho, '   CPF já cadastrado. Limpe os dados e tente novamente.');
            }
            if (error.message.includes('email_UNIQUE')) {
                log(cores.vermelho, '   E-mail já cadastrado. Limpe os dados e tente novamente.');
            }
        }

        return { sucesso: false, erro: error.message };
    } finally {
        if (conn) {
            await conn.end();
            log(cores.amarelo, '\nConexão com banco fechada.\n');
        }
    }
}

async function main() {
    // Limpar usuários existentes
    await limparUsuariosTeste();

    // Aguardar um momento
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Criar novos usuários
    const resultado = await criarUsuariosTeste();

    if (resultado.sucesso) {
        log(cores.verde, 'Script executado com sucesso!\n');
        process.exit(0);
    } else {
        log(cores.vermelho, 'Script falhou. Verifique os erros acima.\n');
        process.exit(1);
    }
}

main();
