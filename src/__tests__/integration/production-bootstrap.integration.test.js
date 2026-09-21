'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { initTestPool, clearDatabase, seedBasicData, closeTestPool } = require('./setup');
const { applyBootstrap } = require('../../../scripts/production_bootstrap');
const manifest = structuredClone(require('../../../production-content/manifest.json'));
const materials = new Map();
let storageDir;
let oldStorageDir;
let pool;
const config = { hours: 6, teacherEmail: 'professor@teste.com', startDate: '2026-09-19', endDate: null };

beforeAll(async () => {
    pool = await initTestPool();
    oldStorageDir = process.env.MATERIAL_STORAGE_DIR;
    storageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'production-bootstrap-test-'));
    process.env.MATERIAL_STORAGE_DIR = storageDir;
    manifest.adminEmail = 'admin@teste.com';
    const buffer = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'valid-material.pdf'));
    const sha256 = require('crypto').createHash('sha256').update(buffer).digest('hex');
    for (const item of manifest.lessons.flatMap((l) => l.contents)) {
        if (item.type === 'PDF') materials.set(item.order, { status: 'AVAILABLE', buffer, sha256 });
        if (item.type === 'XLSX') materials.set(item.order, { status: 'UNSUPPORTED_PRIVATE_XLSX' });
    }
});
beforeEach(async () => { await clearDatabase(); await seedBasicData(); });
afterAll(async () => {
    if (oldStorageDir === undefined) delete process.env.MATERIAL_STORAGE_DIR;
    else process.env.MATERIAL_STORAGE_DIR = oldStorageDir;
    if (storageDir) fs.rmSync(storageDir, { recursive: true, force: true });
    await closeTestPool();
    await require('../../config/database').end();
});
const apply = () => applyBootstrap({ manifest, config, materials, env: { ...process.env, ALLOW_PRODUCTION_CONTENT_BOOTSTRAP: 'I_UNDERSTAND' } });

test('importa PDF privado, preserva rascunhos e repete sem duplicar dados/storage', async () => {
    const first = await apply();
    const files = fs.readdirSync(storageDir);
    const second = await apply();
    expect(second.classId).toBe(first.classId);
    expect(fs.readdirSync(storageDir)).toEqual(files);
    const [[counts]] = await pool.query(`SELECT
      (SELECT COUNT(*) FROM Modulos) AS lessons,
      (SELECT COUNT(*) FROM Conteudos) AS contents,
      (SELECT COUNT(*) FROM ArquivosMateriais) AS pdfs,
      (SELECT COUNT(*) FROM Q_Perguntas) AS questions,
      (SELECT COUNT(*) FROM Questionarios WHERE ativo = 1) AS active`);
    expect(counts).toEqual({ lessons: 9, contents: 23, pdfs: 11, questions: 11, active: 0 });
    const [[group]] = await pool.query('SELECT status FROM Turmas WHERE id_turma = ?', [first.classId]);
    expect(group.status).toBe('FECHADA');
    const [quizzes] = await pool.query('SELECT tipo, prova_final FROM Questionarios ORDER BY ordem');
    expect(quizzes).toEqual([{ tipo: 'EXERCICIO', prova_final: null }, { tipo: 'PROVA', prova_final: 1 }]);
}, 30000);

test('recusa divergência existente e reverte a transação', async () => {
    const first = await apply();
    await pool.query("UPDATE Modulos SET titulo = 'Edição manual' WHERE id_turma = ? AND ordem = 2", [first.classId]);
    await expect(apply()).rejects.toThrow('Conflito em aula 2');
    const [[count]] = await pool.query('SELECT COUNT(*) AS total FROM Modulos');
    expect(count.total).toBe(9);
}, 30000);

test('recusa criação sem professor real sem deixar curso parcial', async () => {
    await expect(applyBootstrap({ manifest, config: { ...config, teacherEmail: 'ausente@example.test' }, materials: new Map(), env: { ...process.env, ALLOW_PRODUCTION_CONTENT_BOOTSTRAP: 'I_UNDERSTAND' } })).rejects.toThrow('Professor responsável');
    const [[count]] = await pool.query('SELECT COUNT(*) AS total FROM Cursos');
    expect(count.total).toBe(0);
});
