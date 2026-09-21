const fs = require('fs');
const storageDir = fs.mkdtempSync(require('path').join(require('os').tmpdir(), 'goal07-atomic-'));
process.env.MATERIAL_STORAGE_DIR = storageDir;
const { initTestPool, clearDatabase, seedBasicData, closeTestPool } = require('./setup');
const db = require('../../config/database');
const conteudos = require('../../api/models/conteudos.models');
const questoes = require('../../api/models/questoes.models');
const turmas = require('../../api/models/turmas.models');
let pool, ids, professor, outro, admin, aluno;
const texto = (ordem = 10) => ({ titulo: 'Autoria atômica', tipo: 'TEXTO', corpo: 'Texto', ordem });
const pergunta = (ordem = 10) => ({ texto_pergunta: 'Pergunta nova?', ordem, pontos: 1,
    opcoes: [{ texto_opcao: 'Sim', ordem: 1, correta: true }, { texto_opcao: 'Não', ordem: 2, correta: false }] });
const arquivo = () => ({ storage_name: `${require('crypto').randomUUID()}.pdf`, original_name: 'material.pdf',
    mime_type: 'application/pdf', size_bytes: 100, sha256: 'a'.repeat(64), buffer: Buffer.from('%PDF-atomic') });

beforeAll(async () => { pool = await initTestPool(); });
beforeEach(async () => {
    await clearDatabase();
    const users = await seedBasicData();
    professor = users.professor; admin = users.admin; aluno = users.aluno;
    const [b] = await pool.query(`INSERT INTO Usuarios (nome_completo, cpf, email, senha, tipo)
        SELECT 'Professor B', '44444444444', 'b@teste.com', senha, 'PROFESSOR' FROM Usuarios WHERE id_usuario = ?`, [professor.id_usuario]);
    outro = { id_usuario: b.insertId, tipo: 'PROFESSOR' };
    const [curso] = await pool.query("INSERT INTO Cursos (nome_curso, carga_horaria) VALUES ('Atomicidade', 20)");
    const [cursoB] = await pool.query("INSERT INTO Cursos (nome_curso, carga_horaria) VALUES ('Outro curso', 20)");
    const criarTurma = async (nome) => (await pool.query(`INSERT INTO Turmas (id_curso,id_professor,nome_turma,data_inicio,status)
        VALUES (?, ?, ?, '2026-09-01', 'FECHADA')`, [curso.insertId, professor.id_usuario, nome]))[0].insertId;
    ids = { curso: curso.insertId, cursoB: cursoB.insertId, turma: await criarTurma('Turma A'), outraTurma: await criarTurma('Turma B') };
    ids.modulo = (await conteudos.criarModulo(ids.turma, { titulo: 'Aula', ordem: 1 }, professor)).id_modulo;
    ids.conteudo = (await conteudos.criar(ids.turma, texto(1), professor)).id_conteudo;
    ids.questionario = (await questoes.criarQuestionario(ids.turma, { titulo: 'Exercício', tipo: 'EXERCICIO' }, professor)).id_questionario;
    ids.pergunta = (await questoes.criarPergunta(ids.questionario, pergunta(1), professor)).id_pergunta;
    const [[opcao]] = await pool.query('SELECT id_opcao FROM Q_Opcoes WHERE id_pergunta = ? AND correta = 0', [ids.pergunta]);
    ids.opcao = opcao.id_opcao;
});
afterEach(() => jest.restoreAllMocks());
afterAll(async () => { await closeTestPool(); await db.end(); fs.rmSync(storageDir, { recursive: true, force: true }); });

function sinal() { let resolver; const promise = new Promise(resolve => { resolver = resolve; }); return { promise, resolver }; }

// Instrumentação só de teste: executa SQL real e pausa a primeira conexão APÓS
// adquirir o lock da turma. A segunda precisa aparecer como LOCK WAIT no MySQL.
async function disputar(primeira, segunda, verificarSegunda) {
    const adquirido = sinal(), liberar = sinal();
    const original = db.getConnection.bind(db);
    let primeiraFinalizada = false;
    jest.spyOn(db, 'getConnection').mockImplementationOnce(async () => {
        const c = await original();
        const query = c.query.bind(c), release = c.release.bind(c);
        c.query = async (sql, params) => {
            const result = await query(sql, params);
            if (/FROM Turmas WHERE id_turma = \? FOR UPDATE/.test(sql)) {
                adquirido.resolver(); await liberar.promise;
            }
            return result;
        };
        c.release = () => { c.query = query; c.release = release; release(); };
        return c;
    });
    const a = primeira().then(value => { primeiraFinalizada = true; return { value }; }, error => ({ error }));
    let b;
    try {
        await Promise.race([adquirido.promise, a.then(result => { throw result.error || new Error('Primeira operação não adquiriu lock.'); })]);
        b = segunda().then(value => ({ value }), error => ({ error }));
        const limite = Date.now() + 5000;
        let aguardando = false;
        while (Date.now() < limite) {
            const [[row]] = await pool.query("SELECT COUNT(*) AS total FROM performance_schema.data_lock_waits");
            if (Number(row.total)) { aguardando = true; break; }
            await new Promise(resolve => setImmediate(resolve));
        }
        expect(aguardando).toBe(true);
        expect(primeiraFinalizada).toBe(false);
    } finally { liberar.resolver(); }
    const [resultadoA, resultadoB] = await Promise.all([a, b]);
    if (resultadoA.error) throw resultadoA.error;
    await verificarSegunda(resultadoB);
    return resultadoA.value;
}

const operacoes = [
    ['criar módulo', () => conteudos.criarModulo(ids.turma, { titulo: 'Nova aula', ordem: 2 }, professor)],
    ['editar/reordenar módulo', () => conteudos.atualizarModulo(ids.modulo, { ordem: 2 }, professor)],
    ['excluir módulo', () => conteudos.removerModulo(ids.modulo, professor)],
    ['criar conteúdo', () => conteudos.criar(ids.turma, texto(), professor)],
    ['editar/reordenar/vincular conteúdo', () => conteudos.atualizar(ids.conteudo, { ordem: 2, id_modulo: ids.modulo }, professor)],
    ['excluir conteúdo', () => conteudos.remover(ids.conteudo, professor)],
    ['upload PDF', () => conteudos.criarPdfComArquivo(ids.turma, texto(), arquivo(), professor)],
    ['substituir PDF', () => conteudos.substituirPdfComArquivo(ids.conteudo, {}, arquivo(), professor)],
    ['criar questionário', () => questoes.criarQuestionario(ids.turma, { titulo: 'Prova final', tipo: 'PROVA', prova_final: true }, professor)],
    ['editar/reordenar/mover questionário', () => questoes.atualizarQuestionario(ids.questionario, { ordem: 2, id_modulo: ids.modulo }, professor)],
    ['inativar questionário', () => questoes.atualizarQuestionario(ids.questionario, { ativo: false }, professor)],
    ['excluir questionário', () => questoes.removerQuestionario(ids.questionario, professor)],
    ['criar pergunta', () => questoes.criarPergunta(ids.questionario, pergunta(), professor)],
    ['editar pergunta', () => questoes.atualizarPergunta(ids.pergunta, { pontos: 2 }, professor)],
    ['excluir pergunta', () => questoes.removerPergunta(ids.pergunta, professor)],
    ['criar opção', () => questoes.criarOpcao(ids.pergunta, { texto_opcao: 'Talvez', ordem: 3, correta: false }, professor)],
    ['editar opção/gabarito', () => questoes.atualizarOpcao(ids.opcao, { correta: true }, professor)],
    ['excluir opção', () => questoes.removerOpcao(ids.opcao, professor)]
];

test.each(operacoes)('%s revalida ownership e encerramento na escrita', async (_nome, operar) => {
    // O contexto externo foi lido quando o professor era responsável e a turma editável.
    const antigo = await conteudos.buscarTurma(ids.turma);
    expect(antigo.id_professor).toBe(professor.id_usuario);
    await turmas.atualizarTurma(ids.turma, { id_professor: outro.id_usuario });
    await expect(operar()).rejects.toMatchObject({ status: 403 });
    await turmas.atualizarTurma(ids.turma, { id_professor: professor.id_usuario, status: 'ENCERRADA' });
    await expect(operar()).rejects.toMatchObject({ status: 409, code: 'TURMA_ENCERRADA' });
    professor = admin;
    await expect(operar()).rejects.toMatchObject({ status: 409, code: 'TURMA_ENCERRADA' });
});

test.each([1, 2, 3, 4, 5])('troca de professor serializa em ambas as ordens (%s)', async () => {
    await disputar(() => conteudos.criar(ids.turma, texto(10), professor),
        () => turmas.atualizarTurma(ids.turma, { id_professor: outro.id_usuario }),
        async resultado => expect(resultado.error).toBeUndefined());
    await expect(conteudos.criar(ids.turma, texto(11), professor)).rejects.toMatchObject({ status: 403 });
    await conteudos.criar(ids.turma, texto(11), outro);
    await turmas.atualizarTurma(ids.turma, { id_professor: professor.id_usuario });
    await disputar(() => turmas.atualizarTurma(ids.turma, { id_professor: outro.id_usuario }),
        () => conteudos.criar(ids.turma, texto(12), professor),
        async resultado => expect(resultado.error).toMatchObject({ status: 403 }));
    const [[row]] = await pool.query('SELECT COUNT(*) AS total FROM Conteudos WHERE id_turma = ?', [ids.turma]);
    expect(Number(row.total)).toBe(3);
});

test.each([1, 2, 3, 4, 5])('encerramento serializa em ambas as ordens e reabertura libera (%s)', async () => {
    await disputar(() => conteudos.atualizar(ids.conteudo, { titulo: 'Antes do encerramento' }, professor),
        () => turmas.atualizarTurma(ids.turma, { status: 'ENCERRADA' }),
        async resultado => expect(resultado.error).toBeUndefined());
    await turmas.atualizarTurma(ids.turma, { status: 'FECHADA' });
    await disputar(() => turmas.atualizarTurma(ids.turma, { status: 'ENCERRADA' }),
        () => conteudos.atualizar(ids.conteudo, { titulo: 'Proibido' }, professor),
        async resultado => expect(resultado.error).toMatchObject({ status: 409 }));
    const [[row]] = await pool.query('SELECT titulo FROM Conteudos WHERE id_conteudo = ?', [ids.conteudo]);
    expect(row.titulo).toBe('Antes do encerramento');
    await turmas.atualizarTurma(ids.turma, { status: 'ABERTA' });
    await conteudos.atualizar(ids.conteudo, { titulo: 'Reaberta' }, professor);
});

test.each(['professor', 'status'])('delete concorrente perde para mudança de %s', async campo => {
    await disputar(() => turmas.atualizarTurma(ids.turma, campo === 'professor' ? { id_professor: outro.id_usuario } : { status: 'ENCERRADA' }),
        () => conteudos.remover(ids.conteudo, professor),
        async resultado => expect(resultado.error).toMatchObject({ status: campo === 'professor' ? 403 : 409 }));
    const [[row]] = await pool.query('SELECT id_conteudo FROM Conteudos WHERE id_conteudo = ?', [ids.conteudo]);
    expect(row).toBeDefined();
});

async function submeter() {
    const [[opcao]] = await pool.query('SELECT id_opcao FROM Q_Opcoes WHERE id_pergunta = ? AND correta = 1', [ids.pergunta]);
    return questoes.submeter(ids.questionario, aluno.id_usuario, [{ id_pergunta: ids.pergunta, id_opcao: opcao.id_opcao }], require('crypto').randomUUID());
}

test('primeira tentativa vence nova pergunta e congela toda a avaliação', async () => {
    await pool.query('INSERT INTO Matriculas (id_aluno,id_turma) VALUES (?,?)', [aluno.id_usuario, ids.turma]);
    await disputar(submeter, () => questoes.criarPergunta(ids.questionario, pergunta(), professor),
        async resultado => expect(resultado.error).toMatchObject({ status: 409, code: 'QUESTIONARIO_COM_HISTORICO' }));
    for (const [,operar] of operacoes.filter(([nome]) => /pergunta|opção|questionário/.test(nome) && !['criar questionário','inativar questionário','editar/reordenar/mover questionário'].includes(nome))) {
        await expect(operar()).rejects.toMatchObject({ status: 409 });
    }
    await questoes.atualizarQuestionario(ids.questionario, { ativo: false }, professor);
    const [[row]] = await pool.query('SELECT COUNT(*) AS total FROM Q_Perguntas WHERE id_questionario = ?', [ids.questionario]);
    expect(Number(row.total)).toBe(1);
});

test('nova pergunta vence primeira tentativa; payload antigo é recusado', async () => {
    await pool.query('INSERT INTO Matriculas (id_aluno,id_turma) VALUES (?,?)', [aluno.id_usuario, ids.turma]);
    await disputar(() => questoes.criarPergunta(ids.questionario, pergunta(), professor), submeter,
        async resultado => expect(resultado.error).toMatchObject({ status: 400, code: 'RESPOSTAS_INCOMPLETAS' }));
});

test('curso vs primeira estrutura permanece coerente em ambas as ordens', async () => {
    await disputar(() => turmas.atualizarTurma(ids.outraTurma, { id_curso: ids.cursoB }),
        () => questoes.criarQuestionario(ids.outraTurma, { titulo: 'Após curso', tipo: 'EXERCICIO' }, professor),
        async resultado => expect(resultado.error).toBeUndefined());
    const [[row]] = await pool.query('SELECT id_curso FROM Questionarios WHERE id_turma = ?', [ids.outraTurma]);
    expect(row.id_curso).toBe(ids.cursoB);
    await pool.query('DELETE FROM Questionarios WHERE id_turma = ?', [ids.outraTurma]);
    await disputar(() => conteudos.criarModulo(ids.outraTurma, { titulo: 'Primeira aula', ordem: 1 }, professor),
        () => turmas.atualizarTurma(ids.outraTurma, { id_curso: ids.curso }),
        async resultado => expect(resultado.error).toMatchObject({ status: 409, code: 'TURMA_COM_ESTRUTURA' }));
});

test('IDs de módulo de outra turma e ordem ocupada continuam em conflito', async () => {
    const modulo = await conteudos.criarModulo(ids.outraTurma, { titulo: 'Alheia', ordem: 1 }, professor);
    await expect(conteudos.atualizar(ids.conteudo, { id_modulo: modulo.id_modulo }, professor)).rejects.toMatchObject({ status: 409 });
    await expect(questoes.atualizarQuestionario(ids.questionario, { id_modulo: modulo.id_modulo }, professor)).rejects.toMatchObject({ status: 409 });
    await expect(conteudos.criar(ids.turma, texto(1), professor)).rejects.toMatchObject({ status: 409 });
    await conteudos.atualizar(ids.conteudo, { id_modulo: ids.modulo }, professor);
    await expect(conteudos.removerModulo(ids.modulo, professor)).rejects.toMatchObject({ status: 409 });
});

test('lock da Turma A não bloqueia autoria na Turma B com mesmo curso/professor', async () => {
    const c = await pool.getConnection();
    try {
        await c.beginTransaction();
        await c.query('SELECT id_turma FROM Turmas WHERE id_turma = ? FOR UPDATE', [ids.turma]);
        // timeout do teste detecta serialização indevida; nenhuma pausa temporal coordena o sucesso.
        await conteudos.criar(ids.outraTurma, texto(), professor);
    } finally { await c.rollback(); c.release(); }
});

test.each(['matricula', 'certificado'])('autoria e %s respeitam turma antes da matrícula', async fluxo => {
    const [m] = await pool.query('INSERT INTO Matriculas (id_aluno,id_turma) VALUES (?,?)', [aluno.id_usuario, ids.turma]);
    await disputar(() => conteudos.criar(ids.turma, texto(), professor), async () => {
        if (fluxo === 'matricula') return require('../../api/models/matricula.models').atualizarMatricula(m.insertId, { nota_final: 7 }, { id_usuario: 1, tipo: 'ADMIN' });
        const c = await db.getConnection();
        try {
            const contexto = await require('../../api/models/certificados.models').buscarContextoEmissao(c, m.insertId);
            await c.commit();
            return contexto;
        } catch (e) { await c.rollback(); throw e; } finally { c.release(); }
    }, async resultado => expect(resultado.error).toBeUndefined());
});

test('nota não usa ownership antigo do middleware após troca de professor', async () => {
    const [m] = await pool.query('INSERT INTO Matriculas (id_aluno,id_turma) VALUES (?,?)', [aluno.id_usuario, ids.turma]);
    await disputar(() => turmas.atualizarTurma(ids.turma, { id_professor: outro.id_usuario }),
        () => require('../../api/models/matricula.models').atualizarMatricula(m.insertId, { nota_final: 7 }, professor),
        async resultado => expect(resultado.error).toMatchObject({ status: 403 }));
    const [[row]] = await pool.query('SELECT nota_final FROM Matriculas WHERE id_matricula = ?', [m.insertId]);
    expect(row.nota_final).toBeNull();
});
