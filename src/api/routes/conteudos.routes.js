const router = require('express').Router();
const { body, param } = require('express-validator');
const checkAuth = require('../../middlewares/checkAuth.middleware');
const checkRole = require('../../middlewares/checkRole.middleware');
const controller = require('../controllers/conteudos.controller');
const { receberPdf } = require('../services/material-upload.service');
const { normalizeYouTubeEmbedUrl, toSafeUrl } = require('../../public/js/security-utils');
const idTurma = param('id_turma').isInt({ min: 1 });
const idConteudo = param('id_conteudo').isInt({ min: 1 });
const idModulo = param('id_modulo').isInt({ min: 1 });
const camposConteudo = ['id_modulo', 'titulo', 'descricao', 'tipo', 'url', 'corpo', 'duracao_minutos', 'ordem'];
const apenasCamposPermitidos = body().custom((payload) => {
    const desconhecidos = Object.keys(payload || {}).filter((campo) => !camposConteudo.includes(campo));
    if (desconhecidos.length) throw new Error(`Campos não permitidos: ${desconhecidos.join(', ')}.`);
    return true;
});
const urlSegura = body('url').optional({ nullable: true, checkFalsy: true })
    .customSanitizer((value) => normalizeYouTubeEmbedUrl(value) || value).custom((value) => {
    if (!toSafeUrl(value, { baseUrl: 'http://localhost' })) {
        throw new Error('URL de conteúdo não pertence a uma origem permitida.');
    }
    return true;
});
const dados = [
    apenasCamposPermitidos,
    body('titulo').isString().trim().isLength({ min: 1, max: 255 }),
    body('tipo').isIn(['VIDEO', 'TEXTO', 'PDF', 'LINK', 'ATIVIDADE']),
    body('ordem').isInt({ min: 0 }).toInt(),
    body('id_modulo').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
    body('duracao_minutos').optional({ nullable: true }).isInt({ min: 0 }).toInt(),
    body('descricao').optional({ nullable: true }).isString(),
    body('corpo').optional({ nullable: true }).isString(),
    urlSegura
];
const atualizacao = [
    apenasCamposPermitidos,
    body().custom((payload) => Object.keys(payload || {}).length > 0)
        .withMessage('Informe ao menos um campo para atualizar.'),
    body('titulo').optional().isString().trim().isLength({ min: 1, max: 255 }),
    body('tipo').optional().isIn(['VIDEO', 'TEXTO', 'PDF', 'LINK', 'ATIVIDADE']),
    body('ordem').optional().isInt({ min: 0 }).toInt(),
    body('id_modulo').optional({ nullable: true }).isInt({ min: 1 }).toInt(),
    body('duracao_minutos').optional({ nullable: true }).isInt({ min: 0 }).toInt(),
    body('descricao').optional({ nullable: true }).isString(),
    body('corpo').optional({ nullable: true }).isString(),
    urlSegura
];
const dadosModulo = [
    body().custom((payload) => {
        const desconhecidos = Object.keys(payload || {})
            .filter((campo) => !['titulo', 'descricao', 'ordem'].includes(campo));
        if (desconhecidos.length) throw new Error(`Campos não permitidos: ${desconhecidos.join(', ')}.`);
        return true;
    }),
    body('titulo').isString().trim().isLength({ min: 1, max: 255 }),
    body('descricao').optional({ nullable: true }).isString(),
    body('ordem').isInt({ min: 0 }).toInt()
];
const atualizacaoModulo = [
    body().custom((payload) => {
        const chaves = Object.keys(payload || {});
        if (!chaves.length) throw new Error('Informe ao menos um campo para atualizar.');
        const desconhecidos = chaves.filter(
            (campo) => !['titulo', 'descricao', 'ordem'].includes(campo)
        );
        if (desconhecidos.length) throw new Error(`Campos não permitidos: ${desconhecidos.join(', ')}.`);
        return true;
    }),
    body('titulo').optional().isString().trim().isLength({ min: 1, max: 255 }),
    body('descricao').optional({ nullable: true }).isString(),
    body('ordem').optional().isInt({ min: 0 }).toInt()
];
const camposPdf = ['id_modulo', 'titulo', 'descricao', 'corpo', 'duracao_minutos', 'ordem'];
const apenasCamposPdf = body().custom((payload) => {
    const desconhecidos = Object.keys(payload || {}).filter((campo) => !camposPdf.includes(campo));
    if (desconhecidos.length) throw new Error(`Campos não permitidos: ${desconhecidos.join(', ')}.`);
    return true;
});
const dadosPdf = [
    apenasCamposPdf,
    body('titulo').isString().trim().isLength({ min: 1, max: 255 }),
    body('ordem').isInt({ min: 0 }).toInt(),
    body('id_modulo').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }).toInt(),
    body('duracao_minutos').optional({ nullable: true, checkFalsy: true }).isInt({ min: 0 }).toInt(),
    body('descricao').optional({ nullable: true }).isString(),
    body('corpo').optional({ nullable: true }).isString()
];
const atualizacaoPdf = [
    apenasCamposPdf,
    body('titulo').optional().isString().trim().isLength({ min: 1, max: 255 }),
    body('ordem').optional().isInt({ min: 0 }).toInt(),
    body('id_modulo').optional({ nullable: true, checkFalsy: true }).isInt({ min: 1 }).toInt(),
    body('duracao_minutos').optional({ nullable: true, checkFalsy: true }).isInt({ min: 0 }).toInt(),
    body('descricao').optional({ nullable: true }).isString(),
    body('corpo').optional({ nullable: true }).isString()
];
router.get('/turmas/:id_turma/conteudos', checkAuth, idTurma, controller.listar);
router.post('/turmas/:id_turma/modulos', checkAuth, idTurma, dadosModulo, controller.criarModulo);
router.patch('/modulos/:id_modulo', checkAuth, idModulo, atualizacaoModulo, controller.atualizarModulo);
router.delete('/modulos/:id_modulo', checkAuth, idModulo, controller.removerModulo);
router.post('/turmas/:id_turma/conteudos', checkAuth, idTurma, dados, controller.criar);
router.post(
    '/turmas/:id_turma/conteudos/pdf',
    checkAuth,
    idTurma,
    controller.autorizarUploadTurma,
    receberPdf,
    dadosPdf,
    controller.criarPdf
);
router.get('/conteudos/:id_conteudo/material', checkAuth, idConteudo, controller.material);
router.patch('/conteudos/:id_conteudo', checkAuth, idConteudo, atualizacao, controller.atualizar);
router.put(
    '/conteudos/:id_conteudo/pdf',
    checkAuth,
    idConteudo,
    controller.autorizarUploadConteudo,
    receberPdf,
    atualizacaoPdf,
    controller.substituirPdf
);
router.delete('/conteudos/:id_conteudo', checkAuth, idConteudo, controller.remover);
router.put('/conteudos/:id_conteudo/progresso', checkAuth, checkRole('ALUNO'), idConteudo, body('status').isIn(['INICIADO', 'CONCLUIDO']), controller.progresso);
router.get('/turmas/:id_turma/progresso', checkAuth, idTurma, controller.turma);
module.exports = router;
