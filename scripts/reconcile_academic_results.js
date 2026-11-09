'use strict';

const db = require('../src/config/database');
const { assertDatabaseConnectionEnvironment } = require('../src/config/database-connection');
const { assertDatabaseIdentity } = require('../src/config/database-identity');
const { bloquearTurma } = require('../src/api/services/academic-access.service');
const { avaliarAprovacao } = require('../src/api/services/academic-progress.service');

function options(argv, env = process.env) {
    if (argv.some(arg => !['--dry-run', '--apply', '--allow-lab-apply'].includes(arg))
        || (argv.includes('--dry-run') && argv.includes('--apply'))) throw new Error('Use --dry-run ou --apply --allow-lab-apply.');
    const apply = argv.includes('--apply');
    const target = assertDatabaseConnectionEnvironment(env);
    if (apply && !(argv.includes('--allow-lab-apply') && env.NODE_ENV === 'test'
        && target.database === 'plataforma_cursos_test'
        && ((target.host === 'db' && target.port === 3306 && env.E2E_RUN === '1')
            || (target.host === '127.0.0.1' && target.port === 33307)))) {
        throw new Error('APPLY permitido somente com autorização explícita em laboratório descartável de teste.');
    }
    return { apply, target };
}

async function candidates(connection = db) {
    const [rows] = await connection.query(`SELECT m.id_matricula, m.id_aluno, m.id_turma,
        m.status_aprovacao AS status_anterior, m.nota_final AS nota_anterior,
        tentativa.id_tentativa, tentativa.percentual,
        IF(tentativa.percentual >= 75, 'APROVADO', 'REPROVADO') AS status_correto,
        EXISTS(SELECT 1 FROM Certificados c WHERE c.id_aluno=m.id_aluno AND c.id_turma=m.id_turma) AS certificado_existente
        FROM Matriculas m INNER JOIN Q_Tentativas tentativa ON tentativa.id_tentativa = (
            SELECT t.id_tentativa FROM Q_Tentativas t
            INNER JOIN Questionarios f ON f.id_questionario=t.id_questionario AND f.id_turma=t.id_turma
            WHERE t.id_usuario=m.id_aluno AND t.id_turma=m.id_turma
                AND f.tipo='PROVA' AND f.prova_final=1 AND t.finalizada_em IS NOT NULL
            ORDER BY t.finalizada_em DESC,t.id_tentativa DESC LIMIT 1)
        WHERE m.status_aprovacao <> 'CANCELADO'
            AND m.status_aprovacao <> IF(tentativa.percentual >= 75,'APROVADO','REPROVADO')
        ORDER BY m.id_turma,m.id_matricula`);
    return rows;
}

async function reconcile(argv = process.argv.slice(2)) {
    const { apply, target } = options(argv);
    const connection = await db.getConnection();
    try {
        await assertDatabaseIdentity(connection, target);
        const items = await candidates(connection);
        const report = { mode: apply ? 'APPLY' : 'DRY_RUN', items, changed: 0, certificatesChanged: 0 };
        if (apply) for (const item of items) {
            await connection.beginTransaction();
            try {
                await bloquearTurma(connection, item.id_turma);
                await connection.query('SELECT id_matricula FROM Matriculas WHERE id_matricula=? FOR UPDATE', [item.id_matricula]);
                const result = await avaliarAprovacao(connection, item.id_aluno, item.id_turma);
                if (result.situacao_atualizada) report.changed++;
                await connection.commit();
            } catch (error) { await connection.rollback(); throw error; }
        }
        return report;
    } finally { connection.release(); }
}

if (require.main === module) {
    reconcile().then(report => console.log(JSON.stringify(report)))
        .catch(error => { console.error(`RECONCILIACAO_RESULTADOS_FALHOU: ${error.message}`); process.exitCode = 1; })
        .finally(() => db.end());
}
module.exports = { options, candidates, reconcile };
