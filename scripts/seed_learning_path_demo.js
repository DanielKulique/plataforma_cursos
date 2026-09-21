'use strict';
const mysql = require('mysql2/promise');
const { assertStagingTarget } = require('./seed_staging_demo');
const { openVerifiedConnection } = require('./lib/database-operations');

async function seed() {
    const database = assertStagingTarget();
    const c = await openVerifiedConnection({
        createConnection: mysql.createConnection,
        additions: { database }
    });
    try {
        await c.beginTransaction();
        const [existing] = await c.query("SELECT id_turma FROM Turmas WHERE nome_turma = 'Jornada por Aulas — Demo 2026-09-05' FOR UPDATE");
        if (existing.length) { await c.commit(); return existing[0].id_turma; }
        const [base] = await c.query("SELECT id_curso, id_professor FROM Turmas WHERE nome_turma = 'Turma Demo Staging'");
        const [alunos] = await c.query("SELECT id_usuario FROM Usuarios WHERE email = 'aluno.demo@example.test' AND tipo = 'ALUNO'");
        if (!base.length || !alunos.length) throw new Error('Demonstração base ausente.');
        const [turma] = await c.query(`INSERT INTO Turmas (id_curso, id_professor, nome_turma, data_inicio, data_fim, status)
            VALUES (?, ?, 'Jornada por Aulas — Demo 2026-09-05', '2026-09-05', '2027-01-02', 'ABERTA')`, [base[0].id_curso, base[0].id_professor]);
        const id = turma.insertId;
        await c.query('INSERT INTO Matriculas (id_aluno, id_turma) VALUES (?, ?)', [alunos[0].id_usuario, id]);
        const aulas = [];
        for (const [indice, titulo] of ['Introdução', 'Referências', 'Avaliação'].entries()) {
            const [m] = await c.query('INSERT INTO Modulos (id_turma, titulo, descricao, ordem) VALUES (?, ?, ?, ?)',
                [id, titulo, ['Conheça os princípios de integridade acadêmica.', 'Aprenda a identificar e citar suas fontes.', 'Revise o percurso antes da avaliação final.'][indice], indice + 1]);
            aulas.push(m.insertId);
        }
        const conteudos = [
            [0, 'TEXTO', 'Por que citar as fontes?', null, 'Citar permite que outras pessoas reconheçam a autoria e consultem a origem de uma ideia. Ao estudar, registre autor, título e data das fontes consultadas.', 5, 1],
            [0, 'VIDEO', 'Vídeo de introdução', 'https://www.youtube.com/embed/M7lc1UVf-VE', null, 5, 2],
            [0, 'PDF', 'Guia de integridade acadêmica', '/assets/materiais/guia-integridade-academica.pdf', null, 10, 3],
            [1, 'TEXTO', 'Elementos de uma referência', null, 'Autor, título e data ajudam a identificar uma obra. Registre também os dados de publicação e o endereço consultado quando aplicável.', 5, 5],
            [1, 'PDF', 'Material de consulta sobre referências', '/assets/materiais/guia-integridade-academica.pdf', null, 10, 6],
            [1, 'ATIVIDADE', 'Pratique uma referência', null, 'Escolha uma fonte que você consultou. Anote autor, título, data e endereço. Explique em uma frase como essa fonte contribuiu para seu texto.', 10, 7],
            [2, 'TEXTO', 'Revisão para a avaliação', null, 'Antes da prova, revise: reconhecimento da autoria, registro das fontes e distinção entre suas ideias e as ideias consultadas.', 5, 9]
        ];
        for (const [aula, tipo, titulo, url, corpo, duracao, ordem] of conteudos) {
            await c.query(`INSERT INTO Conteudos (id_turma, id_modulo, tipo, titulo, descricao, url, corpo, duracao_minutos, ordem)
                VALUES (?, ?, ?, ?, '', ?, ?, ?, ?)`, [id, aulas[aula], tipo, titulo, url, corpo, duracao, ordem]);
        }
        for (const [titulo, tipo, modulo, ordem] of [
            ['Exercício — Integridade', 'EXERCICIO', aulas[0], 4],
            ['Exercício — Referências', 'EXERCICIO', aulas[1], 8],
            ['Prova do curso', 'PROVA', null, 10]
        ]) {
            const [q] = await c.query(`INSERT INTO Questionarios (id_curso, id_turma, titulo, descricao, tipo, ativo, id_modulo, ordem)
                VALUES (?, ?, ?, 'Verifique sua compreensão do tema.', ?, 1, ?, ?)`, [base[0].id_curso, id, titulo, tipo, modulo, ordem]);
            const [p] = await c.query("INSERT INTO Q_Perguntas (id_questionario, texto_pergunta, tipo_pergunta, ordem, pontos) VALUES (?, 'Como reconhecer uma ideia de outra pessoa?', 'MULTIPLA_ESCOLHA', 1, 1)", [q.insertId]);
            await c.query("INSERT INTO Q_Opcoes (id_pergunta, texto_opcao, ordem, correta) VALUES (?, 'Citando a fonte.', 1, 1), (?, 'Omitindo a origem.', 2, 0)", [p.insertId, p.insertId]);
        }
        await c.commit();
        return id;
    } catch (error) { await c.rollback(); throw error; } finally { await c.end(); }
}
seed().then((id) => console.log(`LEARNING_PATH_DEMO turma=${id}`)).catch((error) => { console.error(error.message); process.exitCode = 1; });
