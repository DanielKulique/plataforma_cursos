#!/usr/bin/env node
'use strict';

const db = require('../src/config/database');
const { bloquearTurma } = require('../src/api/services/academic-access.service');
const { avaliarAprovacao } = require('../src/api/services/academic-progress.service');
const certificateService = require('../src/api/services/certificate.service');

function parseArgs(argv) {
    const args = new Set(argv);
    for (const arg of args) {
        if (!['--apply', '--dry-run', '--backup-good'].includes(arg)) {
            throw new Error(`Opção desconhecida: ${arg}`);
        }
    }
    if (args.has('--apply') && args.has('--dry-run')) {
        throw new Error('Use --apply ou --dry-run, não ambos.');
    }
    return { apply: args.has('--apply'), backupGood: args.has('--backup-good') };
}

async function candidatos() {
    const [rows] = await db.query(
        `SELECT m.id_matricula, m.id_aluno, m.id_turma, m.status_aprovacao,
                (m.status_aprovacao = 'CURSANDO') AS aprovacao_pendente,
                NOT EXISTS (
                    SELECT 1 FROM Certificados c
                    WHERE c.id_aluno = m.id_aluno AND c.id_turma = m.id_turma
                ) AS certificado_pendente
         FROM Matriculas m
         WHERE m.status_aprovacao IN ('CURSANDO', 'APROVADO')
           AND EXISTS (
               SELECT 1 FROM Questionarios f
               INNER JOIN Q_Tentativas t ON t.id_questionario = f.id_questionario
                   AND t.id_turma = f.id_turma
               WHERE f.id_turma = m.id_turma AND f.tipo = 'PROVA' AND f.prova_final = 1
                 AND t.id_usuario = m.id_aluno AND t.finalizada_em IS NOT NULL AND t.percentual >= 75
           )
           AND (
               m.status_aprovacao = 'CURSANDO'
               OR NOT EXISTS (
                   SELECT 1 FROM Certificados c
                   WHERE c.id_aluno = m.id_aluno AND c.id_turma = m.id_turma
               )
           )
         ORDER BY m.id_turma, m.id_matricula`
    );
    return rows;
}

async function aplicarEmMatricula(candidate) {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        await bloquearTurma(connection, candidate.id_turma);
        const [rows] = await connection.query(
            `SELECT id_matricula, id_aluno, id_turma, status_aprovacao
             FROM Matriculas WHERE id_matricula = ? FOR UPDATE`,
            [candidate.id_matricula]
        );
        if (!rows.length || !['CURSANDO', 'APROVADO'].includes(rows[0].status_aprovacao)) {
            await connection.commit();
            return { changed: false, certificate: false };
        }

        const requisitos = await avaliarAprovacao(connection, rows[0].id_aluno, rows[0].id_turma);
        const [certificados] = await connection.query(
            `SELECT id_certificado, status FROM Certificados
             WHERE id_aluno = ? AND id_turma = ? ORDER BY versao DESC LIMIT 1 FOR UPDATE`,
            [rows[0].id_aluno, rows[0].id_turma]
        );
        await connection.commit();

        const needsCertificate = requisitos.status_aprovacao === 'APROVADO' && certificados.length === 0;
        const certificateResult = needsCertificate
            ? await certificateService.emitirCertificadoAutomaticamente(rows[0].id_aluno, rows[0].id_turma)
            : undefined;
        return {
            changed: Boolean(requisitos.aprovacao_atualizada),
            certificate: Boolean(certificateResult?.certificado && !certificateResult.reutilizado),
            certificatePending: certificateResult?.status === 'PENDENTE'
        };
    } catch (error) {
        await connection.rollback().catch(() => undefined);
        throw error;
    } finally {
        connection.release();
    }
}

async function main(argv = process.argv.slice(2)) {
    const options = parseArgs(argv);
    if (options.apply && process.env.NODE_ENV === 'production' && !options.backupGood) {
        throw new Error('Produção exige backup local e offsite verificados como GOOD antes de --apply.');
    }

    const items = await candidatos();
    const report = {
        mode: options.apply ? 'APPLY' : 'DRY_RUN',
        analisadas: items.length,
        aprovacoes_pendentes: items.filter((item) => Boolean(item.aprovacao_pendente)).length,
        certificados_previstos: items.filter((item) => Boolean(item.certificado_pendente)).length,
        aprovacoes_corrigidas: 0,
        certificados_novos: 0,
        emissao_pendente: 0
    };

    if (options.apply) {
        for (const item of items) {
            const result = await aplicarEmMatricula(item);
            if (result.changed) report.aprovacoes_corrigidas += 1;
            if (result.certificate) report.certificados_novos += 1;
            if (result.certificatePending) report.emissao_pendente += 1;
        }
    }

    console.log(JSON.stringify(report));
}

if (require.main === module) {
    main()
        .catch((error) => {
            console.error(`RECONCILIACAO_ACADEMICA_FALHOU: ${error.code || error.message}`);
            process.exitCode = 1;
        })
        .finally(() => db.end?.());
}

module.exports = { parseArgs, candidatos, aplicarEmMatricula, main };
