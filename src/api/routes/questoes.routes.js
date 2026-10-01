const router = require('express').Router();
const { body, param, query } = require('express-validator');
const auth = require('../../middlewares/checkAuth.middleware');
const checkRole = require('../../middlewares/checkRole.middleware');
const controller = require('../controllers/questoes.controller');
const { TIPOS_QUESTAO, validarAutoriaPergunta } = require('../services/question-types.service');

const idTurma = param('id_turma').isInt({ min: 1 }).toInt();
const idQuestionario = param('id_questionario').isInt({ min: 1 }).toInt();
const idPergunta = param('id_pergunta').isInt({ min: 1 }).toInt();
const idOpcao = param('id_opcao').isInt({ min: 1 }).toInt();
const camposQuestionario = ['titulo', 'descricao', 'tipo', 'ativo', 'id_modulo', 'ordem', 'prova_final'];
const camposPergunta = ['texto_pergunta', 'tipo_pergunta', 'ordem', 'pontos'];
const camposConteudoPergunta = ['opcoes', 'resposta_booleana', 'pares'];
const validarCampos = (permitidos) => body().custom((payload) => {
    const desconhecidos = Object.keys(payload || {}).filter((campo) => !permitidos.includes(campo));
    if (desconhecidos.length) throw new Error(`Campos não permitidos: ${desconhecidos.join(', ')}.`);
    return true;
});
const apenasCamposPergunta = body().custom((payload) => {
    const desconhecidos = Object.keys(payload || {}).filter((campo) => ![...camposPergunta, ...camposConteudoPergunta].includes(campo));
    if (desconhecidos.length) throw new Error(`Campos não permitidos: ${desconhecidos.join(', ')}.`);
    return true;
});

router.post(
    '/turmas/:id_turma/questionarios',
    auth,
    idTurma,
    validarCampos(camposQuestionario),
    body('titulo').isString().trim().notEmpty().isLength({ max: 255 }),
    body('descricao').optional().isString().isLength({ max: 255 }),
    body('tipo').isIn(['PROVA', 'EXERCICIO']),
    body('ativo').optional().isBoolean().toBoolean(),
    body('prova_final').optional().isBoolean().toBoolean(),
    body('id_modulo').optional({ values: 'null' }).isInt({ min: 1 }).toInt(),
    body('ordem').optional().isInt({ min: 0, max: 2147483647 }).toInt(),
    controller.criarQuestionario
);

router.patch(
    '/questionarios/:id_questionario',
    auth,
    idQuestionario,
    body().custom((payload) => {
        const chaves = Object.keys(payload || {});
        if (!chaves.length) throw new Error('Informe ao menos um campo para atualizar.');
        const desconhecidos = chaves.filter(
            (campo) => !['titulo', 'descricao', 'tipo', 'ativo', 'id_modulo', 'ordem', 'prova_final'].includes(campo)
        );
        if (desconhecidos.length) throw new Error(`Campos não permitidos: ${desconhecidos.join(', ')}.`);
        return true;
    }),
    body('titulo').optional().isString().trim().notEmpty().isLength({ max: 255 }),
    body('descricao').optional().isString().isLength({ max: 255 }),
    body('tipo').optional().isIn(['PROVA', 'EXERCICIO']),
    body('ativo').optional().isBoolean().toBoolean(),
    body('prova_final').optional().isBoolean().toBoolean(),
    body('id_modulo').optional({ values: 'null' }).isInt({ min: 1 }).toInt(),
    body('ordem').optional().isInt({ min: 0, max: 2147483647 }).toInt(),
    controller.atualizarQuestionario
);

router.delete(
    '/questionarios/:id_questionario',
    auth,
    idQuestionario,
    controller.removerQuestionario
);

router.post(
    '/questionarios/:id_questionario/perguntas',
    auth,
    idQuestionario,
    validarCampos([...camposPergunta, ...camposConteudoPergunta]),
    body('texto_pergunta').isString().trim().notEmpty().isLength({ max: 255 }),
    body('ordem').isInt({ min: 0 }).toInt(),
    body('pontos').optional().isFloat({ min: 0.01, max: 1000 }).toFloat()
        .custom((value) => Math.abs(Math.round(value * 100) - value * 100) <= 1e-8),
    body('tipo_pergunta').optional().isIn(TIPOS_QUESTAO),
    body('opcoes').optional().isArray({ min: 2 }),
    body('opcoes.*').custom((opcao) => {
        const desconhecidos = Object.keys(opcao || {}).filter(
            (campo) => !['texto_opcao', 'ordem', 'correta'].includes(campo)
        );
        if (desconhecidos.length) throw new Error(`Campos de opção não permitidos: ${desconhecidos.join(', ')}.`);
        return true;
    }),
    body('opcoes.*.texto_opcao').isString().trim().notEmpty().isLength({ max: 255 }),
    body('opcoes.*.ordem').isInt({ min: 0 }).toInt(),
    body('opcoes.*.correta').isBoolean().toBoolean(),
    body('resposta_booleana').optional().custom((value) => typeof value === 'boolean'),
    body('pares').optional().isArray({ min: 2 }),
    body('pares.*').custom((par) => {
        const desconhecidos = Object.keys(par || {}).filter((campo) => !['esquerda', 'direita', 'ordem'].includes(campo));
        if (desconhecidos.length) throw new Error(`Campos de par não permitidos: ${desconhecidos.join(', ')}.`);
        return true;
    }),
    body('pares.*.esquerda').isString().trim().notEmpty().isLength({ max: 255 }),
    body('pares.*.direita').isString().trim().notEmpty().isLength({ max: 255 }),
    body('pares.*.ordem').isInt({ min: 0 }).toInt(),
    body().custom((payload) => { validarAutoriaPergunta(payload); return true; }),
    controller.criarPergunta
);

router.post(
    '/perguntas/:id_pergunta/opcoes',
    auth,
    idPergunta,
    validarCampos(['texto_opcao', 'ordem', 'correta']),
    body('texto_opcao').isString().trim().notEmpty().isLength({ max: 255 }),
    body('ordem').isInt({ min: 0 }).toInt(),
    body('correta').isBoolean().toBoolean(),
    controller.criarOpcao
);

router.patch(
    '/opcoes/:id_opcao',
    auth,
    idOpcao,
    validarCampos(['texto_opcao', 'ordem', 'correta']),
    body().custom((payload) => Object.keys(payload || {}).length > 0)
        .withMessage('Informe ao menos um campo para atualizar.'),
    body('texto_opcao').optional().isString().trim().notEmpty().isLength({ max: 255 }),
    body('ordem').optional().isInt({ min: 0 }).toInt(),
    body('correta').optional().isBoolean().toBoolean(),
    controller.atualizarOpcao
);

router.delete('/opcoes/:id_opcao', auth, idOpcao, controller.removerOpcao);

router.get(
    '/turmas/:id_turma/questionarios',
    auth,
    idTurma,
    controller.listarMetadados
);

router.get(
    '/turmas/:id_turma/questionarios/disponivel',
    auth,
    idTurma,
    query('tipo').optional().isIn(['prova', 'exercicio', 'PROVA', 'EXERCICIO']),
    query('id_questionario').optional().isInt({ min: 1 }).toInt(),
    controller.listar
);

router.patch(
    '/perguntas/:id_pergunta',
    auth,
    idPergunta,
    apenasCamposPergunta,
    body().custom((payload) => Object.keys(payload || {}).length > 0)
        .withMessage('Informe ao menos um campo para atualizar.'),
    body('texto_pergunta').optional().isString().trim().notEmpty().isLength({ max: 255 }),
    body('tipo_pergunta').optional().isIn(TIPOS_QUESTAO),
    body('ordem').optional().isInt({ min: 0 }).toInt(),
    body('pontos').optional().isFloat({ min: 0.01, max: 1000 }).toFloat()
        .custom((value) => Math.abs(Math.round(value * 100) - value * 100) <= 1e-8),
    body('opcoes').optional().isArray({ min: 2 }),
    body('opcoes.*.texto_opcao').optional().isString().trim().notEmpty().isLength({ max: 255 }),
    body('opcoes.*.ordem').optional().isInt({ min: 0 }).toInt(),
    body('opcoes.*.correta').optional().isBoolean().toBoolean(),
    body('resposta_booleana').optional().custom((value) => typeof value === 'boolean'),
    body('pares').optional().isArray({ min: 2 }),
    body('pares.*.esquerda').optional().isString().trim().notEmpty().isLength({ max: 255 }),
    body('pares.*.direita').optional().isString().trim().notEmpty().isLength({ max: 255 }),
    body('pares.*.ordem').optional().isInt({ min: 0 }).toInt(),
    controller.atualizarPergunta
);
router.delete('/perguntas/:id_pergunta', auth, idPergunta, controller.removerPergunta);

router.post(
    '/questionarios/:id_questionario/submissoes',
    auth,
    checkRole('ALUNO'),
    idQuestionario,
    validarCampos(['submission_id', 'respostas']),
    body('submission_id').isUUID().withMessage('Identificador de submissão inválido.'),
    body('respostas').isArray({ min: 1 }),
    body('respostas.*').custom((resposta) => {
        const desconhecidos = Object.keys(resposta || {}).filter(
            (campo) => !['id_pergunta', 'id_opcao', 'selected_option_ids', 'resposta_booleana', 'matches'].includes(campo)
        );
        if (desconhecidos.length) throw new Error(`Campos de resposta não permitidos: ${desconhecidos.join(', ')}.`);
        const variantes = ['id_opcao', 'selected_option_ids', 'resposta_booleana', 'matches']
            .filter((campo) => Object.hasOwn(resposta, campo));
        if (variantes.length !== 1) throw new Error('Envie exatamente um formato de resposta por pergunta.');
        return true;
    }),
    body('respostas.*.id_pergunta').isInt({ min: 1 }).toInt(),
    body('respostas.*.id_opcao').optional().isInt({ min: 1 }).toInt(),
    body('respostas.*.selected_option_ids').optional().isArray({ min: 1 }),
    body('respostas.*.selected_option_ids.*').optional().isInt({ min: 1 }).toInt(),
    body('respostas.*.resposta_booleana').optional().custom((value) => typeof value === 'boolean'),
    body('respostas.*.matches').optional().isArray({ min: 1 }),
    body('respostas.*.matches.*').optional().custom((match) => {
        const desconhecidos = Object.keys(match || {}).filter((campo) => !['left_id', 'right_id'].includes(campo));
        if (desconhecidos.length) throw new Error(`Campos de associação não permitidos: ${desconhecidos.join(', ')}.`);
        return true;
    }),
    body('respostas.*.matches.*.left_id').optional().isUUID(),
    body('respostas.*.matches.*.right_id').optional().isUUID(),
    controller.submeter
);

router.get(
    '/questionarios/historico',
    auth,
    checkRole('ALUNO'),
    query('id_questionario').optional().isInt({ min: 1 }).toInt(),
    controller.historico
);

router.get(
    '/turmas/:id_turma/questionarios/resultados',
    auth,
    idTurma,
    controller.resultados
);

module.exports = router;
