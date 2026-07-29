'use strict';

const db = require('../../config/database');

async function salvarResumo({ usuarioId, resultado, duracaoMs }) {
    const resumo = resultado.resumo;
    const parameters = resultado.parametros_aplicados;
    const [insert] = await db.query(
        `INSERT INTO AnalisesContextuais
         (id_usuario, status, total_segmentos, segmentos_analisados, total_alertas,
          gravidade_maxima, versao_contrato, tempo_total_ms, parametros_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            usuarioId,
            resultado.status_analise,
            Number(resumo.total_segmentos),
            Number(resumo.segmentos_analisados),
            Number(resumo.total_alertas),
            resumo.gravidade_maxima || null,
            resultado.versao_contrato,
            Number.isFinite(duracaoMs) && duracaoMs >= 0 ? duracaoMs : null,
            JSON.stringify(parameters)
        ]
    );
    if (!insert.affectedRows) throw new Error('Não foi possível registrar o resumo da análise.');
    return { id: insert.insertId };
}

module.exports = { salvarResumo };
