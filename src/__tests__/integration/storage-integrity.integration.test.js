'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { PDFDocument } = require('pdf-lib');
const { initTestPool, clearDatabase, seedBasicData, closeTestPool } = require('./setup');
const db = require('../../config/database');
const model = require('../../api/models/conteudos.models');
const upload = require('../../api/services/material-upload.service');
const storage = require('../../api/services/private-storage.service');
const { reconcile } = require('../../api/services/storage-reconciliation.service');
let pool, users, turma, root, materials, certificates;
const pdf = n => Buffer.from(`%PDF-${n}`);
const future = () => Date.now() + 200 * 86400000;
const prepared = async n => {
    const document = await PDFDocument.create();
    document.addPage().drawText(String(n));
    const buffer = Buffer.from(await document.save());
    return upload.prepararArquivoPdf({ buffer, size: buffer.length, originalname: 'teste.pdf' });
};
const create = async (n = 'A', ordem = 1) => model.criarPdfComArquivo(turma, { titulo: n, ordem }, await prepared(n), users.professor);
const replace = async (id, n) => model.substituirPdfComArquivo(id, {}, await prepared(n), users.professor);
const assets = async () => (await pool.query('SELECT * FROM ArquivosMateriais ORDER BY id_arquivo_material'))[0];
const report = options => reconcile(pool, options);
const target = row => `materials:${row.storage_name}`;

beforeAll(async () => { pool = await initTestPool(); });
beforeEach(async () => {
    await clearDatabase(); users = await seedBasicData();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'integrity-'));
    materials = path.join(root, 'materials'); certificates = path.join(root, 'certificates');
    fs.mkdirSync(materials); fs.mkdirSync(certificates);
    process.env.MATERIAL_STORAGE_DIR = materials; process.env.CERTIFICATE_STORAGE_DIR = certificates;
    const [course] = await pool.query("INSERT INTO Cursos (nome_curso, carga_horaria) VALUES ('Storage fixture', 20)");
    const [t] = await pool.query("INSERT INTO Turmas (id_curso, id_professor, nome_turma, data_inicio, status) VALUES (?, ?, 'Storage fixture', '2026-09-01', 'ABERTA')", [course.insertId, users.professor.id_usuario]);
    turma = t.insertId;
});
afterEach(() => { jest.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
afterAll(async () => { await closeTestPool(); await db.end(); });

function failConnection(method, afterCommit = false) {
    const original = db.getConnection.bind(db);
    jest.spyOn(db, 'getConnection').mockImplementationOnce(async () => {
        const c = await original(); const real = c[method].bind(c), release = c.release.bind(c);
        c[method] = async (...args) => {
            if (method === 'query' && !String(args[0]).includes('INSERT INTO ArquivosMateriais')) return real(...args);
            if (afterCommit) await real(...args);
            throw Object.assign(new Error('injected storage SQL failure'), { code: 'INJECTED' });
        };
        c.release = () => { c[method] = real; c.release = release; release(); };
        return c;
    });
}

it('replacement and delete retain all independent hashes; dry-run never mutates; scoped purge is idempotent', async () => {
    const a = await create(); await replace(a.id_conteudo, 'B');
    let rows = await assets();
    expect(rows.map(r => r.status)).toEqual(['RETIDO', 'ATIVO']);
    expect(rows[0].retido_em).not.toBeNull();
    for (const row of rows) expect((await storage.hashFile(materials, row.storage_name)).sha256).toBe(row.sha256);
    const before = fs.readdirSync(materials).sort();
    const dry = await report(); expect(dry.counts.materials).toEqual({ RETAINED: 1, OK: 1 });
    expect(await assets()).toEqual(rows); expect(fs.readdirSync(materials).sort()).toEqual(before);
    const early = await report({ apply: true, only: rows.map(target) });
    expect(early.entries.every(e => e.action === 'INELIGIBLE')).toBe(true);
    await model.remover(a.id_conteudo, users.professor);
    rows = await assets(); expect(rows.map(r => r.status)).toEqual(['RETIDO', 'RETIDO']);
    expect(fs.readdirSync(materials).sort()).toEqual(before);
    const applied = await report({ apply: true, only: rows.map(target), now: future() });
    expect(applied.entries.map(e => e.action)).toEqual(['PURGED', 'PURGED']);
    expect((await assets()).every(r => r.status === 'PURGADO' && r.purgado_em)).toBe(true);
    expect(fs.readdirSync(materials)).toEqual([]);
    expect((await report({ apply: true, only: rows.map(target), now: future() })).counts.materials).toEqual({ PURGED: 2 });
});

it('two concurrent replacements serialize to exactly one active and two retained PDFs', async () => {
    const a = await create(); await Promise.all([replace(a.id_conteudo, 'B'), replace(a.id_conteudo, 'C')]);
    const rows = await assets(); expect(rows.map(r => r.status)).toEqual(['RETIDO', 'RETIDO', 'ATIVO']);
    expect(new Set(rows.map(r => r.sha256)).size).toBe(3);
    for (const row of rows) expect((await storage.hashFile(materials, row.storage_name)).sha256).toBe(row.sha256);
});

it.each(['query', 'commit'])('%s failure preserves old reference; ambiguous commit leaves an identifiable orphan', async method => {
    const a = await create(); failConnection(method);
    await expect(replace(a.id_conteudo, 'B')).rejects.toMatchObject({ code: 'INJECTED' });
    const rows = await assets(); expect(rows).toHaveLength(1); expect(rows[0].status).toBe('ATIVO');
    const result = await report();
    expect(result.counts.materials.OK).toBe(1);
    expect(result.counts.materials.ORPHAN || 0).toBe(method === 'commit' ? 1 : 0);
});

it('lost COMMIT acknowledgement preserves newly committed bytes and old retained version', async () => {
    const a = await create(); failConnection('commit', true);
    await expect(replace(a.id_conteudo, 'B')).rejects.toMatchObject({ code: 'INJECTED' });
    expect((await report()).counts.materials).toEqual({ RETAINED: 1, OK: 1 });
});

it('SQL rollback plus failed compensation is detected as orphan, then only that aged fixture is removable', async () => {
    const a = await create(); failConnection('query');
    const unlink = fs.promises.unlink.bind(fs.promises);
    jest.spyOn(fs.promises, 'unlink').mockImplementation(file => file.endsWith('.pdf') ? Promise.reject(Object.assign(new Error('denied'), { code: 'EACCES' })) : unlink(file));
    await expect(replace(a.id_conteudo, 'B')).rejects.toThrow();
    jest.restoreAllMocks();
    const orphan = (await report()).entries.find(e => e.classification === 'ORPHAN');
    expect(orphan).toBeDefined();
    const result = await report({ apply: true, only: [`materials:${orphan.name}`], now: future() });
    expect(result.entries.find(e => e.name === orphan.name).action).toBe('REMOVED');
    expect((await report()).counts.materials).toEqual({ OK: 1 });
});

it('publish failure leaves old reference and no temp or new final', async () => {
    const a = await create();
    jest.spyOn(fs.promises, 'link').mockRejectedValueOnce(Object.assign(new Error('move'), { code: 'EXDEV' }));
    await expect(replace(a.id_conteudo, 'B')).rejects.toMatchObject({ code: 'EXDEV' });
    expect((await report()).counts.materials).toEqual({ OK: 1 });
    expect(fs.readdirSync(materials)).toHaveLength(1);
});

it('missing and mismatched bytes preserve all expected metadata and are never purged', async () => {
    await create('A', 1); await create('B', 2);
    const rows = await assets(); fs.unlinkSync(path.join(materials, rows[0].storage_name)); fs.writeFileSync(path.join(materials, rows[1].storage_name), pdf('corrupted'));
    expect((await report({ apply: true, only: rows.map(target), now: future() })).counts.materials).toEqual({ MISSING: 1, HASH_MISMATCH: 1 });
    expect(await assets()).toEqual(rows);
});

it('recent temp is preserved; old temp is removable only when no live publisher holds its lock', async () => {
    const file = await storage.stage(materials, pdf('pending'), 'materials');
    expect((await report()).counts.materials).toEqual({ TEMP_RECENT: 1 });
    const c = await pool.getConnection(); const unlock = await storage.lock(c, 'materials', file.storage_name);
    try {
        const result = await report({ apply: true, only: [`materials:${file.pending}`], now: future() });
        expect(result.entries[0].action).toBe('IN_USE');
    } finally { await unlock(); c.release(); }
    const result = await report({ apply: true, only: [`materials:${file.pending}`], now: future() });
    expect(result.entries[0].action).toBe('REMOVED');
});

it('purge APPLY recusa execução enquanto o backup mantém a trava global', async () => {
    const a = await create();
    await model.remover(a.id_conteudo, users.professor);
    const [row] = await assets();
    const backup = await pool.getConnection();
    try {
        const [[lock]] = await backup.query("SELECT GET_LOCK('plataforma:backup-storage', 0) AS acquired");
        expect(Number(lock.acquired)).toBe(1);
        await expect(report({ apply: true, only: [target(row)], now: future() })).rejects.toMatchObject({ code: 'BACKUP_IN_PROGRESS' });
        expect(fs.existsSync(path.join(materials, row.storage_name))).toBe(true);
    } finally {
        await backup.query("SELECT RELEASE_LOCK('plataforma:backup-storage')");
        backup.release();
    }
});

it('inflight final without committed metadata is protected even beyond grace', async () => {
    const file = await storage.stage(materials, pdf('pending'), 'materials'); await storage.publish(materials, file, 'materials');
    const c = await pool.getConnection(); const unlock = await storage.lock(c, 'materials', file.storage_name);
    try { expect((await report({ apply: true, only: [`materials:${file.storage_name}`], now: future() })).entries[0].action).toBe('IN_USE'); }
    finally { await unlock(); c.release(); }
});

it('reconciles crash after unlink using durable PURGANDO intent without deleting metadata', async () => {
    const a = await create(); await model.remover(a.id_conteudo, users.professor); const [row] = await assets();
    await pool.query("UPDATE ArquivosMateriais SET status = 'PURGANDO' WHERE id_arquivo_material = ?", [row.id_arquivo_material]);
    fs.unlinkSync(path.join(materials, row.storage_name));
    expect((await report()).counts.materials).toEqual({ PURGE_PENDING: 1 });
    expect((await report({ apply: true, only: [target(row)], now: future() })).entries[0].action).toBe('PURGED');
    expect((await assets())[0]).toMatchObject({ status: 'PURGADO', sha256: row.sha256 });
});

it('shared material remains active while another turma still references it', async () => {
    const a = await create(); const [row] = await assets();
    const [other] = await pool.query("INSERT INTO Turmas (id_curso,id_professor,nome_turma,data_inicio,status) SELECT id_curso,id_professor,'Shared storage fixture',data_inicio,status FROM Turmas WHERE id_turma = ?", [turma]);
    await pool.query("INSERT INTO Conteudos (id_turma, titulo, tipo, ordem, id_arquivo_material) VALUES (?, 'Shared fixture', 'PDF', 2, ?)", [other.insertId, row.id_arquivo_material]);
    await model.remover(a.id_conteudo, users.professor);
    expect((await assets())[0].status).toBe('ATIVO');
    expect((await report({ apply: true, only: [target(row)], now: future() })).entries[0].action).toBe('INELIGIBLE');
});

it('path traversal, unknown names, symlinks and shared namespaces are refused without touching outside bytes', async () => {
    const external = path.join(root, 'outside'); fs.writeFileSync(external, pdf('outside'));
    const name = `${crypto.randomUUID()}.pdf`; fs.symlinkSync(external, path.join(materials, name));
    fs.writeFileSync(path.join(materials, 'unexpected-secret-name.txt'), 'do not report raw name');
    const result = await report({ apply: true, only: [`materials:${name}`], now: future() });
    expect(result.counts.materials).toEqual({ UNKNOWN: 1, UNSAFE_PATH: 1 });
    expect(JSON.stringify(result)).not.toContain('unexpected-secret-name');
    expect(fs.readFileSync(external)).toEqual(pdf('outside'));
    await expect(report({ apply: true, only: ['materials:../outside'] })).rejects.toThrow();
    await expect(report({ apply: true })).rejects.toThrow(/only/);
    process.env.CERTIFICATE_STORAGE_DIR = materials;
    await expect(report()).rejects.toThrow(/separados/);
});

it('certificate active, revoked and orphan PDFs are protected; missing and mismatched history keep their hashes', async () => {
    const names = [];
    await pool.query("INSERT INTO Matriculas (id_aluno,id_turma,status_aprovacao) VALUES (?, ?, 'APROVADO')", [users.aluno.id_usuario, turma]);
    let previous = null;
    for (let i = 0; i < 4; i++) {
        const file = await storage.stage(certificates, pdf(`cert-${i}`), 'certificates'); await storage.publish(certificates, file, 'certificates'); names.push(file.storage_name);
        const [inserted] = await pool.query(`INSERT INTO Certificados (id_aluno, id_turma, codigo_publico, aluno_nome, curso_nome, turma_nome, carga_horaria, emitido_em, status, sha256, storage_name, tamanho_bytes, id_usuario_emissor, versao, snapshot_json,
            id_certificado_anterior, motivo_reemissao, reemitido_em, id_usuario_reemissor, revogado_em, id_usuario_revogador, motivo_revogacao)
            VALUES (?, ?, ?, 'Fixture', 'Fixture', 'Fixture', 20, NOW(), ?, ?, ?, ?, ?, ?, '{}', ?, ?, ?, ?, ?, ?, ?)`,
        [users.aluno.id_usuario, turma, `CERT-${crypto.randomBytes(16).toString('hex')}`, i === 0 ? 'ATIVO' : 'REVOGADO', file.sha256, file.storage_name, file.size_bytes, users.admin.id_usuario, i + 1,
            previous, i ? 'Fixture reissue' : null, i ? new Date() : null, i ? users.admin.id_usuario : null, i ? new Date() : null, i ? users.admin.id_usuario : null, i ? 'Fixture revocation' : null]);
        previous = inserted.insertId;
    }
    const [before] = await pool.query('SELECT * FROM Certificados');
    fs.unlinkSync(path.join(certificates, names[2])); fs.writeFileSync(path.join(certificates, names[3]), pdf('corrupt'));
    const orphan = await storage.stage(certificates, pdf('orphan'), 'certificates'); await storage.publish(certificates, orphan, 'certificates'); names.push(orphan.storage_name);
    const result = await report({ apply: true, only: names.map(n => `certificates:${n}`), now: future() });
    expect(result.counts.certificates).toEqual({ OK: 1, CERTIFICATE_HISTORICAL: 1, MISSING: 1, HASH_MISMATCH: 1, ORPHAN: 1 });
    expect(result.entries.every(e => e.action === 'PROTECTED')).toBe(true);
    expect((await pool.query('SELECT * FROM Certificados'))[0]).toEqual(before);
    const certService = require('../../api/services/certificate.service');
    expect((await certService.validarArquivo(pdf('cert-2'))).resultado).toBe('REVOGADO');
});

it('crash between link and unlink is recovered by removing only matching aged pending, then reconciling final', async () => {
    const file = await storage.stage(materials, pdf('partial-publication'), 'materials');
    fs.linkSync(path.join(materials, file.pending), path.join(materials, file.storage_name));
    const first = await report({ now: future() });
    expect(first.counts.materials).toEqual({ TEMP_STALE: 1, UNSAFE_PATH: 1 });
    const applied = await report({ apply: true, only: [`materials:${file.pending}`], now: future() });
    expect(applied.entries.find(e => e.name === file.pending).action).toBe('REMOVED');
    expect(fs.existsSync(path.join(materials, file.storage_name))).toBe(true);
    expect((await report()).counts.materials).toEqual({ ORPHAN: 1 });
});

it('unlink failure leaves durable purge intent; retry finishes with preserved audit row', async () => {
    const a = await create(); await model.remover(a.id_conteudo, users.professor); const [row] = await assets();
    jest.spyOn(fs.promises, 'unlink').mockRejectedValueOnce(Object.assign(new Error('disk denied'), { code: 'EACCES' }));
    const first = await report({ apply: true, only: [target(row)], now: future() });
    expect(first.entries[0].action).toBe('FAILED:EACCES');
    expect((await assets())[0].status).toBe('PURGANDO');
    expect(fs.existsSync(path.join(materials, row.storage_name))).toBe(true);
    expect((await report({ apply: true, only: [target(row)], now: future() })).entries[0].action).toBe('PURGED');
});

it.each(['pdf', 'pending'])('explicit apply preserves a recent unreferenced %s inside grace', async extension => {
    const file = await storage.stage(materials, pdf('recent'), 'materials');
    if (extension === 'pdf') await storage.publish(materials, file, 'materials');
    const name = extension === 'pdf' ? file.storage_name : file.pending;
    const result = await report({ apply: true, only: [`materials:${name}`] });
    expect(result.entries.find(e => e.name === name)).toMatchObject({ eligible: false, action: 'INELIGIBLE' });
    expect(fs.existsSync(path.join(materials, name))).toBe(true);
});
