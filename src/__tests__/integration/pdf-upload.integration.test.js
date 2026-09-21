'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plataforma-pdf-test-'));
process.env.MATERIAL_STORAGE_DIR = storageDir;
process.env.PDF_MAX_SIZE_MB = '1';

const request = require('supertest');
const crypto = require('crypto');
const {
    initTestPool,
    clearDatabase,
    seedBasicData,
    closeTestPool,
    getTestPassword,
    getSessionToken
} = require('./setup');
const { app } = require('../../../index');
// O carregamento do app lê .env; o storage deste teste continua isolado.
process.env.MATERIAL_STORAGE_DIR = storageDir;
const applicationDb = require('../../config/database');
const turmaReplication = require('../../api/services/turma-replication.service');

const pdf = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'valid-material.pdf'));
const encryptedPdf = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'encrypted-material.pdf'));
let pool;
let users;
let ids;
let tokens;

function como(token) {
    return { Authorization: `Bearer ${token}` };
}

async function login(email) {
    const response = await request(app).post('/api/auth/login')
        .send({ email, senha: getTestPassword() });
    expect(response.status).toBe(200);
    return getSessionToken(response);
}

async function upload(idTurma, token, overrides = {}) {
    let requisicao = request(app)
        .post(`/api/turmas/${idTurma}/conteudos/pdf`)
        .set(como(token))
        .field('titulo', overrides.titulo || 'Guia seguro')
        .field('ordem', String(overrides.ordem ?? 1));
    if (overrides.id_modulo) requisicao = requisicao.field('id_modulo', String(overrides.id_modulo));
    if (overrides.semArquivo) return requisicao;
    return requisicao.attach(
        'arquivo',
        overrides.buffer ?? pdf,
        { filename: overrides.filename || 'guia ação.pdf', contentType: overrides.mime || 'application/pdf' }
    );
}

async function prepararCenario() {
    const [hash] = await pool.query("SELECT senha FROM Usuarios WHERE email = 'professor@teste.com'");
    const [outro] = await pool.query(
        `INSERT INTO Usuarios (nome_completo, cpf, email, senha, telefone, tipo)
         VALUES ('Professor PDF Alheio', '48888888888', 'professor.pdf.alheio@teste.com', ?,
                 '11988888888', 'PROFESSOR')`,
        [hash[0].senha]
    );
    await pool.query(
        `INSERT INTO EmailVerificacoes (email, codigo, verificado, expira_em)
         VALUES ('professor.pdf.alheio@teste.com', '000000', 1, DATE_ADD(NOW(), INTERVAL 1 YEAR))`
    );
    const [curso] = await pool.query(
        "INSERT INTO Cursos (nome_curso, descricao, carga_horaria) VALUES ('PDF real', 'Teste', 10)"
    );
    const turma = async (professor, nome, status) => (await pool.query(
        `INSERT INTO Turmas (id_curso, id_professor, nome_turma, data_inicio, status)
         VALUES (?, ?, ?, '2026-09-01', ?)`,
        [curso.insertId, professor, nome, status]
    ))[0].insertId;
    const aberta = await turma(users.professor.id_usuario, 'PDF aberta', 'ABERTA');
    const fechada = await turma(users.professor.id_usuario, 'PDF fechada', 'FECHADA');
    const encerrada = await turma(users.professor.id_usuario, 'PDF encerrada', 'ENCERRADA');
    const alheia = await turma(outro.insertId, 'PDF alheia', 'ABERTA');
    const [modulo] = await pool.query(
        "INSERT INTO Modulos (id_turma, titulo, ordem) VALUES (?, 'Materiais', 1)",
        [aberta]
    );
    await pool.query(
        "INSERT INTO Matriculas (id_aluno, id_turma, status_aprovacao) VALUES (?, ?, 'CURSANDO')",
        [users.aluno.id_usuario, aberta]
    );
    return { curso: curso.insertId, outro: outro.insertId, aberta, fechada, encerrada, alheia, modulo: modulo.insertId };
}

describe('upload privado e persistente de PDFs', () => {
    beforeAll(async () => {
        pool = await initTestPool();
    });

    beforeEach(async () => {
        await clearDatabase();
        for (const nome of fs.readdirSync(storageDir)) fs.unlinkSync(path.join(storageDir, nome));
        users = await seedBasicData();
        ids = await prepararCenario();
        tokens = {
            admin: await login('admin@teste.com'),
            professor: await login('professor@teste.com'),
            outro: await login('professor.pdf.alheio@teste.com'),
            aluno: await login('aluno@teste.com')
        };
    });

    afterAll(async () => {
        await closeTestPool();
        await applicationDb.end();
        fs.rmSync(storageDir, { recursive: true, force: true });
    });

    it('persiste metadados seguros, hash e vínculo e entrega apenas pela rota protegida', async () => {
        const response = await upload(ids.aberta, tokens.professor, { id_modulo: ids.modulo });
        expect(response.status).toBe(201);
        const idConteudo = response.body.conteudo.id_conteudo;
        const [rows] = await pool.query(
            `SELECT c.id_arquivo_material, c.url, a.storage_name, a.original_name,
                    a.mime_type, a.size_bytes, a.sha256, a.id_usuario_upload
             FROM Conteudos c INNER JOIN ArquivosMateriais a
               ON a.id_arquivo_material = c.id_arquivo_material
             WHERE c.id_conteudo = ?`,
            [idConteudo]
        );
        expect(rows[0].storage_name).toMatch(/^[0-9a-f-]{36}\.pdf$/);
        expect(rows[0]).toMatchObject({
            url: null,
            original_name: 'guia ação.pdf',
            mime_type: 'application/pdf',
            size_bytes: pdf.length,
            sha256: crypto.createHash('sha256').update(pdf).digest('hex'),
            id_usuario_upload: users.professor.id_usuario
        });
        expect(fs.readFileSync(path.join(storageDir, rows[0].storage_name))).toEqual(pdf);

        expect((await request(app).get(`/api/conteudos/${idConteudo}/material`)).status).toBe(401);
        const aluno = await request(app).get(`/api/conteudos/${idConteudo}/material`).set(como(tokens.aluno));
        expect(aluno.status).toBe(200);
        expect(aluno.headers['content-type']).toMatch(/^application\/pdf/);
        expect(aluno.headers['content-disposition']).toContain("filename*=UTF-8''guia%20a%C3%A7%C3%A3o.pdf");
        expect(aluno.headers['cache-control']).toBe('private, no-store');
        expect((await request(app).get(`/api/conteudos/${idConteudo}/material`).set(como(tokens.outro))).status).toBe(403);
        expect((await request(app).get('/assets/materiais/qualquer.pdf').set(como(tokens.aluno))).status).toBe(404);
    });

    it('autoriza ADMIN e turma FECHADA, mas bloqueia aluno, professor alheio e ENCERRADA antes do upload', async () => {
        expect((await upload(ids.fechada, tokens.professor)).status).toBe(201);
        expect((await upload(ids.alheia, tokens.admin)).status).toBe(201);
        const quantidade = fs.readdirSync(storageDir).length;
        expect((await upload(ids.aberta, tokens.aluno, { ordem: 7 })).status).toBe(403);
        expect((await upload(ids.aberta, tokens.outro, { ordem: 8 })).status).toBe(403);
        expect((await upload(ids.encerrada, tokens.professor, { ordem: 9 })).status).toBe(409);
        expect(fs.readdirSync(storageDir)).toHaveLength(quantidade);
    });

    it('rejeita ausência, vazio, extensão, MIME, assinatura, tamanho e múltiplos arquivos sem resíduos', async () => {
        expect((await upload(ids.aberta, tokens.professor, { semArquivo: true })).status).toBe(400);
        expect((await upload(ids.aberta, tokens.professor, { buffer: Buffer.alloc(0) })).status).toBe(422);
        expect((await upload(ids.aberta, tokens.professor, { filename: 'malware.exe' })).status).toBe(422);
        expect((await upload(ids.aberta, tokens.professor, { mime: 'text/plain' })).status).toBe(422);
        expect((await upload(ids.aberta, tokens.professor, { buffer: Buffer.from('not a pdf') })).status).toBe(422);
        expect((await upload(ids.aberta, tokens.professor, { buffer: Buffer.from('%PDF-1.4\n%%EOF') })).status).toBe(422);
        expect((await upload(ids.aberta, tokens.professor, { buffer: pdf.subarray(0, pdf.length - 16) })).status).toBe(422);
        const badXref = Buffer.from(pdf.toString('latin1').replace(
            /startxref\s+\d+\s+%%EOF/, 'startxref\n0\n%%EOF'
        ), 'latin1');
        expect((await upload(ids.aberta, tokens.professor, { buffer: badXref })).status).toBe(422);
        const criptografado = await upload(ids.aberta, tokens.professor, { buffer: encryptedPdf });
        expect(criptografado.status).toBe(422);
        expect(criptografado.body.mensagem).toMatch(/protegido por senha/);
        expect((await upload(ids.aberta, tokens.professor, {
            buffer: Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(1024 * 1024)])
        })).status).toBe(413);
        const multiplo = await request(app)
            .post(`/api/turmas/${ids.aberta}/conteudos/pdf`)
            .set(como(tokens.professor))
            .field('titulo', 'Dois arquivos').field('ordem', '9')
            .attach('arquivo', pdf, { filename: 'um.pdf', contentType: 'application/pdf' })
            .attach('arquivo', pdf, { filename: 'dois.pdf', contentType: 'application/pdf' });
        expect(multiplo.status).toBe(400);
        expect(fs.readdirSync(storageDir)).toHaveLength(0);
        const [assets] = await pool.query('SELECT id_arquivo_material FROM ArquivosMateriais');
        expect(assets).toHaveLength(0);
    });

    it('substitui de forma imutável, replica compartilhando o ativo e não apaga arquivos ao remover conteúdo', async () => {
        const original = await upload(ids.aberta, tokens.professor, { id_modulo: ids.modulo });
        const idOriginal = original.body.conteudo.id_conteudo;
        const [antes] = await pool.query(
            'SELECT id_arquivo_material FROM Conteudos WHERE id_conteudo = ?', [idOriginal]
        );
        const nomeAntigo = fs.readdirSync(storageDir)[0];
        const novoPdf = pdf;
        const substituido = await request(app)
            .put(`/api/conteudos/${idOriginal}/pdf`).set(como(tokens.professor))
            .field('titulo', 'Guia atualizado').field('ordem', '1')
            .attach('arquivo', novoPdf, { filename: 'novo.pdf', contentType: 'application/pdf' });
        expect(substituido.status).toBe(200);
        const [depois] = await pool.query(
            'SELECT id_arquivo_material FROM Conteudos WHERE id_conteudo = ?', [idOriginal]
        );
        expect(depois[0].id_arquivo_material).not.toBe(antes[0].id_arquivo_material);
        expect(fs.existsSync(path.join(storageDir, nomeAntigo))).toBe(true);

        const replicada = await turmaReplication.replicarTurma(ids.aberta, {
            nome_turma: 'PDF replicada', id_professor: users.professor.id_usuario,
            data_inicio: '2026-10-01', data_fim: null, status: 'ABERTA'
        }, { id_usuario_admin: users.admin.id_usuario, chave_idempotencia: crypto.randomUUID() });
        const [clones] = await pool.query(
            'SELECT id_conteudo, id_arquivo_material FROM Conteudos WHERE id_turma = ?',
            [replicada.turma.id_turma]
        );
        expect(clones[0].id_conteudo).not.toBe(idOriginal);
        expect(clones[0].id_arquivo_material).toBe(depois[0].id_arquivo_material);

        await request(app).put(`/api/conteudos/${clones[0].id_conteudo}/pdf`).set(como(tokens.admin))
            .field('titulo', 'Clone alterado').field('ordem', '1')
            .attach('arquivo', pdf, { filename: 'clone.pdf', contentType: 'application/pdf' })
            .expect(200);
        const [isolados] = await pool.query(
            'SELECT id_conteudo, id_arquivo_material FROM Conteudos WHERE id_conteudo IN (?, ?) ORDER BY id_conteudo',
            [idOriginal, clones[0].id_conteudo]
        );
        expect(new Set(isolados.map((item) => item.id_arquivo_material)).size).toBe(2);
        const arquivosAntesDelete = fs.readdirSync(storageDir).sort();
        await request(app).delete(`/api/conteudos/${clones[0].id_conteudo}`).set(como(tokens.admin)).expect(200);
        expect(fs.readdirSync(storageDir).sort()).toEqual(arquivosAntesDelete);
    });

    it('substituição inválida preserva arquivo e vínculo anteriores', async () => {
        const original = await upload(ids.aberta, tokens.professor);
        expect(original.status).toBe(201);
        const id = original.body.conteudo.id_conteudo;
        const [[antes]] = await pool.query(
            'SELECT id_arquivo_material FROM Conteudos WHERE id_conteudo = ?', [id]
        );
        const arquivosAntes = fs.readdirSync(storageDir).sort();
        const recusado = await request(app)
            .put(`/api/conteudos/${id}/pdf`).set(como(tokens.professor))
            .field('titulo', 'Tentativa inválida').field('ordem', '1')
            .attach('arquivo', Buffer.from('%PDF-1.4\n%%EOF'), {
                filename: 'novo.pdf', contentType: 'application/pdf'
            });
        expect(recusado.status).toBe(422);
        const [[depois]] = await pool.query(
            'SELECT id_arquivo_material FROM Conteudos WHERE id_conteudo = ?', [id]
        );
        expect(depois).toEqual(antes);
        expect(fs.readdirSync(storageDir).sort()).toEqual(arquivosAntes);
        expect(fs.readFileSync(path.join(storageDir, arquivosAntes[0]))).toEqual(pdf);
    });

    it('remove o arquivo final quando a transação do conteúdo falha', async () => {
        expect((await upload(ids.aberta, tokens.professor, { ordem: 3 })).status).toBe(201);
        const arquivosAntes = fs.readdirSync(storageDir).sort();
        const duplicado = await upload(ids.aberta, tokens.professor, { ordem: 3, titulo: 'Ordem duplicada' });
        expect(duplicado.status).toBe(409);
        expect(fs.readdirSync(storageDir).sort()).toEqual(arquivosAntes);
        const [assets] = await pool.query('SELECT id_arquivo_material FROM ArquivosMateriais');
        expect(assets).toHaveLength(1);
    });
    it('Goal 07: material ausente responde 503 controlado sem apagar metadata', async () => {
        const response = await upload(ids.aberta, tokens.professor);
        expect(response.status).toBe(201);
        const id = response.body.conteudo.id_conteudo;
        const [[before]] = await pool.query('SELECT a.* FROM ArquivosMateriais a JOIN Conteudos c ON c.id_arquivo_material = a.id_arquivo_material WHERE c.id_conteudo = ?', [id]);
        fs.unlinkSync(path.join(storageDir, before.storage_name));
        const download = await request(app).get(`/api/conteudos/${id}/material`).set(como(tokens.aluno));
        expect(download.status).toBe(503); expect(download.body.code).toBe('ARQUIVO_INDISPONIVEL');
        expect(JSON.stringify(download.body)).not.toMatch(/ENOENT|stack|\/tmp/);
        const [[after]] = await pool.query('SELECT * FROM ArquivosMateriais WHERE id_arquivo_material = ?', [before.id_arquivo_material]);
        expect(after).toEqual(before);
    });

});
