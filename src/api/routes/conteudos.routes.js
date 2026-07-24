const router = require('express').Router();
const { body, param } = require('express-validator');
const checkAuth = require('../../middlewares/checkAuth.middleware');
const checkRole = require('../../middlewares/checkRole.middleware');
const controller = require('../controllers/conteudos.controller');
const { toSafeUrl } = require('../../public/js/security-utils');
const idTurma = param('id_turma').isInt({ min: 1 });
const idConteudo = param('id_conteudo').isInt({ min: 1 });
const urlSegura = body('url').optional({ nullable: true, checkFalsy: true }).custom((value) => {
    if (!toSafeUrl(value, { baseUrl: 'http://localhost' })) {
        throw new Error('URL de conteúdo não pertence a uma origem permitida.');
    }
    return true;
});
const dados = [body('titulo').isString().trim().isLength({ min: 1, max: 255 }), body('tipo').isIn(['VIDEO', 'TEXTO', 'PDF', 'LINK', 'ATIVIDADE']), body('ordem').isInt({ min: 0 }), urlSegura];
router.get('/turmas/:id_turma/conteudos', checkAuth, idTurma, controller.listar);
router.post('/turmas/:id_turma/conteudos', checkAuth, idTurma, dados, controller.criar);
router.patch('/conteudos/:id_conteudo', checkAuth, idConteudo, urlSegura, controller.atualizar);
router.delete('/conteudos/:id_conteudo', checkAuth, idConteudo, controller.remover);
router.put('/conteudos/:id_conteudo/progresso', checkAuth, checkRole('ALUNO'), idConteudo, body('status').isIn(['INICIADO', 'CONCLUIDO']), controller.progresso);
router.get('/turmas/:id_turma/progresso', checkAuth, idTurma, controller.turma);
module.exports = router;
