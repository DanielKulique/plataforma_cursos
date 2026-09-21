'use strict';

function academicAccessError(code, status, message) {
    const error = new Error(message);
    error.code = code;
    error.status = status;
    return error;
}

function exigirGestaoEstrutural(usuario, turma) {
    if (!usuario?.id_usuario) throw academicAccessError('IDENTIDADE_OBRIGATORIA', 401, 'Autenticação necessária.');
    if (usuario.tipo === 'ADMIN') return;
    if (
        usuario?.tipo === 'PROFESSOR'
        && Number(turma?.id_professor) === Number(usuario.id_usuario)
    ) return;

    throw academicAccessError(
        'GESTAO_ACADEMICA_NEGADA',
        403,
        'Sem permissão para administrar a estrutura acadêmica desta turma.'
    );
}

function exigirTurmaEditavel(turma) {
    if (turma?.status !== 'ENCERRADA' && turma?.status_turma !== 'ENCERRADA') return;

    throw academicAccessError(
        'TURMA_ENCERRADA',
        409,
        'Reabra a turma antes de alterar sua estrutura acadêmica.'
    );
}

// Apenas identificadores internos; nunca interpolar nomes recebidos da requisição.
const RECURSOS = {
    modulo: { tabela: 'Modulos', chave: 'id_modulo', nome: 'Módulo', code: 'MODULO_NAO_ENCONTRADO' },
    conteudo: { tabela: 'Conteudos', chave: 'id_conteudo', nome: 'Conteúdo', code: 'CONTEUDO_NAO_ENCONTRADO' },
    questionario: { tabela: 'Questionarios', chave: 'id_questionario', nome: 'Questionário', code: 'QUESTIONARIO_NAO_ENCONTRADO' },
    pergunta: { tabela: 'Q_Perguntas', chave: 'id_pergunta', nome: 'Pergunta', code: 'PERGUNTA_NAO_ENCONTRADA', pai: 'questionario' },
    opcao: { tabela: 'Q_Opcoes', chave: 'id_opcao', nome: 'Alternativa', code: 'OPCAO_NAO_ENCONTRADA', pai: 'pergunta' }
};

async function bloquearTurma(connection, idTurma) {
    const [[turma]] = await connection.query(
        'SELECT * FROM Turmas WHERE id_turma = ? FOR UPDATE', [idTurma]
    );
    if (!turma) throw academicAccessError('TURMA_NAO_ENCONTRADA', 404, 'Turma não encontrada.');
    return turma;
}

// Descoberta antes de BEGIN evita snapshot antigo ao aguardar a turma.
// A matrícula não muda de turma; o chamador relê e bloqueia a matrícula depois.
async function iniciarTransacaoMatricula(connection, idMatricula) {
    const [[matricula]] = await connection.query(
        'SELECT id_turma FROM Matriculas WHERE id_matricula = ?', [idMatricula]
    );
    await connection.beginTransaction();
    return matricula ? bloquearTurma(connection, matricula.id_turma) : null;
}

async function lockTurmaParaMutacao(connection, idTurma, usuario) {
    const turma = await bloquearTurma(connection, idTurma);
    exigirGestaoEstrutural(usuario, turma);
    exigirTurmaEditavel(turma);
    return turma;
}

// Descoberta sem autorização, ANTES de BEGIN: não cria snapshot REPEATABLE READ
// obsoleto enquanto espera o lock. Cada vínculo será relido sob lock, de pai a filho.
async function localizarRecurso(connection, tipo, id) {
    const recurso = RECURSOS[tipo];
    const [[row]] = await connection.query(
        `SELECT * FROM ${recurso.tabela} WHERE ${recurso.chave} = ?`, [id]
    );
    if (!row) throw academicAccessError(recurso.code, 404, `${recurso.nome} não encontrado(a).`);
    const pais = recurso.pai
        ? await localizarRecurso(connection, recurso.pai, row[RECURSOS[recurso.pai].chave])
        : { idTurma: row.id_turma, cadeia: [] };
    return { idTurma: pais.idTurma, cadeia: [...pais.cadeia, { tipo, row }] };
}

async function bloquearRecurso(connection, contexto) {
    let atual;
    for (const { tipo, row } of contexto.cadeia) {
        const recurso = RECURSOS[tipo];
        const vinculo = recurso.pai ? RECURSOS[recurso.pai].chave : 'id_turma';
        const [[registro]] = await connection.query(
            `SELECT * FROM ${recurso.tabela} WHERE ${recurso.chave} = ? AND ${vinculo} = ? FOR UPDATE`,
            [row[recurso.chave], row[vinculo]]
        );
        if (!registro) throw academicAccessError(recurso.code, 404, `${recurso.nome} não encontrado(a).`);
        atual = registro;
    }
    return atual;
}

async function iniciarMutacaoRecurso(connection, tipo, id, usuario) {
    const contexto = await localizarRecurso(connection, tipo, id);
    await connection.beginTransaction();
    const turma = await lockTurmaParaMutacao(connection, contexto.idTurma, usuario);
    const recurso = await bloquearRecurso(connection, contexto);
    return { ...recurso, id_turma: turma.id_turma, status_turma: turma.status };
}

module.exports = {
    exigirGestaoEstrutural, exigirTurmaEditavel, bloquearTurma, iniciarTransacaoMatricula,
    lockTurmaParaMutacao, localizarRecurso, bloquearRecurso, iniciarMutacaoRecurso
};
