const turmasModel = require('../api/models/turmas.models');
const matriculaModel = require('../api/models/matricula.models');

async function checkProfessorTurmaPermission(req, res, next) {
    try {
        if (req.user?.tipo === 'ADMIN') {
            return next();
        }

        if (req.user?.tipo !== 'PROFESSOR') {
            return res.status(403).json({
                mensagem: 'Acesso negado. Você não tem permissão para acessar esse recurso.'
            });
        }

        const id_turma = req.params.id_turma;
        const permitido = await turmasModel.professorEhDaTurma(req.user.id_usuario, id_turma);

        if (!permitido) {
            return res.status(403).json({
                mensagem: 'Acesso negado. Professor sem permissão para esta turma.'
            });
        }

        return next();
    } catch (error) {
        return res.status(500).json({ mensagem: 'Ocorreu um erro no servidor.' });
    }
}

async function checkProfessorMatriculaPermission(req, res, next) {
    try {
        if (req.user?.tipo === 'ADMIN') {
            return next();
        }

        if (req.user?.tipo !== 'PROFESSOR') {
            return res.status(403).json({
                mensagem: 'Acesso negado. Você não tem permissão para acessar esse recurso.'
            });
        }

        const id_matricula = req.params.id;
        const permitido = await matriculaModel.professorPodeGerenciarMatricula(
            req.user.id_usuario,
            id_matricula
        );

        if (!permitido) {
            return res.status(403).json({
                mensagem: 'Acesso negado. Professor sem permissão para esta matrícula.'
            });
        }

        return next();
    } catch (error) {
        return res.status(500).json({ mensagem: 'Ocorreu um erro no servidor.' });
    }
}

async function checkMatriculaReadPermission(req, res, next) {
    try {
        if (!req.user) {
            return res.status(401).json({ mensagem: 'Token inválido ou não fornecido.' });
        }

        if (req.user.tipo === 'ADMIN') {
            return next();
        }

        const id_matricula = req.params.id;
        const escopoMatricula = await matriculaModel.buscarEscopoMatriculaPorId(id_matricula);

        if (!escopoMatricula) {
            return res.status(404).json({ mensagem: 'Matrícula não encontrada.' });
        }

        if (req.user.tipo === 'ALUNO' && Number(escopoMatricula.id_aluno) === Number(req.user.id_usuario)) {
            return next();
        }

        if (req.user.tipo === 'PROFESSOR' && Number(escopoMatricula.id_professor) === Number(req.user.id_usuario)) {
            return next();
        }

        return res.status(403).json({
            mensagem: 'Acesso negado. Você não tem permissão para acessar esta matrícula.'
        });
    } catch (error) {
        return res.status(500).json({ mensagem: 'Ocorreu um erro no servidor.' });
    }
}

async function checkMatriculaCancelPermission(req, res, next) {
    try {
        if (!req.user) {
            return res.status(401).json({ mensagem: 'Token inválido ou não fornecido.' });
        }

        const id_matricula = req.params.id;
        const escopoMatricula = await matriculaModel.buscarEscopoMatriculaPorId(id_matricula);

        if (!escopoMatricula) {
            return res.status(404).json({ mensagem: 'Matrícula não encontrada.' });
        }

        if (req.user.tipo === 'ADMIN') {
            return next();
        }

        if (req.user.tipo === 'ALUNO' && Number(escopoMatricula.id_aluno) === Number(req.user.id_usuario)) {
            return next();
        }

        return res.status(403).json({
            mensagem: 'Acesso negado. Você não tem permissão para cancelar esta matrícula.'
        });
    } catch (error) {
        return res.status(500).json({ mensagem: 'Ocorreu um erro no servidor.' });
    }
}

module.exports = {
    checkProfessorTurmaPermission,
    checkProfessorMatriculaPermission,
    checkMatriculaReadPermission,
    checkMatriculaCancelPermission
};
