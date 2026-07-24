const router = require('express').Router();
const { body, param, query } = require('express-validator');
const auth = require('../../middlewares/checkAuth.middleware');
const checkRole = require('../../middlewares/checkRole.middleware');
const controller = require('../controllers/questoes.controller');

const idTurma = param('id_turma').isInt({ min: 1 }).toInt();
const idQuestionario = param('id_questionario').isInt({ min: 1 }).toInt();
const idPergunta = param('id_pergunta').isInt({ min: 1 }).toInt();

router.post(
    '/turmas/:id_turma/questionarios',
    auth,
    idTurma,
    body('titulo').isString().trim().notEmpty(),
    body('tipo').isIn(['PROVA', 'EXERCICIO']),
    controller.criarQuestionario
);

router.post(
    '/questionarios/:id_questionario/perguntas',
    auth,
    idQuestionario,
    body('texto_pergunta').isString().trim().notEmpty(),
    body('ordem').isInt({ min: 0 }),
    body('tipo_pergunta').optional().isIn(['MULTIPLA_ESCOLHA', 'VERDADEIRO_FALSO']),
    body('opcoes').isArray({ min: 2 }),
    body('opcoes.*.texto_opcao').isString().trim().notEmpty(),
    body('opcoes.*.ordem').isInt({ min: 0 }),
    body('opcoes.*.correta').isBoolean(),
    body('opcoes').custom((opcoes) => opcoes.filter((opcao) => opcao.correta).length === 1)
        .withMessage('Informe exatamente uma opção correta.'),
    controller.criarPergunta
);

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
    controller.listar
);

router.patch('/perguntas/:id_pergunta', auth, idPergunta, controller.atualizarPergunta);
router.delete('/perguntas/:id_pergunta', auth, idPergunta, controller.removerPergunta);

router.post(
    '/questionarios/:id_questionario/submissoes',
    auth,
    checkRole('ALUNO'),
    idQuestionario,
    body('respostas').isArray({ min: 1 }),
    body('respostas.*.id_pergunta').isInt({ min: 1 }).toInt(),
    body('respostas.*.id_opcao').isInt({ min: 1 }).toInt(),
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
