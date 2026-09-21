const { validationResult } = require('express-validator');
const model = require('../models/questoes.models');
const {
    exigirGestaoEstrutural,
    exigirTurmaEditavel
} = require('../services/academic-access.service');
const { paginated, parsePagination } = require('../../utils/pagination');

function validar(req, res) {
    const erros = validationResult(req);
    if (erros.isEmpty()) return true;
    res.status(400).json({ erros: erros.array() });
    return false;
}

async function criarQuestionario(req, res, next) {
    try {
        if (!validar(req, res)) return;
        const turma = await model.buscarTurma(req.params.id_turma);
        if (!turma) return res.status(404).json({ mensagem: 'Turma não encontrada.' });
        exigirGestaoEstrutural(req.user, turma);
        exigirTurmaEditavel(turma);
        const questionario = await model.criarQuestionario(req.params.id_turma, req.body, req.user);
        return res.status(201).json({ questionario });
    } catch (error) {
        return next(error);
    }
}

async function criarPergunta(req, res, next) {
    try {
        if (!validar(req, res)) return;
        const escopo = await model.escopoQuestionario(req.params.id_questionario);
        if (!escopo) return res.status(404).json({ mensagem: 'Questionário não encontrado.' });
        exigirGestaoEstrutural(req.user, escopo);
        exigirTurmaEditavel(escopo);
        return res.status(201).json(await model.criarPergunta(req.params.id_questionario, req.body, req.user));
    } catch (error) {
        return next(error);
    }
}

async function criarOpcao(req, res, next) {
    try {
        if (!validar(req, res)) return;
        const escopo = await model.escopoPergunta(req.params.id_pergunta);
        if (!escopo) return res.status(404).json({ mensagem: 'Pergunta não encontrada.' });
        exigirGestaoEstrutural(req.user, escopo);
        exigirTurmaEditavel(escopo);
        return res.status(201).json({
            opcao: await model.criarOpcao(req.params.id_pergunta, req.body, req.user)
        });
    } catch (error) {
        return next(error);
    }
}

async function atualizarOpcao(req, res, next) {
    try {
        if (!validar(req, res)) return;
        const escopo = await model.escopoOpcao(req.params.id_opcao);
        if (!escopo) return res.status(404).json({ mensagem: 'Alternativa não encontrada.' });
        exigirGestaoEstrutural(req.user, escopo);
        exigirTurmaEditavel(escopo);
        await model.atualizarOpcao(req.params.id_opcao, req.body, req.user);
        return res.status(200).json({ mensagem: 'Alternativa atualizada.' });
    } catch (error) {
        return next(error);
    }
}

async function removerOpcao(req, res, next) {
    try {
        if (!validar(req, res)) return;
        const escopo = await model.escopoOpcao(req.params.id_opcao);
        if (!escopo) return res.status(404).json({ mensagem: 'Alternativa não encontrada.' });
        exigirGestaoEstrutural(req.user, escopo);
        exigirTurmaEditavel(escopo);
        await model.removerOpcao(req.params.id_opcao, req.user);
        return res.status(200).json({ mensagem: 'Alternativa removida.' });
    } catch (error) {
        return next(error);
    }
}

async function atualizarQuestionario(req, res, next) {
    try {
        if (!validar(req, res)) return;
        const escopo = await model.escopoQuestionario(req.params.id_questionario);
        if (!escopo) return res.status(404).json({ mensagem: 'Questionário não encontrado.' });
        exigirGestaoEstrutural(req.user, escopo);
        exigirTurmaEditavel(escopo);
        await model.atualizarQuestionario(req.params.id_questionario, req.body, req.user);
        return res.status(200).json({ mensagem: 'Questionário atualizado.' });
    } catch (error) {
        return next(error);
    }
}

async function removerQuestionario(req, res, next) {
    try {
        if (!validar(req, res)) return;
        const escopo = await model.escopoQuestionario(req.params.id_questionario);
        if (!escopo) return res.status(404).json({ mensagem: 'Questionário não encontrado.' });
        exigirGestaoEstrutural(req.user, escopo);
        exigirTurmaEditavel(escopo);
        await model.removerQuestionario(req.params.id_questionario, req.user);
        return res.status(200).json({ mensagem: 'Questionário removido.' });
    } catch (error) {
        return next(error);
    }
}

async function listarMetadados(req, res, next) {
    try {
        if (!validar(req, res)) return;
        const turma = await model.buscarTurma(req.params.id_turma);
        if (!turma) return res.status(404).json({ mensagem: 'Turma não encontrada.' });
        if (req.user.tipo === 'ALUNO') {
            if (!await model.matriculado(req.user.id_usuario, req.params.id_turma)) {
                return res.status(403).json({ mensagem: 'Aluno não matriculado nesta turma.' });
            }
            return res.status(200).json({
                questionarios: await model.listarTrilhaAluno(req.params.id_turma, req.user.id_usuario)
            });
        }
        exigirGestaoEstrutural(req.user, turma);
        const questionarios = await model.listarMetadadosTurma(req.params.id_turma);
        return res.status(200).json({ questionarios });
    } catch (error) {
        return next(error);
    }
}

async function listar(req, res, next) {
    try {
        if (!validar(req, res)) return;
        if (req.user.tipo !== 'ALUNO') {
            return res.status(403).json({ mensagem: 'Esta consulta é destinada a alunos.' });
        }
        const turma = await model.buscarTurma(req.params.id_turma);
        if (!turma) return res.status(404).json({ mensagem: 'Turma não encontrada.' });
        if (turma.status === 'ENCERRADA') {
            return res.status(403).json({ mensagem: 'Esta turma está encerrada.' });
        }
        if (!await model.matriculado(req.user.id_usuario, req.params.id_turma)) {
            return res.status(403).json({ mensagem: 'Aluno não matriculado nesta turma.' });
        }
        const tipo = String(req.query.tipo || 'PROVA').toUpperCase();
        const questionario = await model.listarAluno(req.params.id_turma, tipo, req.query.id_questionario, req.user.id_usuario);
        return questionario
            ? res.status(200).json({ questionario })
            : res.status(404).json({ mensagem: 'Questionário inexistente ou inativo.' });
    } catch (error) {
        return next(error);
    }
}

async function atualizarPergunta(req, res, next) {
    try {
        if (!validar(req, res)) return;
        const escopo = await model.escopoPergunta(req.params.id_pergunta);
        if (!escopo) return res.status(404).json({ mensagem: 'Pergunta não encontrada.' });
        exigirGestaoEstrutural(req.user, escopo);
        exigirTurmaEditavel(escopo);
        await model.atualizarPergunta(req.params.id_pergunta, req.body, req.user);
        return res.status(200).json({ mensagem: 'Pergunta atualizada.' });
    } catch (error) {
        return next(error);
    }
}

async function removerPergunta(req, res, next) {
    try {
        if (!validar(req, res)) return;
        const escopo = await model.escopoPergunta(req.params.id_pergunta);
        if (!escopo) return res.status(404).json({ mensagem: 'Pergunta não encontrada.' });
        exigirGestaoEstrutural(req.user, escopo);
        exigirTurmaEditavel(escopo);
        await model.removerPergunta(req.params.id_pergunta, req.user);
        return res.status(200).json({ mensagem: 'Pergunta removida.' });
    } catch (error) {
        return next(error);
    }
}

async function submeter(req, res, next) {
    try {
        if (!validar(req, res)) return;
        const resultado = await model.submeter(
            req.params.id_questionario,
            req.user.id_usuario,
            req.body.respostas,
            req.body.submission_id
        );
        return res.status(200).json({ resultado });
    } catch (error) {
        return next(error);
    }
}

async function historico(req, res, next) {
    try {
        if (!validar(req, res)) return;
        const pagination = parsePagination(req.query);
        const tentativas = await model.historico(req.user.id_usuario, req.query.id_questionario, pagination);
        return res.status(200).json({
            ...paginated(tentativas.items, tentativas.total, pagination),
            tentativas: tentativas.items
        });
    } catch (error) {
        return next(error);
    }
}

async function resultados(req, res, next) {
    try {
        if (!validar(req, res)) return;
        const turma = await model.buscarTurma(req.params.id_turma);
        if (!turma) return res.status(404).json({ mensagem: 'Turma não encontrada.' });
        exigirGestaoEstrutural(req.user, turma);
        const pagination = parsePagination(req.query);
        const resultados = await model.resultadosTurma(req.params.id_turma, pagination);
        return res.status(200).json({
            ...paginated(resultados.items, resultados.total, pagination),
            resultados: resultados.items
        });
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    criarQuestionario,
    criarPergunta,
    criarOpcao,
    atualizarOpcao,
    removerOpcao,
    atualizarQuestionario,
    removerQuestionario,
    listarMetadados,
    listar,
    atualizarPergunta,
    removerPergunta,
    submeter,
    historico,
    resultados
};
