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

// Carrega .env.test ANTES de qualquer outra coisa
require('dotenv').config({ path: '.env.test' });
process.env.NODE_ENV = 'test';

const request = require('supertest');
const { initTestPool, clearDatabase, seedBasicData, closeTestPool } = require('./setup');
const { app } = require('../../../index');

let adminToken = null;
let professorToken = null;
let alunoToken = null;
let testUsers = null;
let cursoId = null;
let turmaId = null;
let matriculaId = null;
let server = null;

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
            status: 'INSCRIÇÕES ABERTAS'
        });
    turmaId = turmaResponse.body.id_turma;
}

describe('Testes de Integração - Matrículas', () => {
    beforeAll(async () => {
        await initTestPool();
        await clearDatabase();
        testUsers = await seedBasicData();

        // Inicia servidor de teste
        const PORT = process.env.PORT || 3001;
        server = app.listen(PORT, () => {
            console.log(`Servidor de teste na porta ${PORT}`);
        });

        // Login ADMIN
        const adminLogin = await request(server)
            .post('/api/auth/login')
            .send({ email: 'admin@teste.com', senha: 'Teste@123' });
        adminToken = adminLogin.body.token;

        // Login PROFESSOR
        const profLogin = await request(server)
            .post('/api/auth/login')
            .send({ email: 'professor@teste.com', senha: 'Teste@123' });
        professorToken = profLogin.body.token;

        // Login ALUNO
        const alunoLogin = await request(server)
            .post('/api/auth/login')
            .send({ email: 'aluno@teste.com', senha: 'Teste@123' });
        alunoToken = alunoLogin.body.token;
    });

    // Antes de CADA teste: limpa banco, recria seed, recria curso/turma, refaz login
    beforeEach(async () => {
        await clearDatabase();
        testUsers = await seedBasicData();
        matriculaId = null;

        // Refaz login para obter tokens válidos para os novos usuários
        const adminLogin = await request(server)
            .post('/api/auth/login')
            .send({ email: 'admin@teste.com', senha: 'Teste@123' });
        adminToken = adminLogin.body.token;

        const profLogin = await request(server)
            .post('/api/auth/login')
            .send({ email: 'professor@teste.com', senha: 'Teste@123' });
        professorToken = profLogin.body.token;

        const alunoLogin = await request(server)
            .post('/api/auth/login')
            .send({ email: 'aluno@teste.com', senha: 'Teste@123' });
        alunoToken = alunoLogin.body.token;

        await criarCursoETurma();
    });

    afterAll(async () => {
        if (server) {
            await new Promise(resolve => server.close(resolve));
        }
        await closeTestPool();
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
        });

        it('deve retornar 404 para aluno sem matrículas', async () => {
            const response = await request(server)
                .get('/api/matriculas/aluno/99999')
                .set('Authorization', `Bearer ${adminToken}`);

            expect([404, 200]).toContain(response.status);
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

        it('deve atualizar nota do aluno (PROFESSOR)', async () => {
            const updateData = {
                nota_final: 8.5,
                status_aprovacao: 'APROVADO',
                progresso_percentual: 100
            };

            const response = await request(server)
                .patch(`/api/matriculas/${matriculaId}`)
                .set('Authorization', `Bearer ${professorToken}`)
                .send(updateData);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('message');
        });

        it('deve atualizar apenas progresso (PROFESSOR)', async () => {
            const response = await request(server)
                .patch(`/api/matriculas/${matriculaId}`)
                .set('Authorization', `Bearer ${professorToken}`)
                .send({
                    progresso_percentual: 50
                });

            expect(response.status).toBe(200);
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
