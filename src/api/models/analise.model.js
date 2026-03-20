const db = require('../../config/database');

async function garantirTabelaAnalisesPlagio() {
    await db.query(`
        CREATE TABLE IF NOT EXISTS AnalisesPlagio (
            id INT NOT NULL AUTO_INCREMENT,
            usuario_id INT NOT NULL,
            trecho_texto TEXT NOT NULL,
            score_similaridade DECIMAL(5,2) NOT NULL,
            fontes_encontradas JSON NULL,
            criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            CONSTRAINT fk_analises_plagio_usuario
                FOREIGN KEY (usuario_id) REFERENCES Usuarios(id_usuario)
                ON DELETE CASCADE
                ON UPDATE CASCADE
        ) ENGINE=InnoDB
    `);
}

async function salvarAnalise({ usuario_id, trecho_texto, score_similaridade, fontes_encontradas }) {
    await garantirTabelaAnalisesPlagio();

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
    garantirTabelaAnalisesPlagio,
    salvarAnalise
};
