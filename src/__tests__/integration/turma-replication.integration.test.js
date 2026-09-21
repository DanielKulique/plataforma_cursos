'use strict';

const request = require('supertest');
const {
    initTestPool,
    clearDatabase,
    seedBasicData,
    closeTestPool,
    getSessionToken,
    getTestPassword
} = require('./setup');
const { app } = require('../../../index');
const applicationDb = require('../../config/database');

const testPassword = getTestPassword();
let pool;
let users;
let adminToken;
let professorToken;
let alunoToken;

async function login(email) {
    const response = await request(app).post('/api/auth/login').send({ email, senha: testPassword });
    return getSessionToken(response);
}

async function criarOrigem({ nome = 'Turma demonstração A', status = 'ENCERRADA', falha = false } = {}) {
    const [curso] = await pool.query(
        `INSERT INTO Cursos (nome_curso, descricao, carga_horaria)
         VALUES (?, 'Estrutura para replicação', 40)`,
        [`Curso ${nome}`]
    );
    const [turma] = await pool.query(
        `INSERT INTO Turmas
         (id_curso, id_professor, nome_turma, data_inicio, data_fim, status)
         VALUES (?, ?, ?, '2026-02-01', '2026-06-30', ?)`,
        [curso.insertId, users.professor.id_usuario, nome, status]
    );
    const idTurma = turma.insertId;

    const [moduloUm] = await pool.query(
        `INSERT INTO Modulos (id_turma, titulo, descricao, ordem)
         VALUES (?, 'Fundamentos', 'Base conceitual', 1)`,
        [idTurma]
    );
    const [moduloDois] = await pool.query(
        `INSERT INTO Modulos (id_turma, titulo, descricao, ordem)
         VALUES (?, 'Prática', 'Aplicação orientada', 2)`,
        [idTurma]
    );

    const conteudos = [
        [moduloUm.insertId, 'Introdução', 'TEXTO', null, 'Texto acadêmico', null, 1],
        [moduloUm.insertId, 'Videoaula', 'VIDEO', 'https://www.youtube.com/embed/dQw4w9WgXcQ', null, 8, 2],
        [moduloDois.insertId, 'Guia em PDF', 'PDF', '/assets/materiais/guia-integridade-academica.pdf', null, null, 3],
        [moduloDois.insertId, 'Referência externa', 'LINK', 'https://example.com/referencia', null, null, 4],
        [null, 'Atividade final', 'ATIVIDADE', null, 'Produza uma síntese.', 20, 5]
    ];
    for (const conteudo of conteudos) {
        await pool.query(
            `INSERT INTO Conteudos
             (id_turma, id_modulo, titulo, tipo, url, corpo, duracao_minutos, ordem)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [idTurma, ...conteudo]
        );
    }

    const [exercicio] = await pool.query(
        `INSERT INTO Questionarios (id_curso, id_turma, titulo, descricao, ativo, tipo)
         VALUES (?, ?, 'Exercício de revisão', 'Pratique os conceitos.', 1, 'EXERCICIO')`,
        [curso.insertId, idTurma]
    );
    const [prova] = await pool.query(
        `INSERT INTO Questionarios (id_curso, id_turma, titulo, descricao, ativo, tipo)
         VALUES (?, ?, 'Prova final', 'Avaliação somativa.', 1, 'PROVA')`,
        [curso.insertId, idTurma]
    );
    const [perguntaUm] = await pool.query(
        `INSERT INTO Q_Perguntas
         (id_questionario, texto_pergunta, tipo_pergunta, ordem, pontos)
         VALUES (?, 'Qual é a resposta correta?', 'MULTIPLA_ESCOLHA', 1, 2.5)`,
        [exercicio.insertId]
    );
    const [perguntaDois] = await pool.query(
        `INSERT INTO Q_Perguntas
         (id_questionario, texto_pergunta, tipo_pergunta, ordem, pontos)
         VALUES (?, 'Explique o conceito.', 'RESPOSTA_CURTA', 1, 7.5)`,
        [prova.insertId]
    );
    const [opcaoCorreta] = await pool.query(
        `INSERT INTO Q_Opcoes (id_pergunta, texto_opcao, ordem, correta)
         VALUES (?, ?, 1, 1)`,
        [perguntaUm.insertId, falha ? 'Falhar na cópia' : 'Alternativa correta']
    );
    await pool.query(
        `INSERT INTO Q_Opcoes (id_pergunta, texto_opcao, ordem, correta)
         VALUES (?, 'Alternativa incorreta', 2, 0)`,
        [perguntaUm.insertId]
    );

    const [matricula] = await pool.query(
        `INSERT INTO Matriculas
         (id_aluno, id_turma, nota_final, status_aprovacao, progresso_percentual)
         VALUES (?, ?, 9.5, 'APROVADO', 100)`,
        [users.aluno.id_usuario, idTurma]
    );
    await pool.query(
        `INSERT INTO Certificados
         (id_aluno, id_turma, codigo_publico, aluno_nome, curso_nome, turma_nome,
          carga_horaria, sha256, storage_name, tamanho_bytes, id_usuario_emissor)
         VALUES (?, ?, ?, 'Aluno Teste', ?, ?, 40, ?, ?, 10, ?)`,
        [
            users.aluno.id_usuario,
            idTurma,
            `CERT-${String(idTurma).padStart(8, '0')}-AAAAAAAA-BBBBBBBB-CCCCCCCC`,
            `Curso ${nome}`,
            nome,
            String(idTurma).padStart(64, 'a').slice(-64),
            `${String(idTurma).padStart(8, '0')}-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf`,
            users.admin.id_usuario
        ]
    );
    const [primeiroConteudo] = await pool.query(
        'SELECT id_conteudo FROM Conteudos WHERE id_turma = ? ORDER BY ordem LIMIT 1',
        [idTurma]
    );
    await pool.query(
        `INSERT INTO ConteudosProgresso
         (id_aluno, id_conteudo, status, iniciado_em, concluido_em)
         VALUES (?, ?, 'CONCLUIDO', NOW(), NOW())`,
        [users.aluno.id_usuario, primeiroConteudo[0].id_conteudo]
    );
    const [tentativa] = await pool.query(
        `INSERT INTO Q_Tentativas
         (id_questionario, id_usuario, id_turma, pontuacao, percentual, acertos,
          total_perguntas, chave_idempotencia, finalizada_em)
         VALUES (?, ?, ?, 2.5, 100, 1, 1, '11111111-1111-4111-8111-111111111111', NOW())`,
        [exercicio.insertId, users.aluno.id_usuario, idTurma]
    );
    await pool.query(
        `INSERT INTO Q_Respostas
         (id_pergunta, id_usuario, id_questionario, id_tentativa, resposta_opcao, correta)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [
            perguntaUm.insertId, users.aluno.id_usuario, exercicio.insertId,
            tentativa.insertId, opcaoCorreta.insertId
        ]
    );

    return { idTurma, idCurso: curso.insertId, idMatricula: matricula.insertId };
}

function payload(nome = 'Turma demonstração B') {
    return {
        nome_turma: nome,
        id_professor: users.professor.id_usuario,
        data_inicio: '2026-08-01',
        data_fim: '2026-12-15',
        status: 'ABERTA'
    };
}

async function replicar(idTurma, chave, dados = payload()) {
    return request(app)
        .post(`/api/turmas/${idTurma}/replicar`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Idempotency-Key', chave)
        .send(dados);
}

beforeAll(async () => {
    pool = await initTestPool();
});

beforeEach(async () => {
    await clearDatabase();
    users = await seedBasicData();
    [adminToken, professorToken, alunoToken] = await Promise.all([
        login('admin@teste.com'),
        login('professor@teste.com'),
        login('aluno@teste.com')
    ]);
});

afterAll(async () => {
    await closeTestPool();
    await applicationDb.end();
});

describe('replicação transacional de turmas', () => {
    it('replica toda a estrutura com IDs novos, sem histórico e com independência', async () => {
        const origem = await criarOrigem();
        const resumo = await request(app)
            .get(`/api/turmas/${origem.idTurma}/replicacao-resumo`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(resumo.status).toBe(200);
        expect(resumo.body.resumo).toMatchObject({
            modulos: 2,
            conteudos: 5,
            videos: 1,
            pdfs: 1,
            questionarios: 1,
            provas: 1,
            perguntas: 2,
            alternativas: 2
        });

        const response = await replicar(
            origem.idTurma,
            'replicacao-integracao-00000001'
        );
        expect(response.status).toBe(201);
        expect(response.body.message).toBe('Turma replicada com sucesso.');
        expect(response.body.reutilizada).toBe(false);
        const idDestino = response.body.turma.id_turma;
        expect(idDestino).not.toBe(origem.idTurma);

        const [auditoria] = await pool.query(
            `SELECT id_turma_origem, id_turma_destino, id_usuario_admin
             FROM ReplicacoesTurma WHERE id_turma_destino = ?`,
            [idDestino]
        );
        expect(auditoria[0]).toMatchObject({
            id_turma_origem: origem.idTurma,
            id_turma_destino: idDestino,
            id_usuario_admin: users.admin.id_usuario
        });

        const [modulos] = await pool.query(
            'SELECT id_modulo, id_turma, titulo, descricao, ordem FROM Modulos WHERE id_turma IN (?, ?) ORDER BY id_turma, ordem',
            [origem.idTurma, idDestino]
        );
        const modulosOrigem = modulos.filter((item) => item.id_turma === origem.idTurma);
        const modulosDestino = modulos.filter((item) => item.id_turma === idDestino);
        expect(modulosDestino.map(({ titulo, descricao, ordem }) => ({ titulo, descricao, ordem })))
            .toEqual(modulosOrigem.map(({ titulo, descricao, ordem }) => ({ titulo, descricao, ordem })));
        expect(modulosDestino.map((item) => item.id_modulo))
            .not.toEqual(modulosOrigem.map((item) => item.id_modulo));

        const [conteudos] = await pool.query(
            `SELECT id_conteudo, id_turma, id_modulo, titulo, tipo, url, corpo, ordem
             FROM Conteudos WHERE id_turma IN (?, ?) ORDER BY id_turma, ordem`,
            [origem.idTurma, idDestino]
        );
        const conteudosOrigem = conteudos.filter((item) => item.id_turma === origem.idTurma);
        const conteudosDestino = conteudos.filter((item) => item.id_turma === idDestino);
        expect(conteudosDestino.map((item) => item.id_conteudo))
            .not.toEqual(conteudosOrigem.map((item) => item.id_conteudo));
        expect(conteudosDestino.map((item) => item.tipo)).toEqual(conteudosOrigem.map((item) => item.tipo));
        expect(conteudosDestino.find((item) => item.tipo === 'PDF').url)
            .toBe('/assets/materiais/guia-integridade-academica.pdf');
        expect(new Set(conteudosDestino.map((item) => item.id_modulo).filter(Boolean)))
            .toEqual(new Set(modulosDestino.map((item) => item.id_modulo)));

        const [questionarios] = await pool.query(
            `SELECT id_questionario, id_turma, titulo, descricao, tipo, ativo
             FROM Questionarios WHERE id_turma IN (?, ?) ORDER BY id_turma, tipo, titulo`,
            [origem.idTurma, idDestino]
        );
        const questionariosOrigem = questionarios.filter((item) => item.id_turma === origem.idTurma);
        const questionariosDestino = questionarios.filter((item) => item.id_turma === idDestino);
        expect(questionariosDestino.map((item) => item.id_questionario))
            .not.toEqual(questionariosOrigem.map((item) => item.id_questionario));
        expect(questionariosDestino.map(({ titulo, descricao, tipo, ativo }) => ({ titulo, descricao, tipo, ativo })))
            .toEqual(questionariosOrigem.map(({ titulo, descricao, tipo, ativo }) => ({ titulo, descricao, tipo, ativo })));

        const [perguntasDestino] = await pool.query(
            `SELECT p.id_pergunta, p.texto_pergunta, p.ordem, p.pontos, q.id_questionario
             FROM Q_Perguntas p INNER JOIN Questionarios q ON q.id_questionario = p.id_questionario
             WHERE q.id_turma = ? ORDER BY q.tipo, p.ordem`,
            [idDestino]
        );
        const [perguntasOrigem] = await pool.query(
            `SELECT p.id_pergunta, p.texto_pergunta, p.ordem, p.pontos
             FROM Q_Perguntas p INNER JOIN Questionarios q ON q.id_questionario = p.id_questionario
             WHERE q.id_turma = ? ORDER BY q.tipo, p.ordem`,
            [origem.idTurma]
        );
        expect(perguntasDestino.map((item) => item.id_pergunta))
            .not.toEqual(perguntasOrigem.map((item) => item.id_pergunta));
        const [alternativasDestino] = await pool.query(
            `SELECT o.id_opcao, o.id_pergunta, o.texto_opcao, o.ordem, o.correta
             FROM Q_Opcoes o
             INNER JOIN Q_Perguntas p ON p.id_pergunta = o.id_pergunta
             INNER JOIN Questionarios q ON q.id_questionario = p.id_questionario
             WHERE q.id_turma = ? ORDER BY o.ordem`,
            [idDestino]
        );
        expect(alternativasDestino).toHaveLength(2);
        expect(alternativasDestino.some((item) => item.correta === 1)).toBe(true);
        expect(perguntasDestino.map((item) => item.id_pergunta)).toContain(alternativasDestino[0].id_pergunta);

        const [[semDados]] = await pool.query(
            `SELECT
                (SELECT COUNT(*) FROM Matriculas WHERE id_turma = ?) AS matriculas,
                (SELECT COUNT(*) FROM ConteudosProgresso p INNER JOIN Conteudos c ON c.id_conteudo = p.id_conteudo WHERE c.id_turma = ?) AS progressos,
                (SELECT COUNT(*) FROM Q_Tentativas WHERE id_turma = ?) AS tentativas,
                (SELECT COUNT(*) FROM Q_Respostas r INNER JOIN Questionarios q ON q.id_questionario = r.id_questionario WHERE q.id_turma = ?) AS respostas,
                (SELECT COUNT(*) FROM Certificados WHERE id_turma = ?) AS certificados`,
            [idDestino, idDestino, idDestino, idDestino, idDestino]
        );
        expect(semDados).toEqual({
            matriculas: 0,
            progressos: 0,
            tentativas: 0,
            respostas: 0,
            certificados: 0
        });

        const pdfDestino = conteudosDestino.find((item) => item.tipo === 'PDF');
        expect((await request(app).get('/assets/materiais/guia-integridade-academica.pdf')).status).toBe(404);
        expect((await request(app)
            .get(`/api/conteudos/${pdfDestino.id_conteudo}/material`)
            .set('Authorization', `Bearer ${adminToken}`)).status).toBe(200);

        await pool.query('UPDATE Modulos SET titulo = ? WHERE id_modulo = ?', ['Destino editado', modulosDestino[0].id_modulo]);
        await pool.query('UPDATE Conteudos SET corpo = ? WHERE id_conteudo = ?', ['Destino independente', conteudosDestino[0].id_conteudo]);
        await pool.query('UPDATE Q_Perguntas SET texto_pergunta = ? WHERE id_pergunta = ?', ['Destino?', perguntasDestino[0].id_pergunta]);
        await pool.query('DELETE FROM Conteudos WHERE id_conteudo = ?', [conteudosDestino.at(-1).id_conteudo]);
        const [[origemIntacta]] = await pool.query(
            `SELECT
                (SELECT titulo FROM Modulos WHERE id_modulo = ?) AS modulo,
                (SELECT corpo FROM Conteudos WHERE id_conteudo = ?) AS corpo,
                (SELECT texto_pergunta FROM Q_Perguntas WHERE id_pergunta = ?) AS pergunta,
                (SELECT COUNT(*) FROM Conteudos WHERE id_turma = ?) AS conteudos`,
            [modulosOrigem[0].id_modulo, conteudosOrigem[0].id_conteudo, perguntasOrigem[0].id_pergunta, origem.idTurma]
        );
        expect(origemIntacta).toMatchObject({
            modulo: 'Fundamentos',
            corpo: 'Texto acadêmico',
            conteudos: 5
        });
        expect(origemIntacta.pergunta).not.toBe('Destino?');

        await pool.query('UPDATE Modulos SET descricao = ? WHERE id_modulo = ?', ['Origem alterada', modulosOrigem[0].id_modulo]);
        const [[destinoIntacto]] = await pool.query(
            'SELECT descricao FROM Modulos WHERE id_modulo = ?',
            [modulosDestino[0].id_modulo]
        );
        expect(destinoIntacto.descricao).toBe('Base conceitual');

        const matricula = await request(app)
            .post('/api/matriculas')
            .set('Authorization', `Bearer ${alunoToken}`)
            .send({ id_turma: idDestino });
        expect(matricula.status).toBe(201);
    });

    it('restringe a ADMIN e torna retries e chamadas concorrentes idempotentes', async () => {
        const origem = await criarOrigem({ nome: 'Turma idempotente', status: 'ABERTA' });
        const dados = payload('Turma idempotente replicada');
        const proibida = await request(app)
            .post(`/api/turmas/${origem.idTurma}/replicar`)
            .set('Authorization', `Bearer ${professorToken}`)
            .set('Idempotency-Key', 'replicacao-proibida-000001')
            .send(dados);
        expect(proibida.status).toBe(403);

        const chave = 'replicacao-concorrente-000001';
        const respostas = await Promise.all([
            replicar(origem.idTurma, chave, dados),
            replicar(origem.idTurma, chave, dados)
        ]);
        expect(respostas.map((item) => item.status).sort()).toEqual([200, 201]);
        expect(new Set(respostas.map((item) => item.body.turma.id_turma)).size).toBe(1);
        const idDestino = respostas[0].body.turma.id_turma;
        const [destinos] = await pool.query('SELECT id_turma FROM Turmas WHERE nome_turma = ?', [dados.nome_turma]);
        expect(destinos).toHaveLength(1);

        await pool.query('UPDATE Turmas SET status = ? WHERE id_turma = ?', ['FECHADA', idDestino]);
        const retryAposEdicao = await replicar(origem.idTurma, chave, dados);
        expect(retryAposEdicao.status).toBe(200);
        expect(retryAposEdicao.body.turma.id_turma).toBe(idDestino);
        expect(retryAposEdicao.body.turma.status).toBe('FECHADA');

        const conflito = await replicar(origem.idTurma, chave, payload('Outro destino'));
        expect(conflito.status).toBe(409);
        expect(conflito.body.code).toBe('CHAVE_IDEMPOTENCIA_REUTILIZADA');
    });

    it('faz rollback integral quando uma etapa da clonagem falha', async () => {
        const origem = await criarOrigem({ nome: 'Turma rollback', falha: true });
        await pool.query('DROP TRIGGER IF EXISTS teste_falha_replicacao');
        await pool.query(
            `CREATE TRIGGER teste_falha_replicacao BEFORE INSERT ON Q_Opcoes
             FOR EACH ROW
             BEGIN
               IF NEW.texto_opcao = 'Falhar na cópia' THEN
                 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Falha controlada na clonagem';
               END IF;
             END`
        );
        try {
            const response = await replicar(
                origem.idTurma,
                'replicacao-rollback-00000001',
                payload('Turma que deve sofrer rollback')
            );
            expect(response.status).toBe(500);
            const [turmas] = await pool.query(
                'SELECT id_turma FROM Turmas WHERE nome_turma = ?',
                ['Turma que deve sofrer rollback']
            );
            expect(turmas).toHaveLength(0);
            const [auditorias] = await pool.query(
                'SELECT id_replicacao FROM ReplicacoesTurma WHERE chave_idempotencia = ?',
                ['replicacao-rollback-00000001']
            );
            expect(auditorias).toHaveLength(0);
        } finally {
            await pool.query('DROP TRIGGER IF EXISTS teste_falha_replicacao');
        }
    });
});
