'use strict';

// Read on stdin inside the disposable app container; never shipped as a seed command.
const assert = require('node:assert/strict');
assert.equal(process.env.NODE_ENV, 'test');
assert.equal(process.env.E2E_RUN, '1');
assert.equal(process.env.DB_NAME, 'plataforma_cursos_test');
const db = require('./src/config/database');

async function main() {
    if (process.argv[2] === 'cleanup') {
        await db.query("DELETE FROM Turmas WHERE nome_turma LIKE 'Lab Paginação Turma %'");
        await db.query("DELETE FROM Usuarios WHERE email LIKE '%@pagination.example.test'");
        return;
    }
    const [[admin]] = await db.query("SELECT senha FROM Usuarios WHERE email='admin.e2e@example.test'");
    const [[course]] = await db.query("SELECT id_curso FROM Cursos WHERE nome_curso='Curso E2E'");
    assert.ok(admin && course, 'Requires the isolated E2E seed.');
    const users = Array.from({ length: 120 }, (_, i) => [
        `Lab Paginação Professor ${String(i + 1).padStart(3, '0')}`,
        String(80000000001 + i), `prof${i + 1}@pagination.example.test`, admin.senha, 'PROFESSOR'
    ]);
    await db.query('INSERT INTO Usuarios (nome_completo,cpf,email,senha,tipo) VALUES ?', [users]);
    await db.query("INSERT INTO Usuarios (nome_completo,cpf,email,senha,tipo) VALUES ('Lab Paginação Usuário descartável','80000000999','remove@pagination.example.test',?,'ALUNO')", [admin.senha]);
    const [professors] = await db.query("SELECT id_usuario FROM Usuarios WHERE email LIKE '%@pagination.example.test' ORDER BY nome_completo");
    const classes = Array.from({ length: 122 }, (_, i) => {
        const number = 122 - i;
        return [course.id_curso, professors[(number - 1) % 120].id_usuario,
            `Lab Paginação Turma ${String(number).padStart(3, '0')}`, '2020-01-01', ['ABERTA', 'FECHADA', 'ENCERRADA'][number % 3]];
    });
    await db.query('INSERT INTO Turmas (id_curso,id_professor,nome_turma,data_inicio,status) VALUES ?', [classes]);
    console.log('Pagination lab: 120 professors, one disposable student and 122 classes added.');
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.end());
