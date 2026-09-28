'use strict';
const { seedProvaFinalAprovada } = require('./academic-fixtures');

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { PDFDocument } = require('pdf-lib');
const {
    initTestPool,
    clearDatabase,
    seedBasicData,
    closeTestPool,
    getSessionToken,
    getTestPassword
} = require('./setup');

const certificateStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'certificados-integration-'));
const { app } = require('../../../index');
const applicationDb = require('../../config/database');
const certificateModel = require('../../api/models/certificados.models');
const pdfService = require('../../api/services/certificate-pdf.service');
process.env.CERTIFICATE_STORAGE_DIR = certificateStorageDir;
process.env.APP_BASE_URL = 'https://certificados.integration.test';

const testPassword = getTestPassword();
let pool;
let users;
let ids;
let tokens;

function auth(token) {
    return { Authorization: `Bearer ${token}` };
}

async function login(email) {
    const response = await request(app).post('/api/auth/login').send({ email, senha: testPassword });
    expect(response.status).toBe(200);
    return getSessionToken(response);
}

async function criarUsuario(nome, cpf, email, tipo) {
    const [[base]] = await pool.query("SELECT senha FROM Usuarios WHERE email = 'aluno@teste.com'");
    const [result] = await pool.query(
        `INSERT INTO Usuarios (nome_completo, cpf, email, senha, telefone, tipo)
         VALUES (?, ?, ?, ?, '41999999999', ?)`,
        [nome, cpf, email, base.senha, tipo]
    );
    await pool.query(
        `INSERT INTO EmailVerificacoes (email, codigo, verificado, expira_em)
         VALUES (?, '000000', 1, DATE_ADD(NOW(), INTERVAL 1 YEAR))`,
        [email]
    );
    return result.insertId;
}

async function criarCenario() {
    const professorAlheio = await criarUsuario(
        'Professor Alheio Certificado',
        '44444444444',
        'professor.certificado.alheio@teste.com',
        'PROFESSOR'
    );
    const alunoAlheio = await criarUsuario(
        'Aluno Alheio Certificado',
        '55555555555',
        'aluno.certificado.alheio@teste.com',
        'ALUNO'
    );
    const [curso] = await pool.query(
        `INSERT INTO Cursos (nome_curso, descricao, carga_horaria)
         VALUES ('Curso de Certificados', 'Fluxo de integração', 32)`
    );
    const [turma] = await pool.query(
        `INSERT INTO Turmas
         (id_curso, id_professor, nome_turma, data_inicio, data_fim, status)
         VALUES (?, ?, 'Turma Certificados 2026/1', '2026-02-01', '2026-06-30', 'ENCERRADA')`,
        [curso.insertId, users.professor.id_usuario]
    );
    const [aprovada] = await pool.query(
        `INSERT INTO Matriculas
         (id_aluno, id_turma, nota_final, status_aprovacao, progresso_percentual)
         VALUES (?, ?, 9.0, 'APROVADO', 100)`,
        [users.aluno.id_usuario, turma.insertId]
    );
    const [cursando] = await pool.query(
        `INSERT INTO Matriculas
         (id_aluno, id_turma, nota_final, status_aprovacao, progresso_percentual)
         VALUES (?, ?, NULL, 'CURSANDO', 40)`,
        [alunoAlheio, turma.insertId]
    );
    const [conteudo] = await pool.query(
        `INSERT INTO Conteudos (id_turma, titulo, tipo, corpo, ordem)
         VALUES (?, 'Conteúdo concluído', 'TEXTO', 'Conteúdo acadêmico', 1)`,
        [turma.insertId]
    );
    await pool.query(
        `INSERT INTO ConteudosProgresso (id_aluno, id_conteudo, status, iniciado_em, concluido_em)
         VALUES (?, ?, 'CONCLUIDO', NOW(), NOW())`,
        [users.aluno.id_usuario, conteudo.insertId]
    );
    await seedProvaFinalAprovada(pool, users.aluno.id_usuario, turma.insertId);
    return {
        curso: curso.insertId,
        turma: turma.insertId,
        matriculaAprovada: aprovada.insertId,
        matriculaCursando: cursando.insertId,
        professorAlheio,
        alunoAlheio
    };
}

async function emitir(token = tokens.admin, matricula = ids.matriculaAprovada) {
    return request(app)
        .post(`/api/certificados/matriculas/${matricula}/emitir`)
        .set(auth(token));
}

beforeAll(async () => {
    pool = await initTestPool();
});

beforeEach(async () => {
    await clearDatabase();
    fs.rmSync(certificateStorageDir, { recursive: true, force: true });
    fs.mkdirSync(certificateStorageDir, { recursive: true });
    users = await seedBasicData();
    ids = await criarCenario();
    tokens = {
        admin: await login('admin@teste.com'),
        professor: await login('professor@teste.com'),
        professorAlheio: await login('professor.certificado.alheio@teste.com'),
        aluno: await login('aluno@teste.com'),
        alunoAlheio: await login('aluno.certificado.alheio@teste.com')
    };
});

afterAll(async () => {
    await closeTestPool();
    await applicationDb.end();
    fs.rmSync(certificateStorageDir, { recursive: true, force: true });
});

afterEach(() => jest.restoreAllMocks());

describe('certificados de conclusão', () => {
    it('novo conteúdo incompleto não bloqueia emissão ou reutilização do certificado', async () => {
        await pool.query("UPDATE Turmas SET status = 'ABERTA' WHERE id_turma = ?", [ids.turma]);
        const novo = await request(app).post(`/api/turmas/${ids.turma}/conteudos`)
            .set(auth(tokens.professor)).send({ titulo: 'Novo conteúdo', tipo: 'TEXTO', corpo: 'Texto', ordem: 2 });
        expect(novo.status).toBe(201);
        const gerar = jest.spyOn(pdfService, 'gerarCertificadoPdf');
        try {
            const emitido = await emitir();
            expect(emitido.status).toBe(201);
            expect(gerar).toHaveBeenCalledTimes(1);
            expect(fs.readdirSync(certificateStorageDir)).toHaveLength(1);
            const [[total]] = await pool.query('SELECT COUNT(*) AS total FROM Certificados');
            expect(total.total).toBe(1);
            const [[matricula]] = await pool.query('SELECT status_aprovacao FROM Matriculas WHERE id_matricula = ?', [ids.matriculaAprovada]);
            expect(matricula.status_aprovacao).toBe('APROVADO');
        } finally { gerar.mockRestore(); }
        await pool.query("UPDATE Turmas SET status = 'ENCERRADA' WHERE id_turma = ?", [ids.turma]);
        expect((await emitir()).status).toBe(200);
        // Documento emitido permanece reutilizável após mudança estrutural posterior.
        await pool.query("INSERT INTO Conteudos (id_turma, titulo, tipo, ordem) VALUES (?, 'Posterior', 'TEXTO', 3)", [ids.turma]);
        expect((await emitir()).status).toBe(200);
        expect(fs.readdirSync(certificateStorageDir)).toHaveLength(1);
    });

    it('usa a estrutura confirmada enquanto a emissão aguarda o lock da turma', async () => {
        const writer = await pool.getConnection();
        const original = certificateModel.buscarContextoEmissao;
        const buscar = jest.spyOn(certificateModel, 'buscarContextoEmissao');
        let started;
        const aguardando = new Promise(resolve => { started = resolve; });
        buscar.mockImplementationOnce(async (...args) => { started(); return original(...args); });
        try {
            await writer.beginTransaction();
            await writer.query('SELECT id_turma FROM Turmas WHERE id_turma = ? FOR UPDATE', [ids.turma]);
            await writer.query("INSERT INTO Conteudos (id_turma, titulo, tipo, ordem) VALUES (?, 'Concorrente', 'TEXTO', 2)", [ids.turma]);
            const emissao = emitir().then(response => response);
            await aguardando;
            await writer.commit();
            const response = await emissao;
            expect(response.status).toBe(201);
            expect(fs.readdirSync(certificateStorageDir)).toHaveLength(1);
        } finally {
            await writer.rollback();
            writer.release();
            buscar.mockRestore();
        }
    });

    it('ADMIN emite PDF final com código, hash e arquivo no storage privado', async () => {
        const response = await emitir();
        expect(response.status).toBe(201);
        expect(response.body.reutilizado).toBe(false);
        expect(response.body.certificado.codigo_publico)
            .toMatch(/^CERT-[0-9A-F]{8}(?:-[0-9A-F]{8}){3}$/);

        const [[registro]] = await pool.query(
            'SELECT * FROM Certificados WHERE id_certificado = ?',
            [response.body.certificado.id_certificado]
        );
        const caminho = path.join(certificateStorageDir, registro.storage_name);
        const pdf = fs.readFileSync(caminho);
        const documento = await PDFDocument.load(pdf);
        expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
        expect(documento.getPageCount()).toBe(2);
        expect(registro.sha256).toBe(crypto.createHash('sha256').update(pdf).digest('hex'));
        expect(registro.tamanho_bytes).toBe(pdf.length);
        expect(path.dirname(caminho)).toBe(certificateStorageDir);
    });

    it('professor responsável emite, mas professor alheio, aluno e anônimo não emitem', async () => {
        const alheio = await emitir(tokens.professorAlheio);
        const aluno = await emitir(tokens.aluno);
        const anonimo = await request(app)
            .post(`/api/certificados/matriculas/${ids.matriculaAprovada}/emitir`);
        const responsavel = await emitir(tokens.professor);

        expect(alheio.status).toBe(403);
        expect(aluno.status).toBe(403);
        expect(anonimo.status).toBe(401);
        expect(responsavel.status).toBe(201);
    });

    it('não emite para aluno sem aprovação, mesmo com a turma encerrada', async () => {
        const response = await emitir(tokens.admin, ids.matriculaCursando);
        expect(response.status).toBe(409);
        expect(response.body.code).toBe('ALUNO_NAO_APROVADO');
        const [[total]] = await pool.query('SELECT COUNT(*) AS total FROM Certificados');
        expect(total.total).toBe(0);
        expect(fs.readdirSync(certificateStorageDir)).toHaveLength(0);
    });

    it('é idempotente em chamadas sequenciais e concorrentes para aluno + turma', async () => {
        const [primeira, segunda] = await Promise.all([emitir(), emitir()]);
        expect([primeira.status, segunda.status].sort()).toEqual([200, 201]);
        expect(primeira.body.certificado.id_certificado)
            .toBe(segunda.body.certificado.id_certificado);

        const terceira = await emitir();
        expect(terceira.status).toBe(200);
        expect(terceira.body.reutilizado).toBe(true);
        const [[total]] = await pool.query(
            'SELECT COUNT(*) AS total FROM Certificados WHERE id_aluno = ? AND id_turma = ?',
            [users.aluno.id_usuario, ids.turma]
        );
        expect(total.total).toBe(1);
        expect(fs.readdirSync(certificateStorageDir)).toHaveLength(1);
    });

    it('a constraint UNIQUE do banco impede duplicata independentemente da API', async () => {
        await emitir();
        await expect(pool.query(
            `INSERT INTO Certificados
             (id_aluno, id_turma, codigo_publico, aluno_nome, curso_nome, turma_nome,
              carga_horaria, sha256, storage_name, tamanho_bytes, id_usuario_emissor)
             VALUES (?, ?, 'CERT-AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD', 'Outro nome',
                     'Outro curso', 'Outra turma', 1, ?, ?, 1, ?)`,
            [users.aluno.id_usuario, ids.turma, 'b'.repeat(64),
                'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf', users.admin.id_usuario]
        )).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
    });

    it('aluno baixa o próprio PDF, sem poder baixar certificado alheio por ID', async () => {
        const emitido = await emitir();
        const idCertificado = emitido.body.certificado.id_certificado;
        const proprio = await request(app)
            .get(`/api/certificados/${idCertificado}/pdf?download=1`)
            .set(auth(tokens.aluno));
        const alheio = await request(app)
            .get(`/api/certificados/${idCertificado}/pdf`)
            .set(auth(tokens.alunoAlheio));

        expect(proprio.status).toBe(200);
        expect(proprio.headers['content-type']).toContain('application/pdf');
        expect(proprio.headers['content-disposition']).toContain('attachment');
        expect(proprio.headers['x-content-type-options']).toBe('nosniff');
        expect(alheio.status).toBe(403);
        expect(alheio.body).not.toHaveProperty('caminho');
    });

    it('valida publicamente por código sem autenticação nem dados privados', async () => {
        const emitido = await emitir();
        const codigo = emitido.body.certificado.codigo_publico;
        const valido = await request(app).get(`/api/public/certificados/${codigo}`);
        const inexistente = await request(app)
            .get('/api/public/certificados/CERT-FFFFFFFF-FFFFFFFF-FFFFFFFF-FFFFFFFF');

        expect(valido.status).toBe(200);
        expect(valido.body).toMatchObject({
            resultado: 'VALIDO',
            certificado: {
                codigo,
                aluno: 'Aluno Teste',
                curso: 'Curso de Certificados',
                turma: 'Turma Certificados 2026/1',
                carga_horaria: 32
            }
        });
        expect(JSON.stringify(valido.body)).not.toMatch(/cpf|email|telefone|sha256|storage_name|id_aluno/i);
        expect(inexistente.body).toEqual({ resultado: 'NAO_ENCONTRADO' });
    });

    it('valida o PDF original por upload e não valida uma cópia alterada', async () => {
        const emitido = await emitir();
        const download = await request(app)
            .get(`/api/certificados/${emitido.body.certificado.id_certificado}/pdf`)
            .set(auth(tokens.aluno));
        const original = Buffer.from(download.body);
        const alterado = Buffer.concat([original, Buffer.from('\n% alteração controlada')]);

        const autentico = await request(app)
            .post('/api/public/certificados/validar-arquivo')
            .attach('arquivo', original, { filename: 'certificado.pdf', contentType: 'application/pdf' });
        const naoValidado = await request(app)
            .post('/api/public/certificados/validar-arquivo')
            .attach('arquivo', alterado, { filename: 'certificado.pdf', contentType: 'application/pdf' });

        expect(autentico.status).toBe(200);
        expect(autentico.body.resultado).toBe('AUTENTICO');
        expect(naoValidado.status).toBe(200);
        expect(naoValidado.body).toEqual({ resultado: 'NAO_VALIDADO' });
    });

    it('rejeita upload ausente, tipo inválido e multipart com mais de um arquivo', async () => {
        const ausente = await request(app).post('/api/public/certificados/validar-arquivo');
        const tipo = await request(app)
            .post('/api/public/certificados/validar-arquivo')
            .attach('arquivo', Buffer.from('texto'), { filename: 'arquivo.txt', contentType: 'text/plain' });
        const duplo = await request(app)
            .post('/api/public/certificados/validar-arquivo')
            .attach('arquivo', Buffer.from('%PDF-um'), { filename: 'um.pdf', contentType: 'application/pdf' })
            .attach('arquivo', Buffer.from('%PDF-dois'), { filename: 'dois.pdf', contentType: 'application/pdf' });

        expect(ausente.status).toBe(400);
        expect(tipo.status).toBe(422);
        expect(duplo.status).toBe(400);
    });

    it('rejeita PDF acima do limite e hash declarado pelo visitante', async () => {
        const grande = Buffer.alloc(10 * 1024 * 1024 + 1, 32);
        grande.write('%PDF-');
        const oversized = await request(app).post('/api/public/certificados/validar-arquivo')
            .attach('arquivo', grande, { filename: 'grande.pdf', contentType: 'application/pdf' });
        const hashExterno = await request(app).post('/api/public/certificados/validar-arquivo')
            .field('sha256', 'a'.repeat(64))
            .attach('arquivo', Buffer.from('%PDF-exemplo'), { filename: 'exemplo.pdf', contentType: 'application/pdf' });
        expect(oversized.status).toBe(413);
        expect(hashExterno.status).toBe(400);
        expect(fs.readdirSync(certificateStorageDir)).toHaveLength(0);
    });

    it.each(['insert', 'pdf'])('falha em %s não deixa registro nem PDF órfão', async (etapa) => {
        const spy = etapa === 'insert'
            ? jest.spyOn(certificateModel, 'inserir')
            : jest.spyOn(pdfService, 'gerarCertificadoPdf');
        spy.mockRejectedValueOnce(new Error('Falha controlada na emissão'));
        expect((await emitir()).status).toBe(500);
        const [[total]] = await pool.query('SELECT COUNT(*) AS total FROM Certificados');
        expect(total.total).toBe(0);
        expect(fs.readdirSync(certificateStorageDir)).toHaveLength(0);
    });

    it('ADMIN revoga preservando PDF e o status público; professor não revoga', async () => {
        const emitido = await emitir();
        const certificado = emitido.body.certificado;
        const [[antes]] = await pool.query(
            'SELECT storage_name FROM Certificados WHERE id_certificado = ?',
            [certificado.id_certificado]
        );
        const professor = await request(app)
            .post(`/api/certificados/${certificado.id_certificado}/revogar`)
            .set(auth(tokens.professor))
            .send({ motivo: 'Tentativa sem privilégio' });
        const admin = await request(app)
            .post(`/api/certificados/${certificado.id_certificado}/revogar`)
            .set(auth(tokens.admin))
            .send({ motivo: 'Correção acadêmica necessária' });
        const publico = await request(app)
            .get(`/api/public/certificados/${certificado.codigo_publico}`);

        expect(professor.status).toBe(403);
        expect(admin.status).toBe(200);
        expect(admin.body.certificado.status).toBe('REVOGADO');
        expect(publico.body.resultado).toBe('REVOGADO');
        expect(fs.existsSync(path.join(certificateStorageDir, antes.storage_name))).toBe(true);
        const [[registro]] = await pool.query(
            `SELECT status, id_usuario_revogador, motivo_revogacao, revogado_em
             FROM Certificados WHERE id_certificado = ?`,
            [certificado.id_certificado]
        );
        expect(registro).toMatchObject({
            status: 'REVOGADO',
            id_usuario_revogador: users.admin.id_usuario,
            motivo_revogacao: 'Correção acadêmica necessária'
        });
        expect(registro.revogado_em).toBeInstanceOf(Date);
        const uploaded = await request(app).post('/api/public/certificados/validar-arquivo')
            .attach('arquivo', fs.readFileSync(path.join(certificateStorageDir, antes.storage_name)),
                { filename: 'revogado.pdf', contentType: 'application/pdf' });
        expect(uploaded.status).toBe(200);
        expect(uploaded.body.resultado).toBe('REVOGADO');
    });

    it('bloqueia rebaixamento e cancelamento enquanto houver certificado ativo', async () => {
        await emitir();
        const atualizar = await request(app)
            .patch(`/api/matriculas/${ids.matriculaAprovada}`)
            .set(auth(tokens.professor))
            .send({ status_aprovacao: 'REPROVADO', nota_final: 5 });
        const cancelar = await request(app)
            .delete(`/api/matriculas/${ids.matriculaAprovada}`)
            .set(auth(tokens.aluno));

        expect(atualizar.status).toBe(409);
        expect(atualizar.body.code).toBe('CERTIFICADO_ATIVO');
        expect(cancelar.status).toBe(409);
        expect(cancelar.body.code).toBe('CERTIFICADO_ATIVO');
    });
});

describe('D-14: reemissão, integridade e versões históricas', () => {
    const reemitir = (id, token = tokens.admin, payload = { motivo: 'Correção administrativa do nome' }) =>
        request(app).post(`/api/certificados/${id}/reemitir`).set(auth(token)).send(payload);
    const registros = async () => (await pool.query('SELECT * FROM Certificados ORDER BY versao'))[0];
    const bytes = row => fs.readFileSync(path.join(certificateStorageDir, row.storage_name));
    const upload = buffer => request(app).post('/api/public/certificados/validar-arquivo')
        .attach('arquivo', buffer, { filename: 'certificado.pdf', contentType: 'application/pdf' });

    it('reemite com snapshot atual, preserva bytes antigos e valida cada versão pelo código/hash', async () => {
        const v1 = (await emitir()).body.certificado;
        const [antes] = await registros();
        const pdf1 = bytes(antes);
        await pool.query("UPDATE Usuarios SET nome_completo = 'Nome corrigido', cpf = '77777777777' WHERE id_usuario = ?", [users.aluno.id_usuario]);
        await pool.query("UPDATE Cursos SET nome_curso = 'Curso corrigido' WHERE id_curso = ?", [ids.curso]);
        const response = await reemitir(v1.id_certificado);
        expect(response.status).toBe(201);
        const [antigo, novo] = await registros();
        expect(antigo).toMatchObject({ ...antes, status: 'REVOGADO', ativo_unico: null, id_usuario_revogador: users.admin.id_usuario,
            motivo_revogacao: 'Correção administrativa do nome', revogado_em: expect.any(Date) });
        expect(bytes(antigo)).toEqual(pdf1);
        expect(novo).toMatchObject({ versao: 2, status: 'ATIVO', id_certificado_anterior: antes.id_certificado,
            id_usuario_reemissor: users.admin.id_usuario, reemitido_em: expect.any(Date), aluno_nome: 'Nome corrigido', curso_nome: 'Curso corrigido' });
        for (const campo of ['codigo_publico', 'sha256', 'storage_name']) expect(novo[campo]).not.toBe(antes[campo]);
        expect(bytes(novo)).not.toEqual(pdf1);
        const snapshot = typeof novo.snapshot_json === 'string' ? JSON.parse(novo.snapshot_json) : novo.snapshot_json;
        expect(snapshot).toMatchObject({ aluno_cpf: '77777777777', aluno_nome: 'Nome corrigido', responsavel_nome: expect.any(String) });
        for (const [row, resultadoCodigo, resultadoUpload] of [[antigo, 'REVOGADO', 'REVOGADO'], [novo, 'VALIDO', 'AUTENTICO']]) {
            const publico = await request(app).get(`/api/public/certificados/${row.codigo_publico}`);
            expect(publico.body.resultado).toBe(resultadoCodigo);
            expect(JSON.stringify(publico.body)).not.toMatch(/cpf|email|snapshot|storage|sha256|id_aluno|motivo/i);
            expect((await upload(bytes(row))).body.resultado).toBe(resultadoUpload);
            expect((await upload(Buffer.concat([bytes(row), Buffer.from('\n% adulterado')]))).body.resultado).toBe('NAO_VALIDADO');
            expect((await request(app).get(`/api/certificados/${row.id_certificado}/pdf?download=1`).set(auth(tokens.aluno))).status).toBe(200);
        }
        const historico = await request(app).get(`/api/certificados/${novo.id_certificado}/historico`).set(auth(tokens.admin));
        expect(historico.body.certificados.map(c => c.versao)).toEqual([2, 1]);
        const meus = await request(app).get('/api/certificados/meus').set(auth(tokens.aluno));
        expect(meus.body.certificados.map(c => c.versao)).toEqual([2, 1]);
        expect((await request(app).get(`/api/certificados/${novo.id_certificado}/historico`).set(auth(tokens.alunoAlheio))).status).toBe(403);
        await request(app).post(`/api/certificados/${novo.id_certificado}/revogar`).set(auth(tokens.admin)).send({ motivo: 'Revogação isolada posterior' });
        expect((await request(app).get(`/api/public/certificados/${antigo.codigo_publico}`)).body.resultado).toBe('REVOGADO');
        expect(bytes(antigo)).toEqual(pdf1);
        const turma = await request(app).get(`/api/matriculas/turma/${ids.turma}`).set(auth(tokens.admin));
        expect(turma.status).toBe(200);
        const alunos = Array.isArray(turma.body) ? turma.body : turma.body.matriculas;
        expect(alunos.filter(a => a.id_matricula === ids.matriculaAprovada)).toHaveLength(1);
    });

    it('duas reemissões simultâneas e retry criam somente v2 e retornam conflito ao perdedor', async () => {
        const v1 = (await emitir()).body.certificado;
        const responses = await Promise.all([reemitir(v1.id_certificado), reemitir(v1.id_certificado)]);
        expect(responses.map(r => r.status).sort()).toEqual([201, 409]);
        expect((await reemitir(v1.id_certificado)).status).toBe(409);
        const rows = await registros();
        expect(rows.map(r => [r.versao, r.status])).toEqual([[1, 'REVOGADO'], [2, 'ATIVO']]);
        expect(fs.readdirSync(certificateStorageDir)).toHaveLength(2);
        expect((await reemitir(rows[1].id_certificado)).status).toBe(201);
        expect((await registros()).map(r => r.versao)).toEqual([1, 2, 3]);
    });

    it('ADMIN reemite após revogação isolada sem apagar autoria, data ou motivo anterior', async () => {
        const v1 = (await emitir()).body.certificado;
        await request(app).post(`/api/certificados/${v1.id_certificado}/revogar`).set(auth(tokens.admin)).send({ motivo: 'Documento incorreto' });
        const [revogado] = await registros();
        expect((await emitir(tokens.professor)).status).toBe(409);
        expect((await emitir(tokens.admin)).status).toBe(409);
        expect((await reemitir(v1.id_certificado)).status).toBe(201);
        expect((await registros())[0]).toEqual(revogado);
    });

    it('rejeita professor, aluno, anônimo, motivo inválido e campos controlados pelo servidor', async () => {
        const id = (await emitir()).body.certificado.id_certificado;
        for (const token of [tokens.professor, tokens.aluno, tokens.professorAlheio]) {
            expect((await reemitir(id, token)).status).toBe(403);
        }
        expect((await request(app).post(`/api/certificados/${id}/reemitir`).send({ motivo: 'Correção' })).status).toBe(401);
        for (const payload of [{}, { motivo: '' }, { motivo: '  ' }, { motivo: 'x'.repeat(501) }, { motivo: ['correção'] },
            ...['codigo_publico', 'sha256', 'storage_name', 'versao', 'status', 'id_aluno', 'id_turma'].map(key => ({ motivo: 'Correção', [key]: 1 }))]) {
            expect((await reemitir(id, tokens.admin, payload)).status).toBe(400);
        }
        expect(await registros()).toHaveLength(1);
    });

    it.each(['conteudos', 'prova', 'matricula'])('revalida aprovação e nota, ignorando conteúdos em %s', async etapa => {
        const id = (await emitir()).body.certificado.id_certificado;
        if (etapa === 'conteudos') await pool.query("INSERT INTO Conteudos (id_turma, titulo, tipo, ordem) VALUES (?, 'Pendente', 'TEXTO', 2)", [ids.turma]);
        if (etapa === 'prova') await pool.query('UPDATE Q_Tentativas SET percentual = 74 WHERE id_usuario = ?', [users.aluno.id_usuario]);
        if (etapa === 'matricula') await pool.query("UPDATE Matriculas SET status_aprovacao = 'CANCELADO' WHERE id_matricula = ?", [ids.matriculaAprovada]);
        const response = await reemitir(id);
        if (etapa === 'conteudos') {
            expect(response.status).toBe(201);
            expect((await registros()).map(r => r.status)).toEqual(['REVOGADO', 'ATIVO']);
            expect(fs.readdirSync(certificateStorageDir)).toHaveLength(2);
        } else {
            expect(response.status).toBe(409);
            expect((await registros()).map(r => r.status)).toEqual(['ATIVO']);
            expect(fs.readdirSync(certificateStorageDir)).toHaveLength(1);
        }
    });

    it.each(['pdf', 'storage', 'sql', 'codigo'])('falha de %s mantém o anterior ATIVO e remove somente novos arquivos', async etapa => {
        const id = (await emitir()).body.certificado.id_certificado;
        const [antes] = await registros();
        const pdf = bytes(antes);
        const storageService = require('../../api/services/certificate-storage.service');
        const spy = etapa === 'pdf' ? jest.spyOn(pdfService, 'gerarCertificadoPdf')
            : etapa === 'storage' ? jest.spyOn(storageService, 'persistirPdfFinal') : jest.spyOn(certificateModel, 'inserir');
        spy.mockRejectedValue(Object.assign(new Error('Falha controlada'), etapa === 'codigo'
            ? { code: 'ER_DUP_ENTRY', message: 'uk_certificado_codigo_publico' } : {}));
        expect((await reemitir(id)).status).toBe(etapa === 'codigo' ? 503 : 500);
        expect(await registros()).toEqual([antes]);
        expect(bytes(antes)).toEqual(pdf);
        expect(fs.readdirSync(certificateStorageDir)).toHaveLength(1);
    });

    it('constraint de ativo funciona mesmo com versão diferente; versão duplicada também é recusada', async () => {
        const id = (await emitir()).body.certificado.id_certificado;
        await reemitir(id);
        const [v1, v2] = await registros();
        const columns = Object.keys(v2).filter(k => !['id_certificado', 'ativo_unico'].includes(k));
        const insert = changes => {
            const row = { ...v2, codigo_publico: 'CERT-AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD',
                storage_name: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf', id_certificado_anterior: v2.id_certificado, ...changes };
            return pool.query(`INSERT INTO Certificados (${columns.map(c => `\`${c}\``).join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
                columns.map(c => c === 'snapshot_json' && typeof row[c] !== 'string' ? JSON.stringify(row[c]) : row[c]));
        };
        await expect(insert({ versao: 3 })).rejects.toMatchObject({ code: 'ER_DUP_ENTRY', sqlMessage: expect.stringContaining('uk_certificado_ativo') });
        await expect(insert({ versao: 2, status: 'REVOGADO', revogado_em: new Date(), id_usuario_revogador: users.admin.id_usuario, motivo_revogacao: 'Teste de constraint' }))
            .rejects.toMatchObject({ code: 'ER_DUP_ENTRY', sqlMessage: expect.stringContaining('uk_certificado_versao') });
        expect(bytes(v1)).toBeDefined();
    });

    it('migration 009 reaplicável preserva legados ATIVO/REVOGADO e para diante de hash/arquivo inválido', async () => {
        await emitir();
        const [original] = await registros();
        const originalBytes = bytes(original);
        const legacySql = fs.readFileSync(path.join(__dirname, '../../../mysql/migrations/006_certificados.sql'), 'utf8');
        const migration = fs.readFileSync(path.join(__dirname, '../../../mysql/migrations/009_certificate_versioning.sql'), 'utf8');
        const { assertCertificateLegacyIntegrity } = require('../../../scripts/certificate_migration_preflight');
        const connection = await pool.getConnection();
        // Dedicated disposable test database, enforced by integration setup.
        const runSql = async sql => {
            // PREPARE statements contain semicolons only at their own boundaries here.
            for (const statement of sql.split(/;\s*(?:\n|$)/).filter(s => s.trim())) await connection.query(statement);
        };
        try {
            await connection.query('DROP TABLE Certificados');
            await runSql(legacySql);
            const [cols] = await connection.query('SHOW COLUMNS FROM Certificados');
            const columns = cols.map(c => c.Field);
            const legacy = { ...original };
            const insert = row => connection.query(`INSERT INTO Certificados (${columns.map(c => `\`${c}\``).join(',')}) VALUES (${columns.map(() => '?').join(',')})`, columns.map(c => row[c]));
            await insert(legacy);
            const revoked = { ...legacy, id_certificado: Number(legacy.id_certificado) + 100, id_aluno: ids.alunoAlheio,
                codigo_publico: 'CERT-AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD', storage_name: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.pdf',
                status: 'REVOGADO', revogado_em: new Date('2026-09-01T12:00:00Z'), id_usuario_revogador: users.admin.id_usuario, motivo_revogacao: 'Motivo legado' };
            fs.writeFileSync(path.join(certificateStorageDir, revoked.storage_name), originalBytes);
            await insert(revoked);
            const [before] = await connection.query('SELECT * FROM Certificados ORDER BY id_certificado');
            await connection.query("UPDATE Certificados SET sha256 = 'invalido' WHERE id_certificado = ?", [legacy.id_certificado]);
            await expect(runSql(migration)).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
            await expect(assertCertificateLegacyIntegrity(connection)).rejects.toThrow('integridade inválida');
            await connection.query('UPDATE Certificados SET sha256 = ? WHERE id_certificado = ?', [legacy.sha256, legacy.id_certificado]);
            await expect(assertCertificateLegacyIntegrity(connection)).resolves.toBe(2);
            await runSql(migration);
            await runSql(migration);
            const [after] = await connection.query('SELECT * FROM Certificados ORDER BY id_certificado');
            after.forEach((row, i) => {
                expect(row).toMatchObject({ ...before[i], versao: 1, snapshot_json: null, id_certificado_anterior: null });
                expect(bytes(row)).toEqual(originalBytes);
            });
            await connection.query('UPDATE Certificados SET storage_name = ? WHERE id_certificado = ?', ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.pdf', legacy.id_certificado]);
            await expect(assertCertificateLegacyIntegrity(connection)).rejects.toThrow('arquivo ausente');
        } finally {
            await runSql(migration);
            connection.release();
        }
    });
});

it('Goal 07: missing certificate returns 503 while history and public upload authentication remain valid', async () => {
    const emitted = await emitir(); expect(emitted.status).toBe(201);
    const id = emitted.body.certificado.id_certificado;
    const [[before]] = await pool.query('SELECT * FROM Certificados WHERE id_certificado = ?', [id]);
    const bytes = fs.readFileSync(path.join(certificateStorageDir, before.storage_name));
    fs.unlinkSync(path.join(certificateStorageDir, before.storage_name));
    const download = await request(app).get(`/api/certificados/${id}/pdf`).set(auth(tokens.aluno));
    expect(download.status).toBe(503); expect(download.body.code).toBe('ARQUIVO_INDISPONIVEL');
    expect(JSON.stringify(download.body)).not.toMatch(/ENOENT|stack|\/tmp/);
    const valid = await request(app).post('/api/public/certificados/validar-arquivo')
        .attach('arquivo', bytes, { filename: 'certificate.pdf', contentType: 'application/pdf' });
    expect(valid.status).toBe(200); expect(valid.body.resultado).toBe('AUTENTICO');
    const history = await request(app).get(`/api/certificados/${id}/historico`).set(auth(tokens.admin));
    expect(history.status).toBe(200); expect(history.body.certificados).toHaveLength(1);
    const [[after]] = await pool.query('SELECT * FROM Certificados WHERE id_certificado = ?', [id]);
    expect(after).toEqual(before);
});
