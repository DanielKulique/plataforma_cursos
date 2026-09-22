const { validationResult } = require('express-validator');
const fs = require('fs');
const path = require('path');
const model = require('../models/conteudos.models');
const materialUpload = require('../services/material-upload.service');
const {
    exigirGestaoEstrutural,
    exigirTurmaEditavel
} = require('../services/academic-access.service');
const { normalizeYouTubeEmbedUrl, toSafeUrl } = require('../../public/js/security-utils');

function invalidos(req, res) {
    const erros = validationResult(req);
    if (erros.isEmpty()) return false;
    res.status(400).json({ erros: erros.array() });
    return true;
}

async function autorizarLeitura(req, res, idTurma) {
    const turma = await model.buscarTurma(idTurma);
    if (!turma) {
        res.status(404).json({ mensagem: 'Turma não encontrada.' });
        return false;
    }
    if (req.user.tipo === 'ALUNO') {
        if (turma.status === 'ENCERRADA') {
            res.status(403).json({ mensagem: 'Esta turma está encerrada.' });
            return false;
        }
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
        if (conteudo.tipo === 'PDF') {
            const arquivoAtual = conteudo.id_arquivo_material ? {
                nome_original: conteudo.arquivo_original_name,
                tamanho_bytes: Number(conteudo.arquivo_size_bytes)
            } : (conteudo.url ? {
                nome_original: path.posix.basename(conteudo.url),
                tamanho_bytes: null,
                legado: true
            } : null);
            const protegido = { ...conteudo };
            delete protegido.arquivo_original_name;
            delete protegido.arquivo_size_bytes;
            return {
                ...protegido,
                url: `/api/conteudos/${conteudo.id_conteudo}/material`,
                url_bloqueada: false,
                arquivo_atual: arquivoAtual
            };
        }
        if (!conteudo.url) return conteudo;
        if (conteudo.tipo === 'VIDEO') {
            const embed = normalizeYouTubeEmbedUrl(conteudo.url);
            return { ...conteudo, url: embed, url_bloqueada: !embed };
        }
        const permitida = toSafeUrl(conteudo.url, { baseUrl: 'http://localhost' });
        return {
            ...conteudo,
            url: permitida ? conteudo.url : null,
            url_bloqueada: !permitida
        };
    });
}

async function material(req, res, next) {
    try {
        if (invalidos(req, res)) return;
        const conteudo = await model.buscarMaterial(req.params.id_conteudo);
        if (!conteudo) return res.status(404).json({ mensagem: 'Conteúdo não encontrado.' });
        if (conteudo.tipo !== 'PDF') {
            return res.status(409).json({ mensagem: 'O conteúdo solicitado não é um PDF.' });
        }
        if (!await autorizarLeitura(req, res, conteudo.id_turma)) return;

        if (conteudo.id_arquivo_material) {
            if (conteudo.status_arquivo !== 'ATIVO') {
                return res.status(503).json({ code: 'ARQUIVO_INDISPONIVEL', mensagem: 'Arquivo PDF indisponível.' });
            }
            return require('../services/private-download.service').sendPrivatePdf(
                res, require('../../config/material-storage').obterDiretorioMateriais(),
                conteudo.storage_name, 'materials',
                materialUpload.formatarContentDisposition(conteudo.original_name)
            );
        }

        const caminhoPublico = String(conteudo.url || '');
        const nomeArquivo = path.posix.basename(caminhoPublico);
        if (
            !caminhoPublico.startsWith('/assets/materiais/')
            || !/^[a-z0-9][a-z0-9._-]*\.pdf$/i.test(nomeArquivo)
            || caminhoPublico !== `/assets/materiais/${nomeArquivo}`
        ) {
            return res.status(422).json({ mensagem: 'O PDF não possui uma referência local válida.' });
        }

        const caminhoAbsoluto = path.join(__dirname, '..', '..', 'public', 'assets', 'materiais', nomeArquivo);
        if (!fs.existsSync(caminhoAbsoluto)) {
            return res.status(404).json({ mensagem: 'Arquivo PDF não encontrado.' });
        }
        res.set('Cache-Control', 'private, no-store');
        res.set('Content-Disposition', `inline; filename="${nomeArquivo}"`);
        return res.sendFile(caminhoAbsoluto);
    } catch (error) {
        return next(error);
    }
}

async function autorizarUploadTurma(req, res, next) {
    try {
        if (invalidos(req, res)) return;
        const turma = await model.buscarTurma(req.params.id_turma);
        if (!turma) return res.status(404).json({ mensagem: 'Turma não encontrada.' });
        exigirGestaoEstrutural(req.user, turma);
        exigirTurmaEditavel(turma);
        return next();
    } catch (error) {
        return next(error);
    }
}

async function autorizarUploadConteudo(req, res, next) {
    try {
        if (invalidos(req, res)) return;
        const escopo = await model.buscarEscopo(req.params.id_conteudo);
        if (!escopo) return res.status(404).json({ mensagem: 'Conteúdo não encontrado.' });
        exigirGestaoEstrutural(req.user, escopo);
        exigirTurmaEditavel(escopo);
        return next();
    } catch (error) {
        return next(error);
    }
}

async function criarPdf(req, res, next) {
    let preparado;
    try {
        if (invalidos(req, res)) {
            await materialUpload.removerArquivo(req.file?.path);
            return;
        }
        preparado = await materialUpload.prepararArquivoPdf(req.file);
        const conteudo = await model.criarPdfComArquivo(
            req.params.id_turma,
            req.body,
            preparado,
            req.user
        );
        conteudo.url = `/api/conteudos/${conteudo.id_conteudo}/material`;
        return res.status(201).json({ conteudo });
    } catch (error) {
        return next(error);
    }
}

async function substituirPdf(req, res, next) {
    let preparado;
    try {
        if (invalidos(req, res)) {
            await materialUpload.removerArquivo(req.file?.path);
            return;
        }
        preparado = await materialUpload.prepararArquivoPdf(req.file);
        const conteudo = await model.substituirPdfComArquivo(
            req.params.id_conteudo,
            req.body,
            preparado,
            req.user
        );
        conteudo.url = `/api/conteudos/${conteudo.id_conteudo}/material`;
        return res.status(200).json({ conteudo, mensagem: 'PDF substituído com sucesso.' });
    } catch (error) {
        return next(error);
    }
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

async function criarModulo(req, res, next) {
    try {
        if (invalidos(req, res)) return;
        const turma = await model.buscarTurma(req.params.id_turma);
        if (!turma) return res.status(404).json({ mensagem: 'Turma não encontrada.' });
        exigirGestaoEstrutural(req.user, turma);
        exigirTurmaEditavel(turma);
        return res.status(201).json({ modulo: await model.criarModulo(req.params.id_turma, req.body, req.user) });
    } catch (error) {
        return next(error);
    }
}

async function atualizarModulo(req, res, next) {
    try {
        if (invalidos(req, res)) return;
        const escopo = await model.buscarEscopoModulo(req.params.id_modulo);
        if (!escopo) return res.status(404).json({ mensagem: 'Módulo não encontrado.' });
        exigirGestaoEstrutural(req.user, escopo);
        exigirTurmaEditavel(escopo);
        await model.atualizarModulo(req.params.id_modulo, req.body, req.user);
        return res.status(200).json({ mensagem: 'Módulo atualizado com sucesso.' });
    } catch (error) {
        return next(error);
    }
}

async function removerModulo(req, res, next) {
    try {
        if (invalidos(req, res)) return;
        const escopo = await model.buscarEscopoModulo(req.params.id_modulo);
        if (!escopo) return res.status(404).json({ mensagem: 'Módulo não encontrado.' });
        exigirGestaoEstrutural(req.user, escopo);
        exigirTurmaEditavel(escopo);
        await model.removerModulo(req.params.id_modulo, req.user);
        return res.status(200).json({ mensagem: 'Módulo removido com sucesso.' });
    } catch (error) {
        return next(error);
    }
}

async function criar(req, res, next) {
    try {
        if (invalidos(req, res)) return;
        const turma = await model.buscarTurma(req.params.id_turma);
        if (!turma) return res.status(404).json({ mensagem: 'Turma não encontrada.' });
        exigirGestaoEstrutural(req.user, turma);
        exigirTurmaEditavel(turma);
        return res.status(201).json({ conteudo: await model.criar(req.params.id_turma, req.body, req.user) });
    } catch (error) {
        return next(error);
    }
}

async function atualizar(req, res, next) {
    try {
        if (invalidos(req, res)) return;
        const escopo = await model.buscarEscopo(req.params.id_conteudo);
        if (!escopo) return res.status(404).json({ mensagem: 'Conteúdo não encontrado.' });
        exigirGestaoEstrutural(req.user, escopo);
        exigirTurmaEditavel(escopo);
        await model.atualizar(req.params.id_conteudo, req.body, req.user);
        return res.status(200).json({ mensagem: 'Conteúdo atualizado com sucesso.' });
    } catch (error) {
        return next(error);
    }
}

async function remover(req, res, next) {
    try {
        if (invalidos(req, res)) return;
        const escopo = await model.buscarEscopo(req.params.id_conteudo);
        if (!escopo) return res.status(404).json({ mensagem: 'Conteúdo não encontrado.' });
        exigirGestaoEstrutural(req.user, escopo);
        exigirTurmaEditavel(escopo);
        await model.remover(req.params.id_conteudo, req.user);
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
        exigirGestaoEstrutural(req.user, turmaEncontrada);
        return res.status(200).json({ alunos: await model.listarProgressoTurma(req.params.id_turma) });
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    listar,
    criarModulo,
    atualizarModulo,
    removerModulo,
    criar,
    atualizar,
    remover,
    progresso,
    turma,
    material,
    autorizarUploadTurma,
    autorizarUploadConteudo,
    criarPdf,
    substituirPdf
};
