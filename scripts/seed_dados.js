/**
 * Script para popular o banco com dados de exemplo
 * Executa: node scripts/seed_dados.js
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

async function seed() {
    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        waitForConnections: true,
        connectionLimit: 5
    });

    console.log('Conectado ao banco de dados...\n');

    try {
        // 1. Criar Cursos
        console.log('Inserindo cursos...');
        const cursos = [
            {
                nome_curso: 'Desenvolvimento Web Full Stack',
                descricao: 'Aprenda HTML, CSS, JavaScript, Node.js, React e bancos de dados. Curso completo para se tornar um desenvolvedor web profissional.',
                carga_horaria: 120
            },
            {
                nome_curso: 'Python para Ciência de Dados',
                descricao: 'Domine Python, Pandas, NumPy, Matplotlib e Machine Learning. Ideal para quem quer trabalhar com análise de dados.',
                carga_horaria: 80
            },
            {
                nome_curso: 'UX/UI Design',
                descricao: 'Fundamentos de design de interfaces, prototipagem com Figma, pesquisa com usuários e design thinking.',
                carga_horaria: 60
            },
            {
                nome_curso: 'Marketing Digital',
                descricao: 'SEO, Google Ads, redes sociais, e-mail marketing e estratégias de crescimento para negócios digitais.',
                carga_horaria: 40
            },
            {
                nome_curso: 'Gestão de Projetos Ágeis',
                descricao: 'Scrum, Kanban, metodologias ágeis e ferramentas de gestão para liderar equipes de alta performance.',
                carga_horaria: 30
            }
        ];

        const cursoIds = [];
        for (const curso of cursos) {
            const [result] = await pool.query(
                'INSERT INTO Cursos (nome_curso, descricao, carga_horaria) VALUES (?, ?, ?)',
                [curso.nome_curso, curso.descricao, curso.carga_horaria]
            );
            cursoIds.push(result.insertId);
            console.log(`  + ${curso.nome_curso} (ID: ${result.insertId})`);
        }

        // 2. Criar Professores
        console.log('\nInserindo professores...');
        const senhaHash = await bcrypt.hash('123456', 10);

        const professores = [
            {
                nome_completo: 'Prof. Carlos Eduardo Silva',
                cpf: '11122233344',
                email: 'carlos.silva@plataforma.com',
                telefone: '11999887766',
                tipo: 'professor'
            },
            {
                nome_completo: 'Prof. Ana Beatriz Costa',
                cpf: '55566677788',
                email: 'ana.costa@plataforma.com',
                telefone: '11988776655',
                tipo: 'professor'
            },
            {
                nome_completo: 'Prof. Roberto Martins',
                cpf: '99988877766',
                email: 'roberto.martins@plataforma.com',
                telefone: '11977665544',
                tipo: 'professor'
            }
        ];

        const profIds = [];
        for (const prof of professores) {
            const [result] = await pool.query(
                'INSERT INTO Usuarios (nome_completo, cpf, email, senha, telefone, tipo) VALUES (?, ?, ?, ?, ?, ?)',
                [prof.nome_completo, prof.cpf, prof.email, senhaHash, prof.telefone, prof.tipo]
            );
            profIds.push(result.insertId);
            console.log(`  + ${prof.nome_completo} (ID: ${result.insertId})`);
        }

        // 3. Criar Alunos
        console.log('\nInserindo alunos...');
        const alunos = [
            { nome_completo: 'João Pedro Almeida', cpf: '12312312300', email: 'joao@email.com', telefone: '11911111111' },
            { nome_completo: 'Maria Clara Santos', cpf: '45645645600', email: 'maria@email.com', telefone: '11922222222' },
            { nome_completo: 'Lucas Ferreira Lima', cpf: '78978978900', email: 'lucas@email.com', telefone: '11933333333' },
            { nome_completo: 'Isabela Rodrigues', cpf: '14725836900', email: 'isabela@email.com', telefone: '11944444444' },
            { nome_completo: 'Gabriel Oliveira', cpf: '25836914700', email: 'gabriel@email.com', telefone: '11955555555' }
        ];

        const alunoIds = [];
        for (const aluno of alunos) {
            const [result] = await pool.query(
                'INSERT INTO Usuarios (nome_completo, cpf, email, senha, telefone, tipo) VALUES (?, ?, ?, ?, ?, ?)',
                [aluno.nome_completo, aluno.cpf, aluno.email, senhaHash, aluno.telefone, 'aluno']
            );
            alunoIds.push(result.insertId);
            console.log(`  + ${aluno.nome_completo} (ID: ${result.insertId})`);
        }

        // 4. Criar Turmas (status: ABERTA, EM ANDAMENTO, ENCERRADA, CANCELADA)
        console.log('\nInserindo turmas...');
        const turmas = [
            {
                nome_turma: 'Web Full Stack - Turma 2024.1',
                id_curso: cursoIds[0],
                id_professor: profIds[0],
                data_inicio: '2024-03-01',
                data_fim: '2024-07-30',
                status: 'EM ANDAMENTO'
            },
            {
                nome_turma: 'Web Full Stack - Turma 2024.2',
                id_curso: cursoIds[0],
                id_professor: profIds[0],
                data_inicio: '2024-08-01',
                data_fim: null,
                status: 'ABERTA'
            },
            {
                nome_turma: 'Python Data Science - Noturno',
                id_curso: cursoIds[1],
                id_professor: profIds[1],
                data_inicio: '2024-04-15',
                data_fim: '2024-08-15',
                status: 'EM ANDAMENTO'
            },
            {
                nome_turma: 'UX/UI Design - Intensivo',
                id_curso: cursoIds[2],
                id_professor: profIds[1],
                data_inicio: '2024-05-01',
                data_fim: '2024-06-30',
                status: 'ABERTA'
            },
            {
                nome_turma: 'Marketing Digital - Executivo',
                id_curso: cursoIds[3],
                id_professor: profIds[2],
                data_inicio: '2024-02-01',
                data_fim: '2024-03-15',
                status: 'ENCERRADA'
            },
            {
                nome_turma: 'Gestão Ágil - Certificação',
                id_curso: cursoIds[4],
                id_professor: profIds[2],
                data_inicio: '2024-06-01',
                data_fim: null,
                status: 'ABERTA'
            }
        ];

        const turmaIds = [];
        for (const turma of turmas) {
            const [result] = await pool.query(
                'INSERT INTO Turmas (nome_turma, id_curso, id_professor, data_inicio, data_fim, status) VALUES (?, ?, ?, ?, ?, ?)',
                [turma.nome_turma, turma.id_curso, turma.id_professor, turma.data_inicio, turma.data_fim, turma.status]
            );
            turmaIds.push(result.insertId);
            console.log(`  + ${turma.nome_turma} (ID: ${result.insertId})`);
        }

        // 5. Criar Matrículas (id_usuario, id_turma)
        console.log('\nInserindo matrículas...');
        const matriculas = [
            { id_usuario: alunoIds[0], id_turma: turmaIds[0], progresso: 75, nota: 8.5 },
            { id_usuario: alunoIds[1], id_turma: turmaIds[0], progresso: 60, nota: null },
            { id_usuario: alunoIds[2], id_turma: turmaIds[0], progresso: 90, nota: 9.2 },
            { id_usuario: alunoIds[0], id_turma: turmaIds[2], progresso: 45, nota: null },
            { id_usuario: alunoIds[3], id_turma: turmaIds[2], progresso: 30, nota: null },
            { id_usuario: alunoIds[4], id_turma: turmaIds[3], progresso: 10, nota: null },
            { id_usuario: alunoIds[1], id_turma: turmaIds[4], progresso: 100, nota: 7.8, status: 'APROVADO' },
            { id_usuario: alunoIds[2], id_turma: turmaIds[4], progresso: 100, nota: 9.0, status: 'APROVADO' }
        ];

        for (const mat of matriculas) {
            await pool.query(
                'INSERT INTO Matriculas (id_usuario, id_turma, progresso_percentual, nota_final, status_aprovacao) VALUES (?, ?, ?, ?, ?)',
                [mat.id_usuario, mat.id_turma, mat.progresso, mat.nota, mat.status || 'CURSANDO']
            );
        }
        console.log(`  + ${matriculas.length} matrículas criadas`);

        // Resumo
        console.log('\n========================================');
        console.log('DADOS INSERIDOS COM SUCESSO!');
        console.log('========================================');
        console.log(`Cursos: ${cursos.length}`);
        console.log(`Professores: ${professores.length}`);
        console.log(`Alunos: ${alunos.length}`);
        console.log(`Turmas: ${turmas.length}`);
        console.log(`Matrículas: ${matriculas.length}`);
        console.log('\nCredenciais de acesso (senha: 123456):');
        console.log('  - carlos.silva@plataforma.com (professor)');
        console.log('  - ana.costa@plataforma.com (professor)');
        console.log('  - joao@email.com (aluno)');
        console.log('  - maria@email.com (aluno)');
        console.log('========================================\n');

    } catch (error) {
        console.error('Erro ao inserir dados:', error.message);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

seed();
