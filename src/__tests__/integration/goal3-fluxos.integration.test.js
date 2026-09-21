const { seedProvaFinalAprovada } = require('./academic-fixtures');
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
const SUBMISSION_ID = '11111111-1111-4111-8111-111111111111';

let pool;
let users;
let tokens;
let ids;
const testPassword = getTestPassword();

async function login(email) {
    const response = await request(app)
        .post('/api/auth/login')
        .send({ email, senha: testPassword });
    expect(response.status).toBe(200);
    return getSessionToken(response);
}

async function criarCenario() {
    const [professorRows] = await pool.query(
        "SELECT senha FROM Usuarios WHERE email = 'professor@teste.com'"
    );
    const [professorAlheio] = await pool.query(
        `INSERT INTO Usuarios (nome_completo, cpf, email, senha, telefone, tipo)
         VALUES ('Professor Alheio', '44444444444', 'professor.alheio@teste.com', ?, '11999999996', 'PROFESSOR')`,
        [professorRows[0].senha]
    );
    const [curso] = await pool.query(
        `INSERT INTO Cursos (nome_curso, descricao, carga_horaria)
         VALUES ('Curso Goal 3', 'Dados reais para os fluxos do Goal 3', 24)`
    );
    const [turmaPropria] = await pool.query(
        `INSERT INTO Turmas (id_curso, id_professor, nome_turma, data_inicio, status)
         VALUES (?, ?, 'Turma própria Goal 3', '2026-07-01', 'ABERTA')`,
        [curso.insertId, users.professor.id_usuario]
    );
    const [turmaVazia] = await pool.query(
        `INSERT INTO Turmas (id_curso, id_professor, nome_turma, data_inicio, status)
         VALUES (?, ?, 'Turma vazia Goal 3', '2026-07-02', 'FECHADA')`,
        [curso.insertId, users.professor.id_usuario]
    );
    const [turmaAlheia] = await pool.query(
        `INSERT INTO Turmas (id_curso, id_professor, nome_turma, data_inicio, status)
         VALUES (?, ?, 'Turma alheia Goal 3', '2026-07-03', 'ABERTA')`,
        [curso.insertId, professorAlheio.insertId]
    );
    const [turmaDisponivel] = await pool.query(
        `INSERT INTO Turmas (id_curso, id_professor, nome_turma, data_inicio, status)
         VALUES (?, ?, 'Turma disponível Goal 3', '2026-07-04', 'ABERTA')`,
        [curso.insertId, users.professor.id_usuario]
    );
    const [matricula] = await pool.query(
        `INSERT INTO Matriculas (id_aluno, id_turma, status_aprovacao)
         VALUES (?, ?, 'CURSANDO')`,
        [users.aluno.id_usuario, turmaPropria.insertId]
    );
    const [modulo] = await pool.query(
        `INSERT INTO Modulos (id_turma, titulo, descricao, ordem)
         VALUES (?, 'Módulo persistido', 'Conteúdo vindo do MySQL', 1)`,
        [turmaPropria.insertId]
    );
    const [conteudoUm] = await pool.query(
        `INSERT INTO Conteudos (id_turma, id_modulo, titulo, descricao, tipo, corpo, ordem)
         VALUES (?, ?, 'Conteúdo um', 'Texto persistido', 'TEXTO', 'Corpo persistido', 1)`,
        [turmaPropria.insertId, modulo.insertId]
    );
    const [conteudoDois] = await pool.query(
        `INSERT INTO Conteudos (id_turma, id_modulo, titulo, descricao, tipo, url, ordem)
         VALUES (?, ?, 'Conteúdo dois', 'PDF permitido', 'PDF', '/assets/materiais/guia-integridade-academica.pdf', 2)`,
        [turmaPropria.insertId, modulo.insertId]
    );
    const [questionario] = await pool.query(
        `INSERT INTO Questionarios (id_curso, id_turma, titulo, descricao, ativo, tipo)
         VALUES (?, ?, 'Exercício real', 'Questionário persistido', 1, 'EXERCICIO')`,
        [curso.insertId, turmaPropria.insertId]
    );
    await pool.query(
        `INSERT INTO Questionarios (id_curso, id_turma, titulo, descricao, ativo, tipo)
         VALUES (?, ?, 'Prova inativa', 'Não disponível', 0, 'PROVA')`,
        [curso.insertId, turmaPropria.insertId]
    );
    const [perguntaUm] = await pool.query(
        `INSERT INTO Q_Perguntas
         (id_questionario, texto_pergunta, tipo_pergunta, ordem, pontos)
         VALUES (?, 'Pergunta de múltipla escolha', 'MULTIPLA_ESCOLHA', 1, 1)`,
        [questionario.insertId]
    );
    const [perguntaDois] = await pool.query(
        `INSERT INTO Q_Perguntas
         (id_questionario, texto_pergunta, tipo_pergunta, ordem, pontos)
         VALUES (?, 'Pergunta verdadeiro ou falso', 'VERDADEIRO_FALSO', 2, 1)`,
        [questionario.insertId]
    );
    const [opcaoUmCorreta] = await pool.query(
        `INSERT INTO Q_Opcoes (id_pergunta, texto_opcao, ordem, correta)
         VALUES (?, 'Correta 1', 1, 1)`,
        [perguntaUm.insertId]
    );
    const [opcaoUmIncorreta] = await pool.query(
        `INSERT INTO Q_Opcoes (id_pergunta, texto_opcao, ordem, correta)
         VALUES (?, 'Incorreta 1', 2, 0)`,
        [perguntaUm.insertId]
    );
    const [opcaoDoisCorreta] = await pool.query(
        `INSERT INTO Q_Opcoes (id_pergunta, texto_opcao, ordem, correta)
         VALUES (?, 'Verdadeiro', 1, 1)`,
        [perguntaDois.insertId]
    );
    const [opcaoDoisIncorreta] = await pool.query(
        `INSERT INTO Q_Opcoes (id_pergunta, texto_opcao, ordem, correta)
         VALUES (?, 'Falso', 2, 0)`,
        [perguntaDois.insertId]
    );

    return {
        curso: curso.insertId,
        professorAlheio: professorAlheio.insertId,
        turmaPropria: turmaPropria.insertId,
        turmaVazia: turmaVazia.insertId,
        turmaAlheia: turmaAlheia.insertId,
        turmaDisponivel: turmaDisponivel.insertId,
        matricula: matricula.insertId,
        modulo: modulo.insertId,
        conteudoUm: conteudoUm.insertId,
        conteudoDois: conteudoDois.insertId,
        questionario: questionario.insertId,
        perguntaUm: perguntaUm.insertId,
        perguntaDois: perguntaDois.insertId,
        opcaoUmCorreta: opcaoUmCorreta.insertId,
        opcaoUmIncorreta: opcaoUmIncorreta.insertId,
        opcaoDoisCorreta: opcaoDoisCorreta.insertId,
        opcaoDoisIncorreta: opcaoDoisIncorreta.insertId
    };
}

function como(token) {
    return { Authorization: `Bearer ${token}` };
}

describe('Goal 3 — fluxos reais de aluno e professor', () => {
    beforeAll(async () => {
        pool = await initTestPool();
        await clearDatabase();
        users = await seedBasicData();
        tokens = {
            aluno: await login('aluno@teste.com'),
            professor: await login('professor@teste.com'),
            admin: await login('admin@teste.com')
        };
    });

    beforeEach(async () => {
        await clearDatabase();
        users = await seedBasicData();
        ids = await criarCenario();
    });

    afterAll(async () => {
        await closeTestPool();
        await applicationDb.end();
    });

    describe('aluno', () => {
        it('faz catálogo, matrícula em turma aberta e lê a matrícula atualizada', async () => {
            const catalogo = await request(app).get('/api/cursos');
            const turmas = await request(app).get('/api/turmas');
            expect(catalogo.status).toBe(200);
            expect(catalogo.body.some((curso) => curso.id_curso === ids.curso)).toBe(true);
            expect(turmas.body.items.some((turma) => turma.id_turma === ids.turmaDisponivel)).toBe(true);

            const matricula = await request(app)
                .post('/api/matriculas')
                .set(como(tokens.aluno))
                .send({ id_turma: ids.turmaDisponivel });
            expect(matricula.status).toBe(201);

            const atualizadas = await request(app)
                .get(`/api/matriculas/aluno/${users.aluno.id_usuario}`)
                .set(como(tokens.aluno));
            expect(atualizadas.status).toBe(200);
            expect(atualizadas.body.some((item) => item.id_turma === ids.turmaDisponivel)).toBe(true);

            const salaVirtual = await request(app)
                .get('/api/matriculas/minha-sala')
                .set(como(tokens.aluno));
            expect(salaVirtual.status).toBe(200);
            expect(salaVirtual.body.turmas.map((turma) => turma.id_turma)).toEqual(
                expect.arrayContaining([ids.turmaPropria, ids.turmaDisponivel])
            );
        });

        it('acessa módulos e conteúdos quando matriculado e não recebe acesso sem matrícula', async () => {
            const permitido = await request(app)
                .get(`/api/turmas/${ids.turmaPropria}/conteudos`)
                .set(como(tokens.aluno));
            expect(permitido.status).toBe(200);
            expect(permitido.body.modulos).toHaveLength(1);
            expect(permitido.body.modulos[0].conteudos).toHaveLength(2);
            expect(permitido.body.conteudos[1].url).toBe(
                `/api/conteudos/${ids.conteudoDois}/material`
            );

            const negado = await request(app)
                .get(`/api/turmas/${ids.turmaAlheia}/conteudos`)
                .set(como(tokens.aluno));
            expect(negado.status).toBe(403);
        });

        it('serve PDF somente pela rota autenticada e vinculada à matrícula', async () => {
            const direto = await request(app)
                .get('/assets/materiais/guia-integridade-academica.pdf');
            const anonimo = await request(app)
                .get(`/api/conteudos/${ids.conteudoDois}/material`);
            const matriculado = await request(app)
                .get(`/api/conteudos/${ids.conteudoDois}/material`)
                .set(como(tokens.aluno));

            expect(direto.status).toBe(404);
            expect(anonimo.status).toBe(401);
            expect(matriculado.status).toBe(200);
            expect(matriculado.headers['content-type']).toMatch(/^application\/pdf/);
            expect(matriculado.headers['cache-control']).toBe('private, no-store');

            await pool.query(
                "UPDATE Matriculas SET status_aprovacao = 'CANCELADO' WHERE id_matricula = ?",
                [ids.matricula]
            );
            const cancelado = await request(app)
                .get(`/api/conteudos/${ids.conteudoDois}/material`)
                .set(como(tokens.aluno));
            expect(cancelado.status).toBe(403);
        });

        it('mantém payload XSS persistido como texto nos dados de conteúdo', async () => {
            const payload = '<img src=x onerror="globalThis.pwned=true">';
            await pool.query('UPDATE Conteudos SET titulo = ? WHERE id_conteudo = ?', [payload, ids.conteudoUm]);

            const response = await request(app)
                .get(`/api/turmas/${ids.turmaPropria}/conteudos`)
                .set(como(tokens.aluno));

            expect(response.status).toBe(200);
            expect(response.body.conteudos.find(
                (conteudo) => conteudo.id_conteudo === ids.conteudoUm
            ).titulo).toBe(payload);
        });

        it('conclui conteúdo de forma idempotente, calcula e persiste progresso após recarga', async () => {
            const primeira = await request(app)
                .put(`/api/conteudos/${ids.conteudoUm}/progresso`)
                .set(como(tokens.aluno))
                .send({ status: 'CONCLUIDO' });
            const repetida = await request(app)
                .put(`/api/conteudos/${ids.conteudoUm}/progresso`)
                .set(como(tokens.aluno))
                .send({ status: 'CONCLUIDO' });
            expect(primeira.status).toBe(200);
            expect(primeira.body).toMatchObject({ status: 'CONCLUIDO', progresso_percentual: 50 });
            expect(repetida.body).toMatchObject({ status: 'CONCLUIDO', progresso_percentual: 50 });

            const [progresso] = await pool.query(
                'SELECT status FROM ConteudosProgresso WHERE id_aluno = ? AND id_conteudo = ?',
                [users.aluno.id_usuario, ids.conteudoUm]
            );
            const [matriculas] = await pool.query(
                'SELECT progresso_percentual FROM Matriculas WHERE id_matricula = ?',
                [ids.matricula]
            );
            expect(progresso).toHaveLength(1);
            expect(progresso[0].status).toBe('CONCLUIDO');
            expect(matriculas[0].progresso_percentual).toBe(50);

            const recarga = await request(app)
                .get(`/api/turmas/${ids.turmaPropria}/conteudos`)
                .set(como(tokens.aluno));
            expect(recarga.body.conteudos.find(
                (item) => item.id_conteudo === ids.conteudoUm
            ).status_progresso).toBe('CONCLUIDO');
        });

        it('percorre conteúdo, recomposição do progresso e conclusão acadêmica persistida', async () => {
            for (const idConteudo of [ids.conteudoUm, ids.conteudoDois]) {
                const conclusao = await request(app)
                    .put(`/api/conteudos/${idConteudo}/progresso`)
                    .set(como(tokens.aluno))
                    .send({ status: 'CONCLUIDO' });
                expect(conclusao.status).toBe(200);
            }
            let matriculas = await request(app)
                .get(`/api/matriculas/aluno/${users.aluno.id_usuario}`)
                .set(como(tokens.aluno));
            expect(matriculas.body[0]).toMatchObject({
                progresso_percentual: 100,
                conteudos_concluidos: 2,
                total_conteudos: 2,
                conteudo_concluido: true
            });

            const novoConteudo = await request(app)
                .post(`/api/turmas/${ids.turmaPropria}/conteudos`)
                .set(como(tokens.professor))
                .send({
                    id_modulo: ids.modulo,
                    titulo: 'Conteúdo acrescentado',
                    tipo: 'TEXTO',
                    ordem: 3
                });
            expect(novoConteudo.status).toBe(201);

            matriculas = await request(app)
                .get(`/api/matriculas/aluno/${users.aluno.id_usuario}`)
                .set(como(tokens.aluno));
            expect(matriculas.body[0]).toMatchObject({
                progresso_percentual: 67,
                conteudos_concluidos: 2,
                total_conteudos: 3,
                conteudo_concluido: false
            });

            await request(app)
                .put(`/api/conteudos/${novoConteudo.body.conteudo.id_conteudo}/progresso`)
                .set(como(tokens.aluno))
                .send({ status: 'CONCLUIDO' });
            await seedProvaFinalAprovada(pool, users.aluno.id_usuario, ids.turmaPropria);
            const aprovado = await request(app)
                .patch(`/api/matriculas/${ids.matricula}`)
                .set(como(tokens.professor))
                .send({ nota_final: 9, status_aprovacao: 'APROVADO' });
            expect(aprovado.status).toBe(200);

            const tokenReaberto = await login('aluno@teste.com');
            const persistido = await request(app)
                .get(`/api/matriculas/aluno/${users.aluno.id_usuario}`)
                .set(como(tokenReaberto));
            expect(persistido.body[0]).toMatchObject({
                progresso_percentual: 100,
                nota_final: 9,
                status_aprovacao: 'APROVADO',
                conteudo_concluido: true
            });
        });

        it('não permite progresso de conteúdo sem matrícula', async () => {
            const response = await request(app)
                .put(`/api/conteudos/${ids.conteudoUm}/progresso`)
                .set(como(tokens.professor))
                .send({ status: 'CONCLUIDO' });
            expect(response.status).toBe(403);
        });

        it('bloqueia leitura, progresso e nova tentativa quando a turma está encerrada', async () => {
            await pool.query(
                "UPDATE Turmas SET status = 'ENCERRADA' WHERE id_turma = ?",
                [ids.turmaPropria]
            );
            const respostas = [
                request(app)
                    .get(`/api/turmas/${ids.turmaPropria}/conteudos`)
                    .set(como(tokens.aluno)),
                request(app)
                    .put(`/api/conteudos/${ids.conteudoUm}/progresso`)
                    .set(como(tokens.aluno))
                    .send({ status: 'CONCLUIDO' }),
                request(app)
                    .get(`/api/turmas/${ids.turmaPropria}/questionarios/disponivel?tipo=exercicio`)
                    .set(como(tokens.aluno)),
                request(app)
                    .post(`/api/questionarios/${ids.questionario}/submissoes`)
                    .set(como(tokens.aluno))
                    .send({
                        submission_id: SUBMISSION_ID,
                        respostas: [
                            { id_pergunta: ids.perguntaUm, id_opcao: ids.opcaoUmCorreta },
                            { id_pergunta: ids.perguntaDois, id_opcao: ids.opcaoDoisCorreta }
                        ]
                    }),
                request(app)
                    .post(`/api/turmas/${ids.turmaPropria}/conteudos`)
                    .set(como(tokens.professor))
                    .send({ titulo: 'Alteração tardia', tipo: 'TEXTO', ordem: 3 }),
                request(app)
                    .patch(`/api/perguntas/${ids.perguntaUm}`)
                    .set(como(tokens.professor))
                    .send({ texto_pergunta: 'Alteração tardia' })
            ];
            const resultados = await Promise.all(respostas);
            expect(resultados.map((response) => response.status)).toEqual([
                403, 403, 403, 403, 409, 409
            ]);
        });

        it('carrega questionário ativo sem expor respostas corretas e rejeita inativo', async () => {
            const ativo = await request(app)
                .get(`/api/turmas/${ids.turmaPropria}/questionarios/disponivel?tipo=exercicio`)
                .set(como(tokens.aluno));
            expect(ativo.status).toBe(200);
            expect(ativo.body.questionario.perguntas).toHaveLength(2);
            ativo.body.questionario.perguntas.forEach((pergunta) => {
                expect(pergunta.opcoes).toHaveLength(2);
                pergunta.opcoes.forEach((opcao) => expect(opcao).not.toHaveProperty('correta'));
            });

            const inativo = await request(app)
                .get(`/api/turmas/${ids.turmaPropria}/questionarios/disponivel?tipo=prova`)
                .set(como(tokens.aluno));
            expect(inativo.status).toBe(404);

            const semMatricula = await request(app)
                .get(`/api/turmas/${ids.turmaAlheia}/questionarios/disponivel?tipo=exercicio`)
                .set(como(tokens.aluno));
            expect(semMatricula.status).toBe(403);
        });

        it.each([
            ['opção de outra pergunta', (cenario) => [
                { id_pergunta: cenario.perguntaUm, id_opcao: cenario.opcaoDoisCorreta },
                { id_pergunta: cenario.perguntaDois, id_opcao: cenario.opcaoDoisIncorreta }
            ]],
            ['resposta duplicada', (cenario) => [
                { id_pergunta: cenario.perguntaUm, id_opcao: cenario.opcaoUmCorreta },
                { id_pergunta: cenario.perguntaUm, id_opcao: cenario.opcaoUmIncorreta },
                { id_pergunta: cenario.perguntaDois, id_opcao: cenario.opcaoDoisCorreta }
            ]],
            ['resposta ausente', (cenario) => [
                { id_pergunta: cenario.perguntaUm, id_opcao: cenario.opcaoUmCorreta }
            ]]
        ])('rejeita %s e faz rollback integral', async (descricao, respostas) => {
            const response = await request(app)
                .post(`/api/questionarios/${ids.questionario}/submissoes`)
                .set(como(tokens.aluno))
                .send({ submission_id: SUBMISSION_ID, respostas: respostas(ids) });
            expect(response.status).toBe(400);

            const [tentativas] = await pool.query(
                'SELECT id_tentativa FROM Q_Tentativas WHERE id_questionario = ?',
                [ids.questionario]
            );
            const [respostasPersistidas] = await pool.query(
                'SELECT id_resposta FROM Q_Respostas WHERE id_questionario = ?',
                [ids.questionario]
            );
            expect(tentativas).toHaveLength(0);
            expect(respostasPersistidas).toHaveLength(0);
        });

        it('rejeita questionário inexistente e payload inválido', async () => {
            const inexistente = await request(app)
                .post('/api/questionarios/999999/submissoes')
                .set(como(tokens.aluno))
                .send({
                    submission_id: SUBMISSION_ID,
                    respostas: [{ id_pergunta: 1, id_opcao: 1 }]
                });
            const payloadInvalido = await request(app)
                .post(`/api/questionarios/${ids.questionario}/submissoes`)
                .set(como(tokens.aluno))
                .send({ submission_id: SUBMISSION_ID, respostas: 'não-é-uma-lista' });

            expect(inexistente.status).toBe(404);
            expect(payloadInvalido.status).toBe(400);
        });

        it('faz rollback quando uma falha ocorre após iniciar a persistência', async () => {
            await pool.query(`
                CREATE TRIGGER goal5_falha_resposta
                BEFORE INSERT ON Q_Respostas
                FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'falha controlada do teste'
            `);
            try {
                const response = await request(app)
                    .post(`/api/questionarios/${ids.questionario}/submissoes`)
                    .set(como(tokens.aluno))
                    .send({ submission_id: SUBMISSION_ID, respostas: [
                        { id_pergunta: ids.perguntaUm, id_opcao: ids.opcaoUmCorreta },
                        { id_pergunta: ids.perguntaDois, id_opcao: ids.opcaoDoisCorreta }
                    ] });
                expect(response.status).toBe(500);

                const [tentativas] = await pool.query(
                    'SELECT id_tentativa FROM Q_Tentativas WHERE id_questionario = ?',
                    [ids.questionario]
                );
                const [respostas] = await pool.query(
                    'SELECT id_resposta FROM Q_Respostas WHERE id_questionario = ?',
                    [ids.questionario]
                );
                expect(tentativas).toHaveLength(0);
                expect(respostas).toHaveLength(0);
            } finally {
                await pool.query('DROP TRIGGER IF EXISTS goal5_falha_resposta');
            }
        });

        it('calcula no backend, persiste tentativa/respostas e retorna histórico real', async () => {
            const response = await request(app)
                .post(`/api/questionarios/${ids.questionario}/submissoes`)
                .set(como(tokens.aluno))
                .send({ submission_id: SUBMISSION_ID, respostas: [
                    { id_pergunta: ids.perguntaUm, id_opcao: ids.opcaoUmCorreta },
                    { id_pergunta: ids.perguntaDois, id_opcao: ids.opcaoDoisIncorreta }
                ] });
            expect(response.status).toBe(200);
            expect(response.body.resultado).toMatchObject({
                acertos: 1,
                total_perguntas: 2,
                pontuacao: 1,
                percentual: 50
            });

            const [tentativas] = await pool.query(
                'SELECT percentual, acertos FROM Q_Tentativas WHERE id_tentativa = ?',
                [response.body.resultado.id_tentativa]
            );
            const [respostas] = await pool.query(
                'SELECT id_resposta FROM Q_Respostas WHERE id_tentativa = ?',
                [response.body.resultado.id_tentativa]
            );
            expect(Number(tentativas[0].percentual)).toBe(50);
            expect(tentativas[0].acertos).toBe(1);
            expect(respostas).toHaveLength(2);

            const historico = await request(app)
                .get(`/api/questionarios/historico?id_questionario=${ids.questionario}`)
                .set(como(tokens.aluno));
            expect(historico.status).toBe(200);
            expect(historico.body.tentativas).toHaveLength(1);
            expect(Number(historico.body.tentativas[0].percentual)).toBe(50);

            const recarga = await request(app)
                .get(`/api/questionarios/historico?id_questionario=${ids.questionario}`)
                .set(como(tokens.aluno));
            expect(recarga.status).toBe(200);
            expect(recarga.body.tentativas).toEqual(historico.body.tentativas);
        });

        it('reutiliza a mesma submissão e mantém novas tentativas deliberadas', async () => {
            const respostas = [
                { id_pergunta: ids.perguntaUm, id_opcao: ids.opcaoUmCorreta },
                { id_pergunta: ids.perguntaDois, id_opcao: ids.opcaoDoisCorreta }
            ];
            const primeira = await request(app)
                .post(`/api/questionarios/${ids.questionario}/submissoes`)
                .set(como(tokens.aluno))
                .send({ submission_id: SUBMISSION_ID, respostas });
            const repetida = await request(app)
                .post(`/api/questionarios/${ids.questionario}/submissoes`)
                .set(como(tokens.aluno))
                .send({ submission_id: SUBMISSION_ID, respostas });
            const nova = await request(app)
                .post(`/api/questionarios/${ids.questionario}/submissoes`)
                .set(como(tokens.aluno))
                .send({
                    submission_id: '22222222-2222-4222-8222-222222222222',
                    respostas
                });

            expect(primeira.status).toBe(200);
            expect(primeira.body.resultado.reutilizada).toBe(false);
            expect(repetida.body.resultado).toMatchObject({
                id_tentativa: primeira.body.resultado.id_tentativa,
                reutilizada: true
            });
            expect(nova.body.resultado.id_tentativa).not.toBe(primeira.body.resultado.id_tentativa);
            const [tentativas] = await pool.query(
                'SELECT id_tentativa FROM Q_Tentativas WHERE id_questionario = ?',
                [ids.questionario]
            );
            expect(tentativas).toHaveLength(2);
        });
    });

    describe('professor', () => {
        it('lista somente turmas associadas ao professor autenticado', async () => {
            const response = await request(app)
                .get(`/api/turmas/professor/${users.professor.id_usuario}`)
                .set(como(tokens.professor));
            expect(response.status).toBe(200);
            expect(response.body.turmas.map((turma) => turma.id_turma)).toEqual(
                expect.arrayContaining([ids.turmaPropria, ids.turmaVazia, ids.turmaDisponivel])
            );
            expect(response.body.turmas.map((turma) => turma.id_turma)).not.toContain(ids.turmaAlheia);
        });

        it('retorna 200 e lista vazia para turma própria sem alunos', async () => {
            const response = await request(app)
                .get(`/api/matriculas/turma/${ids.turmaVazia}`)
                .set(como(tokens.professor));
            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                items: [], matriculas: [], page: 1, limit: 50, total: 0
            });
        });

        it('retorna 200 e lista vazia para professor sem turmas', async () => {
            const [hashRows] = await pool.query(
                "SELECT senha FROM Usuarios WHERE email = 'professor@teste.com'"
            );
            const [professorSemTurmas] = await pool.query(
                `INSERT INTO Usuarios (nome_completo, cpf, email, senha, telefone, tipo)
                 VALUES ('Professor sem turmas', '55555555555', 'professor.vazio@teste.com', ?, '11999999995', 'PROFESSOR')`,
                [hashRows[0].senha]
            );
            await pool.query(
                `INSERT INTO EmailVerificacoes (email, codigo, verificado, expira_em)
                 VALUES ('professor.vazio@teste.com', '000000', 1, DATE_ADD(NOW(), INTERVAL 1 YEAR))`
            );
            const token = await login('professor.vazio@teste.com');

            const response = await request(app)
                .get(`/api/turmas/professor/${professorSemTurmas.insertId}`)
                .set(como(token));

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ turmas: [] });
        });

        it('lista alunos reais e progresso da própria turma', async () => {
            const alunos = await request(app)
                .get(`/api/matriculas/turma/${ids.turmaPropria}`)
                .set(como(tokens.professor));
            const progresso = await request(app)
                .get(`/api/turmas/${ids.turmaPropria}/progresso`)
                .set(como(tokens.professor));

            expect(alunos.status).toBe(200);
            expect(alunos.body.matriculas[0]).toMatchObject({
                id_aluno: users.aluno.id_usuario,
                id_turma: ids.turmaPropria,
                progresso_percentual: 0
            });
            expect(progresso.status).toBe(200);
            expect(progresso.body.alunos[0].id_aluno).toBe(users.aluno.id_usuario);
        });

        it('bloqueia com 403 alunos, conteúdos e questionários de turma alheia', async () => {
            const respostas = await Promise.all([
                request(app).get(`/api/matriculas/turma/${ids.turmaAlheia}`).set(como(tokens.professor)),
                request(app).get(`/api/turmas/${ids.turmaAlheia}/conteudos`).set(como(tokens.professor)),
                request(app).get(`/api/turmas/${ids.turmaAlheia}/questionarios`).set(como(tokens.professor))
            ]);
            expect(respostas.map((response) => response.status)).toEqual([403, 403, 403]);
        });

        it('impede associar a um conteúdo módulo pertencente a outra turma', async () => {
            const [moduloAlheio] = await pool.query(
                `INSERT INTO Modulos (id_turma, titulo, ordem)
                 VALUES (?, 'Módulo alheio', 1)`,
                [ids.turmaAlheia]
            );
            const response = await request(app)
                .post(`/api/turmas/${ids.turmaPropria}/conteudos`)
                .set(como(tokens.professor))
                .send({
                    id_modulo: moduloAlheio.insertId,
                    titulo: 'Conteúdo inválido',
                    tipo: 'TEXTO',
                    ordem: 3
                });

            expect(response.status).toBe(409);
            expect(response.body.code).toBe('MODULO_FORA_DA_TURMA');
        });

        it('mantém CRUD de alternativas com exatamente um gabarito correto', async () => {
            const criada = await request(app)
                .post(`/api/perguntas/${ids.perguntaUm}/opcoes`)
                .set(como(tokens.admin))
                .send({ texto_opcao: 'Terceira alternativa', ordem: 3, correta: false });
            expect(criada.status).toBe(201);

            const novaCorreta = await request(app)
                .patch(`/api/opcoes/${criada.body.opcao.id_opcao}`)
                .set(como(tokens.professor))
                .send({ correta: true, texto_opcao: 'Nova resposta correta' });
            expect(novaCorreta.status).toBe(200);

            const removida = await request(app)
                .delete(`/api/opcoes/${ids.opcaoUmIncorreta}`)
                .set(como(tokens.admin));
            expect(removida.status).toBe(200);

            const [opcoes] = await pool.query(
                `SELECT id_opcao, correta FROM Q_Opcoes
                 WHERE id_pergunta = ? ORDER BY ordem`,
                [ids.perguntaUm]
            );
            expect(opcoes).toHaveLength(2);
            expect(opcoes.filter((opcao) => Boolean(opcao.correta))).toHaveLength(1);
            expect(opcoes.find((opcao) => Boolean(opcao.correta)).id_opcao)
                .toBe(criada.body.opcao.id_opcao);
        });

        it('preserva históricos acadêmicos contra exclusão ou alteração destrutiva', async () => {
            await request(app)
                .put(`/api/conteudos/${ids.conteudoUm}/progresso`)
                .set(como(tokens.aluno))
                .send({ status: 'CONCLUIDO' });
            const respostas = [
                { id_pergunta: ids.perguntaUm, id_opcao: ids.opcaoUmCorreta },
                { id_pergunta: ids.perguntaDois, id_opcao: ids.opcaoDoisCorreta }
            ];
            await request(app)
                .post(`/api/questionarios/${ids.questionario}/submissoes`)
                .set(como(tokens.aluno))
                .send({ submission_id: SUBMISSION_ID, respostas });

            const removerConteudo = await request(app)
                .delete(`/api/conteudos/${ids.conteudoUm}`)
                .set(como(tokens.professor));
            const alterarPergunta = await request(app)
                .patch(`/api/perguntas/${ids.perguntaUm}`)
                .set(como(tokens.professor))
                .send({ texto_pergunta: 'Não deve substituir o histórico' });
            const alterarOpcao = await request(app)
                .patch(`/api/opcoes/${ids.opcaoUmIncorreta}`)
                .set(como(tokens.professor))
                .send({ texto_opcao: 'Não deve substituir o histórico' });
            const removerQuestionario = await request(app)
                .delete(`/api/questionarios/${ids.questionario}`)
                .set(como(tokens.professor));

            expect(removerConteudo.status).toBe(409);
            expect(removerConteudo.body.code).toBe('CONTEUDO_COM_HISTORICO');
            expect(alterarPergunta.status).toBe(409);
            expect(alterarPergunta.body.code).toBe('PERGUNTA_COM_HISTORICO');
            expect(alterarOpcao.status).toBe(409);
            expect(alterarOpcao.body.code).toBe('PERGUNTA_COM_HISTORICO');
            expect(removerQuestionario.status).toBe(409);
            expect(removerQuestionario.body.code).toBe('QUESTIONARIO_COM_HISTORICO');
            const autoria = await request(app)
                .get(`/api/turmas/${ids.turmaPropria}/questionarios`)
                .set(como(tokens.professor));
            expect(autoria.status).toBe(200);
            expect(autoria.body.questionarios.find(
                (item) => item.id_questionario === ids.questionario
            )).toMatchObject({ possui_historico: true });
        });

        it('atualiza nota válida no banco e rejeita notas fora de 0 a 10', async () => {
            const valida = await request(app)
                .patch(`/api/matriculas/${ids.matricula}`)
                .set(como(tokens.professor))
                .send({ nota_final: 9.5 });
            expect(valida.status).toBe(200);
            const [matriculas] = await pool.query(
                'SELECT nota_final FROM Matriculas WHERE id_matricula = ?',
                [ids.matricula]
            );
            expect(Number(matriculas[0].nota_final)).toBe(9.5);

            for (const nota of [-0.1, 10.1]) {
                const invalida = await request(app)
                    .patch(`/api/matriculas/${ids.matricula}`)
                    .set(como(tokens.professor))
                    .send({ nota_final: nota });
                expect(invalida.status).toBe(400);
            }
        });

        it('entrega a estrutura e o gabarito somente à autoria autorizada', async () => {
            const conteudos = await request(app)
                .get(`/api/turmas/${ids.turmaPropria}/conteudos`)
                .set(como(tokens.professor));
            const metadados = await request(app)
                .get(`/api/turmas/${ids.turmaPropria}/questionarios`)
                .set(como(tokens.professor));
            expect(conteudos.status).toBe(200);
            expect(conteudos.body.conteudos).toHaveLength(2);
            expect(metadados.status).toBe(200);
            expect(metadados.body.questionarios).toHaveLength(2);
            expect(metadados.body.questionarios[0]).toHaveProperty('total_perguntas');
            expect(metadados.body.questionarios.find((item) => item.perguntas.length)).toBeDefined();
            expect(JSON.stringify(metadados.body)).toMatch(/"correta":(?:true|false|0|1)/);
            expect(JSON.stringify(metadados.body)).not.toMatch(/senha|cpf|hash/i);
        });

        it('retorna 404 ao consultar conteúdo de turma inexistente', async () => {
            const response = await request(app)
                .get('/api/turmas/999999/conteudos')
                .set(como(tokens.professor));

            expect(response.status).toBe(404);
        });

        it('permite a mesma consulta de metadados ao ADMIN', async () => {
            const response = await request(app)
                .get(`/api/turmas/${ids.turmaPropria}/questionarios`)
                .set(como(tokens.admin));
            expect(response.status).toBe(200);
        });
    });
});
