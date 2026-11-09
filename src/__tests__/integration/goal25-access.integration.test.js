'use strict';
const request=require('supertest');
const jwt=require('jsonwebtoken');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {initTestPool,clearDatabase,seedBasicData,closeTestPool,getTestPassword,getSessionToken}=require('./setup');
const {app}=require('../../../index');
const db=require('../../config/database');
const storage=fs.mkdtempSync(path.join(os.tmpdir(),'goal25-access-'));
process.env.CERTIFICATE_STORAGE_DIR=storage;
let pool;
beforeAll(async()=>{pool=await initTestPool();});
afterAll(async()=>{await closeTestPool();await db.end();fs.rmSync(storage,{recursive:true,force:true});});

test('finite seven-profile API matrix enforces private course, PDF, result and certificate boundaries',async()=>{
    await clearDatabase();const users=await seedBasicData();
    const tokens={};
    for(const role of ['aluno','professor','admin']) {
        const response=await request(app).post('/api/auth/login').send({email:`${role}@teste.com`,senha:getTestPassword()});
        expect(response.status).toBe(200);tokens[role]=getSessionToken(response);
    }
    for(const [role,type,cpf] of [['outroAluno','ALUNO','79000000001'],['outroProfessor','PROFESSOR','79000000002']]) {
        const email=`${role.toLowerCase()}@goal25.example.test`;
        await pool.query('INSERT INTO Usuarios (nome_completo,cpf,email,senha,tipo) SELECT ?,?,?,senha,? FROM Usuarios WHERE id_usuario=?',[role,cpf,email,type,users.aluno.id_usuario]);
        await pool.query("INSERT INTO EmailVerificacoes(email,codigo,verificado,expira_em) VALUES (?,'000000',1,DATE_ADD(NOW(),INTERVAL 1 DAY))",[email]);
        const response=await request(app).post('/api/auth/login').send({email,senha:getTestPassword()});expect(response.status).toBe(200);tokens[role]=getSessionToken(response);
    }
    tokens.expirada=jwt.sign({id_usuario:users.aluno.id_usuario,tipo:'ALUNO',sv:0},process.env.JWT_SECRET,{expiresIn:-60});
    const [course]=await pool.query("INSERT INTO Cursos(nome_curso,carga_horaria) VALUES ('Curso Goal25',4)");
    const [turma]=await pool.query("INSERT INTO Turmas(id_curso,id_professor,nome_turma,data_inicio) VALUES (?,?,'Turma Goal25',CURRENT_DATE)",[course.insertId,users.professor.id_usuario]);const id=turma.insertId;
    const [mat]=await pool.query("INSERT INTO Matriculas(id_aluno,id_turma,status_aprovacao) VALUES (?,?,'APROVADO')",[users.aluno.id_usuario,id]);
    const [pdf]=await pool.query("INSERT INTO Conteudos(id_turma,titulo,tipo,url,ordem) VALUES (?,'Privado Goal25','PDF','/assets/materiais/guia-integridade-academica.pdf',1)",[id]);
    const [final]=await pool.query("INSERT INTO Questionarios(id_curso,id_turma,titulo,descricao,tipo,prova_final) VALUES (?,?,'Privado Goal25','Reservado','PROVA',1)",[course.insertId,id]);
    await pool.query('INSERT INTO Q_Tentativas(id_questionario,id_usuario,id_turma,total_perguntas,percentual,finalizada_em,chave_idempotencia) VALUES (?,?,?,4,75,NOW(),UUID())',[final.insertId,users.aluno.id_usuario,id]);
    const cert=await request(app).post(`/api/certificados/matriculas/${mat.insertId}/emitir`).set('Authorization',`Bearer ${tokens.professor}`);expect(cert.status).toBe(201);
    const [[certificate]]=await pool.query('SELECT id_certificado FROM Certificados WHERE id_turma=?',[id]);
    const matrix=[
        [`/api/matriculas/minha-sala`,['aluno','outroAluno']],
        [`/api/turmas/${id}/conteudos`,['aluno','professor','admin']],
        [`/api/conteudos/${pdf.insertId}/material`,['aluno','professor','admin']],
        [`/api/turmas/${id}/questionarios`,['aluno','professor','admin']],
        [`/api/turmas/${id}/questionarios/disponivel?tipo=prova&id_questionario=${final.insertId}`,['aluno']],
        [`/api/questionarios/historico?id_questionario=${final.insertId}`,['aluno','outroAluno']],
        [`/api/turmas/${id}/questionarios/resultados`,['professor','admin']],
        [`/api/certificados/${certificate.id_certificado}/pdf`,['aluno','professor','admin']],
        [`/api/matriculas/turma/${id}`,['professor','admin']],
        [`/api/admin/usuarios`,['admin']]
    ];
    for(const role of ['visitante','aluno','professor','admin','expirada','outroAluno','outroProfessor']) for(const [url,allowed] of matrix) {
        const req=request(app).get(url);if(tokens[role]) req.set('Authorization',`Bearer ${tokens[role]}`);
        const response=await req;const expected=['visitante','expirada'].includes(role)?401:allowed.includes(role)?200:403;
        expect({role,url,status:response.status}).toEqual({role,url,status:expected});
        if(expected!==200||role==='outroAluno') expect(JSON.stringify(response.body)).not.toContain('Privado Goal25');
        if(role==='outroAluno'&&url.includes('historico')) expect(response.body.tentativas).toEqual([]);
    }
    for(const query of ['tipo=invalid','tipo=prova&id_questionario=-1']) expect((await request(app).get(`/api/turmas/${id}/questionarios/disponivel?${query}`).set('Authorization',`Bearer ${tokens.aluno}`)).status).toBe(400);
    expect((await request(app).get(`/api/turmas/99999999/questionarios/disponivel?tipo=prova`).set('Authorization',`Bearer ${tokens.aluno}`)).status).toBe(404);
    expect((await request(app).get(`/api/turmas/${id}/questionarios/disponivel?tipo=prova&id_questionario=99999999`).set('Authorization',`Bearer ${tokens.aluno}`)).status).toBe(404);
});

test('roster status filters and totals apply before pagination, with no duplicate students',async()=>{
    await clearDatabase();const users=await seedBasicData();
    const [course]=await pool.query("INSERT INTO Cursos(nome_curso,carga_horaria) VALUES ('Roster Goal25',4)");
    const [turma]=await pool.query("INSERT INTO Turmas(id_curso,id_professor,nome_turma,data_inicio) VALUES (?,?,'Roster Goal25',CURRENT_DATE)",[course.insertId,users.professor.id_usuario]);const id=turma.insertId;
    const [final]=await pool.query("INSERT INTO Questionarios(id_curso,id_turma,titulo,descricao,tipo,prova_final) VALUES (?,?,'Final','Reservado','PROVA',1)",[course.insertId,id]);
    const [[source]]=await pool.query('SELECT senha FROM Usuarios WHERE id_usuario=?',[users.aluno.id_usuario]);
    for(let i=0;i<28;i++) {
        const [u]=await pool.query('INSERT INTO Usuarios(nome_completo,cpf,email,senha,tipo) VALUES (?,?,?,?,\'ALUNO\')',[`Roster ${i}`,String(78000000000+i),`roster${i}@goal25.example.test`,source.senha]);
        await pool.query('INSERT INTO Matriculas(id_aluno,id_turma) VALUES (?,?)',[u.insertId,id]);
        if(i<2)await pool.query('INSERT INTO Q_Tentativas(id_questionario,id_usuario,id_turma,total_perguntas,percentual,finalizada_em,chave_idempotencia) VALUES (?,?,?,4,?,NOW(),UUID())',[final.insertId,u.insertId,id,i===0?50:75]);
    }
    const login=await request(app).post('/api/auth/login').send({email:'admin@teste.com',senha:getTestPassword()});const token=getSessionToken(login);
    const get=query=>request(app).get(`/api/matriculas/turma/${id}?${query}`).set('Authorization',`Bearer ${token}`);
    const one=await get('limit=25');expect(one.status).toBe(200);expect(one.body).toMatchObject({total:28,summary:{CURSANDO:26,APROVADO:1,REPROVADO:1}});
    const two=await get('page=2&limit=25');expect(two.body.items).toHaveLength(3);
    expect(new Set([...one.body.items,...two.body.items].map(s=>s.id_matricula)).size).toBe(28);
    const failed=await get('status=REPROVADO&limit=1');expect(failed.body.total).toBe(1);expect(failed.body.items[0]).toMatchObject({status_aprovacao:'REPROVADO',prova_final_percentual:50});
    expect((await get('status=INVALID')).status).toBe(400);
});
