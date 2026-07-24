const { validationResult } = require('express-validator');
const model = require('../models/conteudos.models');
const { toSafeUrl } = require('../../public/js/security-utils');

function invalidos(req, res) {
    const erros = validationResult(req);
    if (erros.isEmpty()) return false;
    res.status(400).json({ erros: erros.array() });
    return true;
}

async function podeAdministrar(req, idTurma) {
    return req.user.tipo === 'ADMIN'
        || (req.user.tipo === 'PROFESSOR'
            && model.professorEhDaTurma(req.user.id_usuario, idTurma));
}

async function autorizarLeitura(req, res, idTurma) {
    const turma = await model.buscarTurma(idTurma);
    if (!turma) {
        res.status(404).json({ mensagem: 'Turma não encontrada.' });
        return false;
    }
    if (req.user.tipo === 'ALUNO') {
        const matriculado = await model.alunoEstaMatriculado(req.user.id_usuario, idTurma);
        if (!matriculado) {
            res.status(403).json({ mensagem: 'Aluno não matriculado nesta turma.' });
            return false;
        }
        return true;
    }
    if (req.user.tipo === 'PROFESSOR' && Number(turma.id_professor) !== Number(req.user.id_usuario)) {
        res.status(403).json({ mensagem: 'Professor sem permissão para esta turma.' });
        return false;
    }
    if (!['PROFESSOR', 'ADMIN'].includes(req.user.tipo)) {
        res.status(403).json({ mensagem: 'Papel sem permissão para consultar conteúdos.' });
        return false;
    }
    return true;
}

function protegerUrls(conteudos) {
    return conteudos.map((conteudo) => {
        if (!conteudo.url) return conteudo;
        const permitida = toSafeUrl(conteudo.url, { baseUrl: 'http://localhost' });
        return {
            ...conteudo,
            url: permitida ? conteudo.url : null,
            url_bloqueada: !permitida
        };
    });
}

async function listar(req, res, next) {
    try {
        if (invalidos(req, res)) return;
        const idTurma = req.params.id_turma;
        if (!await autorizarLeitura(req, res, idTurma)) return;

        const idAluno = req.user.tipo === 'ALUNO' ? req.user.id_usuario : null;
        const [modulos, conteudosBrutos] = await Promise.all([
            model.listarModulos(idTurma),
            model.listar(idTurma, idAluno)
        ]);
        const conteudos = protegerUrls(conteudosBrutos);
        const estrutura = modulos.map((modulo) => ({
            ...modulo,
            conteudos: conteudos.filter(
                (conteudo) => Number(conteudo.id_modulo) === Number(modulo.id_modulo)
            )
        }));

        return res.status(200).json({ modulos: estrutura, conteudos });
    } catch (error) {
        return next(error);
    }
}

async function criar(req, res, next) {
    try {
        if (invalidos(req, res)) return;
        if (!await podeAdministrar(req, req.params.id_turma)) {
            return res.status(403).json({ mensagem: 'Sem permissão para administrar esta turma.' });
        }
        return res.status(201).json({ conteudo: await model.criar(req.params.id_turma, req.body) });
    } catch (error) {
        return next(error);
    }
}

async function atualizar(req, res, next) {
    try {
        if (invalidos(req, res)) return;
        const escopo = await model.buscarEscopo(req.params.id_conteudo);
        if (!escopo) return res.status(404).json({ mensagem: 'Conteúdo não encontrado.' });
        if (!await podeAdministrar(req, escopo.id_turma)) {
            return res.status(403).json({ mensagem: 'Sem permissão para alterar este conteúdo.' });
        }
        await model.atualizar(req.params.id_conteudo, req.body);
        return res.status(200).json({ mensagem: 'Conteúdo atualizado com sucesso.' });
    } catch (error) {
        return next(error);
    }
}

async function remover(req, res, next) {
    try {
        const escopo = await model.buscarEscopo(req.params.id_conteudo);
        if (!escopo) return res.status(404).json({ mensagem: 'Conteúdo não encontrado.' });
        if (!await podeAdministrar(req, escopo.id_turma)) {
            return res.status(403).json({ mensagem: 'Sem permissão para remover este conteúdo.' });
        }
        await model.remover(req.params.id_conteudo);
        return res.status(200).json({ mensagem: 'Conteúdo removido com sucesso.' });
    } catch (error) {
        return next(error);
    }
}

async function progresso(req, res, next) {
    try {
        if (invalidos(req, res)) return;
        const resultado = await model.registrarProgresso(
            req.user.id_usuario,
            req.params.id_conteudo,
            req.body.status
        );
        return res.status(200).json(resultado);
    } catch (error) {
        return next(error);
    }
}

async function turma(req, res, next) {
    try {
        if (invalidos(req, res)) return;
        const turmaEncontrada = await model.buscarTurma(req.params.id_turma);
        if (!turmaEncontrada) return res.status(404).json({ mensagem: 'Turma não encontrada.' });
        if (!await podeAdministrar(req, req.params.id_turma)) {
            return res.status(403).json({ mensagem: 'Sem permissão para consultar esta turma.' });
        }
        return res.status(200).json({ alunos: await model.listarProgressoTurma(req.params.id_turma) });
    } catch (error) {
        return next(error);
    }
}

module.exports = { listar, criar, atualizar, remover, progresso, turma };
