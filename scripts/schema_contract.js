'use strict';

const EXPECTED_COLUMNS = Object.freeze({
    Usuarios: ['id_usuario', 'nome_completo', 'cpf', 'email', 'senha', 'telefone', 'tipo', 'data_cadastro'],
    EmailVerificacoes: ['id_verificacao', 'email', 'codigo', 'verificado', 'expira_em', 'criado_em'],
    Cursos: ['id_curso', 'nome_curso', 'descricao', 'carga_horaria'],
    Turmas: ['id_turma', 'id_curso', 'id_professor', 'nome_turma', 'data_inicio', 'data_fim', 'status'],
    Matriculas: ['id_matricula', 'id_aluno', 'id_turma', 'data_matricula', 'nota_final', 'status_aprovacao', 'progresso_percentual'],
    Questionarios: ['id_questionario', 'id_curso', 'id_turma', 'titulo', 'descricao', 'ativo', 'tipo'],
    Q_Perguntas: ['id_pergunta', 'id_questionario', 'texto_pergunta', 'tipo_pergunta', 'ordem', 'pontos'],
    Q_Opcoes: ['id_opcao', 'id_pergunta', 'texto_opcao', 'ordem', 'correta'],
    Q_Tentativas: ['id_tentativa', 'id_questionario', 'id_usuario', 'id_turma', 'pontuacao', 'percentual', 'acertos', 'total_perguntas', 'iniciada_em', 'finalizada_em'],
    Q_Respostas: ['id_resposta', 'id_pergunta', 'id_usuario', 'id_questionario', 'id_tentativa', 'resposta_texto', 'resposta_opcao', 'data_resposta', 'correta'],
    Modulos: ['id_modulo', 'id_turma', 'titulo', 'descricao', 'ordem'],
    Conteudos: ['id_conteudo', 'id_turma', 'id_modulo', 'titulo', 'descricao', 'tipo', 'url', 'corpo', 'duracao_minutos', 'ordem'],
    ConteudosProgresso: ['id_progresso', 'id_aluno', 'id_conteudo', 'status', 'iniciado_em', 'concluido_em'],
    AnalisesPlagio: ['id', 'usuario_id', 'trecho_texto', 'score_similaridade', 'fontes_encontradas', 'criado_em']
});

const EXPECTED_ENUMS = Object.freeze({
    'Usuarios.tipo': "enum('ALUNO','PROFESSOR','ADMIN')",
    'Turmas.status': "enum('ABERTA','FECHADA','ENCERRADA')",
    'Matriculas.status_aprovacao': "enum('CURSANDO','APROVADO','REPROVADO','CANCELADO')"
});

const REQUIRED_UNIQUE_INDEXES = Object.freeze({
    Matriculas: { uk_aluno_turma: ['id_aluno', 'id_turma'] },
    ConteudosProgresso: { uk_aluno_conteudo: ['id_aluno', 'id_conteudo'] }
});

function schemaError(details) {
    const error = new Error(`Schema incompatível com o contrato canônico: ${details.join('; ')}`);
    error.code = 'SCHEMA_INCOMPATIVEL';
    return error;
}

async function listTables(connection, database) {
    const [rows] = await connection.query(
        `SELECT TABLE_NAME
         FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
         ORDER BY TABLE_NAME`,
        [database]
    );
    return rows.map((row) => row.TABLE_NAME);
}

async function assertCanonicalSchema(connection, database) {
    const expectedTables = Object.keys(EXPECTED_COLUMNS).sort();
    const actualTables = await listTables(connection, database);
    const details = [];

    const missingTables = expectedTables.filter((table) => !actualTables.includes(table));
    const extraTables = actualTables.filter((table) => !expectedTables.includes(table));
    if (missingTables.length) details.push(`tabelas ausentes: ${missingTables.join(', ')}`);
    if (extraTables.length) details.push(`tabelas inesperadas: ${extraTables.join(', ')}`);

    const [columns] = await connection.query(
        `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, ORDINAL_POSITION
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = ?
         ORDER BY TABLE_NAME, ORDINAL_POSITION`,
        [database]
    );

    for (const [table, expected] of Object.entries(EXPECTED_COLUMNS)) {
        const actual = columns.filter((column) => column.TABLE_NAME === table).map((column) => column.COLUMN_NAME);
        if (actual.join('|') !== expected.join('|')) {
            details.push(`colunas de ${table}: esperado [${expected.join(', ')}], encontrado [${actual.join(', ')}]`);
        }
    }

    for (const [qualifiedName, expectedType] of Object.entries(EXPECTED_ENUMS)) {
        const [table, column] = qualifiedName.split('.');
        const actual = columns.find((item) => item.TABLE_NAME === table && item.COLUMN_NAME === column);
        if (!actual || String(actual.COLUMN_TYPE).toLowerCase() !== expectedType.toLowerCase()) {
            details.push(`${qualifiedName} deve ser ${expectedType}`);
        }
    }

    const [indexes] = await connection.query(
        `SELECT TABLE_NAME, INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX, NON_UNIQUE
         FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = ?
         ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
        [database]
    );

    for (const [table, requiredIndexes] of Object.entries(REQUIRED_UNIQUE_INDEXES)) {
        for (const [indexName, expectedColumns] of Object.entries(requiredIndexes)) {
            const actual = indexes
                .filter((index) => index.TABLE_NAME === table && index.INDEX_NAME === indexName && Number(index.NON_UNIQUE) === 0)
                .map((index) => index.COLUMN_NAME);
            if (actual.join('|') !== expectedColumns.join('|')) {
                details.push(`índice único ${table}.${indexName} deve usar [${expectedColumns.join(', ')}]`);
            }
        }
    }

    if (details.length) throw schemaError(details);
    return { database, tables: expectedTables.length };
}

module.exports = {
    EXPECTED_COLUMNS,
    EXPECTED_ENUMS,
    REQUIRED_UNIQUE_INDEXES,
    listTables,
    assertCanonicalSchema
};
