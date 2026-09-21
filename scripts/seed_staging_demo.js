'use strict';

const path = require('path');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');
const { assertCanonicalSchema } = require('./schema_contract');
const { assertDatabaseConnectionEnvironment, describeDatabaseTarget } = require('../src/config/database-connection');
const { assertDatabaseIdentity } = require('../src/config/database-identity');

dotenv.config({ path: path.join(__dirname, '..', '.env'), override: false, quiet: true });

const CONFIRMATION = 'I_UNDERSTAND_STAGING_DEMO';
const ALTERNATE_PROFESSOR_EMAIL = 'professor.alheio.demo@example.test';

function required(env, key) {
    const value = String(env[key] || '').trim();
    if (!value) throw new Error(`Variável obrigatória ausente: ${key}`);
    return value;
}

function assertStagingTarget(env = process.env) {
    if (env.NODE_ENV !== 'production' || env.APP_ENV !== 'staging') {
        throw new Error('O seed de demonstração exige NODE_ENV=production e APP_ENV=staging.');
    }
    if (env.ALLOW_STAGING_DEMO_SEED !== CONFIRMATION) {
        throw new Error(`Defina ALLOW_STAGING_DEMO_SEED=${CONFIRMATION}.`);
    }
    const database = required(env, 'DB_NAME');
    if (!/(staging|demo)/i.test(database)) {
        throw new Error('DB_NAME deve identificar explicitamente staging ou demo.');
    }
    return database;
}

async function upsert(connection, sql, params) {
    const [result] = await connection.query(sql, params);
    return Number(result.insertId);
}

async function upsertUser(connection, user, hash) {
    const id = await upsert(connection,
        `INSERT INTO Usuarios (nome_completo, cpf, email, senha, telefone, tipo)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id_usuario = LAST_INSERT_ID(id_usuario),
           nome_completo = VALUES(nome_completo), senha = VALUES(senha),
           telefone = VALUES(telefone), tipo = VALUES(tipo)`,
        [user.name, user.cpf, user.email, hash, user.phone, user.role]);
    await connection.query(
        `INSERT INTO EmailVerificacoes (email, codigo, verificado, expira_em)
         VALUES (?, '000000', 1, DATE_ADD(NOW(), INTERVAL 1 YEAR))
         ON DUPLICATE KEY UPDATE verificado = 1, expira_em = VALUES(expira_em)`,
        [user.email]);
    return id;
}

async function upsertContent(connection, classId, moduleId, content) {
    return upsert(connection,
        `INSERT INTO Conteudos
         (id_turma, id_modulo, titulo, descricao, tipo, url, corpo, duracao_minutos, ordem)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id_conteudo = LAST_INSERT_ID(id_conteudo),
           id_modulo = VALUES(id_modulo), titulo = VALUES(titulo), descricao = VALUES(descricao),
           tipo = VALUES(tipo), url = VALUES(url), corpo = VALUES(corpo),
           duracao_minutos = VALUES(duracao_minutos)`,
        [classId, moduleId, content.title, content.description, content.type,
            content.url || null, content.body || null, content.duration, content.order]);
}

async function upsertQuestionnaire(connection, courseId, classId, questionnaire) {
    const questionnaireId = await upsert(connection,
        `INSERT INTO Questionarios (id_curso, id_turma, titulo, descricao, ativo, tipo)
         VALUES (?, ?, ?, ?, 1, ?)
         ON DUPLICATE KEY UPDATE id_questionario = LAST_INSERT_ID(id_questionario),
           descricao = VALUES(descricao), ativo = 1`,
        [courseId, classId, questionnaire.title, questionnaire.description, questionnaire.type]);

    for (const question of questionnaire.questions) {
        const questionId = await upsert(connection,
            `INSERT INTO Q_Perguntas
             (id_questionario, texto_pergunta, tipo_pergunta, ordem, pontos)
             VALUES (?, ?, 'MULTIPLA_ESCOLHA', ?, ?)
             ON DUPLICATE KEY UPDATE id_pergunta = LAST_INSERT_ID(id_pergunta),
               texto_pergunta = VALUES(texto_pergunta), pontos = VALUES(pontos)`,
            [questionnaireId, question.text, question.order, question.points]);
        for (const [index, option] of question.options.entries()) {
            await connection.query(
                `INSERT INTO Q_Opcoes (id_pergunta, texto_opcao, ordem, correta)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE texto_opcao = VALUES(texto_opcao), correta = VALUES(correta)`,
                [questionId, option.text, index + 1, option.correct ? 1 : 0]);
        }
    }
}

async function seedStagingDemo(env = process.env) {
    const database = assertStagingTarget(env);
    const target = assertDatabaseConnectionEnvironment(env);
    const password = required(env, 'STAGING_DEMO_PASSWORD');
    if (password.length < 12 || !/[A-Z]/.test(password) || !/[a-z]/.test(password)
        || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
        throw new Error('STAGING_DEMO_PASSWORD deve ter 12+ caracteres, maiúscula, minúscula, número e símbolo.');
    }

    const connection = await mysql.createConnection({
        host: target.host,
        port: target.port,
        user: target.user,
        password: target.password,
        database
    });
    try {
        await assertDatabaseIdentity(connection, target);
        await assertCanonicalSchema(connection, database);
        const hash = await bcrypt.hash(password, 12);
        await connection.beginTransaction();

        const professorId = await upsertUser(connection, {
            name: 'Professora Demo', cpf: '91000000101', email: 'professor.demo@example.test',
            phone: '41910000101', role: 'PROFESSOR'
        }, hash);
        const alternateProfessorId = await upsertUser(connection, {
            name: 'Professor Alheio Demo', cpf: '91000000104', email: ALTERNATE_PROFESSOR_EMAIL,
            phone: '41910000104', role: 'PROFESSOR'
        }, hash);
        const studentId = await upsertUser(connection, {
            name: 'Aluno Demo', cpf: '91000000102', email: 'aluno.demo@example.test',
            phone: '41910000102', role: 'ALUNO'
        }, hash);
        await upsertUser(connection, {
            name: 'Aluno Sem Matrícula Demo', cpf: '91000000103', email: 'sem.matricula.demo@example.test',
            phone: '41910000103', role: 'ALUNO'
        }, hash);

        const courseId = await upsert(connection,
            `INSERT INTO Cursos (nome_curso, descricao, carga_horaria)
             VALUES ('Integridade Acadêmica — Demonstração',
               'Curso fictício para apresentação segura do ambiente de staging.', 12)
             ON DUPLICATE KEY UPDATE id_curso = LAST_INSERT_ID(id_curso),
               descricao = VALUES(descricao), carga_horaria = VALUES(carga_horaria)`, []);
        const classId = await upsert(connection,
            `INSERT INTO Turmas
             (id_curso, id_professor, nome_turma, data_inicio, data_fim, status)
             VALUES (?, ?, 'Turma Demo Staging', CURRENT_DATE,
               DATE_ADD(CURRENT_DATE, INTERVAL 120 DAY), 'ABERTA')
             ON DUPLICATE KEY UPDATE id_turma = LAST_INSERT_ID(id_turma),
               id_curso = VALUES(id_curso), id_professor = VALUES(id_professor),
               data_inicio = VALUES(data_inicio), data_fim = VALUES(data_fim), status = 'ABERTA'`,
            [courseId, professorId]);
        const closedClassId = await upsert(connection,
            `INSERT INTO Turmas
             (id_curso, id_professor, nome_turma, data_inicio, data_fim, status)
             VALUES (?, ?, 'Turma Demo Fechada', CURRENT_DATE,
               DATE_ADD(CURRENT_DATE, INTERVAL 120 DAY), 'FECHADA')
             ON DUPLICATE KEY UPDATE id_turma = LAST_INSERT_ID(id_turma),
               id_curso = VALUES(id_curso), id_professor = VALUES(id_professor),
               data_inicio = VALUES(data_inicio), data_fim = VALUES(data_fim), status = 'FECHADA'`,
            [courseId, professorId]);
        const endedClassId = await upsert(connection,
            `INSERT INTO Turmas
             (id_curso, id_professor, nome_turma, data_inicio, data_fim, status)
             VALUES (?, ?, 'Turma Demo Encerrada', CURRENT_DATE,
               DATE_ADD(CURRENT_DATE, INTERVAL 120 DAY), 'ENCERRADA')
             ON DUPLICATE KEY UPDATE id_turma = LAST_INSERT_ID(id_turma),
               id_curso = VALUES(id_curso), id_professor = VALUES(id_professor),
               data_inicio = VALUES(data_inicio), data_fim = VALUES(data_fim), status = 'ENCERRADA'`,
            [courseId, professorId]);
        await connection.query(
            `INSERT INTO Matriculas (id_aluno, id_turma, status_aprovacao, progresso_percentual)
             VALUES (?, ?, 'CURSANDO', 0)
             ON DUPLICATE KEY UPDATE status_aprovacao = 'CURSANDO'`,
            [studentId, classId]);

        const moduleId = await upsert(connection,
            `INSERT INTO Modulos (id_turma, titulo, descricao, ordem)
             VALUES (?, 'Módulo demonstrativo', 'Conteúdos fictícios para a apresentação.', 1)
             ON DUPLICATE KEY UPDATE id_modulo = LAST_INSERT_ID(id_modulo),
               titulo = VALUES(titulo), descricao = VALUES(descricao)`, [classId]);

        const contents = [
            { order: 1, title: 'Boas-vindas', description: 'Introdução ao roteiro.', type: 'TEXTO',
                body: 'Este ambiente contém somente dados fictícios para demonstração.', duration: 3 },
            { order: 2, title: 'Guia fictício de integridade', description: 'PDF protegido de demonstração.',
                type: 'PDF', url: '/assets/materiais/guia-integridade-academica.pdf', duration: 10 },
            { order: 3, title: 'Vídeo introdutório', description: 'Vídeo público incorporado do YouTube.',
                type: 'VIDEO', url: 'https://www.youtube.com/embed/M7lc1UVf-VE', duration: 5 },
            { order: 4, title: 'Referência complementar', description: 'Link público de referência.',
                type: 'LINK', url: 'https://www.utfpr.edu.br/', duration: 5 },
            { order: 5, title: 'Atividade de reflexão', description: 'Atividade fictícia sem dados pessoais.',
                type: 'ATIVIDADE', body: 'Registre três práticas que favorecem a integridade acadêmica.', duration: 15 }
        ];
        for (const content of contents) await upsertContent(connection, classId, moduleId, content);
        await connection.query(
            `INSERT INTO ConteudosProgresso
             (id_aluno, id_conteudo, status, concluido_em)
             SELECT ?, id_conteudo, 'CONCLUIDO', NOW()
             FROM Conteudos
             WHERE id_turma = ?
             ON DUPLICATE KEY UPDATE status = 'CONCLUIDO', concluido_em = VALUES(concluido_em)`,
            [studentId, classId]
        );
        await connection.query(
            `UPDATE Matriculas
             SET progresso_percentual = 100, nota_final = 8.5, status_aprovacao = 'APROVADO'
             WHERE id_aluno = ? AND id_turma = ?`,
            [studentId, classId]
        );

        const questions = [
            { order: 1, points: 1, text: 'Ao utilizar uma ideia de outra pessoa, o que fazer?', options: [
                { text: 'Citar a fonte adequadamente', correct: true },
                { text: 'Ocultar a origem', correct: false },
                { text: 'Trocar poucas palavras sem citar', correct: false }
            ] },
            { order: 2, points: 1, text: 'Qual dado ajuda a avaliar a atualidade de uma fonte?', options: [
                { text: 'A data de publicação', correct: true },
                { text: 'A cor da página', correct: false },
                { text: 'O tamanho do título', correct: false }
            ] }
        ];
        await upsertQuestionnaire(connection, courseId, classId, {
            title: 'Questionário demonstrativo', description: 'Exercício fictício.', type: 'EXERCICIO', questions
        });
        await upsertQuestionnaire(connection, courseId, classId, {
            title: 'Prova demonstrativa', description: 'Prova fictícia para validar a jornada.', type: 'PROVA', questions
        });

        await connection.commit();
        return {
            courseId,
            classId,
            closedClassId,
            endedClassId,
            professorId,
            alternateProfessorId,
            studentId,
            contents: contents.length
        };
    } catch (error) {
        await connection.rollback().catch(() => undefined);
        throw error;
    } finally {
        await connection.end();
    }
}

if (require.main === module) {
    console.log(JSON.stringify(describeDatabaseTarget(process.env), null, 2));
    seedStagingDemo()
        .then((result) => console.log(
            `Seed de staging aplicado: curso ${result.courseId}, turma ${result.classId}, ${result.contents} conteúdos.`
        ))
        .catch((error) => {
            console.error(`Falha no seed de staging: ${error.message}`);
            process.exitCode = 1;
        });
}

module.exports = {
    ALTERNATE_PROFESSOR_EMAIL,
    CONFIRMATION,
    assertStagingTarget,
    seedStagingDemo
};
