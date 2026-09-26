const request = require('supertest');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { initTestPool, clearDatabase, seedBasicData, closeTestPool, getTestPassword, getSessionToken } = require('./setup');
const { app } = require('../../../index');
const db = require('../../config/database');
const { buscarRequisitos } = require('../../api/services/academic-progress.service');
const pdf = require('../../api/services/certificate-pdf.service');
const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'academic-exam-'));
process.env.CERTIFICATE_STORAGE_DIR = storage;
let pool, users, curso, turma, matricula, conteudos, final, exercicio, outro, tokens;
const auth = tipo => ({ Authorization: `Bearer ${tokens[tipo]}` });

async function questionario(tipo, provaFinal = false, ativo = true) {
    const [q] = await pool.query('INSERT INTO Questionarios (id_curso,id_turma,titulo,descricao,tipo,prova_final,ativo) VALUES (?,?,?,?,?,?,?)',
        [curso,turma,crypto.randomUUID(),'Teste',tipo,provaFinal ? 1 : null,ativo]);
    const perguntas = [];
    for (const [i,pontos] of [749.9,0.1,250].entries()) {
        const [p] = await pool.query("INSERT INTO Q_Perguntas (id_questionario,texto_pergunta,tipo_pergunta,ordem,pontos) VALUES (?,?,'MULTIPLA_ESCOLHA',?,?)", [q.insertId,`Pergunta ${i}`,i,pontos]);
        const [c] = await pool.query('INSERT INTO Q_Opcoes (id_pergunta,texto_opcao,ordem,correta) VALUES (?, ?, 1, 1)', [p.insertId,'Certa']);
        const [e] = await pool.query('INSERT INTO Q_Opcoes (id_pergunta,texto_opcao,ordem,correta) VALUES (?, ?, 2, 0)', [p.insertId,'Errada']);
        perguntas.push({id:p.insertId,certa:c.insertId,errada:e.insertId});
    }
    return { id: q.insertId, perguntas };
}
async function tentativa(q, percentual, aluno = users.aluno.id_usuario, finalizada = true) {
    await pool.query('INSERT INTO Q_Tentativas (id_questionario,id_usuario,id_turma,total_perguntas,percentual,chave_idempotencia,finalizada_em) VALUES (?,?,?,3,?,?,?)',
        [q.id,aluno,turma,percentual,crypto.randomUUID(),finalizada ? new Date() : null]);
}
async function concluir(n) {
    for (const c of conteudos.slice(0,n)) await pool.query("INSERT IGNORE INTO ConteudosProgresso (id_aluno,id_conteudo,status) VALUES (?,?,'CONCLUIDO')", [users.aluno.id_usuario,c.id_conteudo]);
}
const requisitos = () => buscarRequisitos(pool, users.aluno.id_usuario, turma);
const status = async () => (await pool.query('SELECT status_aprovacao,nota_final FROM Matriculas WHERE id_matricula = ?', [matricula]))[0][0];
const abrir = () => request(app).get(`/api/turmas/${turma}/questionarios/disponivel?tipo=PROVA&id_questionario=${final.id}`).set(auth('aluno'));
const enviar = (q, acertos, submission_id = crypto.randomUUID()) => request(app).post(`/api/questionarios/${q.id}/submissoes`).set(auth('aluno')).send({submission_id, respostas:q.perguntas.map((p,i)=>({id_pergunta:p.id,id_opcao:i < acertos ? p.certa : p.errada}))});
const emitir = () => request(app).post(`/api/certificados/matriculas/${matricula}/emitir`).set(auth('professor'));

beforeAll(async()=>{ pool=await initTestPool(); });
beforeEach(async()=>{
    await clearDatabase(); users=await seedBasicData(); tokens={};
    for (const tipo of ['aluno','professor','admin']) {
        const r=await request(app).post('/api/auth/login').send({email:`${tipo}@teste.com`,senha:getTestPassword()});
        expect(r.status).toBe(200); tokens[tipo]=getSessionToken(r);
    }
    const [c]=await pool.query("INSERT INTO Cursos (nome_curso,carga_horaria) VALUES ('Curso',10)"); curso=c.insertId;
    const [t]=await pool.query("INSERT INTO Turmas (id_curso,id_professor,nome_turma,data_inicio,status) VALUES (?,?,'Turma',CURRENT_DATE,'ABERTA')",[curso,users.professor.id_usuario]); turma=t.insertId;
    const [m]=await pool.query('INSERT INTO Matriculas (id_aluno,id_turma) VALUES (?,?)',[users.aluno.id_usuario,turma]); matricula=m.insertId;
    await pool.query('INSERT INTO Conteudos (id_turma,titulo,tipo,ordem) VALUES ?', [Array.from({length:8},(_,i)=>[turma,`Conteúdo ${i}`,'TEXTO',i])]);
    [conteudos]=await pool.query('SELECT id_conteudo FROM Conteudos WHERE id_turma=? ORDER BY ordem',[turma]);
    final=await questionario('PROVA',true); exercicio=await questionario('EXERCICIO'); outro=await questionario('EXERCICIO');
});
afterAll(async()=>{ await closeTestPool(); await db.end(); fs.rmSync(storage,{recursive:true,force:true}); });

test.each([[0,false],[7,false],[8,true],[9,true],[10,true]])('%i/10: gate HTTP de leitura e submissão',async(n,liberada)=>{
    await concluir(Math.min(n,8)); if(n>8) await tentativa(exercicio,0); if(n>9) await tentativa(outro,0);
    expect((await requisitos()).prova_liberada).toBe(liberada);
    const r=await abrir(); expect(r.status).toBe(liberada?200:409);
    if(!liberada) { expect(JSON.stringify(r.body)).not.toContain('Pergunta'); expect((await enviar(final,3)).status).toBe(409); }
});
test('progresso >=80% já existente libera a prova sem novo evento de progresso',async()=>{
    await concluir(8);
    const [[matriculaAntes]] = await pool.query(
        'SELECT progresso_percentual FROM Matriculas WHERE id_matricula = ?', [matricula]
    );
    expect(Number(matriculaAntes.progresso_percentual)).toBe(0);
    expect(await requisitos()).toMatchObject({
        total_trilha: 10, trilha_realizada: 8, progresso_para_prova: 80, prova_liberada: true
    });

    const lista = await request(app)
        .get(`/api/turmas/${turma}/questionarios`)
        .set(auth('aluno'));
    expect(lista.status).toBe(200);
    expect(lista.body.questionarios.find(item => Number(item.id_questionario) === final.id))
        .toMatchObject({
            tipo: 'PROVA', prova_final: 1, bloqueada: false,
            requisitos: { progresso_para_prova: 80, prova_liberada: true }
        });

    const disponivel = await abrir();
    expect(disponivel.status).toBe(200);
    expect(disponivel.body.questionario.id_questionario).toBe(final.id);
});
test('exercícios contam uma vez, sem mínimo, apenas ativos/finalizados e do aluno/turma',async()=>{
    await tentativa(exercicio,0); await tentativa(exercicio,30); await tentativa(outro,100,users.admin.id_usuario);
    await tentativa(outro,100,users.aluno.id_usuario,false);
    const inativo=await questionario('EXERCICIO',false,false); await tentativa(inativo,100);
    const intermediaria=await questionario('PROVA'); await tentativa(intermediaria,100);
    await tentativa(final,74.99);
    expect(await requisitos()).toMatchObject({total_exercicios:2,exercicios_realizados:1,total_trilha:10,prova_final_aprovada:false});
    const [t]=await pool.query("INSERT INTO Turmas (id_curso,id_professor,nome_turma,data_inicio) VALUES (?,?,'Outra',CURRENT_DATE)",[curso,users.professor.id_usuario]);
    const [q]=await pool.query("INSERT INTO Questionarios (id_curso,id_turma,titulo,descricao,tipo) VALUES (?,?,'Outro','Outro','EXERCICIO')",[curso,t.insertId]);
    await pool.query('INSERT INTO Q_Tentativas (id_questionario,id_usuario,id_turma,total_perguntas,percentual,finalizada_em,chave_idempotencia) VALUES (?,?,?,1,100,NOW(),UUID())',[q.insertId,users.aluno.id_usuario,t.insertId]);
    expect((await requisitos()).exercicios_realizados).toBe(1);
});
test.each([[0,false],[50,false],[74.99,false],[75,true],[75.01,true],[100,true]])('fronteira persistida da prova %s',async(percentual,aprovada)=>{
    await tentativa(final,percentual); expect((await requisitos()).prova_final_aprovada).toBe(aprovada);
});
test('74.99 real mantém CURSANDO; retry 75 aprova sem nota e tentativa pior não remove conquista',async()=>{
    await concluir(8);
    expect((await status()).status_aprovacao).toBe('CURSANDO');
    const baixa=await enviar(final,1); expect(baixa.status).toBe(200); expect(baixa.body.resultado.percentual).toBe(74.99);
    expect((await status()).status_aprovacao).toBe('CURSANDO');
    const chave=crypto.randomUUID(); const boa=await enviar(final,2,chave); expect(boa.status).toBe(200); expect(boa.body.resultado.percentual).toBe(75);
    expect(await status()).toMatchObject({status_aprovacao:'APROVADO',nota_final:null});
    expect((await enviar(final,2,chave)).body.resultado.reutilizada).toBe(true);
    expect((await enviar(final,0)).body.resultado.percentual).toBe(0);
    expect((await requisitos()).prova_final_aprovada).toBe(true); expect((await status()).status_aprovacao).toBe('APROVADO');
});
test('prova antes dos conteúdos: 6 conteúdos + 2 exercícios libera; último conteúdo aprova automaticamente',async()=>{
    await concluir(6); expect((await enviar(exercicio,0)).status).toBe(200); expect((await enviar(outro,0)).status).toBe(200);
    expect((await enviar(final,2)).status).toBe(200); expect((await status()).status_aprovacao).toBe('CURSANDO');
    for(const c of conteudos.slice(6)) expect((await request(app).put(`/api/conteudos/${c.id_conteudo}/progresso`).set(auth('aluno')).send({status:'CONCLUIDO'})).status).toBe(200);
    expect((await status()).status_aprovacao).toBe('APROVADO');
});
test('intermediária e exercício >=75 não aprovam; professor e ADMIN não contornam prova final',async()=>{
    await concluir(8); const intermediaria=await questionario('PROVA');
    expect((await enviar(intermediaria,3)).status).toBe(200); expect((await enviar(exercicio,3)).status).toBe(200);
    for(const tipo of ['professor','admin']) expect((await request(app).patch(`/api/matriculas/${matricula}`).set(auth(tipo)).send({status_aprovacao:'APROVADO',nota_final:10})).status).toBe(409);
    expect((await status()).status_aprovacao).toBe('CURSANDO');
});
test('submissão revalida trilha alterada após abrir prova',async()=>{
    await concluir(8); expect((await abrir()).status).toBe(200);
    await pool.query("INSERT INTO Conteudos (id_turma,titulo,tipo,ordem) VALUES (?,'Novo','TEXTO',9)",[turma]);
    expect((await enviar(final,3)).status).toBe(409);
    const [[row]]=await pool.query('SELECT COUNT(*) AS n FROM Q_Tentativas'); expect(row.n).toBe(0);
});
test('certificado revalida prova/conteúdo, não gera PDF/linha na falha, emite em ENCERRADA',async()=>{
    const spy=jest.spyOn(pdf,'gerarCertificadoPdf');
    try {
        expect((await emitir()).status).toBe(409);
        await pool.query("UPDATE Matriculas SET status_aprovacao='APROVADO' WHERE id_matricula=?",[matricula]);
        await concluir(8); expect((await emitir()).body.code).toBe('PROVA_FINAL_PENDENTE');
        await tentativa(final,75);
        const [novo]=await pool.query("INSERT INTO Conteudos (id_turma,titulo,tipo,ordem) VALUES (?,'Novo','TEXTO',9)",[turma]);
        expect((await emitir()).body.code).toBe('CONTEUDOS_PENDENTES'); expect(spy).not.toHaveBeenCalled();
        const [[row]]=await pool.query('SELECT COUNT(*) AS n FROM Certificados'); expect(row.n).toBe(0);
        expect(fs.readdirSync(storage)).toHaveLength(0);
        await pool.query("INSERT INTO ConteudosProgresso (id_aluno,id_conteudo,status) VALUES (?,?,'CONCLUIDO')",[users.aluno.id_usuario,novo.insertId]);
        await pool.query("UPDATE Turmas SET status='ENCERRADA' WHERE id_turma=?",[turma]);
        expect((await emitir()).status).toBe(201);
    } finally { spy.mockRestore(); }
});
test('designação estrutural: apenas PROVA, única por turma, sem reclassificar histórico',async()=>{
    await expect(questionario('PROVA',true)).rejects.toMatchObject({code:'ER_DUP_ENTRY'});
    expect((await request(app).patch(`/api/questionarios/${exercicio.id}`).set(auth('professor')).send({prova_final:true})).status).toBe(400);
    await tentativa(final,75);
    expect((await request(app).patch(`/api/questionarios/${final.id}`).set(auth('professor')).send({prova_final:false})).status).toBe(409);
});

test('último conteúdo e prova concorrentes convergem para aprovação idempotente',async()=>{
    await concluir(7); await tentativa(exercicio,0);
    const [prova,conteudo] = await Promise.all([
        enviar(final,2),
        request(app).put(`/api/conteudos/${conteudos[7].id_conteudo}/progresso`).set(auth('aluno')).send({status:'CONCLUIDO'})
    ]);
    expect(prova.status).toBe(200); expect(conteudo.status).toBe(200);
    expect((await status()).status_aprovacao).toBe('APROVADO');
    const [[certificados]]=await pool.query('SELECT COUNT(*) AS n FROM Certificados'); expect(certificados.n).toBe(0);
});
