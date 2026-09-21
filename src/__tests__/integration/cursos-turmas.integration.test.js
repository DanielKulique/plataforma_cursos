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
const { initTestPool, clearDatabase, seedBasicData, closeTestPool, getTestPassword, getSessionToken } = require('./setup');
const { app } = require('../../../index');
const applicationDb = require('../../config/database');

let adminToken = null;
let professorToken = null;
let alunoToken = null;
let testUsers = null;
let cursoId = null;
let turmaId = null;
const testPassword = getTestPassword();

describe('Testes de Integração - Cursos e Turmas', () => {
    beforeAll(async () => {
        await initTestPool();
        await clearDatabase();
        testUsers = await seedBasicData();

        // Faz login como ADMIN
        const adminLogin = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'admin@teste.com',
                senha: testPassword
            });
        adminToken = getSessionToken(adminLogin);

        // Faz login como PROFESSOR
        const profLogin = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'professor@teste.com',
                senha: testPassword
            });
        professorToken = getSessionToken(profLogin);

        // Faz login como ALUNO
        const alunoLogin = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'aluno@teste.com',
                senha: testPassword
            });
        alunoToken = getSessionToken(alunoLogin);
    });

    afterEach(async () => {
        await clearDatabase();
        testUsers = await seedBasicData();
        cursoId = null;
        turmaId = null;
    });

    afterAll(async () => {
        await closeTestPool();
        await applicationDb.end();
    });

    describe('CRUD de Cursos', () => {
        describe('POST /api/cursos', () => {
            it('deve criar um curso com sucesso (ADMIN)', async () => {
                const cursoData = {
                    nome_curso: 'Curso de JavaScript Avançado',
                    descricao: 'Aprenda JavaScript moderno',
                    carga_horaria: 40
                };

                const response = await request(app)
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
                const response = await request(app)
                    .post('/api/cursos')
                    .send({
                        nome_curso: 'Curso Teste',
                        carga_horaria: 20
                    });

                expect(response.status).toBe(401);
            });

            it('deve retornar 403 para usuário não ADMIN', async () => {
                const response = await request(app)
                    .post('/api/cursos')
                    .set('Authorization', `Bearer ${alunoToken}`)
                    .send({
                        nome_curso: 'Curso Teste',
                        carga_horaria: 20
                    });

                expect(response.status).toBe(403);
            });
        });

        describe('GET /api/cursos', () => {
            beforeEach(async () => {
                // Cria um curso para teste
                const createResponse = await request(app)
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
                const response = await request(app)
                    .get('/api/cursos');

                expect(response.status).toBe(200);
                expect(Array.isArray(response.body)).toBe(true);
                expect(response.body.length).toBeGreaterThan(0);
            });

            it('deve buscar curso por ID', async () => {
                const response = await request(app)
                    .get(`/api/cursos/${cursoId}`);

                expect(response.status).toBe(200);
                expect(response.body).toHaveProperty('id_curso', cursoId);
                expect(response.body).toHaveProperty('nome_curso');
            });

            it('deve retornar 404 para curso inexistente', async () => {
                const response = await request(app)
                    .get('/api/cursos/99999');

                expect(response.status).toBe(404);
            });
        });

        describe('PUT /api/cursos/:id', () => {
            beforeEach(async () => {
                const createResponse = await request(app)
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

                const response = await request(app)
                    .put(`/api/cursos/${cursoId}`)
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send(updateData);

                expect(response.status).toBe(200);
                expect(response.body).toHaveProperty('id_curso');
            });
        });

        describe('DELETE /api/cursos/:id', () => {
            beforeEach(async () => {
                const createResponse = await request(app)
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
                const response = await request(app)
                    .delete(`/api/cursos/${cursoId}`)
                    .set('Authorization', `Bearer ${adminToken}`);

                expect(response.status).toBe(204);
            });
        });
    });

    describe('CRUD de Turmas', () => {
        beforeEach(async () => {
            // Cria um curso primeiro
            const cursoResponse = await request(app)
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
                    status: 'ABERTA'
                };

                const response = await request(app)
                    .post('/api/turmas')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send(turmaData);

                expect(response.status).toBe(201);
                expect(response.body).toHaveProperty('id_turma');
                expect(response.body.nome_turma).toBe(turmaData.nome_turma);

                turmaId = response.body.id_turma;
            });

            it('deve retornar 401 sem autenticação', async () => {
                const response = await request(app)
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
                const createResponse = await request(app)
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
                const response = await request(app)
                    .get('/api/turmas');

                expect(response.status).toBe(200);
                expect(Array.isArray(response.body.items)).toBe(true);
                expect(response.body).toMatchObject({ page: 1, limit: 50 });
                expect(response.body.total).toBeGreaterThan(0);
            });

            it('deve buscar turma por ID', async () => {
                const response = await request(app)
                    .get(`/api/turmas/${turmaId}`);

                expect(response.status).toBe(200);
                expect(response.body).toHaveProperty('id_turma', turmaId);
            });
        });
    });
});
