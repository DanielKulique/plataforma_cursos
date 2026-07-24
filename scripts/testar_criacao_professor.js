/**
 * Script para testar criação de usuário PROFESSOR via API
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { assertDevelopmentDatabase } = require('./test_database_safety');
assertDevelopmentDatabase(process.env);
const TEST_ACCOUNT_PASSWORD = process.env.CANONICAL_SEED_PASSWORD;
if (!TEST_ACCOUNT_PASSWORD || String(TEST_ACCOUNT_PASSWORD).length < 8) {
    throw new Error('Defina CANONICAL_SEED_PASSWORD com ao menos 8 caracteres antes de executar este script.');
}

const BASE_URL = `http://localhost:${process.env.PORT || 3000}/api`;

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

async function testarCriacaoProfessor() {
    console.log('=== TESTE: Criação de Usuário PROFESSOR ===\n');

    const sufixo = Date.now();
    const cpf = String(30000000000 + (sufixo % 89999999999)).slice(0, 11);
    const email = `prof.cadastro.${sufixo}@example.com`;

    console.log('Payload de teste preparado (dados pessoais omitidos do log).');
    console.log('  Tipo: PROFESSOR\n');

    const { status, data, error } = await fazerRequisicao(`${BASE_URL}/usuarios`, {
        method: 'POST',
        body: JSON.stringify({
            nome_completo: 'Professor Cadastro Teste',
            cpf: cpf,
            email: email,
            senha: TEST_ACCOUNT_PASSWORD,
            telefone: '11999999999',
            tipo: 'PROFESSOR'
        })
    });

    if (error) {
        console.log(`❌ ERRO DE CONEXÃO: ${error}`);
        console.log('\nVerifique se o servidor está rodando (npm start)');
        return false;
    }

    console.log(`Status HTTP: ${status}`);

    if (status === 201 && data.id_usuario) {
        console.log('✅ SUCESSO! Usuário PROFESSOR criado com sucesso!');
        console.log(`   ID: ${data.id_usuario}`);
        console.log(`   Tipo: ${data.tipo}`);
        return true;
    } else if (status === 400) {
        console.log('❌ VALIDAÇÃO: Erro na validação dos dados');
        return false;
    } else if (status === 409) {
        console.log('❌ CONFLITO: CPF ou E-mail já cadastrado');
        return false;
    } else {
        console.log('❌ FALHA: Erro ao criar usuário');
        return false;
    }
}

async function testarCriacaoAluno() {
    console.log('\n=== TESTE: Criação de Usuário ALUNO (padrão) ===\n');

    const sufixo = Date.now() + 1;
    const cpf = String(40000000000 + (sufixo % 89999999999)).slice(0, 11);
    const email = `aluno.cadastro.${sufixo}@example.com`;

    console.log('Payload de teste preparado sem papel explícito (dados pessoais omitidos do log).\n');

    const { status, data, error } = await fazerRequisicao(`${BASE_URL}/usuarios`, {
        method: 'POST',
        body: JSON.stringify({
            nome_completo: 'Aluno Cadastro Teste',
            cpf: cpf,
            email: email,
            senha: TEST_ACCOUNT_PASSWORD,
            telefone: '11988888888'
            // tipo não especificado - deve ser ALUNO por padrão
        })
    });

    if (error) {
        console.log(`❌ ERRO DE CONEXÃO: ${error}`);
        return false;
    }

    console.log(`Status HTTP: ${status}`);

    if (status === 201 && data.id_usuario && data.tipo === 'ALUNO') {
        console.log('✅ SUCESSO! Usuário ALUNO criado com sucesso!');
        console.log(`   ID: ${data.id_usuario}`);
        console.log(`   Tipo: ${data.tipo}`);
        return true;
    } else {
        console.log('❌ FALHA: Erro ao criar usuário ALUNO');
        return false;
    }
}

async function testarTipoInvalido() {
    console.log('\n=== TESTE: Tipo Inválido ===\n');

    const sufixo = Date.now() + 2;
    const cpf = String(50000000000 + (sufixo % 89999999999)).slice(0, 11);
    const email = `invalido.cadastro.${sufixo}@example.com`;

    console.log('Dados do usuário (tipo inválido - deve falhar):');
    console.log(`  Tipo: INVALIDO\n`);

    const { status, data, error } = await fazerRequisicao(`${BASE_URL}/usuarios`, {
        method: 'POST',
        body: JSON.stringify({
            nome_completo: 'Usuário Inválido Teste',
            cpf: cpf,
            email: email,
            senha: TEST_ACCOUNT_PASSWORD,
            tipo: 'INVALIDO'
        })
    });

    if (error) {
        console.log(`❌ ERRO DE CONEXÃO: ${error}`);
        return false;
    }

    console.log(`Status HTTP: ${status}`);

    if (status === 400) {
        console.log('✅ SUCESSO! Validação funcionou - tipo inválido rejeitado');
        return true;
    } else {
        console.log('❌ FALHA: Tipo inválido deveria ser rejeitado');
        return false;
    }
}

async function main() {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║   TESTES - CRIAÇÃO DE USUÁRIOS COM TIPO                ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    // Verificar se o servidor está rodando (usando endpoint que retorna mesmo com 401)
    console.log('Verificando conexão com o servidor...');
    const healthCheck = await fazerRequisicao(`${BASE_URL}/health`);
    if (healthCheck.status === 0) {
        console.log('✗ Servidor não está rodando ou não responde');
        console.log('Dica: Execute "npm start" para iniciar o servidor\n');
        process.exit(1);
    }
    console.log('✓ Servidor está rodando! (Status:', healthCheck.status, ')\n');

    let resultados = [];

    // Teste 1: Criar PROFESSOR
    resultados.push(await testarCriacaoProfessor());

    // Teste 2: Criar ALUNO (padrão)
    resultados.push(await testarCriacaoAluno());

    // Teste 3: Tipo inválido
    resultados.push(await testarTipoInvalido());

    // Resumo
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║                    RESUMO                              ║');
    console.log('╚════════════════════════════════════════════════════════╝');

    const total = resultados.length;
    const sucesso = resultados.filter(r => r).length;

    console.log(`\nTestes executados: ${total}`);
    console.log(`Sucessos: ${sucesso}`);
    console.log(`Falhas: ${total - sucesso}`);

    if (sucesso === total) {
        console.log('\n✅ Todos os testes passaram!');
    } else {
        console.log('\n⚠ Alguns testes falharam.');
    }
}

main().catch((error) => {
    console.error('\n❌ Erro fatal:', error);
    process.exit(1);
});
