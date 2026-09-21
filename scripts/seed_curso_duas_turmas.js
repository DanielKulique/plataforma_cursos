const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const { loadEnvironment } = require('../src/config/loadEnvironment');
loadEnvironment('development', path.join(__dirname, '..'));
const { assertDevelopmentDatabase } = require('./test_database_safety');
const { openVerifiedConnection, printDatabaseTarget } = require('./lib/database-operations');
assertDevelopmentDatabase(process.env);
const TEST_ACCOUNT_PASSWORD = process.env.CANONICAL_SEED_PASSWORD;
if (!TEST_ACCOUNT_PASSWORD || String(TEST_ACCOUNT_PASSWORD).length < 8) {
    throw new Error('Defina CANONICAL_SEED_PASSWORD com ao menos 8 caracteres antes de executar este script.');
}

async function run() {
  const conn = await openVerifiedConnection({
    createConnection: mysql.createConnection,
    additions: { database: process.env.DB_NAME }
  });
  printDatabaseTarget();

  try {
    const [professores] = await conn.query(
      "SELECT id_usuario, nome_completo FROM Usuarios WHERE tipo = 'PROFESSOR' ORDER BY id_usuario LIMIT 1"
    );

    let professor = professores[0];

    if (!professor) {
      const sufixo = Date.now();
      const cpf = String(10000000000 + (sufixo % 89999999999)).slice(0, 11);
      const email = `prof.seed.${sufixo}@example.com`;
      const senhaHash = await bcrypt.hash(TEST_ACCOUNT_PASSWORD, 10);

      const [profResult] = await conn.query(
        'INSERT INTO Usuarios (nome_completo, cpf, email, senha, telefone, tipo) VALUES (?, ?, ?, ?, ?, ?)',
        ['Professor Seed', cpf, email, senhaHash, '11999999999', 'PROFESSOR']
      );

      professor = {
        id_usuario: profResult.insertId,
        nome_completo: 'Professor Seed',
        email,
      };
    }

    const [cursoResult] = await conn.query(
      'INSERT INTO Cursos (nome_curso, descricao, carga_horaria) VALUES (?, ?, ?)',
      [
        'HTML e CSS para Catálogo de Cursos',
        'Curso prático focado em estruturação HTML e estilização moderna com CSS.',
        24,
      ]
    );

    const idCurso = cursoResult.insertId;

    const [turmaAberta] = await conn.query(
      'INSERT INTO Turmas (id_curso, id_professor, nome_turma, data_inicio, data_fim, status) VALUES (?, ?, ?, ?, ?, ?)',
      [idCurso, professor.id_usuario, 'Turma A - Aberta', '2026-02-15', '2026-03-15', 'ABERTA']
    );

    const [turmaEncerrada] = await conn.query(
      'INSERT INTO Turmas (id_curso, id_professor, nome_turma, data_inicio, data_fim, status) VALUES (?, ?, ?, ?, ?, ?)',
      [idCurso, professor.id_usuario, 'Turma B - Encerrada', '2025-11-01', '2025-12-01', 'ENCERRADA']
    );

    console.log(
      JSON.stringify(
        {
          professor_utilizado: professor,
          curso_criado: { id_curso: idCurso, nome_curso: 'HTML e CSS para Catálogo de Cursos' },
          turmas_criadas: [
            { id_turma: turmaAberta.insertId, nome_turma: 'Turma A - Aberta', status: 'ABERTA' },
            { id_turma: turmaEncerrada.insertId, nome_turma: 'Turma B - Encerrada', status: 'ENCERRADA' },
          ],
        },
        null,
        2
      )
    );
  } finally {
    await conn.end();
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
