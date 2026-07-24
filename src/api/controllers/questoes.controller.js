const { validationResult } = require('express-validator');
const model = require('../models/questoes.models');

function validar(req, res) {
    const erros = validationResult(req);
    if (erros.isEmpty()) return true;
    res.status(400).json({ erros: erros.array() });
    return false;
}

async function adminTurma(req, idTurma) {
    return req.user.tipo === 'ADMIN'
        || (req.user.tipo === 'PROFESSOR'
            && model.professorEhDaTurma(req.user.id_usuario, idTurma));
}

async function criarQuestionario(req, res, next) {
    try {
        if (!validar(req, res)) return;
        const turma = await model.buscarTurma(req.params.id_turma);
        if (!turma) return res.status(404).json({ mensagem: 'Turma não encontrada.' });
        if (!await adminTurma(req, req.params.id_turma)) {
            return res.status(403).json({ mensagem: 'Sem permissão para administrar esta turma.' });
        }
        const questionario = await model.criarQuestionario(req.params.id_turma, req.body);
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
        if (!await adminTurma(req, escopo.id_turma)) {
            return res.status(403).json({ mensagem: 'Sem permissão para este questionário.' });
        }
        return res.status(201).json(await model.criarPergunta(req.params.id_questionario, req.body));
    } catch (error) {
        return next(error);
    }
}

async function listarMetadados(req, res, next) {
    try {
        if (!validar(req, res)) return;
        const turma = await model.buscarTurma(req.params.id_turma);
        if (!turma) return res.status(404).json({ mensagem: 'Turma não encontrada.' });
        if (!await adminTurma(req, req.params.id_turma)) {
            return res.status(403).json({ mensagem: 'Sem permissão para esta turma.' });
        }
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
        if (!await model.matriculado(req.user.id_usuario, req.params.id_turma)) {
            return res.status(403).json({ mensagem: 'Aluno não matriculado nesta turma.' });
        }
        const tipo = String(req.query.tipo || 'PROVA').toUpperCase();
        const questionario = await model.listarAluno(req.params.id_turma, tipo);
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
        if (!await adminTurma(req, escopo.id_turma)) {
            return res.status(403).json({ mensagem: 'Sem permissão para esta pergunta.' });
        }
        await model.atualizarPergunta(req.params.id_pergunta, req.body);
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
        if (!await adminTurma(req, escopo.id_turma)) {
            return res.status(403).json({ mensagem: 'Sem permissão para esta pergunta.' });
        }
        await model.removerPergunta(req.params.id_pergunta);
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
            req.body.respostas
        );
        return res.status(200).json({ resultado });
    } catch (error) {
        return next(error);
    }
}

async function historico(req, res, next) {
    try {
        if (!validar(req, res)) return;
        const tentativas = await model.historico(req.user.id_usuario, req.query.id_questionario);
        return res.status(200).json({ tentativas });
    } catch (error) {
        return next(error);
    }
}

async function resultados(req, res, next) {
    try {
        if (!validar(req, res)) return;
        const turma = await model.buscarTurma(req.params.id_turma);
        if (!turma) return res.status(404).json({ mensagem: 'Turma não encontrada.' });
        if (!await adminTurma(req, req.params.id_turma)) {
            return res.status(403).json({ mensagem: 'Sem permissão para esta turma.' });
        }
        return res.status(200).json({ resultados: await model.resultadosTurma(req.params.id_turma) });
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    criarQuestionario,
    criarPergunta,
    listarMetadados,
    listar,
    atualizarPergunta,
    removerPergunta,
    submeter,
    historico,
    resultados
};
