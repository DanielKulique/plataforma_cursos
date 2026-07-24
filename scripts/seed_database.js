'use strict';

const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const { assertDevelopmentDatabase, assertTestDatabaseIsDisposable } = require('./test_database_safety');
const { assertCanonicalSchema } = require('./schema_contract');
const { loadEnvironment } = require('../src/config/loadEnvironment');

const mode = process.argv[2];
if (!['dev', 'test'].includes(mode)) throw new Error('Uso: node scripts/seed_database.js <dev|test>');

const root = path.join(__dirname, '..');
const envFile = mode === 'test' ? '.env.test' : '.env';
loadEnvironment(mode, root);

const database = mode === 'test'
    ? assertTestDatabaseIsDisposable(process.env)
    : assertDevelopmentDatabase(process.env);
const seedPassword = mode === 'test'
    ? process.env.TEST_SEED_PASSWORD
    : process.env.CANONICAL_SEED_PASSWORD;

if (!seedPassword || String(seedPassword).length < 8) {
    const variable = mode === 'test' ? 'TEST_SEED_PASSWORD' : 'CANONICAL_SEED_PASSWORD';
    throw new Error(`Defina ${variable} com ao menos 8 caracteres para o seed de ${mode === 'test' ? 'teste' : 'desenvolvimento'}.`);
}

const config = {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database
};

async function upsertUser(connection, user, passwordHash) {
    const [result] = await connection.query(
        `INSERT INTO Usuarios (nome_completo, cpf, email, senha, telefone, tipo)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            id_usuario = LAST_INSERT_ID(id_usuario), nome_completo = VALUES(nome_completo),
            senha = VALUES(senha), telefone = VALUES(telefone), tipo = VALUES(tipo)`,
        [user.name, user.cpf, user.email, passwordHash, user.phone, user.role]
    );
    return result.insertId;
}

async function upsertCourse(connection) {
    const [result] = await connection.query(
        `INSERT INTO Cursos (nome_curso, descricao, carga_horaria)
         VALUES ('Fundamentos de Desenvolvimento Web', 'Curso canônico para validação local.', 40)
         ON DUPLICATE KEY UPDATE id_curso = LAST_INSERT_ID(id_curso),
            descricao = VALUES(descricao), carga_horaria = VALUES(carga_horaria)`
    );
    return result.insertId;
}

async function upsertClass(connection, values) {
    const [result] = await connection.query(
        `INSERT INTO Turmas (id_curso, id_professor, nome_turma, data_inicio, data_fim, status)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id_turma = LAST_INSERT_ID(id_turma),
            id_curso = VALUES(id_curso), id_professor = VALUES(id_professor),
            data_inicio = VALUES(data_inicio), data_fim = VALUES(data_fim), status = VALUES(status)`,
        [values.courseId, values.professorId, values.name, values.start, values.end, values.status]
    );
    return result.insertId;
}

async function seedDatabase() {
    if (!config.user || config.password === undefined) {
        throw new Error(`Configure DB_USER e DB_PASSWORD em ${envFile} antes de executar o seed.`);
    }

    const connection = await mysql.createConnection(config);
    try {
        await assertCanonicalSchema(connection, database);
        const passwordHash = await bcrypt.hash(seedPassword, 10);
        await connection.beginTransaction();

        const users = [
            { key: 'admin', name: 'Admin Canônico', cpf: '90000000001', email: 'admin.canonico@example.test', phone: '11900000001', role: 'ADMIN' },
            { key: 'professor', name: 'Professor Canônico', cpf: '90000000002', email: 'professor.canonico@example.test', phone: '11900000002', role: 'PROFESSOR' },
            { key: 'alunoMatriculado', name: 'Aluno Matriculado', cpf: '90000000003', email: 'aluno.matriculado@example.test', phone: '11900000003', role: 'ALUNO' },
            { key: 'alunoDisponivel', name: 'Aluno Disponível', cpf: '90000000004', email: 'aluno.disponivel@example.test', phone: '11900000004', role: 'ALUNO' }
        ];
        const userIds = {};
        for (const user of users) {
            userIds[user.key] = await upsertUser(connection, user, passwordHash);
            await connection.query(
                `INSERT INTO EmailVerificacoes (email, codigo, verificado, expira_em)
                 VALUES (?, '000000', 1, DATE_ADD(NOW(), INTERVAL 1 YEAR))
                 ON DUPLICATE KEY UPDATE codigo = VALUES(codigo), verificado = 1, expira_em = VALUES(expira_em)`,
                [user.email]
            );
        }

        const courseId = await upsertCourse(connection);
        const openClassId = await upsertClass(connection, {
            courseId, professorId: userIds.professor, name: 'Web Canônica - Inscrições',
            start: '2026-08-01', end: '2026-10-31', status: 'ABERTA'
        });
        await upsertClass(connection, {
            courseId, professorId: userIds.professor, name: 'Web Canônica - Fechada',
            start: '2026-05-01', end: '2026-07-31', status: 'FECHADA'
        });
        await upsertClass(connection, {
            courseId, professorId: userIds.professor, name: 'Web Canônica - Encerrada',
            start: '2025-08-01', end: '2025-10-31', status: 'ENCERRADA'
        });

        await connection.query(
            `INSERT INTO Matriculas (id_aluno, id_turma, status_aprovacao, progresso_percentual, nota_final)
             VALUES (?, ?, 'CURSANDO', 0, NULL)
             ON DUPLICATE KEY UPDATE status_aprovacao = VALUES(status_aprovacao),
                progresso_percentual = VALUES(progresso_percentual), nota_final = VALUES(nota_final)`,
            [userIds.alunoMatriculado, openClassId]
        );

        const [moduleResult] = await connection.query(
            `INSERT INTO Modulos (id_turma, titulo, descricao, ordem)
             VALUES (?, 'Introdução', 'Módulo canônico inicial.', 1)
             ON DUPLICATE KEY UPDATE id_modulo = LAST_INSERT_ID(id_modulo),
                titulo = VALUES(titulo), descricao = VALUES(descricao)`,
            [openClassId]
        );
        await connection.query(
            `INSERT INTO Conteudos (id_turma, id_modulo, titulo, descricao, tipo, corpo, ordem)
             VALUES (?, ?, 'Boas-vindas', 'Conteúdo inicial do ambiente local.', 'TEXTO', 'Bem-vindo à turma canônica.', 1)
             ON DUPLICATE KEY UPDATE id_modulo = VALUES(id_modulo), titulo = VALUES(titulo),
                descricao = VALUES(descricao), tipo = VALUES(tipo), corpo = VALUES(corpo)`,
            [openClassId, moduleResult.insertId]
        );

        const [questionnaireResult] = await connection.query(
            `INSERT INTO Questionarios (id_curso, id_turma, titulo, descricao, ativo, tipo)
             VALUES (?, ?, 'Diagnóstico inicial', 'Questionário canônico.', 1, 'EXERCICIO')
             ON DUPLICATE KEY UPDATE id_questionario = LAST_INSERT_ID(id_questionario),
                descricao = VALUES(descricao), ativo = VALUES(ativo)`,
            [courseId, openClassId]
        );
        const [questionResult] = await connection.query(
            `INSERT INTO Q_Perguntas (id_questionario, texto_pergunta, tipo_pergunta, ordem, pontos)
             VALUES (?, 'Qual status permite uma nova matrícula?', 'MULTIPLA_ESCOLHA', 1, 1)
             ON DUPLICATE KEY UPDATE id_pergunta = LAST_INSERT_ID(id_pergunta),
                texto_pergunta = VALUES(texto_pergunta), tipo_pergunta = VALUES(tipo_pergunta), pontos = VALUES(pontos)`,
            [questionnaireResult.insertId]
        );
        for (const [text, order, correct] of [['ABERTA', 1, 1], ['FECHADA', 2, 0], ['ENCERRADA', 3, 0]]) {
            await connection.query(
                `INSERT INTO Q_Opcoes (id_pergunta, texto_opcao, ordem, correta)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE texto_opcao = VALUES(texto_opcao), correta = VALUES(correta)`,
                [questionResult.insertId, text, order, correct]
            );
        }

        await connection.commit();
        console.log(`Seed canônico aplicado de forma transacional em ${database}.`);
    } catch (error) {
        await connection.rollback().catch(() => undefined);
        throw error;
    } finally {
        await connection.end();
    }
}

seedDatabase().catch((error) => {
    console.error(`Falha no seed de ${database}: ${error.message}`);
    process.exitCode = 1;
});
