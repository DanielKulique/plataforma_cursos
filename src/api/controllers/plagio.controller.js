const { validationResult } = require('express-validator');
const plagioService = require('../services/plagio.service');
const analiseModel = require('../models/analise.model');
const logger = require('../../utils/logger');

async function verificarTexto(req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { texto_original, texto_suspeito } = req.body;
        const usuario_id = req.user && req.user.id_usuario;

        if (!usuario_id) {
            return res.status(401).json({ message: 'Usuário não autenticado.' });
        }

        const resultadoIA = await plagioService.enviarParaAnaliseIA(texto_original, texto_suspeito);

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
            trecho_texto: texto_suspeito,
            score_similaridade: scoreSimilaridade,
            fontes_encontradas: fontesEncontradas
        });

        return res.status(200).json({
            mensagem: 'Textos analisados com sucesso.',
            id_registro: registro.id,
            resultado: {
                score_similaridade: scoreSimilaridade,
                fontes_encontradas: fontesEncontradas,
                bruto: resultadoIA
            }
        });
    } catch (error) {
        logger.error('plagio.analise.falhou', { requestId: req.id, actorId: req.user?.id_usuario, error });

        if (error.status) {
            return res.status(error.status).json({ mensagem: error.message });
        }

        return res.status(500).json({
            message: 'Ocorreu um erro no servidor ao processar a análise de plágio.'
        });
    }
}

module.exports = {
    verificarTexto
};
