'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const {
    initTestPool,
    clearDatabase,
    seedBasicData,
    closeTestPool,
    getTestPassword,
    getSessionToken
} = require('./setup');
const { app } = require('../../../index');
const applicationDb = require('../../config/database');
const { buscarRequisitos } = require('../../api/services/academic-progress.service');
const { assertCanonicalSchema } = require('../../../scripts/schema_contract');

let pool;
let users;
let curso;
let turma;
let tokens;

const auth = (tipo) => ({ Authorization: `Bearer ${tokens[tipo]}` });

async function criarQuestionario(tipo, provaFinal = false, ordem = 0) {
    const [questionario] = await pool.query(
        `INSERT INTO Questionarios
         (id_curso,id_turma,titulo,descricao,tipo,prova_final,ativo,ordem)
         VALUES (?,?,?,?,?,?,1,?)`,
        [curso, turma, crypto.randomUUID(), 'Ciclo de matrícula', tipo, provaFinal ? 1 : null, ordem]
    );
    const [pergunta] = await pool.query(
        `INSERT INTO Q_Perguntas
         (id_questionario,texto_pergunta,tipo_pergunta,ordem,pontos)
         VALUES (?,'Pergunta','MULTIPLA_ESCOLHA',1,1)`,
        [questionario.insertId]
    );
    const [correta] = await pool.query(
        `INSERT INTO Q_Opcoes (id_pergunta,texto_opcao,ordem,correta)
         VALUES (?,'Correta',1,1)`, [pergunta.insertId]
    );
    await pool.query(
        `INSERT INTO Q_Opcoes (id_pergunta,texto_opcao,ordem,correta)
         VALUES (?,'Errada',2,0)`, [pergunta.insertId]
    );
    return { id: questionario.insertId, pergunta: pergunta.insertId, correta: correta.insertId };
}

async function submeter(questionario, submissionId = crypto.randomUUID()) {
    return request(app)
        .post(`/api/questionarios/${questionario.id}/submissoes`)
        .set(auth('aluno'))
        .send({
            submission_id: submissionId,
            respostas: [{ id_pergunta: questionario.pergunta, id_opcao: questionario.correta }]
        });
}

async function concluir(conteudos, quantidade) {
    for (const conteudo of conteudos.slice(0, quantidade)) {
        const response = await request(app)
            .put(`/api/conteudos/${conteudo.id_conteudo}/progresso`)
            .set(auth('aluno'))
            .send({ status: 'CONCLUIDO' });
        expect(response.status).toBe(200);
    }
}

async function matriculaAtual() {
    const [[row]] = await pool.query(
        'SELECT * FROM Matriculas WHERE id_aluno = ? AND id_turma = ?',
        [users.aluno.id_usuario, turma]
    );
    return row;
}

async function executarMigration(sql, connection = pool) {
    for (const statement of sql.split(/;\s*(?:\n|$)/).filter((item) => item.trim())) {
        await connection.query(statement);
    }
}

beforeAll(async () => {
    pool = await initTestPool();
});

beforeEach(async () => {
    await clearDatabase();
    users = await seedBasicData();
    tokens = {};
    for (const tipo of ['aluno', 'professor', 'admin']) {
        const login = await request(app).post('/api/auth/login')
            .send({ email: `${tipo}@teste.com`, senha: getTestPassword() });
        expect(login.status).toBe(200);
        tokens[tipo] = getSessionToken(login);
    }
    const [course] = await pool.query(
        "INSERT INTO Cursos (nome_curso,carga_horaria) VALUES ('Ciclos acadêmicos',10)"
    );
    curso = course.insertId;
    const [classroom] = await pool.query(
        `INSERT INTO Turmas (id_curso,id_professor,nome_turma,data_inicio,status)
         VALUES (?,?,'Turma de ciclos',CURRENT_DATE,'ABERTA')`,
        [curso, users.professor.id_usuario]
    );
    turma = classroom.insertId;
});

afterAll(async () => {
    await closeTestPool();
    await applicationDb.end();
});

test('D-04/D-05: rematrícula isola progresso, exercícios, prova e aprovação por ciclo', async () => {
    const primeira = await request(app).post('/api/matriculas').set(auth('aluno')).send({ id_turma: turma });
    expect(primeira.status).toBe(201);
    expect(primeira.body.matricula).toMatchObject({
        status_aprovacao: 'CURSANDO', ciclo_atual: 1, reativada: false
    });
    const idMatricula = primeira.body.matricula.id_matricula;

    await pool.query('INSERT INTO Conteudos (id_turma,titulo,tipo,ordem) VALUES ?', [
        Array.from({ length: 8 }, (_, index) => [turma, `Conteúdo ${index + 1}`, 'TEXTO', index + 1])
    ]);
    const [conteudos] = await pool.query(
        'SELECT id_conteudo FROM Conteudos WHERE id_turma = ? ORDER BY ordem', [turma]
    );
    const exercicioA = await criarQuestionario('EXERCICIO', false, 1);
    const exercicioB = await criarQuestionario('EXERCICIO', false, 2);
    const provaFinal = await criarQuestionario('PROVA', true, 3);
    const chaveReutilizada = crypto.randomUUID();

    await concluir(conteudos, 6);
    expect((await submeter(exercicioA, chaveReutilizada)).status).toBe(200);
    expect((await submeter(exercicioB)).status).toBe(200);
    let requisitos = await buscarRequisitos(pool, users.aluno.id_usuario, turma);
    expect(requisitos).toMatchObject({
        ciclo_atual: 1, trilha_realizada: 8, total_trilha: 10,
        prova_liberada: true, prova_final_aprovada: false
    });
    expect((await submeter(provaFinal)).status).toBe(200);
    expect((await matriculaAtual()).status_aprovacao).toBe('CURSANDO');

    expect((await request(app).delete(`/api/matriculas/${idMatricula}`).set(auth('aluno'))).status).toBe(200);
    for (const [tipo, status] of [['professor', 'CURSANDO'], ['admin', 'CURSANDO'],
        ['professor', 'APROVADO'], ['admin', 'REPROVADO']]) {
        const bypass = await request(app).patch(`/api/matriculas/${idMatricula}`)
            .set(auth(tipo)).send({ status_aprovacao: status });
        expect(bypass.status).toBe(409);
        expect(bypass.body.code).toBe('REMATRICULA_OBRIGATORIA');
    }

    const concorrentes = await Promise.all([1, 2].map(() => request(app)
        .post('/api/matriculas').set(auth('aluno')).send({ id_turma: turma })));
    expect(concorrentes.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await matriculaAtual()).toMatchObject({
        id_matricula: idMatricula, ciclo_atual: 2, status_aprovacao: 'CURSANDO',
        nota_final: null, progresso_percentual: 0
    });

    requisitos = await buscarRequisitos(pool, users.aluno.id_usuario, turma);
    expect(requisitos).toMatchObject({
        ciclo_atual: 2, conteudos_concluidos: 0, exercicios_realizados: 0,
        trilha_realizada: 0, prova_liberada: false, prova_final_aprovada: false,
        elegivel_aprovacao: false
    });
    expect((await submeter(provaFinal)).status).toBe(409);
    const historicoAntigo = await request(app).get('/api/questionarios/historico').set(auth('aluno'));
    expect(historicoAntigo.status).toBe(200);
    expect(historicoAntigo.body.tentativas).toHaveLength(3);
    expect(new Set(historicoAntigo.body.tentativas.map((item) => item.ciclo_matricula))).toEqual(new Set([1]));

    await concluir(conteudos, 6);
    const novaA = await submeter(exercicioA, chaveReutilizada);
    expect(novaA.status).toBe(200);
    expect(novaA.body.resultado.reutilizada).toBe(false);
    expect((await submeter(exercicioB)).status).toBe(200);
    requisitos = await buscarRequisitos(pool, users.aluno.id_usuario, turma);
    expect(requisitos).toMatchObject({
        ciclo_atual: 2, exercicios_realizados: 2, trilha_realizada: 8,
        prova_liberada: true, prova_final_aprovada: false
    });
    expect((await submeter(provaFinal)).status).toBe(200);
    expect((await matriculaAtual()).status_aprovacao).toBe('CURSANDO');
    await concluir(conteudos.slice(6), 2);
    expect((await matriculaAtual()).status_aprovacao).toBe('APROVADO');

    const historicoCompleto = await request(app).get('/api/questionarios/historico').set(auth('aluno'));
    expect(historicoCompleto.body.tentativas).toHaveLength(6);
    expect(new Set(historicoCompleto.body.tentativas.map((item) => item.ciclo_matricula))).toEqual(new Set([1, 2]));

    expect((await request(app).delete(`/api/matriculas/${idMatricula}`).set(auth('aluno'))).status).toBe(200);
    const segundoCiclo = await Promise.all([1, 2].map(() => request(app)
        .post('/api/matriculas').set(auth('aluno')).send({ id_turma: turma })));
    expect(segundoCiclo.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await matriculaAtual()).toMatchObject({ ciclo_atual: 3, status_aprovacao: 'CURSANDO' });
    expect(await buscarRequisitos(pool, users.aluno.id_usuario, turma)).toMatchObject({
        ciclo_atual: 3, exercicios_realizados: 0, prova_final_aprovada: false,
        prova_liberada: false, elegivel_aprovacao: false
    });
});

test.each(['FECHADA', 'ENCERRADA'])('rematrícula oficial recusa turma %s sem incrementar ciclo', async (status) => {
    const primeira = await request(app).post('/api/matriculas').set(auth('aluno')).send({ id_turma: turma });
    const idMatricula = primeira.body.matricula.id_matricula;
    await request(app).delete(`/api/matriculas/${idMatricula}`).set(auth('aluno'));
    await pool.query('UPDATE Turmas SET status = ? WHERE id_turma = ?', [status, turma]);

    const response = await request(app).post('/api/matriculas').set(auth('aluno')).send({ id_turma: turma });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('TURMA_NAO_ABERTA');
    expect(await matriculaAtual()).toMatchObject({ ciclo_atual: 1, status_aprovacao: 'CANCELADO' });
});

test('migration 010 é reaplicável, rejeita órfãos e faz backfill conservador', async () => {
    const migration = fs.readFileSync(
        path.join(__dirname, '../../../mysql/migrations/010_enrollment_cycles.sql'), 'utf8'
    );
    const [matricula] = await pool.query(
        `INSERT INTO Matriculas (id_aluno,id_turma,data_matricula)
         VALUES (?,?,'2026-02-01 00:00:00')`, [users.aluno.id_usuario, turma]
    );
    const questionario = await criarQuestionario('EXERCICIO');
    await pool.query(
        `INSERT INTO Q_Tentativas
         (id_questionario,id_usuario,id_turma,total_perguntas,chave_idempotencia,iniciada_em,finalizada_em)
         VALUES (?,?,?,?,?,'2026-01-01 00:00:00','2026-01-01 00:01:00'),
                (?,?,?,?,?,'2026-03-01 00:00:00','2026-03-01 00:01:00')`,
        [questionario.id, users.aluno.id_usuario, turma, 1, crypto.randomUUID(),
            questionario.id, users.aluno.id_usuario, turma, 1, crypto.randomUUID()]
    );

    await pool.query(
        `ALTER TABLE Q_Tentativas
         DROP INDEX idx_tentativas_ciclo_atual,
         DROP INDEX uk_tentativa_idempotente,
         DROP CHECK chk_tentativas_ciclo,
         DROP COLUMN ciclo_matricula,
         ADD UNIQUE KEY uk_tentativa_idempotente (id_usuario,id_questionario,chave_idempotencia)`
    );
    await pool.query(
        'ALTER TABLE Matriculas DROP CHECK chk_matriculas_ciclo, DROP COLUMN ciclo_atual'
    );
    await pool.query('DELETE FROM Matriculas WHERE id_matricula = ?', [matricula.insertId]);

    await expect(executarMigration(migration)).rejects.toMatchObject({
        code: 'ER_CHECK_CONSTRAINT_VIOLATED'
    });
    const [antes] = await pool.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Matriculas' AND COLUMN_NAME = 'ciclo_atual'`
    );
    expect(antes).toHaveLength(0);

    await pool.query(
        `INSERT INTO Matriculas (id_aluno,id_turma,data_matricula)
         VALUES (?,?,'2026-02-01 00:00:00')`, [users.aluno.id_usuario, turma]
    );
    await executarMigration(migration);
    await executarMigration(migration);

    expect(await matriculaAtual()).toMatchObject({ ciclo_atual: 2 });
    const [tentativas] = await pool.query(
        'SELECT ciclo_matricula FROM Q_Tentativas ORDER BY iniciada_em'
    );
    expect(tentativas.map((item) => item.ciclo_matricula)).toEqual([1, 2]);
    await expect(pool.query('UPDATE Matriculas SET ciclo_atual = 0 WHERE id_aluno = ?', [users.aluno.id_usuario]))
        .rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
    await expect(pool.query('UPDATE Q_Tentativas SET ciclo_matricula = 0 LIMIT 1'))
        .rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
    await expect(assertCanonicalSchema(pool, process.env.DB_NAME, { allowMissingMigrationLedger: true }))
        .resolves.toMatchObject({ status: 'ok' });
});
