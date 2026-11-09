'use strict';
const assert=require('node:assert/strict');
assert.equal(process.env.NODE_ENV,'test');assert.equal(process.env.E2E_RUN,'1');assert.equal(process.env.DB_NAME,'plataforma_cursos_test');assert.equal(process.env.DB_HOST,'db');
const db=require('./src/config/database');
async function main() {
    if(process.argv[2]==='cleanup') {
        await db.query("DELETE q FROM Questionarios q INNER JOIN Turmas t ON t.id_turma=q.id_turma WHERE t.nome_turma='Goal25 — Laboratório'");
        await db.query("DELETE FROM Turmas WHERE nome_turma='Goal25 — Laboratório'");
        await db.query("DELETE FROM EmailVerificacoes WHERE email IN ('aluno.goal25@example.test','professor.goal25@example.test')");
        await db.query("DELETE FROM Usuarios WHERE email IN ('aluno.goal25@example.test','professor.goal25@example.test')");
        return;
    }
    const [[source]]=await db.query("SELECT senha FROM Usuarios WHERE email='aluno.e2e@example.test'");
    for(const [name,cpf,email,role] of [['Aluno Goal25','77000000001','aluno.goal25@example.test','ALUNO'],['Professor Alheio Goal25','77000000002','professor.goal25@example.test','PROFESSOR']]) {
        await db.query('INSERT INTO Usuarios(nome_completo,cpf,email,senha,tipo) VALUES (?,?,?,?,?)',[name,cpf,email,source.senha,role]);
        await db.query("INSERT INTO EmailVerificacoes(email,codigo,verificado,expira_em) VALUES (?,'000000',1,DATE_ADD(NOW(),INTERVAL 1 DAY))",[email]);
    }
    const [[student]]=await db.query("SELECT id_usuario FROM Usuarios WHERE email='aluno.goal25@example.test'");
    const [[base]]=await db.query('SELECT id_curso,id_professor FROM Turmas WHERE id_turma=1');
    const [turma]=await db.query("INSERT INTO Turmas(id_curso,id_professor,nome_turma,data_inicio) VALUES (?,?,'Goal25 — Laboratório',CURRENT_DATE)",[base.id_curso,base.id_professor]);
    const id=turma.insertId;
    await db.query('INSERT INTO Matriculas(id_aluno,id_turma) VALUES (?,?)',[student.id_usuario,id]);
    const [module]=await db.query("INSERT INTO Modulos(id_turma,titulo,ordem) VALUES (?,'Aula Goal25',1)",[id]);
    for(let n=1;n<=5;n++) {
        const [content]=await db.query("INSERT INTO Conteudos(id_turma,id_modulo,titulo,tipo,corpo,ordem) VALUES (?, ?,?,'TEXTO','Material de laboratório.',?)",[id,module.insertId,`Material Goal25 ${n}`,n]);
        if(n<=4) await db.query("INSERT INTO ConteudosProgresso(id_aluno,id_conteudo,status,concluido_em) VALUES (?,?,'CONCLUIDO',NOW())",[student.id_usuario,content.insertId]);
    }
    const [final]=await db.query("INSERT INTO Questionarios(id_curso,id_turma,titulo,descricao,tipo,prova_final) VALUES (?,?,'Teste Final Goal25','Avaliação de laboratório.','PROVA',1)",[base.id_curso,id]);
    const [exercise]=await db.query("INSERT INTO Questionarios(id_curso,id_turma,titulo,descricao,tipo,id_modulo) VALUES (?,?,'Simulado Goal25','Prática opcional.','EXERCICIO',?)",[base.id_curso,id,module.insertId]);
    for(const qid of [final.insertId,exercise.insertId]) for(let n=1;n<=4;n++) {
        const [question]=await db.query("INSERT INTO Q_Perguntas(id_questionario,texto_pergunta,tipo_pergunta,ordem,pontos) VALUES (?,?,'MULTIPLA_ESCOLHA',?,1)",[qid,`Questão Goal25 ${n}`,n]);
        await db.query('INSERT INTO Q_Opcoes(id_pergunta,texto_opcao,ordem,correta) VALUES (?,?,1,1),(?,?,2,0)',[question.insertId,`Correta ${n}`,question.insertId,`Incorreta ${n}`]);
    }
    const expired=require('jsonwebtoken').sign({id_usuario:student.id_usuario,tipo:'ALUNO',sv:0},process.env.JWT_SECRET,{expiresIn:-60});
    console.log('GOAL25_FIXTURE='+JSON.stringify({id,module:module.insertId,final:final.insertId,exercise:exercise.insertId,expired}));
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>db.end());
