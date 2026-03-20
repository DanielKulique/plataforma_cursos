const { validationResult } = require('express-validator');
const plagioService = require('../services/plagio.service');
const analiseModel = require('../models/analise.model');

async function verificarTexto(req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { texto } = req.body;
        const usuario_id = req.user && req.user.id_usuario;

        if (!usuario_id) {
            return res.status(401).json({ message: 'Usuário não autenticado.' });
        }

        const resultadoIA = await plagioService.enviarParaAnaliseIA(texto);

        const scoreSimilaridade = Number(
            resultadoIA.score_similaridade ??
            resultadoIA.score ??
            resultadoIA.similaridade ??
            0
        );

        const fontesEncontradas =
            resultadoIA.fontes_encontradas ??
            resultadoIA.fontes ??
            resultadoIA.sources ??
            [];

        const registro = await analiseModel.salvarAnalise({
            usuario_id,
            trecho_texto: texto,
            score_similaridade: scoreSimilaridade,
            fontes_encontradas: fontesEncontradas
        });

        return res.status(200).json({
            message: 'Texto analisado com sucesso.',
            id_registro: registro.id,
            resultado: {
                score_similaridade: scoreSimilaridade,
                fontes_encontradas: fontesEncontradas,
                bruto: resultadoIA
            }
        });
    } catch (error) {
        console.error('Erro ao verificar texto:', error);

        if (error.status) {
            return res.status(error.status).json({ message: error.message });
        }

        return res.status(500).json({
            message: 'Ocorreu um erro no servidor ao processar a análise de plágio.'
        });
    }
}

module.exports = {
    verificarTexto
};
