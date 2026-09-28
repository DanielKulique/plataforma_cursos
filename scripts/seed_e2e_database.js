'use strict';

// Deterministic fixture for the isolated Playwright Compose project only.
// The disposable project/database is removed by scripts/run_e2e.js after use.
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const { assertDatabaseConnectionEnvironment } = require('../src/config/database-connection');
const { assertDatabaseIdentity } = require('../src/config/database-identity');

async function seed() {
    const target = assertDatabaseConnectionEnvironment(process.env);
    if (process.env.NODE_ENV !== 'test' || target.database !== 'plataforma_cursos_test'
        || process.env.E2E_RUN !== '1') {
        throw new Error('E2E seed recusado fora do banco de teste isolado.');
    }
    const password = process.env.TEST_SEED_PASSWORD;
    if (!password || password.length < 12) throw new Error('TEST_SEED_PASSWORD E2E inválida.');

    const connection = await mysql.createConnection({
        host: target.host, port: target.port, user: target.user, password: target.password,
        database: target.database
    });
    try {
        await assertDatabaseIdentity(connection, target);
        await connection.beginTransaction();
        const hash = await bcrypt.hash(password, 10);
        const users = [
            ['Admin E2E', '90000001001', 'admin.e2e@example.test', 'ADMIN'],
            ['Professor E2E', '90000001002', 'professor.e2e@example.test', 'PROFESSOR'],
            ['Aluno E2E', '90000001003', 'aluno.e2e@example.test', 'ALUNO'],
            ['Aluno 2 E2E', '90000001004', 'aluno2.e2e@example.test', 'ALUNO']
        ];
        const userIds = {};
        for (const [name, cpf, email, role] of users) {
            await connection.execute(
                `INSERT INTO Usuarios (nome_completo, cpf, email, senha, tipo)
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE id_usuario = LAST_INSERT_ID(id_usuario),
                    nome_completo = VALUES(nome_completo), senha = VALUES(senha), tipo = VALUES(tipo)`,
                [name, cpf, email, hash, role]
            );
            const [[user]] = await connection.execute('SELECT id_usuario FROM Usuarios WHERE email = ?', [email]);
            userIds[role === 'ALUNO' ? (email.startsWith('aluno2') ? 'student2' : 'student') : role.toLowerCase()] = Number(user.id_usuario);
            await connection.execute(
                `INSERT INTO EmailVerificacoes (email, codigo, verificado, expira_em)
                 VALUES (?, '000000', 1, DATE_ADD(NOW(), INTERVAL 1 YEAR))
                 ON DUPLICATE KEY UPDATE codigo = VALUES(codigo), verificado = 1, expira_em = VALUES(expira_em)`,
                [email]
            );
        }

        await connection.execute(
            `INSERT INTO Cursos (nome_curso, descricao, carga_horaria)
             VALUES ('Curso E2E', 'Curso determinístico do ambiente descartável.', 4)
             ON DUPLICATE KEY UPDATE id_curso = LAST_INSERT_ID(id_curso), descricao = VALUES(descricao)`
        );
        const [[course]] = await connection.execute("SELECT id_curso FROM Cursos WHERE nome_curso = 'Curso E2E'");
        const courseId = Number(course.id_curso);

        const classIds = {};
        for (const [name, status, start, end] of [
            ['Turma E2E Aberta', 'ABERTA', '2026-09-01', '2026-12-31'],
            ['Turma E2E Fechada', 'FECHADA', '2026-06-01', '2026-08-31'],
            ['Turma E2E Encerrada', 'ENCERRADA', '2025-01-01', '2025-12-31']
        ]) {
            await connection.execute(
                `INSERT INTO Turmas (id_curso, id_professor, nome_turma, data_inicio, data_fim, status)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE id_turma = LAST_INSERT_ID(id_turma), id_curso = VALUES(id_curso),
                    id_professor = VALUES(id_professor), data_inicio = VALUES(data_inicio),
                    data_fim = VALUES(data_fim), status = VALUES(status)`,
                [courseId, userIds.professor, name, start, end, status]
            );
            const [[row]] = await connection.execute('SELECT id_turma FROM Turmas WHERE nome_turma = ?', [name]);
            classIds[name] = Number(row.id_turma);
        }
        const openClassId = classIds['Turma E2E Aberta'];
        for (const studentId of [userIds.student, userIds.student2]) {
            await connection.execute(
                `INSERT INTO Matriculas (id_aluno, id_turma, status_aprovacao, progresso_percentual)
                 VALUES (?, ?, 'CURSANDO', 0)
                 ON DUPLICATE KEY UPDATE status_aprovacao = 'CURSANDO', progresso_percentual = 0`,
                [studentId, openClassId]
            );
        }

        await connection.execute(
            `INSERT INTO Modulos (id_turma, titulo, descricao, ordem)
             VALUES (?, 'Módulo E2E', 'Estrutura acadêmica determinística.', 1)
             ON DUPLICATE KEY UPDATE id_modulo = LAST_INSERT_ID(id_modulo), descricao = VALUES(descricao)` ,
            [openClassId]
        );
        const [[module]] = await connection.execute('SELECT id_modulo FROM Modulos WHERE id_turma = ? AND ordem = 1', [openClassId]);
        const moduleId = Number(module.id_modulo);
        for (const [title, kind, body, url, order] of [
            ['Conteúdo E2E 1', 'TEXTO', 'Material de teste.', null, 1],
            ['Conteúdo E2E 2', 'VIDEO', null, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 2],
            ['Conteúdo E2E 3', 'LINK', null, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 3],
            ['Conteúdo E2E 4', 'TEXTO', 'Quarto material.', null, 4],
            ['Conteúdo E2E 5', 'TEXTO', 'Quinto material.', null, 5]
        ]) {
            await connection.execute(
                `INSERT INTO Conteudos (id_turma, id_modulo, titulo, tipo, corpo, url, ordem)
                 VALUES (?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE id_conteudo = LAST_INSERT_ID(id_conteudo),
                    id_modulo = VALUES(id_modulo), tipo = VALUES(tipo), corpo = VALUES(corpo), url = VALUES(url)`,
                [openClassId, moduleId, title, kind, body, url, order]
            );
        }

        await connection.execute(
            `INSERT INTO Questionarios (id_curso, id_turma, titulo, descricao, ativo, tipo, id_modulo, ordem, prova_final)
             VALUES (?, ?, 'Prova final E2E', 'Avaliação determinística.', 1, 'PROVA', ?, 1, 1)
             ON DUPLICATE KEY UPDATE id_questionario = LAST_INSERT_ID(id_questionario), ativo = 1,
                id_modulo = VALUES(id_modulo), ordem = VALUES(ordem), prova_final = 1`,
            [courseId, openClassId, moduleId]
        );
        const [[assessment]] = await connection.execute(
            "SELECT id_questionario FROM Questionarios WHERE id_turma = ? AND titulo = 'Prova final E2E'",
            [openClassId]
        );
        for (let questionOrder = 1; questionOrder <= 4; questionOrder += 1) {
            const questionText = questionOrder === 1
                ? 'Qual é o ambiente desta turma?'
                : `Questão E2E ${questionOrder}`;
            await connection.execute(
                `INSERT INTO Q_Perguntas (id_questionario, texto_pergunta, tipo_pergunta, ordem, pontos)
                 VALUES (?, ?, 'MULTIPLA_ESCOLHA', ?, 1)
                 ON DUPLICATE KEY UPDATE id_pergunta = LAST_INSERT_ID(id_pergunta), texto_pergunta = VALUES(texto_pergunta)`,
                [assessment.id_questionario, questionText, questionOrder]
            );
            const [[question]] = await connection.execute(
                'SELECT id_pergunta FROM Q_Perguntas WHERE id_questionario = ? AND ordem = ?',
                [assessment.id_questionario, questionOrder]
            );
            const options = questionOrder === 4
                ? [['Produção', 1, 0], ['E2E', 2, 1]]
                : [['E2E', 1, 1], ['Produção', 2, 0]];
            for (const [text, order, correct] of options) {
                await connection.execute(
                    `INSERT INTO Q_Opcoes (id_pergunta, texto_opcao, ordem, correta)
                     VALUES (?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE texto_opcao = VALUES(texto_opcao), correta = VALUES(correta)`,
                    [question.id_pergunta, text, order, correct]
                );
            }
        }
        await connection.commit();
        console.log('Seed E2E aplicado em banco descartável.');
    } catch (error) {
        await connection.rollback().catch(() => undefined);
        throw error;
    } finally {
        await connection.end();
    }
}

if (require.main === module) {
    seed().catch((error) => {
        console.error(`Falha no seed E2E: ${error.code || 'SEED_FAILED'} ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = { seed };
