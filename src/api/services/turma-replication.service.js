'use strict';

const crypto = require('crypto');
const db = require('../../config/database');

const STATUS_TURMA = new Set(['ABERTA', 'FECHADA', 'ENCERRADA']);

function erroDominio(message, status, code) {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    return error;
}

function dataSomente(valor) {
    if (!valor) return null;
    if (valor instanceof Date) return valor.toISOString().slice(0, 10);
    return String(valor).slice(0, 10);
}

function normalizarDados(dados) {
    const normalizados = {
        nome_turma: String(dados.nome_turma || '').trim(),
        id_professor: Number(dados.id_professor),
        data_inicio: dataSomente(dados.data_inicio),
        data_fim: dataSomente(dados.data_fim),
        status: String(dados.status || 'ABERTA').toUpperCase()
    };
    if (!STATUS_TURMA.has(normalizados.status)) {
        throw erroDominio('Status de turma inválido.', 400, 'STATUS_INVALIDO');
    }
    if (normalizados.data_fim && normalizados.data_fim < normalizados.data_inicio) {
        throw erroDominio(
            'A data final deve ser igual ou posterior à data inicial.',
            400,
            'DATAS_INVALIDAS'
        );
    }
    return normalizados;
}

function resumoVazio() {
    return {
        modulos: 0,
        conteudos: 0,
        videos: 0,
        pdfs: 0,
        textos: 0,
        links: 0,
        atividades: 0,
        questionarios: 0,
        provas: 0,
        perguntas: 0,
        alternativas: 0
    };
}

function hashRequisicao(idTurmaOrigem, dados) {
    return crypto.createHash('sha256').update(JSON.stringify({
        id_turma_origem: Number(idTurmaOrigem),
        nome_turma: dados.nome_turma,
        id_professor: dados.id_professor,
        data_inicio: dados.data_inicio,
        data_fim: dados.data_fim,
        status: dados.status
    })).digest('hex');
}

async function buscarResumoCom(connection, idTurma, bloquear = false) {
    const sufixoBloqueio = bloquear ? ' FOR UPDATE' : '';
    const [turmas] = await connection.query(
        `SELECT id_turma, id_curso, id_professor, nome_turma, data_inicio, data_fim, status
         FROM Turmas
         WHERE id_turma = ?${sufixoBloqueio}`,
        [idTurma]
    );
    if (!turmas.length) {
        throw erroDominio('Turma de origem não encontrada.', 404, 'TURMA_ORIGEM_NAO_ENCONTRADA');
    }

    const [contagens] = await connection.query(
        `SELECT
            (SELECT COUNT(*) FROM Modulos WHERE id_turma = ?) AS modulos,
            (SELECT COUNT(*) FROM Conteudos WHERE id_turma = ?) AS conteudos,
            (SELECT COUNT(*) FROM Conteudos WHERE id_turma = ? AND tipo = 'VIDEO') AS videos,
            (SELECT COUNT(*) FROM Conteudos WHERE id_turma = ? AND tipo = 'PDF') AS pdfs,
            (SELECT COUNT(*) FROM Conteudos WHERE id_turma = ? AND tipo = 'TEXTO') AS textos,
            (SELECT COUNT(*) FROM Conteudos WHERE id_turma = ? AND tipo = 'LINK') AS links,
            (SELECT COUNT(*) FROM Conteudos WHERE id_turma = ? AND tipo = 'ATIVIDADE') AS atividades,
            (SELECT COUNT(*) FROM Questionarios WHERE id_turma = ? AND tipo = 'EXERCICIO') AS questionarios,
            (SELECT COUNT(*) FROM Questionarios WHERE id_turma = ? AND tipo = 'PROVA') AS provas,
            (SELECT COUNT(*) FROM Q_Perguntas p
               INNER JOIN Questionarios q ON q.id_questionario = p.id_questionario
             WHERE q.id_turma = ?) AS perguntas,
            (SELECT COUNT(*) FROM Q_Opcoes o
               INNER JOIN Q_Perguntas p ON p.id_pergunta = o.id_pergunta
               INNER JOIN Questionarios q ON q.id_questionario = p.id_questionario
             WHERE q.id_turma = ?) AS alternativas`,
        Array(11).fill(idTurma)
    );

    return {
        turma: turmas[0],
        resumo: Object.fromEntries(
            Object.entries({ ...resumoVazio(), ...contagens[0] })
                .map(([chave, valor]) => [chave, Number(valor) || 0])
        )
    };
}

async function buscarResumo(idTurma) {
    return buscarResumoCom(db, Number(idTurma));
}

function mesmaRequisicao(registro, requisicaoHash) {
    return registro.requisicao_hash === requisicaoHash;
}

async function buscarReplicacaoPorChave(connection, chaveIdempotencia) {
    const [rows] = await connection.query(
        `SELECT r.id_turma_origem, r.id_turma_destino, r.requisicao_hash,
                t.id_curso, t.id_professor, t.nome_turma, t.data_inicio, t.data_fim, t.status
         FROM ReplicacoesTurma r
         INNER JOIN Turmas t ON t.id_turma = r.id_turma_destino
         WHERE r.chave_idempotencia = ?`,
        [chaveIdempotencia]
    );
    return rows[0] || null;
}

async function respostaIdempotente(connection, registro, idTurmaOrigem, requisicaoHash) {
    if (!mesmaRequisicao(registro, requisicaoHash)) {
        throw erroDominio(
            'A chave de idempotência já foi utilizada com outros dados.',
            409,
            'CHAVE_IDEMPOTENCIA_REUTILIZADA'
        );
    }
    const { resumo } = await buscarResumoCom(connection, registro.id_turma_destino);
    return {
        turma: {
            id_turma: Number(registro.id_turma_destino),
            id_curso: Number(registro.id_curso),
            id_professor: Number(registro.id_professor),
            nome_turma: registro.nome_turma,
            data_inicio: dataSomente(registro.data_inicio),
            data_fim: dataSomente(registro.data_fim),
            status: registro.status,
            id_turma_origem: Number(idTurmaOrigem)
        },
        resumo,
        reutilizada: true
    };
}

async function validarProfessor(connection, idProfessor) {
    const [usuarios] = await connection.query(
        'SELECT id_usuario, tipo FROM Usuarios WHERE id_usuario = ? FOR UPDATE',
        [idProfessor]
    );
    if (!usuarios.length) {
        throw erroDominio('Professor não encontrado.', 404, 'PROFESSOR_NAO_ENCONTRADO');
    }
    if (usuarios[0].tipo !== 'PROFESSOR') {
        throw erroDominio(
            'O usuário associado à nova turma deve possuir papel PROFESSOR.',
            409,
            'USUARIO_NAO_PROFESSOR'
        );
    }
}

async function carregarEstrutura(connection, idTurma) {
    // Certificados são documentos acadêmicos individuais e, intencionalmente,
    // não fazem parte da estrutura replicável de uma turma.
    const [modulos] = await connection.query(
        `SELECT id_modulo, titulo, descricao, ordem
         FROM Modulos WHERE id_turma = ? ORDER BY ordem, id_modulo FOR UPDATE`,
        [idTurma]
    );
    const [conteudos] = await connection.query(
        `SELECT id_conteudo, id_modulo, titulo, descricao, tipo, id_arquivo_material,
                url, corpo, duracao_minutos, ordem
         FROM Conteudos WHERE id_turma = ? ORDER BY ordem, id_conteudo FOR UPDATE`,
        [idTurma]
    );
    const [questionarios] = await connection.query(
        `SELECT id_questionario, id_curso, titulo, descricao, ativo, tipo, id_modulo, ordem, prova_final
         FROM Questionarios WHERE id_turma = ? ORDER BY ordem, tipo, titulo FOR UPDATE`,
        [idTurma]
    );

    let perguntas = [];
    let alternativas = [];
    let itensAssociacao = [];
    let gabaritosAssociacao = [];
    if (questionarios.length) {
        const placeholders = questionarios.map(() => '?').join(', ');
        const ids = questionarios.map((item) => item.id_questionario);
        [perguntas] = await connection.query(
            `SELECT id_pergunta, id_questionario, texto_pergunta, tipo_pergunta, ordem, pontos, resposta_booleana
             FROM Q_Perguntas
             WHERE id_questionario IN (${placeholders})
             ORDER BY id_questionario, ordem, id_pergunta FOR UPDATE`,
            ids
        );
        if (perguntas.length) {
            const placeholdersPerguntas = perguntas.map(() => '?').join(', ');
            [alternativas] = await connection.query(
                `SELECT id_opcao, id_pergunta, texto_opcao, ordem, correta
                 FROM Q_Opcoes
                 WHERE id_pergunta IN (${placeholdersPerguntas})
                 ORDER BY id_pergunta, ordem, id_opcao FOR UPDATE`,
                perguntas.map((item) => item.id_pergunta)
            );
            [itensAssociacao] = await connection.query(
                `SELECT id_item, id_pergunta, lado, texto, ordem
                 FROM Q_AssociacaoItens
                 WHERE id_pergunta IN (${placeholdersPerguntas})
                 ORDER BY id_pergunta, lado, ordem, id_item FOR UPDATE`,
                perguntas.map((item) => item.id_pergunta)
            );
            [gabaritosAssociacao] = await connection.query(
                `SELECT id_pergunta, id_item_esquerda, id_item_direita
                 FROM Q_AssociacaoGabaritos
                 WHERE id_pergunta IN (${placeholdersPerguntas}) FOR UPDATE`,
                perguntas.map((item) => item.id_pergunta)
            );
        }
    }
    return { modulos, conteudos, questionarios, perguntas, alternativas, itensAssociacao, gabaritosAssociacao };
}

async function copiarEstrutura(connection, origem, idTurmaDestino) {
    const mapaModulos = new Map();
    const mapaQuestionarios = new Map();
    const mapaPerguntas = new Map();
    const mapaItensAssociacao = new Map();

    for (const modulo of origem.modulos) {
        const [result] = await connection.query(
            'INSERT INTO Modulos (id_turma, titulo, descricao, ordem) VALUES (?, ?, ?, ?)',
            [idTurmaDestino, modulo.titulo, modulo.descricao, modulo.ordem]
        );
        mapaModulos.set(Number(modulo.id_modulo), result.insertId);
    }

    for (const conteudo of origem.conteudos) {
        const novoModulo = conteudo.id_modulo === null
            ? null
            : mapaModulos.get(Number(conteudo.id_modulo));
        if (conteudo.id_modulo !== null && !novoModulo) {
            throw erroDominio(
                'A estrutura de conteúdo da turma de origem está inconsistente.',
                409,
                'ESTRUTURA_ORIGEM_INCONSISTENTE'
            );
        }
        if (conteudo.id_arquivo_material) {
            const [[asset]] = await connection.query(
                'SELECT status FROM ArquivosMateriais WHERE id_arquivo_material = ? FOR SHARE',
                [conteudo.id_arquivo_material]
            );
            if (!asset || asset.status !== 'ATIVO') {
                throw Object.assign(new Error('Material da origem indisponível para replicação.'), { code: 'MATERIAL_INDISPONIVEL', status: 409 });
            }
        }
        await connection.query(
            `INSERT INTO Conteudos
             (id_turma, id_modulo, titulo, descricao, tipo, id_arquivo_material,
              url, corpo, duracao_minutos, ordem)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                idTurmaDestino, novoModulo, conteudo.titulo, conteudo.descricao,
                conteudo.tipo, conteudo.id_arquivo_material, conteudo.url,
                conteudo.corpo, conteudo.duracao_minutos,
                conteudo.ordem
            ]
        );
    }

    for (const questionario of origem.questionarios) {
        const novoModulo = questionario.id_modulo == null ? null : mapaModulos.get(Number(questionario.id_modulo));
        if (questionario.id_modulo != null && !novoModulo) {
            throw erroDominio('Avaliação vinculada a aula de outra turma.', 409, 'ESTRUTURA_ORIGEM_INCONSISTENTE');
        }
        const [result] = await connection.query(
            `INSERT INTO Questionarios (id_curso, id_turma, titulo, descricao, ativo, tipo, id_modulo, ordem, prova_final)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                questionario.id_curso, idTurmaDestino, questionario.titulo,
                questionario.descricao, questionario.ativo, questionario.tipo, novoModulo, questionario.ordem, questionario.prova_final || null
            ]
        );
        mapaQuestionarios.set(Number(questionario.id_questionario), result.insertId);
    }

    for (const pergunta of origem.perguntas) {
        const novoQuestionario = mapaQuestionarios.get(Number(pergunta.id_questionario));
        if (!novoQuestionario) {
            throw erroDominio(
                'A estrutura de avaliação da turma de origem está inconsistente.',
                409,
                'ESTRUTURA_ORIGEM_INCONSISTENTE'
            );
        }
        const [result] = await connection.query(
            `INSERT INTO Q_Perguntas
             (id_questionario, texto_pergunta, tipo_pergunta, ordem, pontos, resposta_booleana)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                novoQuestionario, pergunta.texto_pergunta, pergunta.tipo_pergunta,
                pergunta.ordem, pergunta.pontos, pergunta.resposta_booleana
            ]
        );
        mapaPerguntas.set(Number(pergunta.id_pergunta), result.insertId);
    }

    for (const alternativa of origem.alternativas) {
        const novaPergunta = mapaPerguntas.get(Number(alternativa.id_pergunta));
        if (!novaPergunta) {
            throw erroDominio(
                'A estrutura de alternativas da turma de origem está inconsistente.',
                409,
                'ESTRUTURA_ORIGEM_INCONSISTENTE'
            );
        }
        await connection.query(
            `INSERT INTO Q_Opcoes (id_pergunta, texto_opcao, ordem, correta)
             VALUES (?, ?, ?, ?)`,
            [novaPergunta, alternativa.texto_opcao, alternativa.ordem, alternativa.correta]
        );
    }

    for (const item of origem.itensAssociacao) {
        const novaPergunta = mapaPerguntas.get(Number(item.id_pergunta));
        if (!novaPergunta) {
            throw erroDominio('A associação da turma de origem está inconsistente.', 409, 'ESTRUTURA_ORIGEM_INCONSISTENTE');
        }
        const novoItem = crypto.randomUUID();
        await connection.query(
            `INSERT INTO Q_AssociacaoItens (id_item, id_pergunta, lado, texto, ordem)
             VALUES (?, ?, ?, ?, ?)`,
            [novoItem, novaPergunta, item.lado, item.texto, item.ordem]
        );
        mapaItensAssociacao.set(item.id_item, novoItem);
    }
    for (const gabarito of origem.gabaritosAssociacao) {
        const novaPergunta = mapaPerguntas.get(Number(gabarito.id_pergunta));
        const esquerda = mapaItensAssociacao.get(gabarito.id_item_esquerda);
        const direita = mapaItensAssociacao.get(gabarito.id_item_direita);
        if (!novaPergunta || !esquerda || !direita) {
            throw erroDominio('O gabarito de associação da turma de origem está inconsistente.', 409, 'ESTRUTURA_ORIGEM_INCONSISTENTE');
        }
        await connection.query(
            `INSERT INTO Q_AssociacaoGabaritos (id_pergunta, id_item_esquerda, id_item_direita)
             VALUES (?, ?, ?)`,
            [novaPergunta, esquerda, direita]
        );
    }
}

function resumirEstrutura(estrutura) {
    const resumo = resumoVazio();
    resumo.modulos = estrutura.modulos.length;
    resumo.conteudos = estrutura.conteudos.length;
    resumo.questionarios = estrutura.questionarios.filter((item) => item.tipo === 'EXERCICIO').length;
    resumo.provas = estrutura.questionarios.filter((item) => item.tipo === 'PROVA').length;
    resumo.perguntas = estrutura.perguntas.length;
    resumo.alternativas = estrutura.alternativas.length;
    const mapaTipos = { VIDEO: 'videos', PDF: 'pdfs', TEXTO: 'textos', LINK: 'links', ATIVIDADE: 'atividades' };
    for (const conteudo of estrutura.conteudos) {
        if (mapaTipos[conteudo.tipo]) resumo[mapaTipos[conteudo.tipo]] += 1;
    }
    return resumo;
}

async function replicarTurma(idTurmaOrigem, dadosRecebidos, contexto) {
    const idOrigem = Number(idTurmaOrigem);
    const idAdmin = Number(contexto.id_usuario_admin);
    const chaveIdempotencia = String(contexto.chave_idempotencia || '').trim();
    const dados = normalizarDados(dadosRecebidos);
    const requisicaoHash = hashRequisicao(idOrigem, dados);
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();
        const existente = await buscarReplicacaoPorChave(connection, chaveIdempotencia);
        if (existente) {
            const resposta = await respostaIdempotente(connection, existente, idOrigem, requisicaoHash);
            await connection.commit();
            return resposta;
        }

        const { turma: turmaOrigem } = await buscarResumoCom(connection, idOrigem, true);
        await validarProfessor(connection, dados.id_professor);
        const estrutura = await carregarEstrutura(connection, idOrigem);
        const [result] = await connection.query(
            `INSERT INTO Turmas
             (id_curso, id_professor, nome_turma, data_inicio, data_fim, status)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
                turmaOrigem.id_curso, dados.id_professor, dados.nome_turma,
                dados.data_inicio, dados.data_fim, dados.status
            ]
        );
        const idDestino = result.insertId;
        await copiarEstrutura(connection, estrutura, idDestino);
        await connection.query(
            `INSERT INTO ReplicacoesTurma
             (id_turma_origem, id_turma_destino, id_usuario_admin, chave_idempotencia, requisicao_hash)
             VALUES (?, ?, ?, ?, ?)`,
            [idOrigem, idDestino, idAdmin, chaveIdempotencia, requisicaoHash]
        );
        await connection.commit();
        return {
            turma: {
                id_turma: idDestino,
                id_curso: Number(turmaOrigem.id_curso),
                ...dados,
                id_turma_origem: idOrigem
            },
            resumo: resumirEstrutura(estrutura),
            reutilizada: false
        };
    } catch (error) {
        await connection.rollback().catch(() => undefined);

        if (error?.errno === 1062) {
            const existente = await buscarReplicacaoPorChave(db, chaveIdempotencia);
            if (existente) return respostaIdempotente(db, existente, idOrigem, requisicaoHash);
            throw erroDominio('Já existe uma turma com esse nome.', 409, 'TURMA_DUPLICADA');
        }
        if (error?.errno === 1451 || error?.errno === 1452) {
            throw erroDominio(
                'A estrutura da turma possui vínculos incompatíveis com a replicação.',
                409,
                'TURMA_COM_VINCULOS'
            );
        }
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = {
    buscarResumo,
    replicarTurma
};
