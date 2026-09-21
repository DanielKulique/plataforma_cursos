const { seedProvaFinalAprovada } = require('./academic-fixtures');
/**
 * Testes de Integração - Matrículas
 * 
 * Testa o fluxo completo de matrículas:
 * - Aluno se matricula em turma
 * - Professor visualiza matrículas da turma
 * - Professor atualiza nota de aluno
 * - Aluno cancela matrícula
 * - Aluno visualiza suas matrículas
 */

const request = require('supertest');
const { initTestPool, clearDatabase, seedBasicData, closeTestPool, getTestPassword, getSessionToken } = require('./setup');
const { app } = require('../../../index');
const applicationDb = require('../../config/database');

let adminToken = null;
let professorToken = null;
let alunoToken = null;
let testUsers = null;
let cursoId = null;
let turmaId = null;
let matriculaId = null;
const server = app;
const testPassword = getTestPassword();

/**
 * Cria curso e turma para os testes
 */
async function criarCursoETurma() {
    const cursoResponse = await request(server)
        .post('/api/cursos')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
            nome_curso: 'Curso para Matrículas',
            descricao: 'Curso teste',
            carga_horaria: 40
        });
    cursoId = cursoResponse.body.id_curso;

    const turmaResponse = await request(server)
        .post('/api/turmas')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
            id_curso: cursoId,
            id_professor: testUsers.professor.id_usuario,
            nome_turma: 'Turma para Teste de Matrícula',
            data_inicio: '2026-03-01',
            status: 'ABERTA'
        });
    turmaId = turmaResponse.body.id_turma;
}

describe('Testes de Integração - Matrículas', () => {
    beforeAll(async () => {
        await initTestPool();
        await clearDatabase();
        testUsers = await seedBasicData();

        // Login ADMIN
        const adminLogin = await request(server)
            .post('/api/auth/login')
            .send({ email: 'admin@teste.com', senha: testPassword });
        adminToken = getSessionToken(adminLogin);

        // Login PROFESSOR
        const profLogin = await request(server)
            .post('/api/auth/login')
            .send({ email: 'professor@teste.com', senha: testPassword });
        professorToken = getSessionToken(profLogin);

        // Login ALUNO
        const alunoLogin = await request(server)
            .post('/api/auth/login')
            .send({ email: 'aluno@teste.com', senha: testPassword });
        alunoToken = getSessionToken(alunoLogin);
    });

    // Antes de CADA teste: limpa o banco descartável, recria IDs estáveis e os dados do cenário.
    beforeEach(async () => {
        await clearDatabase();
        testUsers = await seedBasicData();
        matriculaId = null;

        await criarCursoETurma();
    });

    afterAll(async () => {
        await closeTestPool();
        await applicationDb.end();
    });

    describe('POST /api/matriculas', () => {
        it('deve matricular aluno em turma com sucesso', async () => {
            const response = await request(server)
                .post('/api/matriculas')
                .set('Authorization', `Bearer ${alunoToken}`)
                .send({
                    id_turma: turmaId
                });

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('message');
            expect(response.body).toHaveProperty('matricula');
            expect(response.body.matricula).toHaveProperty('id_turma', turmaId);

            matriculaId = response.body.matricula.id_matricula;
        });

        it('deve retornar 409 se aluno já estiver matriculado', async () => {
            // Primeira matrícula
            await request(server)
                .post('/api/matriculas')
                .set('Authorization', `Bearer ${alunoToken}`)
                .send({ id_turma: turmaId });

            // Tenta matricular novamente
            const response = await request(server)
                .post('/api/matriculas')
                .set('Authorization', `Bearer ${alunoToken}`)
                .send({ id_turma: turmaId });

            expect(response.status).toBe(409);
            expect(response.body).toHaveProperty('message');
        });

        it('deve retornar 401 sem autenticação', async () => {
            const response = await request(server)
                .post('/api/matriculas')
                .send({ id_turma: turmaId });

            expect(response.status).toBe(401);
        });

        it('deve retornar 403 quando o usuário autenticado não é ALUNO', async () => {
            const response = await request(server)
                .post('/api/matriculas')
                .set('Authorization', `Bearer ${professorToken}`)
                .send({ id_turma: turmaId });

            expect(response.status).toBe(403);
        });

        it('deve retornar 403 quando o usuário autenticado é ADMIN', async () => {
            const response = await request(server)
                .post('/api/matriculas')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ id_turma: turmaId });

            expect(response.status).toBe(403);
        });

        it.each([
            {},
            { id_turma: 0 },
            { id_turma: 'invalida' }
        ])('deve retornar 400 para payload inválido: %j', async (payload) => {
            const response = await request(server)
                .post('/api/matriculas')
                .set('Authorization', `Bearer ${alunoToken}`)
                .send(payload);

            expect(response.status).toBe(400);
        });

        it('deve retornar 404 para turma inexistente', async () => {
            const response = await request(server)
                .post('/api/matriculas')
                .set('Authorization', `Bearer ${alunoToken}`)
                .send({ id_turma: 999999 });

            expect(response.status).toBe(404);
            expect(response.body.code).toBe('TURMA_NAO_ENCONTRADA');
        });

        it.each(['FECHADA', 'ENCERRADA'])('deve retornar 403 para turma %s', async (status) => {
            const turmaResponse = await request(server)
                .post('/api/turmas')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    id_curso: cursoId,
                    id_professor: testUsers.professor.id_usuario,
                    nome_turma: `Turma ${status}`,
                    data_inicio: '2026-03-01',
                    status
                });

            const response = await request(server)
                .post('/api/matriculas')
                .set('Authorization', `Bearer ${alunoToken}`)
                .send({ id_turma: turmaResponse.body.id_turma });

            expect(response.status).toBe(403);
            expect(response.body.code).toBe('TURMA_NAO_ABERTA');
        });

        it('deve reativar matrícula cancelada e reiniciar nota e progresso', async () => {
            const created = await request(server)
                .post('/api/matriculas')
                .set('Authorization', `Bearer ${alunoToken}`)
                .send({ id_turma: turmaId });
            const id = created.body.matricula.id_matricula;
            const pool = await initTestPool();
            await pool.query(
                "UPDATE Matriculas SET data_matricula = '2020-01-01 00:00:00' WHERE id_matricula = ?",
                [id]
            );
            const [content] = await pool.query(
                `INSERT INTO Conteudos (id_turma, titulo, tipo, ordem)
                 VALUES (?, 'Conteúdo concluído antes do cancelamento', 'TEXTO', 1)`,
                [turmaId]
            );
            await pool.query(
                `INSERT INTO ConteudosProgresso (id_aluno, id_conteudo, status, iniciado_em, concluido_em)
                 VALUES (?, ?, 'CONCLUIDO', NOW(), NOW())`,
                [testUsers.aluno.id_usuario, content.insertId]
            );

            await request(server)
                .patch(`/api/matriculas/${id}`)
                .set('Authorization', `Bearer ${professorToken}`)
                .send({ nota_final: 8.5 });
            await request(server)
                .delete(`/api/matriculas/${id}`)
                .set('Authorization', `Bearer ${alunoToken}`);

            const response = await request(server)
                .post('/api/matriculas')
                .set('Authorization', `Bearer ${alunoToken}`)
                .send({ id_turma: turmaId });

            expect(response.status).toBe(200);
            expect(response.body.matricula).toMatchObject({
                id_matricula: id,
                status_aprovacao: 'CURSANDO',
                progresso_percentual: 0,
                nota_final: null,
                reativada: true
            });
            const [rows] = await pool.query(
                `SELECT status_aprovacao, progresso_percentual, nota_final,
                        data_matricula > '2020-01-01 00:00:00' AS data_atualizada
                 FROM Matriculas WHERE id_matricula = ?`,
                [id]
            );
            expect(rows[0]).toMatchObject({
                status_aprovacao: 'CURSANDO',
                progresso_percentual: 0,
                nota_final: null,
                data_atualizada: 1
            });
            const [progressRows] = await pool.query(
                'SELECT COUNT(*) AS total FROM ConteudosProgresso WHERE id_aluno = ? AND id_conteudo = ?',
                [testUsers.aluno.id_usuario, content.insertId]
            );
            expect(Number(progressRows[0].total)).toBe(0);
        });

        it('deve manter uma única matrícula sob duas requisições concorrentes', async () => {
            const requests = [1, 2].map(() => request(server)
                .post('/api/matriculas')
                .set('Authorization', `Bearer ${alunoToken}`)
                .send({ id_turma: turmaId }));

            const responses = await Promise.all(requests);
            expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);

            const pool = await initTestPool();
            const [rows] = await pool.query(
                'SELECT COUNT(*) AS total FROM Matriculas WHERE id_aluno = ? AND id_turma = ?',
                [testUsers.aluno.id_usuario, turmaId]
            );
            expect(Number(rows[0].total)).toBe(1);
        });
    });

    describe('GET /api/matriculas/aluno/:id', () => {
        beforeEach(async () => {
            // Cria matrícula
            const matriculaResponse = await request(server)
                .post('/api/matriculas')
                .set('Authorization', `Bearer ${alunoToken}`)
                .send({ id_turma: turmaId });
            matriculaId = matriculaResponse.body.matricula.id_matricula;
        });

        it('deve listar matrículas do aluno', async () => {
            const response = await request(server)
                .get(`/api/matriculas/aluno/${testUsers.aluno.id_usuario}`)
                .set('Authorization', `Bearer ${alunoToken}`);

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body.length).toBeGreaterThan(0);
            expect(response.body[0]).toHaveProperty('id_turma', turmaId);
        });

        it('deve retornar coleção vazia com 200 para aluno sem matrículas', async () => {
            const response = await request(server)
                .get('/api/matriculas/aluno/99999')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toEqual([]);
        });
    });

    describe('GET /api/matriculas/turma/:id_turma', () => {
        beforeEach(async () => {
            const matriculaResponse = await request(server)
                .post('/api/matriculas')
                .set('Authorization', `Bearer ${alunoToken}`)
                .send({ id_turma: turmaId });
            matriculaId = matriculaResponse.body.matricula.id_matricula;
        });

        it('deve listar matrículas da turma (PROFESSOR)', async () => {
            const response = await request(server)
                .get(`/api/matriculas/turma/${turmaId}`)
                .set('Authorization', `Bearer ${professorToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('matriculas');
            expect(response.body.matriculas[0]).toMatchObject({
                id_aluno: testUsers.aluno.id_usuario,
                id_turma: turmaId
            });
        });

        it('deve listar matrículas da turma (ADMIN)', async () => {
            const response = await request(server)
                .get(`/api/matriculas/turma/${turmaId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('matriculas');
        });
    });

    describe('PATCH /api/matriculas/:id', () => {
        beforeEach(async () => {
            const matriculaResponse = await request(server)
                .post('/api/matriculas')
                .set('Authorization', `Bearer ${alunoToken}`)
                .send({ id_turma: turmaId });
            matriculaId = matriculaResponse.body.matricula.id_matricula;
        });

        it('D-03: 200/201 bloqueia professor e ADMIN; 201/201 ainda exige prova final', async () => {
            const pool = await initTestPool();
            const tipos = ['VIDEO', 'TEXTO', 'PDF', 'LINK', 'ATIVIDADE'];
            await pool.query('INSERT INTO Conteudos (id_turma, titulo, tipo, ordem) VALUES ?', [
                Array.from({ length: 201 }, (_, i) => [turmaId, `Conteúdo ${i + 1}`, tipos[i % 5], i + 1])
            ]);
            const [conteudos] = await pool.query('SELECT id_conteudo FROM Conteudos WHERE id_turma = ? ORDER BY ordem', [turmaId]);
            await pool.query('INSERT INTO ConteudosProgresso (id_aluno, id_conteudo, status) VALUES ?', [
                conteudos.slice(0, 200).map(c => [testUsers.aluno.id_usuario, c.id_conteudo, 'CONCLUIDO'])
            ]);
            // Outro aluno concluiu o conteúdo faltante: isso não conclui a matrícula testada.
            await pool.query("INSERT INTO ConteudosProgresso (id_aluno, id_conteudo, status) VALUES (?, ?, 'CONCLUIDO')",
                [testUsers.admin.id_usuario, conteudos[200].id_conteudo]);
            await pool.query('INSERT INTO Questionarios (id_curso, id_turma, titulo, descricao, tipo) VALUES ?', [[
                [cursoId, turmaId, 'Prova separada', 'Não conta', 'PROVA'],
                [cursoId, turmaId, 'Exercício separado', 'Não conta', 'EXERCICIO']
            ]]);
            const [outraTurma] = await pool.query(
                "INSERT INTO Turmas (id_curso, id_professor, nome_turma, data_inicio, status) VALUES (?, ?, 'Outra turma', '2026-01-01', 'ABERTA')",
                [cursoId, testUsers.professor.id_usuario]);
            const [outroConteudo] = await pool.query(
                "INSERT INTO Conteudos (id_turma, titulo, tipo, ordem) VALUES (?, 'Outro', 'TEXTO', 1)", [outraTurma.insertId]);
            await pool.query("INSERT INTO ConteudosProgresso (id_aluno, id_conteudo, status) VALUES (?, ?, 'CONCLUIDO')",
                [testUsers.aluno.id_usuario, outroConteudo.insertId]);
            const listar = () => request(server).get(`/api/matriculas/turma/${turmaId}`)
                .set('Authorization', `Bearer ${professorToken}`);
            expect((await listar()).body.matriculas[0]).toMatchObject({
                total_conteudos: 201, conteudos_concluidos: 200,
                progresso_percentual: 100, conteudo_concluido: false, status_aprovacao: 'CURSANDO'
            });
            for (const token of [professorToken, adminToken]) {
                const response = await request(server).patch(`/api/matriculas/${matriculaId}`)
                    .set('Authorization', `Bearer ${token}`)
                    .send({ nota_final: 9, status_aprovacao: 'APROVADO' });
                expect(response.status).toBe(409);
                expect(response.body.code).toBe('CONTEUDOS_PENDENTES');
            }
            expect((await request(server).put(`/api/conteudos/${conteudos[200].id_conteudo}/progresso`)
                .set('Authorization', `Bearer ${alunoToken}`).send({ status: 'CONCLUIDO' })).status).toBe(200);
            expect((await listar()).body.matriculas[0]).toMatchObject({
                conteudo_concluido: true, status_aprovacao: 'CURSANDO', nota_final: null
            });
            const semNota = await request(server).patch(`/api/matriculas/${matriculaId}`)
                .set('Authorization', `Bearer ${professorToken}`).send({ status_aprovacao: 'APROVADO' });
            expect(semNota.status).toBe(409);
            expect(semNota.body.code).toBe('PROVA_FINAL_PENDENTE');
            await seedProvaFinalAprovada(pool, testUsers.aluno.id_usuario, turmaId);
            expect((await request(server).patch(`/api/matriculas/${matriculaId}`)
                .set('Authorization', `Bearer ${professorToken}`)
                .send({ nota_final: 0, status_aprovacao: 'APROVADO' })).status).toBe(200);
        });

        it('deve atualizar nota do aluno (PROFESSOR)', async () => {
            const pool = await initTestPool();
            const [conteudo] = await pool.query(
                `INSERT INTO Conteudos (id_turma, titulo, tipo, ordem)
                 VALUES (?, 'Conteúdo obrigatório', 'TEXTO', 1)`,
                [turmaId]
            );
            const progresso = await request(server)
                .put(`/api/conteudos/${conteudo.insertId}/progresso`)
                .set('Authorization', `Bearer ${alunoToken}`)
                .send({ status: 'CONCLUIDO' });
            expect(progresso.status).toBe(200);

            await seedProvaFinalAprovada(pool, testUsers.aluno.id_usuario, turmaId);
            const updateData = {
                nota_final: 8.5,
                status_aprovacao: 'APROVADO'
            };

            const response = await request(server)
                .patch(`/api/matriculas/${matriculaId}`)
                .set('Authorization', `Bearer ${professorToken}`)
                .send(updateData);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('message');
        });

        it('deve rejeitar alteração manual do progresso', async () => {
            const response = await request(server)
                .patch(`/api/matriculas/${matriculaId}`)
                .set('Authorization', `Bearer ${professorToken}`)
                .send({
                    progresso_percentual: 50
                });

            expect(response.status).toBe(400);
        });

        it('deve impedir aprovação enquanto houver conteúdo pendente', async () => {
            const pool = await initTestPool();
            await pool.query(
                `INSERT INTO Conteudos (id_turma, titulo, tipo, ordem)
                 VALUES (?, 'Conteúdo pendente', 'TEXTO', 1)`,
                [turmaId]
            );

            const response = await request(server)
                .patch(`/api/matriculas/${matriculaId}`)
                .set('Authorization', `Bearer ${professorToken}`)
                .send({ nota_final: 8.5, status_aprovacao: 'APROVADO' });

            expect(response.status).toBe(409);
            expect(response.body.code).toBe('CONTEUDOS_PENDENTES');
        });

        it('deve retornar 400 para nota inválida', async () => {
            const response = await request(server)
                .patch(`/api/matriculas/${matriculaId}`)
                .set('Authorization', `Bearer ${professorToken}`)
                .send({
                    nota_final: 'invalido'
                });

            expect(response.status).toBe(400);
        });
    });

    describe('DELETE /api/matriculas/:id', () => {
        beforeEach(async () => {
            const matriculaResponse = await request(server)
                .post('/api/matriculas')
                .set('Authorization', `Bearer ${alunoToken}`)
                .send({ id_turma: turmaId });
            matriculaId = matriculaResponse.body.matricula.id_matricula;
        });

        it('deve cancelar matrícula (ALUNO)', async () => {
            const response = await request(server)
                .delete(`/api/matriculas/${matriculaId}`)
                .set('Authorization', `Bearer ${alunoToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('message');
        });

        it('deve cancelar matrícula (ADMIN)', async () => {
            const response = await request(server)
                .delete(`/api/matriculas/${matriculaId}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(200);
        });
    });

    describe('GET /api/matriculas/minha-sala', () => {
        beforeEach(async () => {
            await request(server)
                .post('/api/matriculas')
                .set('Authorization', `Bearer ${alunoToken}`)
                .send({ id_turma: turmaId });
        });

        it('deve retornar sala virtual do aluno', async () => {
            const response = await request(server)
                .get('/api/matriculas/minha-sala')
                .set('Authorization', `Bearer ${alunoToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('total');
            expect(response.body).toHaveProperty('turmas');
        });
    });
});
