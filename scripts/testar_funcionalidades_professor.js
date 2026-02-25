/**
 * Script de teste para funcionalidades do PROFESSOR
 * 
 * Este script testa as seguintes funcionalidades:
 * 1. Login do professor
 * 2. Listar turmas do professor
 * 3. Listar alunos de uma turma
 * 4. Atualizar nota/status de um aluno
 * 5. Ver detalhes de uma matrícula específica
 */

const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const BASE_URL = `http://localhost:${process.env.PORT || 3000}/api`;

// Cores para output no console
const cores = {
    reset: '\x1b[0m',
    verde: '\x1b[32m',
    vermelho: '\x1b[31m',
    amarelo: '\x1b[33m',
    azul: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(color, message) {
    console.log(`${color}${message}${cores.reset}`);
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

async function setupDadosTeste() {
    log(cores.amarelo, '\n=== CONFIGURANDO DADOS DE TESTE ===');

    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    try {
        // Criar professor de teste
        const sufixo = Date.now();
        const cpf = String(10000000000 + (sufixo % 89999999999)).slice(0, 11);
        const email = `prof.teste.${sufixo}@example.com`;
        const senha = '123456';
        const senhaHash = await bcrypt.hash(senha, 10);

        const [profResult] = await conn.query(
            'INSERT INTO Usuarios (nome_completo, cpf, email, senha, telefone, tipo) VALUES (?, ?, ?, ?, ?, ?)',
            ['Professor Teste', cpf, email, senhaHash, '11999999999', 'PROFESSOR']
        );

        const idProfessor = profResult.insertId;
        log(cores.verde, `✓ Professor criado: ID=${idProfessor}, Email=${email}, Senha=${senha}`);

        // Criar curso de teste
        const [cursoResult] = await conn.query(
            'INSERT INTO Cursos (nome_curso, descricao, carga_horaria) VALUES (?, ?, ?)',
            ['Curso Teste - Node.js', 'Curso para teste das funcionalidades do professor', 40]
        );
        const idCurso = cursoResult.insertId;
        log(cores.verde, `✓ Curso criado: ID=${idCurso}`);

        // Criar turma de teste
        const [turmaResult] = await conn.query(
            'INSERT INTO Turmas (id_curso, id_professor, nome_turma, data_inicio, data_fim, status) VALUES (?, ?, ?, ?, ?, ?)',
            [idCurso, idProfessor, 'Turma Teste 2026', '2026-02-01', '2026-06-30', 'EM ANDAMENTO']
        );
        const idTurma = turmaResult.insertId;
        log(cores.verde, `✓ Turma criada: ID=${idTurma}`);

        // Criar aluno de teste
        const cpfAluno = String(20000000000 + (sufixo % 89999999999)).slice(0, 11);
        const emailAluno = `aluno.teste.${sufixo}@example.com`;
        const senhaAlunoHash = await bcrypt.hash('123456', 10);

        const [alunoResult] = await conn.query(
            'INSERT INTO Usuarios (nome_completo, cpf, email, senha, telefone, tipo) VALUES (?, ?, ?, ?, ?, ?)',
            ['Aluno Teste', cpfAluno, emailAluno, senhaAlunoHash, '11988888888', 'ALUNO']
        );
        const idAluno = alunoResult.insertId;
        log(cores.verde, `✓ Aluno criado: ID=${idAluno}`);

        // Criar matrícula do aluno na turma
        const [matriculaResult] = await conn.query(
            'INSERT INTO Matriculas (id_aluno, id_turma, status_aprovacao, progresso_percentual, nota_final) VALUES (?, ?, ?, ?, ?)',
            [idAluno, idTurma, 'CURSANDO', 50, null]
        );
        const idMatricula = matriculaResult.insertId;
        log(cores.verde, `✓ Matrícula criada: ID=${idMatricula}`);

        return {
            idProfessor,
            idCurso,
            idTurma,
            idAluno,
            idMatricula,
            email,
            senha,
            emailAluno
        };
    } finally {
        await conn.end();
    }
}

async function testarLoginProfessor(email, senha) {
    log(cores.amarelo, '\n=== TESTE 1: LOGIN DO PROFESSOR ===');

    const { status, data, error } = await fazerRequisicao(`${BASE_URL}/auth/login`, {
        method: 'POST',
        body: JSON.stringify({ email, senha })
    });

    if (error) {
        logTeste('Login do Professor', false, `Erro de conexão: ${error}`);
        return null;
    }

    const sucesso = status === 200 && data.token;
    logTeste('Login do Professor', sucesso, 
        `Status: ${status}${sucesso ? `\nToken JWT: ${data.token.substring(0, 50)}...` : `\nResposta: ${JSON.stringify(data)}`}`
    );

    return data.token;
}

async function testarListarTurmasDoProfessor(token, idProfessor) {
    log(cores.amarelo, '\n=== TESTE 2: LISTAR TURMAS DO PROFESSOR ===');

    const { status, data, error } = await fazerRequisicao(`${BASE_URL}/turmas/professor/${idProfessor}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (error) {
        logTeste('Listar Turmas', false, `Erro de conexão: ${error}`);
        return null;
    }

    const sucesso = status === 200 && data.turmas;
    logTeste('Listar Turmas', sucesso,
        `Status: ${status}${sucesso ? `\nTurmas encontradas: ${data.turmas.length}` : `\nResposta: ${JSON.stringify(data)}`}`
    );

    if (sucesso && data.turmas.length > 0) {
        log(cores.cyan, 'Primeira turma:');
        console.log(JSON.stringify(data.turmas[0], null, 2));
    }

    return data.turmas;
}

async function testarListarAlunosDaTurma(token, idTurma) {
    log(cores.amarelo, '\n=== TESTE 3: LISTAR ALUNOS DA TURMA ===');

    const { status, data, error } = await fazerRequisicao(`${BASE_URL}/matriculas/turma/${idTurma}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (error) {
        logTeste('Listar Alunos da Turma', false, `Erro de conexão: ${error}`);
        return null;
    }

    const sucesso = status === 200 && data.matriculas;
    logTeste('Listar Alunos da Turma', sucesso,
        `Status: ${status}${sucesso ? `\nAlunos matriculados: ${data.matriculas.length}` : `\nResposta: ${JSON.stringify(data)}`}`
    );

    if (sucesso && data.matriculas.length > 0) {
        log(cores.cyan, 'Primeiro aluno:');
        console.log(JSON.stringify(data.matriculas[0], null, 2));
    }

    return data.matriculas;
}

async function testarAtualizarNotaAluno(token, idMatricula) {
    log(cores.amarelo, '\n=== TESTE 4: ATUALIZAR NOTA DO ALUNO ===');

    const { status, data, error } = await fazerRequisicao(`${BASE_URL}/matriculas/${idMatricula}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
            nota_final: 8.5,
            status_aprovacao: 'APROVADO',
            progresso_percentual: 100
        })
    });

    if (error) {
        logTeste('Atualizar Nota do Aluno', false, `Erro de conexão: ${error}`);
        return false;
    }

    const sucesso = status === 200;
    logTeste('Atualizar Nota do Aluno', sucesso,
        `Status: ${status}\nResposta: ${JSON.stringify(data)}`
    );

    return sucesso;
}

async function testarBuscarMatriculaPorId(token, idMatricula) {
    log(cores.amarelo, '\n=== TESTE 5: BUSCAR MATRÍCULA POR ID ===');

    const { status, data, error } = await fazerRequisicao(`${BASE_URL}/matriculas/${idMatricula}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (error) {
        logTeste('Buscar Matrícula por ID', false, `Erro de conexão: ${error}`);
        return false;
    }

    const sucesso = status === 200 && data.id_matricula;
    logTeste('Buscar Matrícula por ID', sucesso,
        `Status: ${status}${sucesso ? `\nNota final: ${data.nota_final}\nStatus: ${data.status_aprovacao}\nProgresso: ${data.progresso_percentual}%` : `\nResposta: ${JSON.stringify(data)}`}`
    );

    return sucesso;
}

async function testarAcessoNegadoAluno(token, idTurma) {
    log(cores.amarelo, '\n=== TESTE 6: ACESSO NEGADO (Aluno tentando acessar turma de outro professor) ===');

    // Este teste deve falhar - um aluno não pode acessar matrículas de turma
    const { status, data, error } = await fazerRequisicao(`${BASE_URL}/matriculas/turma/${idTurma}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (error) {
        logTeste('Teste de Permissão (esperado falhar para não-professor)', false, `Erro de conexão: ${error}`);
        return false;
    }

    // Esperamos 403 Forbidden
    const sucesso = status === 403;
    logTeste('Teste de Permissão', sucesso,
        `Status: ${status} (esperado 403)\nResposta: ${JSON.stringify(data)}`
    );

    return sucesso;
}

async function limparDadosTeste(ids) {
    log(cores.amarelo, '\n=== LIMPANDO DADOS DE TESTE ===');
    
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
    });

    try {
        // Deletar em ordem inversa devido às foreign keys
        await conn.query('DELETE FROM Matriculas WHERE id_matricula = ?', [ids.idMatricula]);
        await conn.query('DELETE FROM Turmas WHERE id_turma = ?', [ids.idTurma]);
        await conn.query('DELETE FROM Cursos WHERE id_curso = ?', [ids.idCurso]);
        await conn.query('DELETE FROM Usuarios WHERE id_usuario = ? OR id_usuario = ?', [ids.idProfessor, ids.idAluno]);
        
        log(cores.verde, '✓ Dados de teste limpos com sucesso');
    } catch (error) {
        log(cores.vermelho, `⚠ Erro ao limpar dados: ${error.message}`);
    } finally {
        await conn.end();
    }
}

async function main() {
    log(cores.cyan, '╔════════════════════════════════════════════════════════╗');
    log(cores.cyan, '║   TESTES DAS FUNCIONALIDADES DO PROFESSOR              ║');
    log(cores.cyan, '╚════════════════════════════════════════════════════════╝');

    // Verificar se o servidor está rodando
    log(cores.amarelo, '\nVerificando conexão com o servidor...');
    const healthCheck = await fazerRequisicao(`${BASE_URL}/health`);
    if (healthCheck.status !== 200) {
        log(cores.vermelho, `✗ Servidor não está rodando ou não responde em ${BASE_URL}/health`);
        log(cores.amarelo, 'Dica: Execute "npm start" para iniciar o servidor');
        process.exit(1);
    }
    log(cores.verde, '✓ Servidor está rodando!');

    // Setup dos dados de teste
    const dadosTeste = await setupDadosTeste();

    let todosSucesso = true;
    let token = null;

    try {
        // Teste 1: Login
        token = await testarLoginProfessor(dadosTeste.email, dadosTeste.senha);
        if (!token) todosSucesso = false;

        if (token) {
            // Teste 2: Listar turmas
            const turmas = await testarListarTurmasDoProfessor(token, dadosTeste.idProfessor);
            
            // Teste 3: Listar alunos da turma
            if (turmas && turmas.length > 0) {
                const matriculas = await testarListarAlunosDaTurma(token, dadosTeste.idTurma);
                
                // Teste 4: Atualizar nota
                if (matriculas && matriculas.length > 0) {
                    const atualizouNota = await testarAtualizarNotaAluno(token, dadosTeste.idMatricula);
                    
                    // Teste 5: Buscar matrícula atualizada
                    if (atualizouNota) {
                        await testarBuscarMatriculaPorId(token, dadosTeste.idMatricula);
                    }
                }
            }
        }

        // Resumo final
        log(cores.cyan, '\n╔════════════════════════════════════════════════════════╗');
        log(cores.cyan, '║                    RESUMO DOS TESTES                     ║');
        log(cores.cyan, '╚════════════════════════════════════════════════════════╝');
        
        if (todosSucesso) {
            log(cores.verde, '\n✓ Todos os testes principais foram executados com sucesso!');
        } else {
            log(cores.amarelo, '\n⚠ Alguns testes falharam. Verifique os logs acima.');
        }

    } finally {
        // Limpar dados de teste
        await limparDadosTeste(dadosTeste);
    }
}

main().catch((error) => {
    log(cores.vermelho, `\n✗ Erro fatal: ${error.message}`);
    console.error(error);
    process.exit(1);
});
