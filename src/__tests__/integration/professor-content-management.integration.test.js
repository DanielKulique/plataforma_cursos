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

let pool;
let users;
let tokens;
let ids;
const testPassword = getTestPassword();

function como(token) {
    return { Authorization: `Bearer ${token}` };
}

async function login(email) {
    const response = await request(app)
        .post('/api/auth/login')
        .send({ email, senha: testPassword });
    expect(response.status).toBe(200);
    return getSessionToken(response);
}

async function criarCenario() {
    const [hashRows] = await pool.query(
        "SELECT senha FROM Usuarios WHERE email = 'professor@teste.com'"
    );
    const [professorAlheio] = await pool.query(
        `INSERT INTO Usuarios (nome_completo, cpf, email, senha, telefone, tipo)
         VALUES ('Professor Alheio Conteúdo', '44444444444',
                 'professor.conteudo.alheio@teste.com', ?, '11999999996', 'PROFESSOR')`,
        [hashRows[0].senha]
    );
    await pool.query(
        `INSERT INTO EmailVerificacoes (email, codigo, verificado, expira_em)
         VALUES ('professor.conteudo.alheio@teste.com', '000000', 1,
                 DATE_ADD(NOW(), INTERVAL 1 YEAR))`
    );
    const [curso] = await pool.query(
        `INSERT INTO Cursos (nome_curso, descricao, carga_horaria)
         VALUES ('Curso autoria professor', 'Integração MySQL real', 20)`
    );
    const criarTurma = async (professor, nome, status) => {
        const [result] = await pool.query(
            `INSERT INTO Turmas
             (id_curso, id_professor, nome_turma, data_inicio, status)
             VALUES (?, ?, ?, '2026-09-01', ?)`,
            [curso.insertId, professor, nome, status]
        );
        return result.insertId;
    };
    const turmaAberta = await criarTurma(users.professor.id_usuario, 'Turma aberta autoria', 'ABERTA');
    const turmaFechada = await criarTurma(users.professor.id_usuario, 'Turma fechada autoria', 'FECHADA');
    const turmaEncerrada = await criarTurma(users.professor.id_usuario, 'Turma encerrada autoria', 'ENCERRADA');
    const turmaAlheia = await criarTurma(professorAlheio.insertId, 'Turma alheia autoria', 'ABERTA');
    await pool.query(
        `INSERT INTO Matriculas (id_aluno, id_turma, status_aprovacao)
         VALUES (?, ?, 'CURSANDO')`,
        [users.aluno.id_usuario, turmaAberta]
    );
    const [moduloProprio] = await pool.query(
        `INSERT INTO Modulos (id_turma, titulo, descricao, ordem)
         VALUES (?, 'Módulo inicial', 'Base para edição', 1)`,
        [turmaAberta]
    );
    const [moduloAlheio] = await pool.query(
        `INSERT INTO Modulos (id_turma, titulo, descricao, ordem)
         VALUES (?, 'Módulo alheio', 'Não pertence ao professor', 1)`,
        [turmaAlheia]
    );
    const [conteudoProprio] = await pool.query(
        `INSERT INTO Conteudos
         (id_turma, id_modulo, titulo, descricao, tipo, corpo, ordem)
         VALUES (?, ?, 'Texto inicial', 'Base para edição', 'TEXTO', 'Corpo inicial', 1)`,
        [turmaAberta, moduloProprio.insertId]
    );
    const [conteudoAlheio] = await pool.query(
        `INSERT INTO Conteudos
         (id_turma, id_modulo, titulo, descricao, tipo, corpo, ordem)
         VALUES (?, ?, 'Texto alheio', 'Não pode ser alterado', 'TEXTO', 'Corpo alheio', 1)`,
        [turmaAlheia, moduloAlheio.insertId]
    );

    return {
        curso: curso.insertId,
        professorAlheio: professorAlheio.insertId,
        turmaAberta,
        turmaFechada,
        turmaEncerrada,
        turmaAlheia,
        moduloProprio: moduloProprio.insertId,
        moduloAlheio: moduloAlheio.insertId,
        conteudoProprio: conteudoProprio.insertId,
        conteudoAlheio: conteudoAlheio.insertId
    };
}

async function criarConteudo(payload = {}) {
    return request(app)
        .post(`/api/turmas/${ids.turmaAberta}/conteudos`)
        .set(como(tokens.professor))
        .send({
            id_modulo: ids.moduloProprio,
            titulo: 'Conteúdo criado pelo professor',
            tipo: 'TEXTO',
            corpo: 'Persistido no MySQL',
            ordem: 2,
            ...payload
        });
}

describe('Goal — gerenciamento de conteúdos pelo professor', () => {
    beforeAll(async () => {
        pool = await initTestPool();
    });

    beforeEach(async () => {
        await clearDatabase();
        users = await seedBasicData();
        ids = await criarCenario();
        tokens = {
            admin: await login('admin@teste.com'),
            professor: await login('professor@teste.com'),
            professorAlheio: await login('professor.conteudo.alheio@teste.com'),
            aluno: await login('aluno@teste.com')
        };
    });

    afterAll(async () => {
        await closeTestPool();
        await applicationDb.end();
    });

    it('professor cria módulo em turmas ABERTA e FECHADA às quais está atribuído', async () => {
        const aberta = await request(app)
            .post(`/api/turmas/${ids.turmaAberta}/modulos`)
            .set(como(tokens.professor))
            .send({ titulo: 'Módulo aberto', descricao: 'Autoria', ordem: 2 });
        const fechada = await request(app)
            .post(`/api/turmas/${ids.turmaFechada}/modulos`)
            .set(como(tokens.professor))
            .send({ titulo: 'Módulo fechado', descricao: 'Autoria continua', ordem: 1 });

        expect(aberta.status).toBe(201);
        expect(fechada.status).toBe(201);
        const [rows] = await pool.query(
            'SELECT id_turma, titulo FROM Modulos WHERE titulo IN (?, ?) ORDER BY titulo',
            ['Módulo aberto', 'Módulo fechado']
        );
        expect(rows).toHaveLength(2);
    });

    it('professor cria texto na própria turma e persiste corpo, módulo e ordem', async () => {
        const response = await criarConteudo();
        expect(response.status).toBe(201);
        const [rows] = await pool.query(
            `SELECT id_turma, id_modulo, tipo, corpo, ordem
             FROM Conteudos WHERE id_conteudo = ?`,
            [response.body.conteudo.id_conteudo]
        );
        expect(rows[0]).toMatchObject({
            id_turma: ids.turmaAberta,
            id_modulo: ids.moduloProprio,
            tipo: 'TEXTO',
            corpo: 'Persistido no MySQL',
            ordem: 2
        });
    });

    it('professor cria vídeo com URL incorporável do YouTube', async () => {
        const response = await criarConteudo({
            titulo: 'Vídeo válido',
            tipo: 'VIDEO',
            url: 'https://www.youtube.com/watch?v=M7lc1UVf-VE'
        });
        expect(response.status).toBe(201);
        const [rows] = await pool.query(
            'SELECT tipo, url FROM Conteudos WHERE id_conteudo = ?',
            [response.body.conteudo.id_conteudo]
        );
        expect(rows[0]).toEqual({
            tipo: 'VIDEO',
            url: 'https://www.youtube-nocookie.com/embed/M7lc1UVf-VE'
        });
    });

    it('normaliza vídeo curto e rejeita HTML arbitrário', async () => {
        const watch = await criarConteudo({
            titulo: 'Short válido',
            tipo: 'VIDEO',
            url: 'https://youtu.be/M7lc1UVf-VE'
        });
        const html = await criarConteudo({
            titulo: 'HTML inválido',
            tipo: 'VIDEO',
            url: '<iframe src="https://www.youtube.com/embed/M7lc1UVf-VE"></iframe>'
        });
        expect(watch.status).toBe(201);
        expect(watch.body.conteudo.url).toBe('https://www.youtube-nocookie.com/embed/M7lc1UVf-VE');
        expect(html.status).toBe(422);
        expect(html.body.code).toBe('VIDEO_INVALIDO');
    });

    it('professor associa PDF pelo caminho local protegido existente', async () => {
        const response = await criarConteudo({
            titulo: 'PDF cadastrado',
            tipo: 'PDF',
            url: '/assets/materiais/guia-integridade-academica.pdf'
        });
        expect(response.status).toBe(201);
        const leitura = await request(app)
            .get(`/api/turmas/${ids.turmaAberta}/conteudos`)
            .set(como(tokens.professor));
        const pdf = leitura.body.conteudos.find(
            (item) => Number(item.id_conteudo) === Number(response.body.conteudo.id_conteudo)
        );
        expect(pdf.url).toBe(`/api/conteudos/${pdf.id_conteudo}/material`);
    });

    it('professor edita conteúdo da própria turma', async () => {
        const response = await request(app)
            .patch(`/api/conteudos/${ids.conteudoProprio}`)
            .set(como(tokens.professor))
            .send({ titulo: 'Texto revisado', corpo: 'Corpo revisado', ordem: 3 });
        expect(response.status).toBe(200);
        const [rows] = await pool.query(
            'SELECT titulo, corpo, ordem FROM Conteudos WHERE id_conteudo = ?',
            [ids.conteudoProprio]
        );
        expect(rows[0]).toEqual({ titulo: 'Texto revisado', corpo: 'Corpo revisado', ordem: 3 });
    });

    it('professor não edita nem remove conteúdo de outra turma manipulando o ID', async () => {
        const editar = await request(app)
            .patch(`/api/conteudos/${ids.conteudoAlheio}`)
            .set(como(tokens.professor))
            .send({ titulo: 'Ataque por ID' });
        const remover = await request(app)
            .delete(`/api/conteudos/${ids.conteudoAlheio}`)
            .set(como(tokens.professor));
        expect(editar.status).toBe(403);
        expect(remover.status).toBe(403);
        const [rows] = await pool.query(
            'SELECT titulo FROM Conteudos WHERE id_conteudo = ?',
            [ids.conteudoAlheio]
        );
        expect(rows[0].titulo).toBe('Texto alheio');
    });

    it('professor não cria nem move conteúdo para módulo de outra turma', async () => {
        const criar = await criarConteudo({ id_modulo: ids.moduloAlheio });
        const mover = await request(app)
            .patch(`/api/conteudos/${ids.conteudoProprio}`)
            .set(como(tokens.professor))
            .send({ id_modulo: ids.moduloAlheio });
        expect(criar.status).toBe(409);
        expect(criar.body.code).toBe('MODULO_FORA_DA_TURMA');
        expect(mover.status).toBe(409);
        expect(mover.body.code).toBe('MODULO_FORA_DA_TURMA');
    });

    it('professor não cria conteúdo diretamente na turma de outro professor', async () => {
        const response = await request(app)
            .post(`/api/turmas/${ids.turmaAlheia}/conteudos`)
            .set(como(tokens.professor))
            .send({ titulo: 'Ataque em turma alheia', tipo: 'TEXTO', ordem: 2 });
        expect(response.status).toBe(403);
        expect(response.body.code).toBe('GESTAO_ACADEMICA_NEGADA');
    });

    it('turma ENCERRADA rejeita criação de módulo, conteúdo e questionário', async () => {
        const respostas = await Promise.all([
            request(app)
                .post(`/api/turmas/${ids.turmaEncerrada}/modulos`)
                .set(como(tokens.professor))
                .send({ titulo: 'Módulo tardio', ordem: 1 }),
            request(app)
                .post(`/api/turmas/${ids.turmaEncerrada}/conteudos`)
                .set(como(tokens.professor))
                .send({ titulo: 'Conteúdo tardio', tipo: 'TEXTO', ordem: 1 }),
            request(app)
                .post(`/api/turmas/${ids.turmaEncerrada}/questionarios`)
                .set(como(tokens.professor))
                .send({ titulo: 'Questionário tardio', tipo: 'EXERCICIO', ativo: false })
        ]);
        expect(respostas.map((item) => item.status)).toEqual([409, 409, 409]);
        respostas.forEach((item) => expect(item.body.code).toBe('TURMA_ENCERRADA'));
    });

    it('professor não altera progresso manualmente nem acessa CRUD administrativo global', async () => {
        const progresso = await request(app)
            .put(`/api/conteudos/${ids.conteudoProprio}/progresso`)
            .set(como(tokens.professor))
            .send({ status: 'CONCLUIDO' });
        const payloadIntruso = await request(app)
            .patch(`/api/conteudos/${ids.conteudoProprio}`)
            .set(como(tokens.professor))
            .send({ progresso_percentual: 100 });
        const admin = await request(app)
            .get('/api/admin/usuarios')
            .set(como(tokens.professor));
        expect(progresso.status).toBe(403);
        expect(payloadIntruso.status).toBe(400);
        expect(admin.status).toBe(403);
    });

    it('ADMIN mantém permissão global para criar e editar estrutura acadêmica', async () => {
        const criar = await request(app)
            .post(`/api/turmas/${ids.turmaAlheia}/conteudos`)
            .set(como(tokens.admin))
            .send({
                id_modulo: ids.moduloAlheio,
                titulo: 'Conteúdo administrativo',
                tipo: 'TEXTO',
                ordem: 2
            });
        expect(criar.status).toBe(201);
        const editar = await request(app)
            .patch(`/api/conteudos/${criar.body.conteudo.id_conteudo}`)
            .set(como(tokens.admin))
            .send({ titulo: 'Conteúdo administrativo revisado' });
        expect(editar.status).toBe(200);
    });

    it('ALUNO continua sem permissão de escrita estrutural', async () => {
        const respostas = await Promise.all([
            request(app)
                .post(`/api/turmas/${ids.turmaAberta}/modulos`)
                .set(como(tokens.aluno))
                .send({ titulo: 'Módulo do aluno', ordem: 2 }),
            request(app)
                .post(`/api/turmas/${ids.turmaAberta}/conteudos`)
                .set(como(tokens.aluno))
                .send({ titulo: 'Conteúdo do aluno', tipo: 'TEXTO', ordem: 2 }),
            request(app)
                .patch(`/api/conteudos/${ids.conteudoProprio}`)
                .set(como(tokens.aluno))
                .send({ titulo: 'Edição do aluno' })
        ]);
        expect(respostas.map((item) => item.status)).toEqual([403, 403, 403]);
    });

    it('conteúdo criado pelo professor aparece para aluno matriculado', async () => {
        const criado = await criarConteudo({ titulo: 'Texto visível ao aluno' });
        const leitura = await request(app)
            .get(`/api/turmas/${ids.turmaAberta}/conteudos`)
            .set(como(tokens.aluno));
        expect(criado.status).toBe(201);
        expect(leitura.status).toBe(200);
        expect(leitura.body.conteudos).toEqual(expect.arrayContaining([
            expect.objectContaining({ titulo: 'Texto visível ao aluno', corpo: 'Persistido no MySQL' })
        ]));
    });

    it('nova consulta mantém o conteúdo persistido no banco', async () => {
        const criado = await criarConteudo({ titulo: 'Texto após refresh' });
        const primeira = await request(app)
            .get(`/api/turmas/${ids.turmaAberta}/conteudos`)
            .set(como(tokens.professor));
        const segunda = await request(app)
            .get(`/api/turmas/${ids.turmaAberta}/conteudos`)
            .set(como(tokens.professor));
        const idCriado = criado.body.conteudo.id_conteudo;
        expect(primeira.body.conteudos.some((item) => item.id_conteudo === idCriado)).toBe(true);
        expect(segunda.body.conteudos.some((item) => item.id_conteudo === idCriado)).toBe(true);
    });

    it('proteção do PDF continua válida para rota estática, matrícula e professor alheio', async () => {
        const criado = await criarConteudo({
            titulo: 'PDF protegido pelo professor',
            tipo: 'PDF',
            url: '/assets/materiais/guia-integridade-academica.pdf'
        });
        const idConteudo = criado.body.conteudo.id_conteudo;
        const direto = await request(app)
            .get('/assets/materiais/guia-integridade-academica.pdf');
        const matriculado = await request(app)
            .get(`/api/conteudos/${idConteudo}/material`)
            .set(como(tokens.aluno));
        const professorAlheio = await request(app)
            .get(`/api/conteudos/${idConteudo}/material`)
            .set(como(tokens.professorAlheio));
        expect(direto.status).toBe(404);
        expect(matriculado.status).toBe(200);
        expect(matriculado.headers['cache-control']).toBe('private, no-store');
        expect(professorAlheio.status).toBe(403);
    });

    it('histórico de progresso impede exclusão destrutiva do conteúdo', async () => {
        const progresso = await request(app)
            .put(`/api/conteudos/${ids.conteudoProprio}/progresso`)
            .set(como(tokens.aluno))
            .send({ status: 'CONCLUIDO' });
        const remover = await request(app)
            .delete(`/api/conteudos/${ids.conteudoProprio}`)
            .set(como(tokens.professor));
        expect(progresso.status).toBe(200);
        expect(remover.status).toBe(409);
        expect(remover.body.code).toBe('CONTEUDO_COM_HISTORICO');
    });

    it('professor cria questionário e pergunta somente no fluxo da própria turma', async () => {
        const questionario = await request(app)
            .post(`/api/turmas/${ids.turmaAberta}/questionarios`)
            .set(como(tokens.professor))
            .send({ titulo: 'Exercício do professor', tipo: 'EXERCICIO', ativo: false });
        expect(questionario.status).toBe(201);
        const pergunta = await request(app)
            .post(`/api/questionarios/${questionario.body.questionario.id_questionario}/perguntas`)
            .set(como(tokens.professor))
            .send({
                texto_pergunta: 'Qual é a prática correta?',
                tipo_pergunta: 'MULTIPLA_ESCOLHA',
                ordem: 1,
                pontos: 1,
                opcoes: [
                    { texto_opcao: 'Citar a fonte', ordem: 1, correta: true },
                    { texto_opcao: 'Ocultar a fonte', ordem: 2, correta: false }
                ]
            });
        expect(pergunta.status).toBe(201);
        const ataque = await request(app)
            .patch(`/api/questionarios/${questionario.body.questionario.id_questionario}`)
            .set(como(tokens.professorAlheio))
            .send({ titulo: 'Ataque por ID de questionário' });
        expect(ataque.status).toBe(403);
    });
    it('jornada: vínculo e ordem, acesso específico, final, histórico e replicação', async () => {
        const criar = async (titulo, tipo, id_modulo, ordem) => {
            const res = await request(app).post(`/api/turmas/${ids.turmaAberta}/questionarios`)
                .set(como(tokens.professor)).send({ titulo, tipo, id_modulo, ordem, ativo: true });
            expect(res.status).toBe(201);
            return res.body.questionario.id_questionario;
        };
        const exercicio = await criar('Exercício da introdução', 'EXERCICIO', ids.moduloProprio, 2);
        const prova = await criar('Prova final', 'PROVA', null, 10);
        const pergunta = await request(app).post(`/api/questionarios/${exercicio}/perguntas`)
            .set(como(tokens.professor)).send({ texto_pergunta: 'Citar a fonte?', ordem: 1,
                opcoes: [{ texto_opcao: 'Sim', ordem: 1, correta: true }, { texto_opcao: 'Não', ordem: 2, correta: false }] });
        expect(pergunta.status).toBe(201);
        const obter = await request(app).get(`/api/turmas/${ids.turmaAberta}/questionarios/disponivel?tipo=exercicio&id_questionario=${exercicio}`).set(como(tokens.aluno));
        expect(obter.status).toBe(200);
        expect(obter.body.questionario.id_modulo).toBe(ids.moduloProprio);
        expect(obter.body.questionario.perguntas[0].opcoes[0]).not.toHaveProperty('correta');
        const submeter = await request(app).post(`/api/questionarios/${exercicio}/submissoes`).set(como(tokens.aluno))
            .send({ submission_id: require('crypto').randomUUID(), respostas: [{ id_pergunta: obter.body.questionario.perguntas[0].id_pergunta, id_opcao: obter.body.questionario.perguntas[0].opcoes[0].id_opcao }] });
        expect(submeter.status).toBe(200);
        const mover = await request(app).patch(`/api/questionarios/${exercicio}`).set(como(tokens.professor)).send({ ordem: 3, id_modulo: ids.moduloProprio });
        expect(mover.status).toBe(200);
        const alterar = await request(app).patch(`/api/questionarios/${exercicio}`).set(como(tokens.professor)).send({ titulo: 'Alterar histórico' });
        expect(alterar.status).toBe(409);
        const trilha = await request(app).get(`/api/turmas/${ids.turmaAberta}/questionarios`).set(como(tokens.aluno));
        expect(trilha.status).toBe(200);
        expect(trilha.body.questionarios.find((q) => q.id_questionario === exercicio)).toMatchObject({ id_modulo: ids.moduloProprio, ordem: 3, concluido: 1 });
        expect(trilha.body.questionarios.find((q) => q.id_questionario === prova).id_modulo).toBeNull();
        const historico = await request(app).get(`/api/questionarios/historico?id_questionario=${exercicio}`).set(como(tokens.aluno));
        expect(historico.body.tentativas).toHaveLength(1);
        const replication = require('../../api/services/turma-replication.service');
        const replica = await replication.replicarTurma(ids.turmaAberta, { nome_turma: 'Cópia jornada', id_professor: users.professor.id_usuario, data_inicio: '2026-09-01', status: 'FECHADA' }, { id_usuario_admin: users.admin.id_usuario, chave_idempotencia: require('crypto').randomUUID() });
        const [clones] = await pool.query('SELECT q.id_modulo, q.ordem, m.id_turma FROM Questionarios q LEFT JOIN Modulos m ON m.id_modulo = q.id_modulo WHERE q.id_turma = ? AND q.tipo = \'EXERCICIO\'', [replica.turma.id_turma]);
        expect(clones[0]).toMatchObject({ ordem: 3, id_turma: replica.turma.id_turma });
        expect(clones[0].id_modulo).not.toBe(ids.moduloProprio);
        const [tentativas] = await pool.query('SELECT * FROM Q_Tentativas WHERE id_turma = ?', [replica.turma.id_turma]);
        expect(tentativas).toHaveLength(0);
    });

    it('jornada: bloqueia aula externa, professor alheio e autoria encerrada', async () => {
        const url = `/api/turmas/${ids.turmaAberta}/questionarios`;
        const dados = { titulo: 'Vínculo inválido', tipo: 'EXERCICIO', id_modulo: ids.moduloAlheio, ordem: 2 };
        expect((await request(app).post(url).set(como(tokens.professor)).send(dados)).status).toBe(409);
        expect((await request(app).post(url).set(como(tokens.professorAlheio)).send(dados)).status).toBe(403);
        expect((await request(app).post(`/api/turmas/${ids.turmaEncerrada}/questionarios`).set(como(tokens.admin)).send({ ...dados, id_modulo: null })).status).toBe(409);
        expect((await request(app).get(`/api/turmas/${ids.turmaAlheia}/questionarios`).set(como(tokens.aluno))).status).toBe(403);
        const criado = await request(app).post(url).set(como(tokens.admin)).send({ ...dados, id_modulo: ids.moduloProprio });
        expect(criado.status).toBe(201);
        expect((await request(app).get(`/api/turmas/${ids.turmaAlheia}/questionarios/disponivel?tipo=exercicio&id_questionario=${criado.body.questionario.id_questionario}`).set(como(tokens.aluno))).status).toBe(403);
        const apagar = await request(app).delete(`/api/modulos/${ids.moduloProprio}`).set(como(tokens.professor));
        expect(apagar.status).toBe(409);
    });

});
