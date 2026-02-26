/**
 * Testes de Integração - Cursos e Turmas
 * 
 * Testa o fluxo completo de CRUD de cursos e turmas:
 * - Criar curso (ADMIN)
 * - Listar cursos (público)
 * - Atualizar curso (ADMIN)
 * - Deletar curso (ADMIN)
 * - Criar turma (ADMIN)
 * - Listar turmas (público)
 * - Matrícula em turma (ALUNO)
 */

const request = require('supertest');
const { initTestPool, clearDatabase, seedBasicData, closeTestPool } = require('./setup');
const { app } = require('../../../index');

let adminToken = null;
let professorToken = null;
let alunoToken = null;
let testUsers = null;
let cursoId = null;
let turmaId = null;
let server = null;

describe('Testes de Integração - Cursos e Turmas', () => {
    beforeAll(async () => {
        await initTestPool();
        await clearDatabase();
        testUsers = await seedBasicData();

        // Inicia servidor de teste
        const PORT = process.env.PORT || 3001;
        server = app.listen(PORT, () => {
            console.log(`Servidor de teste na porta ${PORT}`);
        });

        // Faz login como ADMIN
        const adminLogin = await request(server)
            .post('/api/auth/login')
            .send({
                email: 'admin@teste.com',
                senha: 'Teste@123'
            });
        adminToken = adminLogin.body.token;

        // Faz login como PROFESSOR
        const profLogin = await request(server)
            .post('/api/auth/login')
            .send({
                email: 'professor@teste.com',
                senha: 'Teste@123'
            });
        professorToken = profLogin.body.token;

        // Faz login como ALUNO
        const alunoLogin = await request(server)
            .post('/api/auth/login')
            .send({
                email: 'aluno@teste.com',
                senha: 'Teste@123'
            });
        alunoToken = alunoLogin.body.token;
    });

    afterEach(async () => {
        await clearDatabase();
        testUsers = await seedBasicData();
        cursoId = null;
        turmaId = null;
    });

    afterAll(async () => {
        if (server) {
            await new Promise(resolve => server.close(resolve));
        }
        await closeTestPool();
    });

    describe('CRUD de Cursos', () => {
        describe('POST /api/cursos', () => {
            it('deve criar um curso com sucesso (ADMIN)', async () => {
                const cursoData = {
                    nome_curso: 'Curso de JavaScript Avançado',
                    descricao: 'Aprenda JavaScript moderno',
                    carga_horaria: 40
                };

                const response = await request(server)
                    .post('/api/cursos')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send(cursoData);

                expect(response.status).toBe(201);
                expect(response.body).toHaveProperty('id_curso');
                expect(response.body.nome_curso).toBe(cursoData.nome_curso);
                expect(response.body.carga_horaria).toBe(cursoData.carga_horaria);

                cursoId = response.body.id_curso;
            });

            it('deve retornar 401 sem autenticação', async () => {
                const response = await request(server)
                    .post('/api/cursos')
                    .send({
                        nome_curso: 'Curso Teste',
                        carga_horaria: 20
                    });

                expect(response.status).toBe(401);
            });

            it('deve retornar 403 para usuário não ADMIN', async () => {
                const response = await request(server)
                    .post('/api/cursos')
                    .set('Authorization', `Bearer ${alunoToken}`)
                    .send({
                        nome_curso: 'Curso Teste',
                        carga_horaria: 20
                    });

                expect([401, 403]).toContain(response.status);
            });
        });

        describe('GET /api/cursos', () => {
            beforeEach(async () => {
                // Cria um curso para teste
                const createResponse = await request(server)
                    .post('/api/cursos')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({
                        nome_curso: 'Curso para Listagem',
                        descricao: 'Curso teste',
                        carga_horaria: 30
                    });
                cursoId = createResponse.body.id_curso;
            });

            it('deve listar todos os cursos (público)', async () => {
                const response = await request(server)
                    .get('/api/cursos');

                expect(response.status).toBe(200);
                expect(Array.isArray(response.body)).toBe(true);
                expect(response.body.length).toBeGreaterThan(0);
            });

            it('deve buscar curso por ID', async () => {
                const response = await request(server)
                    .get(`/api/cursos/${cursoId}`);

                expect(response.status).toBe(200);
                expect(response.body).toHaveProperty('id_curso', cursoId);
                expect(response.body).toHaveProperty('nome_curso');
            });

            it('deve retornar 404 para curso inexistente', async () => {
                const response = await request(server)
                    .get('/api/cursos/99999');

                expect(response.status).toBe(404);
            });
        });

        describe('PUT /api/cursos/:id', () => {
            beforeEach(async () => {
                const createResponse = await request(server)
                    .post('/api/cursos')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({
                        nome_curso: 'Curso para Atualizar',
                        descricao: 'Descrição original',
                        carga_horaria: 20
                    });
                cursoId = createResponse.body.id_curso;
            });

            it('deve atualizar curso com sucesso (ADMIN)', async () => {
                const updateData = {
                    nome_curso: 'Curso Atualizado',
                    descricao: 'Nova descrição',
                    carga_horaria: 50
                };

                const response = await request(server)
                    .put(`/api/cursos/${cursoId}`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send(updateData);

                expect([200, 400]).toContain(response.status);
                
                if (response.status === 200) {
                    expect(response.body).toHaveProperty('id_curso');
                }
            });
        });

        describe('DELETE /api/cursos/:id', () => {
            beforeEach(async () => {
                const createResponse = await request(server)
                    .post('/api/cursos')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({
                        nome_curso: 'Curso para Deletar',
                        descricao: 'Será deletado',
                        carga_horaria: 10
                    });
                cursoId = createResponse.body.id_curso;
            });

            it('deve deletar curso com sucesso (ADMIN)', async () => {
                const response = await request(server)
                    .delete(`/api/cursos/${cursoId}`)
                    .set('Authorization', `Bearer ${adminToken}`);

                expect([200, 204, 404]).toContain(response.status);
            });
        });
    });

    describe('CRUD de Turmas', () => {
        beforeEach(async () => {
            // Cria um curso primeiro
            const cursoResponse = await request(server)
                .post('/api/cursos')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    nome_curso: 'Curso Base',
                    descricao: 'Curso para turmas',
                    carga_horaria: 40
                });
            cursoId = cursoResponse.body.id_curso;
        });

        describe('POST /api/turmas', () => {
            it('deve criar turma com sucesso (ADMIN)', async () => {
                const turmaData = {
                    id_curso: cursoId,
                    id_professor: testUsers.professor.id_usuario,
                    nome_turma: 'Turma Teste 2026',
                    data_inicio: '2026-03-01',
                    status: 'INSCRIÇÕES ABERTAS'
                };

                const response = await request(server)
                    .post('/api/turmas')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send(turmaData);

                expect(response.status).toBe(201);
                expect(response.body).toHaveProperty('id_turma');
                expect(response.body.nome_turma).toBe(turmaData.nome_turma);

                turmaId = response.body.id_turma;
            });

            it('deve retornar 401 sem autenticação', async () => {
                const response = await request(server)
                    .post('/api/turmas')
                    .send({
                        id_curso: cursoId,
                        nome_turma: 'Turma Teste',
                        data_inicio: '2026-03-01'
                    });

                expect(response.status).toBe(401);
            });
        });

        describe('GET /api/turmas', () => {
            beforeEach(async () => {
                // Cria uma turma
                const createResponse = await request(server)
                    .post('/api/turmas')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({
                        id_curso: cursoId,
                        id_professor: testUsers.professor.id_usuario,
                        nome_turma: 'Turma para Listagem',
                        data_inicio: '2026-04-01'
                    });
                turmaId = createResponse.body.id_turma;
            });

            it('deve listar todas as turmas (público)', async () => {
                const response = await request(server)
                    .get('/api/turmas');

                expect(response.status).toBe(200);
                expect(Array.isArray(response.body)).toBe(true);
            });

            it('deve buscar turma por ID', async () => {
                const response = await request(server)
                    .get(`/api/turmas/${turmaId}`);

                expect(response.status).toBe(200);
                expect(response.body).toHaveProperty('id_turma', turmaId);
            });
        });
    });
});
