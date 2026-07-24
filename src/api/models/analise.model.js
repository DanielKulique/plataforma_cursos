const db = require('../../config/database');

async function salvarAnalise({ usuario_id, trecho_texto, score_similaridade, fontes_encontradas }) {
    const scoreNormalizado = Number(score_similaridade);
    const fontesSerializadas = fontes_encontradas === undefined || fontes_encontradas === null
        ? null
        : JSON.stringify(fontes_encontradas);

    const [result] = await db.query(
        `INSERT INTO AnalisesPlagio (usuario_id, trecho_texto, score_similaridade, fontes_encontradas)
         VALUES (?, ?, ?, ?)` ,
        [usuario_id, trecho_texto, scoreNormalizado, fontesSerializadas]
    );

    if (result.affectedRows === 0) {
        throw new Error('Não foi possível salvar o histórico da análise.');
    }

    return {
        id: result.insertId,
        usuario_id,
        trecho_texto,
        score_similaridade: scoreNormalizado,
        fontes_encontradas: fontes_encontradas || [],
        criado_em: new Date().toISOString()
    };
}

module.exports = {
    salvarAnalise
};
