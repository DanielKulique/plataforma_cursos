'use strict';

const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const { assertDevelopmentDatabase } = require('./test_database_safety');
const { assertCanonicalSchema } = require('./schema_contract');
const { loadEnvironment } = require('../src/config/loadEnvironment');
const { assertDatabaseConnectionEnvironment, describeDatabaseTarget } = require('../src/config/database-connection');
const { assertDatabaseIdentity } = require('../src/config/database-identity');

const root = path.join(__dirname, '..');
loadEnvironment('dev', root);

const database = assertDevelopmentDatabase(process.env);
const target = assertDatabaseConnectionEnvironment(process.env);
const demoPassword = process.env.MANUAL_DEMO_PASSWORD || process.env.CANONICAL_SEED_PASSWORD;

if (!demoPassword || String(demoPassword).length < 8) {
    throw new Error(
        'Defina MANUAL_DEMO_PASSWORD ou CANONICAL_SEED_PASSWORD com ao menos 8 caracteres.'
    );
}

const config = {
    host: target.host,
    port: target.port,
    user: target.user,
    password: target.password,
    database
};

async function upsertUser(connection, user, passwordHash) {
    const [result] = await connection.query(
        `INSERT INTO Usuarios (nome_completo, cpf, email, senha, telefone, tipo)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            id_usuario = LAST_INSERT_ID(id_usuario),
            nome_completo = VALUES(nome_completo),
            senha = VALUES(senha),
            telefone = VALUES(telefone),
            tipo = VALUES(tipo)`,
        [user.name, user.cpf, user.email, passwordHash, user.phone, user.role]
    );
    await connection.query(
        `INSERT INTO EmailVerificacoes (email, codigo, verificado, expira_em)
         VALUES (?, '000000', 1, DATE_ADD(NOW(), INTERVAL 1 YEAR))
         ON DUPLICATE KEY UPDATE
            codigo = VALUES(codigo),
            verificado = 1,
            expira_em = VALUES(expira_em)`,
        [user.email]
    );
    return result.insertId;
}

async function upsertCourse(connection, course) {
    const [result] = await connection.query(
        `INSERT INTO Cursos (nome_curso, descricao, carga_horaria)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
            id_curso = LAST_INSERT_ID(id_curso),
            descricao = VALUES(descricao),
            carga_horaria = VALUES(carga_horaria)`,
        [course.name, course.description, course.hours]
    );
    return result.insertId;
}

async function upsertClass(connection, values) {
    const [result] = await connection.query(
        `INSERT INTO Turmas
         (id_curso, id_professor, nome_turma, data_inicio, data_fim, status)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            id_turma = LAST_INSERT_ID(id_turma),
            id_curso = VALUES(id_curso),
            id_professor = VALUES(id_professor),
            data_inicio = VALUES(data_inicio),
            data_fim = VALUES(data_fim),
            status = VALUES(status)`,
        [
            values.courseId,
            values.professorId,
            values.name,
            values.start,
            values.end,
            values.status
        ]
    );
    return result.insertId;
}

async function upsertEnrollment(connection, values) {
    await connection.query(
        `INSERT INTO Matriculas
         (id_aluno, id_turma, status_aprovacao, progresso_percentual, nota_final)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            status_aprovacao = VALUES(status_aprovacao),
            progresso_percentual = VALUES(progresso_percentual),
            nota_final = VALUES(nota_final)`,
        [
            values.studentId,
            values.classId,
            values.status || 'CURSANDO',
            values.progress || 0,
            values.grade ?? null
        ]
    );
}

async function upsertModule(connection, values) {
    const [result] = await connection.query(
        `INSERT INTO Modulos (id_turma, titulo, descricao, ordem)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            id_modulo = LAST_INSERT_ID(id_modulo),
            titulo = VALUES(titulo),
            descricao = VALUES(descricao)`,
        [values.classId, values.title, values.description, values.order]
    );
    return result.insertId;
}

async function upsertContent(connection, values) {
    const [result] = await connection.query(
        `INSERT INTO Conteudos
         (id_turma, id_modulo, titulo, descricao, tipo, url, corpo, duracao_minutos, ordem)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            id_conteudo = LAST_INSERT_ID(id_conteudo),
            id_modulo = VALUES(id_modulo),
            titulo = VALUES(titulo),
            descricao = VALUES(descricao),
            tipo = VALUES(tipo),
            url = VALUES(url),
            corpo = VALUES(corpo),
            duracao_minutos = VALUES(duracao_minutos)`,
        [
            values.classId,
            values.moduleId,
            values.title,
            values.description,
            values.type,
            values.url || null,
            values.body || null,
            values.duration || null,
            values.order
        ]
    );
    return result.insertId;
}

async function upsertQuestionnaire(connection, values) {
    const [result] = await connection.query(
        `INSERT INTO Questionarios
         (id_curso, id_turma, titulo, descricao, ativo, tipo)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            id_questionario = LAST_INSERT_ID(id_questionario),
            id_curso = VALUES(id_curso),
            descricao = VALUES(descricao),
            ativo = VALUES(ativo)`,
        [
            values.courseId,
            values.classId,
            values.title,
            values.description,
            values.active ? 1 : 0,
            values.type
        ]
    );
    return result.insertId;
}

async function upsertQuestion(connection, questionnaireId, question) {
    const [result] = await connection.query(
        `INSERT INTO Q_Perguntas
         (id_questionario, texto_pergunta, tipo_pergunta, ordem, pontos)
         VALUES (?, ?, 'MULTIPLA_ESCOLHA', ?, ?)
         ON DUPLICATE KEY UPDATE
            id_pergunta = LAST_INSERT_ID(id_pergunta),
            texto_pergunta = VALUES(texto_pergunta),
            tipo_pergunta = VALUES(tipo_pergunta),
            pontos = VALUES(pontos)`,
        [questionnaireId, question.text, question.order, question.points || 1]
    );

    for (const [index, option] of question.options.entries()) {
        await connection.query(
            `INSERT INTO Q_Opcoes (id_pergunta, texto_opcao, ordem, correta)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                texto_opcao = VALUES(texto_opcao),
                correta = VALUES(correta)`,
            [result.insertId, option.text, index + 1, option.correct ? 1 : 0]
        );
    }
}

async function seedQuestionnaire(connection, values) {
    const questionnaireId = await upsertQuestionnaire(connection, values);
    for (const question of values.questions) {
        await upsertQuestion(connection, questionnaireId, question);
    }
    return questionnaireId;
}

async function seedManualDemo() {
    if (!config.user || config.password === undefined) {
        throw new Error('Configure DB_USER e DB_PASSWORD no .env local.');
    }

    const connection = await mysql.createConnection(config);
    try {
        await assertDatabaseIdentity(connection, target);
        await assertCanonicalSchema(connection, database);
        const passwordHash = await bcrypt.hash(demoPassword, 10);
        await connection.beginTransaction();

        const users = [
            {
                key: 'adminSupport',
                name: 'Admin de Apoio',
                cpf: '91000000001',
                email: 'admin.apoio@example.test',
                phone: '11910000001',
                role: 'ADMIN'
            },
            {
                key: 'professorAna',
                name: 'Professora Ana Lima',
                cpf: '91000000002',
                email: 'professora.ana@example.test',
                phone: '11910000002',
                role: 'PROFESSOR'
            },
            {
                key: 'studentAna',
                name: 'Aluna Ana Souza',
                cpf: '91000000003',
                email: 'aluna.ana@example.test',
                phone: '11910000003',
                role: 'ALUNO'
            },
            {
                key: 'studentBruno',
                name: 'Aluno Bruno Costa',
                cpf: '91000000004',
                email: 'aluno.bruno@example.test',
                phone: '11910000004',
                role: 'ALUNO'
            },
            {
                key: 'studentCarla',
                name: 'Aluna Carla Mendes',
                cpf: '91000000005',
                email: 'aluna.carla@example.test',
                phone: '11910000005',
                role: 'ALUNO'
            },
            {
                key: 'studentUnenrolled',
                name: 'Aluno Sem Matrícula',
                cpf: '91000000006',
                email: 'aluno.sem.matricula@example.test',
                phone: '11910000006',
                role: 'ALUNO'
            }
        ];
        const userIds = {};
        for (const user of users) {
            userIds[user.key] = await upsertUser(connection, user, passwordHash);
        }

        const [[canonicalProfessor]] = await connection.query(
            `SELECT id_usuario
             FROM Usuarios
             WHERE email = 'professor.canonico@example.test' AND tipo = 'PROFESSOR'`
        );
        const [[canonicalStudent]] = await connection.query(
            `SELECT id_usuario
             FROM Usuarios
             WHERE email = 'aluno.matriculado@example.test' AND tipo = 'ALUNO'`
        );
        if (!canonicalProfessor || !canonicalStudent) {
            throw new Error('Execute primeiro o seed canônico de desenvolvimento.');
        }

        const webCourseId = await upsertCourse(connection, {
            name: 'Fundamentos de Desenvolvimento Web',
            description: 'Curso canônico ampliado para auditoria manual do frontend e dos fluxos.',
            hours: 40
        });
        const researchCourseId = await upsertCourse(connection, {
            name: 'Pesquisa Acadêmica e Integridade',
            description: 'Curso demonstrativo sobre escrita, fontes e integridade acadêmica.',
            hours: 24
        });

        const webClassId = await upsertClass(connection, {
            courseId: webCourseId,
            professorId: canonicalProfessor.id_usuario,
            name: 'Web Canônica - Inscrições',
            start: '2026-08-01',
            end: '2026-10-31',
            status: 'ABERTA'
        });
        const researchClassId = await upsertClass(connection, {
            courseId: researchCourseId,
            professorId: userIds.professorAna,
            name: 'Pesquisa Acadêmica - Turma 2026',
            start: '2026-08-10',
            end: '2026-11-30',
            status: 'ABERTA'
        });

        for (const enrollment of [
            { studentId: canonicalStudent.id_usuario, classId: webClassId, progress: 0 },
            { studentId: userIds.studentAna, classId: webClassId, progress: 0 },
            { studentId: userIds.studentBruno, classId: webClassId, progress: 0 },
            { studentId: userIds.studentCarla, classId: researchClassId, progress: 0 }
        ]) {
            await upsertEnrollment(connection, enrollment);
        }

        const webIntroModuleId = await upsertModule(connection, {
            classId: webClassId,
            title: 'Introdução',
            description: 'Primeiros passos e materiais essenciais.',
            order: 1
        });
        const webAccessModuleId = await upsertModule(connection, {
            classId: webClassId,
            title: 'Acessibilidade e qualidade',
            description: 'Práticas para interfaces mais inclusivas.',
            order: 2
        });
        await upsertContent(connection, {
            classId: webClassId,
            moduleId: webIntroModuleId,
            title: 'Boas-vindas',
            description: 'Apresentação do ambiente e do roteiro de estudos.',
            type: 'TEXTO',
            body: 'Bem-vindo à turma. Explore os materiais, marque conteúdos como concluídos e responda aos questionários disponíveis.',
            duration: 5,
            order: 1
        });
        await upsertContent(connection, {
            classId: webClassId,
            moduleId: webIntroModuleId,
            title: 'Guia de desenvolvimento web',
            description: 'PDF demonstrativo com o roteiro da disciplina.',
            type: 'PDF',
            url: '/assets/materiais/guia-desenvolvimento-web.pdf',
            duration: 15,
            order: 2
        });
        await upsertContent(connection, {
            classId: webClassId,
            moduleId: webAccessModuleId,
            title: 'Checklist de acessibilidade',
            description: 'PDF para revisão manual das interfaces.',
            type: 'PDF',
            url: '/assets/materiais/checklist-acessibilidade.pdf',
            duration: 10,
            order: 3
        });
        await upsertContent(connection, {
            classId: webClassId,
            moduleId: webAccessModuleId,
            title: 'Atividade: auditoria de uma página',
            description: 'Exercício prático sem envio de arquivo.',
            type: 'ATIVIDADE',
            body: 'Escolha uma página, navegue apenas com teclado e registre três melhorias de acessibilidade.',
            duration: 25,
            order: 4
        });

        const researchModuleId = await upsertModule(connection, {
            classId: researchClassId,
            title: 'Fontes e integridade',
            description: 'Leitura crítica e uso responsável de referências.',
            order: 1
        });
        await upsertContent(connection, {
            classId: researchClassId,
            moduleId: researchModuleId,
            title: 'Como avaliar uma fonte',
            description: 'Conteúdo introdutório para avaliação de referências.',
            type: 'TEXTO',
            body: 'Considere autoria, data, método, evidências e contexto antes de incorporar uma fonte ao seu trabalho.',
            duration: 8,
            order: 1
        });
        await upsertContent(connection, {
            classId: researchClassId,
            moduleId: researchModuleId,
            title: 'Guia de integridade acadêmica',
            description: 'PDF demonstrativo sobre citação e autoria.',
            type: 'PDF',
            url: '/assets/materiais/guia-integridade-academica.pdf',
            duration: 20,
            order: 2
        });

        await seedQuestionnaire(connection, {
            courseId: webCourseId,
            classId: webClassId,
            title: 'Diagnóstico inicial',
            description: 'Exercício demonstrativo corrigido e persistido pelo backend.',
            active: true,
            type: 'EXERCICIO',
            questions: [
                {
                    order: 1,
                    text: 'Qual status permite uma nova matrícula?',
                    options: [
                        { text: 'ABERTA', correct: true },
                        { text: 'FECHADA', correct: false },
                        { text: 'ENCERRADA', correct: false }
                    ]
                },
                {
                    order: 2,
                    text: 'Qual elemento HTML agrupa controles relacionados de um formulário?',
                    options: [
                        { text: 'fieldset', correct: true },
                        { text: 'canvas', correct: false },
                        { text: 'template', correct: false }
                    ]
                },
                {
                    order: 3,
                    text: 'Qual prática ajuda usuários de teclado?',
                    options: [
                        { text: 'Manter foco visível', correct: true },
                        { text: 'Remover outline globalmente', correct: false },
                        { text: 'Depender apenas de hover', correct: false }
                    ]
                }
            ]
        });
        await seedQuestionnaire(connection, {
            courseId: webCourseId,
            classId: webClassId,
            title: 'Prova de fundamentos web',
            description: 'Prova demonstrativa para validar o fluxo completo.',
            active: true,
            type: 'PROVA',
            questions: [
                {
                    order: 1,
                    points: 2,
                    text: 'Qual camada define a estrutura semântica da página?',
                    options: [
                        { text: 'HTML', correct: true },
                        { text: 'CSS', correct: false },
                        { text: 'SQL', correct: false }
                    ]
                },
                {
                    order: 2,
                    points: 2,
                    text: 'Qual recurso deve fechar um diálogo acessível?',
                    options: [
                        { text: 'A tecla Escape', correct: true },
                        { text: 'Apenas recarregar a página', correct: false },
                        { text: 'Somente um clique fora', correct: false }
                    ]
                },
                {
                    order: 3,
                    points: 2,
                    text: 'Onde a pontuação do questionário deve ser calculada?',
                    options: [
                        { text: 'No backend', correct: true },
                        { text: 'Somente no CSS', correct: false },
                        { text: 'Em um fallback mock', correct: false }
                    ]
                }
            ]
        });
        await seedQuestionnaire(connection, {
            courseId: researchCourseId,
            classId: researchClassId,
            title: 'Revisão de integridade acadêmica',
            description: 'Exercício demonstrativo sobre fontes e autoria.',
            active: true,
            type: 'EXERCICIO',
            questions: [
                {
                    order: 1,
                    text: 'Qual informação ajuda a avaliar a atualidade de uma fonte?',
                    options: [
                        { text: 'A data de publicação', correct: true },
                        { text: 'A cor do site', correct: false },
                        { text: 'O tamanho do título', correct: false }
                    ]
                },
                {
                    order: 2,
                    text: 'Ao usar uma ideia de outra pessoa, o que deve ser feito?',
                    options: [
                        { text: 'Indicar a fonte adequadamente', correct: true },
                        { text: 'Ocultar a origem', correct: false },
                        { text: 'Trocar poucas palavras sem citar', correct: false }
                    ]
                }
            ]
        });

        await connection.commit();
        console.log(
            `Demonstração manual aplicada em ${database}: `
            + `${users.length} contas adicionais, 2 turmas principais, 7 conteúdos e 3 questionários.`
        );
    } catch (error) {
        await connection.rollback().catch(() => undefined);
        throw error;
    } finally {
        await connection.end();
    }
}

console.log(JSON.stringify(describeDatabaseTarget(process.env), null, 2));
seedManualDemo().catch((error) => {
    console.error(`Falha no seed manual de ${database}: ${error.message}`);
    process.exitCode = 1;
});
