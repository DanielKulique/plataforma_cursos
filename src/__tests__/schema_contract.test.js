const {
    EXPECTED_COLUMNS,
    EXPECTED_ENUMS,
    REQUIRED_UNIQUE_INDEXES,
    assertCanonicalSchema
} = require('../../scripts/schema_contract');

function canonicalConnection(overrides = {}) {
    const tables = Object.keys(EXPECTED_COLUMNS).sort().map((TABLE_NAME) => ({ TABLE_NAME }));
    const columns = Object.entries(EXPECTED_COLUMNS).flatMap(([TABLE_NAME, names]) => names.map((COLUMN_NAME, index) => ({
        TABLE_NAME,
        COLUMN_NAME,
        ORDINAL_POSITION: index + 1,
        COLUMN_TYPE: EXPECTED_ENUMS[`${TABLE_NAME}.${COLUMN_NAME}`] || 'varchar(255)'
    })));
    const indexes = Object.entries(REQUIRED_UNIQUE_INDEXES).flatMap(([TABLE_NAME, definitions]) =>
        Object.entries(definitions).flatMap(([INDEX_NAME, names]) => names.map((COLUMN_NAME, index) => ({
            TABLE_NAME, INDEX_NAME, COLUMN_NAME, SEQ_IN_INDEX: index + 1, NON_UNIQUE: 0
        })))
    );

    return {
        query: jest.fn(async (sql) => {
            if (sql.includes('INFORMATION_SCHEMA.TABLES')) return [overrides.tables || tables];
            if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) return [overrides.columns || columns];
            if (sql.includes('INFORMATION_SCHEMA.STATISTICS')) return [overrides.indexes || indexes];
            throw new Error(`Consulta inesperada: ${sql}`);
        })
    };
}

describe('contrato do schema canônico', () => {
    it('aceita todas as tabelas, colunas, enums e índices esperados', async () => {
        await expect(assertCanonicalSchema(canonicalConnection(), 'plataforma_cursos_dev'))
            .resolves.toEqual({ database: 'plataforma_cursos_dev', tables: 15 });
    });

    it('detecta o drift legado id_usuario em Matriculas', async () => {
        const canonical = canonicalConnection();
        const [columns] = await canonical.query('INFORMATION_SCHEMA.COLUMNS');
        const legacyColumns = columns.map((column) => column.TABLE_NAME === 'Matriculas' && column.COLUMN_NAME === 'id_aluno'
            ? { ...column, COLUMN_NAME: 'id_usuario' }
            : column);

        await expect(assertCanonicalSchema(canonicalConnection({ columns: legacyColumns }), 'plataforma_cursos_dev'))
            .rejects.toMatchObject({ code: 'SCHEMA_INCOMPATIVEL' });
    });

    it('detecta tabela inesperada antes de qualquer migração automática', async () => {
        const connection = canonicalConnection({
            tables: [...Object.keys(EXPECTED_COLUMNS).map((TABLE_NAME) => ({ TABLE_NAME })), { TABLE_NAME: 'ProgressoAluno' }]
        });

        await expect(assertCanonicalSchema(connection, 'plataforma_cursos_dev'))
            .rejects.toThrow('tabelas inesperadas: ProgressoAluno');
    });
});
