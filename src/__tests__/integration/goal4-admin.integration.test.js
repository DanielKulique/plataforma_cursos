const request = require('supertest');
const { initTestPool, clearDatabase, seedBasicData, closeTestPool, getTestPassword, getSessionToken } = require('./setup');
const { app } = require('../../../index');
const applicationDb = require('../../config/database');

let pool;
const server = app;
let users;
let adminToken;
let professorToken;
let alunoToken;

const testPassword = getTestPassword();

async function login(email, senha = testPassword) {
    return request(server).post('/api/auth/login').send({ email, senha });
}

async function criarCurso(nome = 'Curso administrativo') {
    return request(server)
        .post('/api/cursos')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ nome_curso: nome, descricao: 'Curso do Goal 4', carga_horaria: 24 });
}

async function criarTurma(idCurso, nome = 'Turma administrativa') {
    return request(server)
        .post('/api/turmas')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
            nome_turma: nome,
            id_curso: idCurso,
            id_professor: users.professor.id_usuario,
            data_inicio: '2026-08-01',
            data_fim: '2026-12-01',
            status: 'ABERTA'
        });
}

function dadosUsuario(sufixo, tipo = 'ALUNO') {
    return {
        nome_completo: `Usuário Goal Quatro ${sufixo}`,
        cpf: `8${String(sufixo).padStart(10, '0')}`,
        email: `goal4-${sufixo}@example.test`,
        telefone: '11988887777',
        senha: 'Senha@123',
        tipo
    };
}

describe('Goal 4 - CRUD administrativo e regras de integridade', () => {
    beforeAll(async () => {
        pool = await initTestPool();
        await clearDatabase();
        users = await seedBasicData();
        adminToken = getSessionToken(await login('admin@teste.com'));
        professorToken = getSessionToken(await login('professor@teste.com'));
        alunoToken = getSessionToken(await login('aluno@teste.com'));
    });

    beforeEach(async () => {
        await clearDatabase();
        users = await seedBasicData();
    });

    afterAll(async () => {
        await closeTestPool();
        await applicationDb.end();
    });

    it('autoriza a listagem de usuários somente para ADMIN e nunca expõe senha/hash', async () => {
        expect((await request(server).get('/api/admin/usuarios')).status).toBe(401);
        expect((await request(server).get('/api/admin/usuarios').set('Authorization', `Bearer ${alunoToken}`)).status).toBe(403);
        expect((await request(server).get('/api/admin/usuarios').set('Authorization', `Bearer ${professorToken}`)).status).toBe(403);

        const response = await request(server)
            .get('/api/admin/usuarios')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(response.status).toBe(200);
        expect(response.body.items).toHaveLength(3);
        expect(response.body.items.every((usuario) => !('senha' in usuario) && !('password' in usuario))).toBe(true);
        expect(JSON.stringify(response.body)).not.toMatch(/\$2[aby]\$/);
    });

    it('mantém dados persistidos potencialmente maliciosos como texto e rejeita e-mail inválido', async () => {
        const payload = '<svg onload="globalThis.pwned=true"></svg>';
        const usuario = await request(server)
            .post('/api/admin/usuarios')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ ...dadosUsuario(9), nome_completo: payload });
        expect(usuario.status).toBe(201);
        expect(usuario.body.nome_completo).toBe(payload);

        const emailInvalido = await request(server)
            .post('/api/admin/usuarios')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ ...dadosUsuario(8), email: payload });
        expect(emailInvalido.status).toBe(400);

        const curso = await criarCurso(payload);
        expect(curso.status).toBe(201);
        expect(curso.body.nome_curso).toBe(payload);
        const turma = await criarTurma(curso.body.id_curso, `${payload} turma`);
        expect(turma.status).toBe(201);
        expect(turma.body.nome_turma).toBe(`${payload} turma`);

        const lista = await request(server)
            .get('/api/admin/usuarios')
            .set('Authorization', `Bearer ${adminToken}`);
        expect(lista.body.items.find((item) => item.id_usuario === usuario.body.id_usuario).nome_completo).toBe(payload);
        expect(JSON.stringify(lista.body)).not.toMatch(/"senha"|\$2[aby]\$/i);
    });

    it('cria ALUNO, PROFESSOR e ADMIN e converte CPF/e-mail duplicados em 409', async () => {
        for (const [index, tipo] of ['ALUNO', 'PROFESSOR', 'ADMIN'].entries()) {
            const response = await request(server)
                .post('/api/admin/usuarios')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(dadosUsuario(index + 10, tipo));
            expect(response.status).toBe(201);
            expect(response.body.tipo).toBe(tipo);
            expect(response.body).not.toHaveProperty('senha');
        }

        const cpfDuplicado = await request(server)
            .post('/api/admin/usuarios')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ ...dadosUsuario(30), cpf: '33333333333' });
        expect(cpfDuplicado.status).toBe(409);

        const emailDuplicado = await request(server)
            .post('/api/admin/usuarios')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ ...dadosUsuario(31), email: 'aluno@teste.com' });
        expect(emailDuplicado.status).toBe(409);

        const invalido = await request(server)
            .post('/api/admin/usuarios')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ ...dadosUsuario(32), cpf: '123', senha: 'fraca' });
        expect(invalido.status).toBe(400);
    });

    it('altera papel válido, recusa senha no PATCH e retorna 404 para usuário ausente', async () => {
        const criado = await request(server)
            .post('/api/admin/usuarios')
            .set('Authorization', `Bearer ${adminToken}`)
            .send(dadosUsuario(40));

        const atualizado = await request(server)
            .patch(`/api/admin/usuarios/${criado.body.id_usuario}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ tipo: 'PROFESSOR', nome_completo: 'Professor promovido' });
        expect(atualizado.status).toBe(200);
        expect(atualizado.body.tipo).toBe('PROFESSOR');

        const comSenha = await request(server)
            .patch(`/api/admin/usuarios/${criado.body.id_usuario}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ senha: 'Outra@123' });
        expect(comSenha.status).toBe(400);

        const ausente = await request(server)
            .patch('/api/admin/usuarios/999999')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ nome_completo: 'Ausente' });
        expect(ausente.status).toBe(404);
    });

    it('bloqueia mudança do último ADMIN, professor com turmas e aluno com matrícula', async () => {
        const ultimoAdmin = await request(server)
            .patch(`/api/admin/usuarios/${users.admin.id_usuario}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ tipo: 'ALUNO' });
        expect(ultimoAdmin.status).toBe(409);
        expect(ultimoAdmin.body.code).toBe('ULTIMO_ADMIN');

        const curso = await criarCurso('Curso para vínculos de papel');
        const turma = await criarTurma(curso.body.id_curso, 'Turma para vínculos de papel');
        expect(turma.status).toBe(201);

        const professor = await request(server)
            .patch(`/api/admin/usuarios/${users.professor.id_usuario}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ tipo: 'ALUNO' });
        expect(professor.status).toBe(409);
        expect(professor.body.code).toBe('PROFESSOR_COM_TURMAS');

        await pool.query(
            'INSERT INTO Matriculas (id_aluno, id_turma, status_aprovacao) VALUES (?, ?, ?)',
            [users.aluno.id_usuario, turma.body.id_turma, 'CURSANDO']
        );
        const aluno = await request(server)
            .patch(`/api/admin/usuarios/${users.aluno.id_usuario}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ tipo: 'PROFESSOR' });
        expect(aluno.status).toBe(409);
        expect(aluno.body.code).toBe('ALUNO_COM_VINCULOS');
    });

    it('protege autoexclusão e vínculos, mas realiza exclusão física válida', async () => {
        const autoexclusao = await request(server)
            .delete(`/api/admin/usuarios/${users.admin.id_usuario}`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(autoexclusao.status).toBe(409);
        expect(autoexclusao.body.code).toBe('AUTOEXCLUSAO');

        const curso = await criarCurso('Curso para exclusões protegidas');
        const turma = await criarTurma(curso.body.id_curso, 'Turma para exclusões protegidas');
        await pool.query(
            'INSERT INTO Matriculas (id_aluno, id_turma, status_aprovacao) VALUES (?, ?, ?)',
            [users.aluno.id_usuario, turma.body.id_turma, 'CURSANDO']
        );

        const professorVinculado = await request(server)
            .delete(`/api/admin/usuarios/${users.professor.id_usuario}`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(professorVinculado.status).toBe(409);

        const alunoVinculado = await request(server)
            .delete(`/api/admin/usuarios/${users.aluno.id_usuario}`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(alunoVinculado.status).toBe(409);

        const criadoComAnalise = await request(server)
            .post('/api/admin/usuarios')
            .set('Authorization', `Bearer ${adminToken}`)
            .send(dadosUsuario(50));
        await pool.query(
            'INSERT INTO AnalisesPlagio (usuario_id, trecho_texto, score_similaridade) VALUES (?, ?, ?)',
            [criadoComAnalise.body.id_usuario, 'Texto de teste', 10]
        );
        const outroVinculo = await request(server)
            .delete(`/api/admin/usuarios/${criadoComAnalise.body.id_usuario}`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(outroVinculo.status).toBe(409);

        const criadoLivre = await request(server)
            .post('/api/admin/usuarios')
            .set('Authorization', `Bearer ${adminToken}`)
            .send(dadosUsuario(51));
        const removido = await request(server)
            .delete(`/api/admin/usuarios/${criadoLivre.body.id_usuario}`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(removido.status).toBe(204);
        const [rows] = await pool.query('SELECT id_usuario FROM Usuarios WHERE id_usuario = ?', [criadoLivre.body.id_usuario]);
        expect(rows).toHaveLength(0);
    });

    it('troca somente a própria senha após validar senha atual e força mínima', async () => {
        const outroUsuario = await request(server)
            .patch(`/api/usuarios/${users.aluno.id_usuario}/senha`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ senha_atual: testPassword, nova_senha: 'NovaSenha@456' });
        expect(outroUsuario.status).toBe(403);

        const incorreta = await request(server)
            .patch(`/api/usuarios/${users.admin.id_usuario}/senha`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ senha_atual: 'Incorreta@123', nova_senha: 'NovaSenha@456' });
        expect(incorreta.status).toBe(403);

        const fraca = await request(server)
            .patch(`/api/usuarios/${users.admin.id_usuario}/senha`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ senha_atual: testPassword, nova_senha: 'fraca' });
        expect(fraca.status).toBe(400);

        const valida = await request(server)
            .patch(`/api/usuarios/${users.admin.id_usuario}/senha`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ senha_atual: testPassword, nova_senha: 'NovaSenha@456' });
        expect(valida.status).toBe(200);
        expect(JSON.stringify(valida.body)).not.toContain(testPassword);
        expect(JSON.stringify(valida.body)).not.toMatch(/NovaSenha@456|\$2[aby]\$/);

        const [rows] = await pool.query('SELECT senha FROM Usuarios WHERE id_usuario = ?', [users.admin.id_usuario]);
        expect(rows[0].senha).not.toBe('NovaSenha@456');
        expect(rows[0].senha).toMatch(/^\$2[aby]\$/);
        expect((await request(server)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${adminToken}`)).status).toBe(401);
        expect((await login('admin@teste.com', testPassword)).status).toBe(401);
        expect((await login('admin@teste.com', 'NovaSenha@456')).status).toBe(200);
    });

    it('executa CRUD de cursos e protege validação, duplicidade e turma vinculada', async () => {
        expect((await request(server).get('/api/cursos')).body).toEqual([]);

        const nomeInvalido = await request(server)
            .post('/api/cursos').set('Authorization', `Bearer ${adminToken}`)
            .send({ nome_curso: ' ', carga_horaria: 10 });
        expect(nomeInvalido.status).toBe(400);
        const cargaInvalida = await request(server)
            .post('/api/cursos').set('Authorization', `Bearer ${adminToken}`)
            .send({ nome_curso: 'Curso inválido', carga_horaria: 0 });
        expect(cargaInvalida.status).toBe(400);

        const curso = await criarCurso('Curso CRUD Goal 4');
        expect(curso.status).toBe(201);
        expect((await criarCurso('Curso CRUD Goal 4')).status).toBe(409);

        const atualizado = await request(server)
            .put(`/api/cursos/${curso.body.id_curso}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ nome_curso: 'Curso CRUD Atualizado', descricao: 'Atualizado', carga_horaria: 40 });
        expect(atualizado.status).toBe(200);
        expect(atualizado.body.carga_horaria).toBe(40);

        const ausente = await request(server)
            .put('/api/cursos/999999')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ nome_curso: 'Ausente', descricao: null, carga_horaria: 10 });
        expect(ausente.status).toBe(404);

        const livre = await criarCurso('Curso removível');
        expect((await request(server)
            .delete(`/api/cursos/${livre.body.id_curso}`)
            .set('Authorization', `Bearer ${adminToken}`)).status).toBe(204);

        await criarTurma(curso.body.id_curso, 'Turma que protege curso');
        const vinculado = await request(server)
            .delete(`/api/cursos/${curso.body.id_curso}`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(vinculado.status).toBe(409);
    });

    it('executa CRUD de turmas com nomes enriquecidos e todas as validações de domínio', async () => {
        expect((await request(server).get('/api/turmas')).body)
            .toEqual({ items: [], page: 1, limit: 50, total: 0 });
        const curso = await criarCurso('Curso base de turmas');

        const turma = await criarTurma(curso.body.id_curso, 'Turma CRUD Goal 4');
        expect(turma.status).toBe(201);
        expect(turma.body.status).toBe('ABERTA');
        const baseTurma = {
            id_curso: curso.body.id_curso,
            id_professor: users.professor.id_usuario,
            data_inicio: '2026-08-01',
            data_fim: '2026-12-01',
            status: 'ABERTA'
        };

        const lista = await request(server).get('/api/turmas');
        expect(lista.status).toBe(200);
        expect(lista.body.items[0]).toEqual(expect.objectContaining({
            nome_curso: 'Curso base de turmas',
            nome_professor: 'Professor Teste'
        }));

        const cursoAusente = await request(server)
            .post('/api/turmas').set('Authorization', `Bearer ${adminToken}`)
            .send({ ...baseTurma, nome_turma: 'Turma curso ausente', id_curso: 999999 });
        expect(cursoAusente.status).toBe(404);

        const naoProfessor = await request(server)
            .post('/api/turmas').set('Authorization', `Bearer ${adminToken}`)
            .send({ ...baseTurma, nome_turma: 'Turma usuário inválido', id_professor: users.aluno.id_usuario });
        expect(naoProfessor.status).toBe(409);

        const professorAusente = await request(server)
            .post('/api/turmas').set('Authorization', `Bearer ${adminToken}`)
            .send({ ...baseTurma, nome_turma: 'Turma professor ausente', id_professor: 999999 });
        expect(professorAusente.status).toBe(404);

        const datasInvalidas = await request(server)
            .post('/api/turmas').set('Authorization', `Bearer ${adminToken}`)
            .send({ ...baseTurma, nome_turma: 'Turma datas inválidas', data_inicio: '2026-10-01', data_fim: '2026-09-01' });
        expect(datasInvalidas.status).toBe(400);

        const statusInvalido = await request(server)
            .post('/api/turmas').set('Authorization', `Bearer ${adminToken}`)
            .send({ ...baseTurma, nome_turma: 'Turma status inválido', status: 'ATIVA' });
        expect(statusInvalido.status).toBe(400);

        expect((await criarTurma(curso.body.id_curso, 'Turma CRUD Goal 4')).status).toBe(409);

        const atualizada = await request(server)
            .patch(`/api/turmas/${turma.body.id_turma}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ status: 'FECHADA', data_fim: '2027-01-10' });
        expect(atualizada.status).toBe(200);
        expect(atualizada.body.status).toBe('FECHADA');

        const encerrada = await request(server)
            .patch(`/api/turmas/${turma.body.id_turma}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ status: 'ENCERRADA' });
        expect(encerrada.status).toBe(200);
        expect(encerrada.body.status).toBe('ENCERRADA');

        const ausente = await request(server)
            .patch('/api/turmas/999999')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ status: 'ENCERRADA' });
        expect(ausente.status).toBe(404);

        const removivel = await criarTurma(curso.body.id_curso, 'Turma removível');
        expect((await request(server)
            .delete(`/api/turmas/${removivel.body.id_turma}`)
            .set('Authorization', `Bearer ${adminToken}`)).status).toBe(204);

        await pool.query(
            'INSERT INTO Matriculas (id_aluno, id_turma, status_aprovacao) VALUES (?, ?, ?)',
            [users.aluno.id_usuario, turma.body.id_turma, 'CURSANDO']
        );
        const vinculada = await request(server)
            .delete(`/api/turmas/${turma.body.id_turma}`)
            .set('Authorization', `Bearer ${adminToken}`);
        expect(vinculada.status).toBe(409);
        expect((await request(server)
            .delete('/api/turmas/999999')
            .set('Authorization', `Bearer ${adminToken}`)).status).toBe(404);
    });

    it('recusa visitante, ALUNO e PROFESSOR nas mutações administrativas de cursos e turmas', async () => {
        const coursePayload = { nome_curso: 'Não autorizado', descricao: null, carga_horaria: 10 };
        const classPayload = {
            nome_turma: 'Não autorizada', id_curso: 1, id_professor: users.professor.id_usuario,
            data_inicio: '2026-09-01', status: 'ABERTA'
        };

        expect((await request(server).post('/api/cursos').send(coursePayload)).status).toBe(401);
        expect((await request(server).post('/api/turmas').send(classPayload)).status).toBe(401);
        for (const token of [alunoToken, professorToken]) {
            expect((await request(server).post('/api/cursos').set('Authorization', `Bearer ${token}`).send(coursePayload)).status).toBe(403);
            expect((await request(server).post('/api/turmas').set('Authorization', `Bearer ${token}`).send(classPayload)).status).toBe(403);
        }
    });
});
