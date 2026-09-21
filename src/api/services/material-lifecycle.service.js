'use strict';

async function reterSeSemReferencias(connection, id) {
    if (!id) return;
    await connection.query(
        `UPDATE ArquivosMateriais a SET status = 'RETIDO', retido_em = COALESCE(retido_em, NOW())
         WHERE a.id_arquivo_material = ? AND a.status = 'ATIVO'
           AND NOT EXISTS (SELECT 1 FROM Conteudos c WHERE c.id_arquivo_material = a.id_arquivo_material)`, [id]
    );
}

module.exports = { reterSeSemReferencias };
