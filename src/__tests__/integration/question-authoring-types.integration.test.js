const crypto = require('crypto');
const request = require('supertest');
const {
    initTestPool, clearDatabase, seedBasicData, closeTestPool,
    getTestPassword, getSessionToken
} = require('./setup');
const { app } = require('../../../index');
const applicationDb = require('../../config/database');

let pool;
let users;
let tokens;
let ids;

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const option = (texto, ordem, correta) => ({ texto_opcao: texto, ordem, correta });
const pair = (esquerda, direita, ordem) => ({ esquerda, direita, ordem });

async function login(email) {
    const response = await request(app).post('/api/auth/login')
        .send({ email, senha: getTestPassword() });
    expect(response.status).toBe(200);
    return getSessionToken(response);
}

async function criarPergunta(payload, token = tokens.professor) {
    const response = await request(app)
        .post(`/api/questionarios/${ids.questionario}/perguntas`)
        .set(auth(token)).send(payload);
    expect(response.status).toBe(201);
    return response.body.id_pergunta;
}

async function consultarAutor() {
    const response = await request(app)
        .get(`/api/turmas/${ids.turma}/questionarios`).set(auth(tokens.professor));
    expect(response.status).toBe(200);
    return response.body.questionarios.find((item) => item.id_questionario === ids.questionario).perguntas;
}

async function consultarAluno() {
    const response = await request(app)
        .get(`/api/turmas/${ids.turma}/questionarios/disponivel?tipo=exercicio&id_questionario=${ids.questionario}`)
        .set(auth(tokens.aluno));
    expect(response.status).toBe(200);
    return response.body.questionario.perguntas;
}

async function submeter(respostas) {
    return request(app).post(`/api/questionarios/${ids.questionario}/submissoes`)
        .set(auth(tokens.aluno)).send({ submission_id: crypto.randomUUID(), respostas });
}

describe('autoria completa de questões por tipo', () => {
    beforeAll(async () => {
        pool = await initTestPool();
        await clearDatabase();
        await seedBasicData();
        tokens = {
            professor: await login('professor@teste.com'),
            admin: await login('admin@teste.com'),
            aluno: await login('aluno@teste.com')
        };
    });

    beforeEach(async () => {
        await clearDatabase();
        users = await seedBasicData();
        const [curso] = await pool.query(
            "INSERT INTO Cursos (nome_curso, descricao, carga_horaria) VALUES ('Tipos de questões', 'Integração', 12)"
        );
        const [turma] = await pool.query(
            `INSERT INTO Turmas (id_curso, id_professor, nome_turma, data_inicio, status)
             VALUES (?, ?, 'Turma tipos', '2026-07-01', 'ABERTA')`,
            [curso.insertId, users.professor.id_usuario]
        );
        await pool.query(
            "INSERT INTO Matriculas (id_aluno, id_turma, status_aprovacao) VALUES (?, ?, 'CURSANDO')",
            [users.aluno.id_usuario, turma.insertId]
        );
        const [questionario] = await pool.query(
            `INSERT INTO Questionarios (id_curso, id_turma, titulo, descricao, ativo, tipo)
             VALUES (?, ?, 'Questionário de tipos', 'Questões reais', 1, 'EXERCICIO')`,
            [curso.insertId, turma.insertId]
        );
        ids = { curso: curso.insertId, turma: turma.insertId, questionario: questionario.insertId };
    });

    afterAll(async () => {
        await closeTestPool();
        await applicationDb.end();
    });

    it('aceita 2/1, 4/1, 4/2 e 6/4, corrige por conjunto e persiste IDs selecionados', async () => {
        const cases = [[2, [1]], [4, [3]], [4, [2, 4]], [6, [1, 2, 4, 6]]];
        for (const [index, [quantity, correct]] of cases.entries()) {
            await criarPergunta({
                tipo_pergunta: 'MULTIPLA_ESCOLHA', texto_pergunta: `Múltipla ${index + 1}`,
                ordem: index + 1, pontos: 1,
                opcoes: Array.from({ length: quantity }, (_, i) => option(`Q${index + 1} O${i + 1}`, i + 1, correct.includes(i + 1)))
            });
        }
        const author = await consultarAutor();
        expect(author.map((question) => question.opcoes.length)).toEqual([2, 4, 4, 6]);
        const student = await consultarAluno();
        expect(JSON.stringify(student)).not.toContain('"correta"');
        const answers = author.map((question) => ({
            id_pergunta: question.id_pergunta,
            selected_option_ids: question.opcoes.filter((item) => item.correta)
                .map((item) => item.id_opcao).reverse()
        }));
        const full = await submeter(answers);
        expect(full.status).toBe(200);
        expect(full.body.resultado).toMatchObject({ acertos: 4, pontuacao: 4 });

        const partial = structuredClone(answers);
        partial[2].selected_option_ids.pop();
        const incomplete = await submeter(partial);
        expect(incomplete.status).toBe(200);
        expect(incomplete.body.resultado.acertos).toBe(3);

        const extra = structuredClone(answers);
        extra[2].selected_option_ids.push(author[2].opcoes.find((item) => !item.correta).id_opcao);
        const contaminated = await submeter(extra);
        expect(contaminated.status).toBe(200);
        expect(contaminated.body.resultado.acertos).toBe(3);
        const [selectedRows] = await pool.query(
            `SELECT o.id_opcao FROM Q_RespostaOpcoes o
             INNER JOIN Q_Respostas r ON r.id_resposta = o.id_resposta
             WHERE r.id_tentativa = ? AND r.id_pergunta = ?`,
            [full.body.resultado.id_tentativa, author[3].id_pergunta]
        );
        expect(selectedRows.map((row) => row.id_opcao).sort((a, b) => a - b))
            .toEqual([...answers[3].selected_option_ids].sort((a, b) => a - b));
    });

    it('rejeita autoria de múltipla escolha inválida sem persistir pergunta', async () => {
        const valid = {
            texto_pergunta: 'Qual?', tipo_pergunta: 'MULTIPLA_ESCOLHA', ordem: 1, pontos: 1,
            opcoes: [option('A', 1, true), option('B', 2, false)]
        };
        const invalid = [
            { ...valid, opcoes: [option('A', 1, true)] },
            { ...valid, opcoes: [option('A', 1, false), option('B', 2, false)] },
            { ...valid, opcoes: [option('', 1, true), option('B', 2, false)] },
            { ...valid, opcoes: [option('A', 1, true), option('B', 1, false)] },
            { ...valid, texto_pergunta: ' ' },
            { ...valid, pontos: 0 }
        ];
        for (const payload of invalid) {
            const response = await request(app)
                .post(`/api/questionarios/${ids.questionario}/perguntas`)
                .set(auth(tokens.professor)).send(payload);
            expect(response.status).toBe(400);
        }
        const [[count]] = await pool.query(
            'SELECT COUNT(*) AS total FROM Q_Perguntas WHERE id_questionario = ?', [ids.questionario]
        );
        expect(Number(count.total)).toBe(0);
    });

    it('persiste V/F sem alternativas personalizadas e corrige por booleano', async () => {
        const trueId = await criarPergunta({
            tipo_pergunta: 'VERDADEIRO_FALSO', texto_pergunta: 'Afirmação verdadeira',
            ordem: 1, pontos: 2, resposta_booleana: true
        });
        const falseId = await criarPergunta({
            tipo_pergunta: 'VERDADEIRO_FALSO', texto_pergunta: 'Afirmação falsa',
            ordem: 2, pontos: 3, resposta_booleana: false
        });
        const invalid = await request(app).post(`/api/questionarios/${ids.questionario}/perguntas`)
            .set(auth(tokens.professor)).send({
                tipo_pergunta: 'VERDADEIRO_FALSO', texto_pergunta: 'Terceira alternativa', ordem: 3,
                pontos: 1, resposta_booleana: true,
                opcoes: [option('V', 1, true), option('F', 2, false), option('Talvez', 3, false)]
            });
        expect(invalid.status).toBe(400);
        const student = await consultarAluno();
        expect(student).toHaveLength(2);
        student.forEach((question) => {
            expect(question.formato_resposta).toBe('BOOLEANO');
            expect(question).not.toHaveProperty('resposta_booleana');
            expect(question).not.toHaveProperty('opcoes');
        });
        const correct = await submeter([
            { id_pergunta: trueId, resposta_booleana: true },
            { id_pergunta: falseId, resposta_booleana: false }
        ]);
        expect(correct.status).toBe(200);
        expect(correct.body.resultado).toMatchObject({ acertos: 2, pontuacao: 5 });
        const wrong = await submeter([
            { id_pergunta: trueId, resposta_booleana: false },
            { id_pergunta: falseId, resposta_booleana: false }
        ]);
        expect(wrong.body.resultado).toMatchObject({ acertos: 1, pontuacao: 3 });
        const malformed = await submeter([
            { id_pergunta: trueId, resposta_booleana: 'Talvez' },
            { id_pergunta: falseId, resposta_booleana: false }
        ]);
        expect(malformed.status).toBe(400);
        const [rows] = await pool.query(
            'SELECT id_pergunta, resposta_booleana FROM Q_Respostas WHERE id_tentativa = ? ORDER BY id_pergunta',
            [correct.body.resultado.id_tentativa]
        );
        expect(rows.map((row) => Number(row.resposta_booleana))).toEqual([1, 0]);
    });

    it('associa 3 e 5 pares por IDs, sem gabarito no DTO do aluno, e rejeita pares adulterados', async () => {
        for (const [index, quantity] of [3, 5].entries()) {
            await criarPergunta({
                tipo_pergunta: 'ASSOCIACAO', texto_pergunta: `Associe ${quantity} itens`,
                ordem: index + 1, pontos: 2,
                pares: Array.from({ length: quantity }, (_, i) => pair(`E${index}-${i}`, `D${index}-${i}`, i + 1))
            });
        }
        const author = await consultarAutor();
        expect(author.map((question) => question.pares.length)).toEqual([3, 5]);
        const student = await consultarAluno();
        expect(JSON.stringify(student)).not.toContain('id_item_esquerda');
        expect(JSON.stringify(student)).not.toContain('id_item_direita');
        expect(student[0].itens_direita.map((item) => item.id_item))
            .not.toEqual(author[0].pares.map((item) => item.id_item_direita));
        const answers = author.map((question) => ({
            id_pergunta: question.id_pergunta,
            matches: question.pares.map((par) => ({ left_id: par.id_item_esquerda, right_id: par.id_item_direita })).reverse()
        }));
        const full = await submeter(answers);
        expect(full.status).toBe(200);
        expect(full.body.resultado).toMatchObject({ acertos: 2, pontuacao: 4 });
        const swapped = structuredClone(answers);
        [swapped[0].matches[0].right_id, swapped[0].matches[1].right_id] =
            [swapped[0].matches[1].right_id, swapped[0].matches[0].right_id];
        expect((await submeter(swapped)).body.resultado.acertos).toBe(1);
        const duplicate = structuredClone(answers);
        duplicate[0].matches[1].right_id = duplicate[0].matches[0].right_id;
        expect((await submeter(duplicate)).status).toBe(400);
        const foreignLeft = structuredClone(answers);
        foreignLeft[0].matches[0].left_id = author[1].pares[0].id_item_esquerda;
        expect((await submeter(foreignLeft)).status).toBe(400);
        const foreignRight = structuredClone(answers);
        foreignRight[0].matches[0].right_id = author[1].pares[0].id_item_direita;
        expect((await submeter(foreignRight)).status).toBe(400);
        const [persisted] = await pool.query(
            `SELECT a.id_item_esquerda, a.id_item_direita FROM Q_RespostaAssociacoes a
             INNER JOIN Q_Respostas r ON r.id_resposta = a.id_resposta
             WHERE r.id_tentativa = ?`, [full.body.resultado.id_tentativa]
        );
        expect(persisted).toHaveLength(8);
    });

    it('reverte criação inteira após falha na quarta opção ou no terceiro par', async () => {
        await pool.query(`CREATE TRIGGER test_question_option_failure BEFORE INSERT ON Q_Opcoes
            FOR EACH ROW BEGIN
              IF NEW.texto_opcao = 'FALHA_4' THEN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'falha controlada';
              END IF;
            END`);
        try {
            const result = await request(app).post(`/api/questionarios/${ids.questionario}/perguntas`)
                .set(auth(tokens.professor)).send({
                    tipo_pergunta: 'MULTIPLA_ESCOLHA', texto_pergunta: 'Rollback múltipla', ordem: 1, pontos: 1,
                    opcoes: [option('A', 1, true), option('B', 2, false), option('C', 3, false), option('FALHA_4', 4, false)]
                });
            expect(result.status).toBe(500);
        } finally {
            await pool.query('DROP TRIGGER IF EXISTS test_question_option_failure');
        }
        await pool.query(`CREATE TRIGGER test_question_pair_failure BEFORE INSERT ON Q_AssociacaoItens
            FOR EACH ROW BEGIN
              IF NEW.texto = 'FALHA_3' THEN
                SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'falha controlada';
              END IF;
            END`);
        try {
            const result = await request(app).post(`/api/questionarios/${ids.questionario}/perguntas`)
                .set(auth(tokens.professor)).send({
                    tipo_pergunta: 'ASSOCIACAO', texto_pergunta: 'Rollback associação', ordem: 1, pontos: 1,
                    pares: [pair('E1', 'D1', 1), pair('E2', 'D2', 2), pair('E3', 'FALHA_3', 3)]
                });
            expect(result.status).toBe(500);
        } finally {
            await pool.query('DROP TRIGGER IF EXISTS test_question_pair_failure');
        }
        const [[questions]] = await pool.query(
            'SELECT COUNT(*) AS total FROM Q_Perguntas WHERE id_questionario = ?', [ids.questionario]
        );
        const [[items]] = await pool.query('SELECT COUNT(*) AS total FROM Q_AssociacaoItens');
        expect(Number(questions.total)).toBe(0);
        expect(Number(items.total)).toBe(0);
    });

    it('edita a estrutura por tipo antes de tentativas e bloqueia alterações depois', async () => {
        const id = await criarPergunta({
            tipo_pergunta: 'MULTIPLA_ESCOLHA', texto_pergunta: 'Pergunta mutável', ordem: 1, pontos: 1,
            opcoes: [option('A', 1, true), option('B', 2, false)]
        });
        const association = await request(app).patch(`/api/perguntas/${id}`).set(auth(tokens.professor))
            .send({ tipo_pergunta: 'ASSOCIACAO', texto_pergunta: 'Associe', ordem: 1, pontos: 1,
                pares: [pair('L1', 'R1', 1), pair('L2', 'R2', 2)] });
        expect(association.status).toBe(200);
        let author = await consultarAutor();
        expect(author[0].opcoes).toHaveLength(0);
        expect(author[0].pares).toHaveLength(2);
        const boolean = await request(app).patch(`/api/perguntas/${id}`).set(auth(tokens.professor))
            .send({ tipo_pergunta: 'VERDADEIRO_FALSO', texto_pergunta: 'É falso?', ordem: 1, pontos: 1,
                resposta_booleana: false });
        expect(boolean.status).toBe(200);
        author = await consultarAutor();
        expect(author[0].pares).toHaveLength(0);
        expect(author[0].resposta_booleana).toBe(0);
        expect((await submeter([{ id_pergunta: id, resposta_booleana: false }])).status).toBe(200);
        const blocked = await request(app).patch(`/api/perguntas/${id}`).set(auth(tokens.professor))
            .send({ resposta_booleana: true });
        expect(blocked.status).toBe(409);
        const studentAuthorship = await request(app)
            .post(`/api/questionarios/${ids.questionario}/perguntas`).set(auth(tokens.aluno))
            .send({ tipo_pergunta: 'VERDADEIRO_FALSO', texto_pergunta: 'Sem permissão', ordem: 2,
                resposta_booleana: true });
        expect(studentAuthorship.status).toBe(403);
    });

    it('replica gabaritos booleanos e associações com novos IDs', async () => {
        await criarPergunta({ tipo_pergunta: 'VERDADEIRO_FALSO', texto_pergunta: 'Verdadeiro na origem',
            ordem: 1, pontos: 1, resposta_booleana: false });
        await criarPergunta({ tipo_pergunta: 'ASSOCIACAO', texto_pergunta: 'Pares na origem',
            ordem: 2, pontos: 1, pares: [pair('Esquerda A', 'Direita A', 1), pair('Esquerda B', 'Direita B', 2)] });
        const original = await consultarAutor();
        const response = await request(app).post(`/api/turmas/${ids.turma}/replicar`)
            .set(auth(tokens.admin)).set('Idempotency-Key', 'tipos-questao-replicacao-0001')
            .send({ nome_turma: 'Cópia dos tipos', id_professor: users.professor.id_usuario,
                data_inicio: '2026-08-01', data_fim: '2026-12-31', status: 'ABERTA' });
        expect(response.status).toBe(201);
        const copiedClassId = response.body.turma.id_turma;
        const copied = await request(app).get(`/api/turmas/${copiedClassId}/questionarios`)
            .set(auth(tokens.professor));
        expect(copied.status).toBe(200);
        const questions = copied.body.questionarios[0].perguntas;
        expect(questions[0].resposta_booleana).toBe(0);
        expect(questions[1].pares.map((item) => [item.esquerda, item.direita]))
            .toEqual(original[1].pares.map((item) => [item.esquerda, item.direita]));
        expect(questions[1].pares[0].id_item_esquerda).not.toBe(original[1].pares[0].id_item_esquerda);
    });
});
