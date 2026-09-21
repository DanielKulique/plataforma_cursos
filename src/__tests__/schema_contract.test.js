const { normalizeColumn, validateCanonicalSchema } = require('../../scripts/schema_contract');

const baseRows = Object.freeze({
    tables: [{ TABLE_NAME: 'Example', ENGINE: 'InnoDB', TABLE_COLLATION: 'utf8mb4_unicode_ci' }],
    columns: [{
        TABLE_NAME: 'Example', COLUMN_NAME: 'id', ORDINAL_POSITION: 1,
        COLUMN_TYPE: 'bigint unsigned', IS_NULLABLE: 'NO', COLUMN_DEFAULT: null,
        EXTRA: 'auto_increment', GENERATION_EXPRESSION: '', CHARACTER_SET_NAME: null, COLLATION_NAME: null
    }],
    indexes: [{
        TABLE_NAME: 'Example', INDEX_NAME: 'PRIMARY', NON_UNIQUE: 0, INDEX_TYPE: 'BTREE',
        SEQ_IN_INDEX: 1, COLUMN_NAME: 'id', SUB_PART: null, COLLATION: 'A'
    }],
    foreignKeys: [],
    checks: [{ TABLE_NAME: 'Example', CONSTRAINT_NAME: 'chk_example_id', CHECK_CLAUSE: '(`id` > 0)' }]
});

const contract = Object.freeze({
    expectedVersion: 12,
    tables: {
        Example: {
            engine: 'innodb',
            collation: 'utf8mb4_unicode_ci',
            columns: [{
                name: 'id', ordinal: 1, type: 'bigint unsigned', nullable: false, default: null,
                extra: 'auto_increment', generationExpression: '', characterSet: null, collation: null
            }],
            indexes: [{
                name: 'PRIMARY', unique: true, type: 'btree',
                columns: [{ name: 'id', ordinal: 1, prefixLength: null, order: 'A' }]
            }],
            foreignKeys: [],
            checks: [{ name: 'chk_example_id', clause: 'id > 0' }]
        }
    }
});

function connection(overrides = {}) {
    const rows = { ...baseRows, ...overrides };
    return {
        query: jest.fn(async (sql) => {
            if (sql.includes('INFORMATION_SCHEMA.TABLES')) return [rows.tables];
            if (sql.includes('INFORMATION_SCHEMA.COLUMNS')) return [rows.columns];
            if (sql.includes('INFORMATION_SCHEMA.STATISTICS')) return [rows.indexes];
            if (sql.includes('REFERENTIAL_CONSTRAINTS')) return [rows.foreignKeys];
            if (sql.includes('CHECK_CONSTRAINTS')) return [rows.checks];
            throw new Error(`Consulta inesperada: ${sql}`);
        })
    };
}

describe('contrato estrutural completo do schema', () => {
    it('normaliza sintaxe SQL sem apagar a caixa de literais semânticos', () => {
        expect(normalizeColumn({
            ...baseRows.columns[0],
            COLUMN_TYPE: "ENUM('ATIVO','Revogado')",
            COLUMN_DEFAULT: 'ATIVO'
        })).toMatchObject({ type: "enum('ATIVO','Revogado')", default: 'ATIVO' });
    });

    it('valida engine, colunas, PK e CHECK com output contável', async () => {
        await expect(validateCanonicalSchema(connection(), 'test', { contract })).resolves.toMatchObject({
            status: 'ok', tablesChecked: 1, columnsChecked: 1, indexesChecked: 1,
            primaryKeysChecked: 1, checksChecked: 1, errors: []
        });
    });

    it.each([
        ['tipo', { columns: [{ ...baseRows.columns[0], COLUMN_TYPE: 'int' }] }, 'COLUMN_DEFINITION_MISMATCH'],
        ['nullable', { columns: [{ ...baseRows.columns[0], IS_NULLABLE: 'YES' }] }, 'COLUMN_DEFINITION_MISMATCH'],
        ['primary key', { indexes: [] }, 'INDEX_MISSING'],
        ['check', { checks: [] }, 'CHECK_MISSING']
    ])('detecta drift de %s', async (_label, overrides, expectedType) => {
        const result = await validateCanonicalSchema(connection(overrides), 'test', { contract });
        expect(result.status).toBe('error');
        expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ type: expectedType })]));
    });

    it('trata tabela extra como erro sem tentar apagá-la', async () => {
        const result = await validateCanonicalSchema(connection({
            tables: [...baseRows.tables, { TABLE_NAME: 'Surpresa', ENGINE: 'InnoDB', TABLE_COLLATION: 'utf8mb4_unicode_ci' }]
        }), 'test', { contract });
        expect(result.errors).toEqual(expect.arrayContaining([
            expect.objectContaining({ type: 'UNEXPECTED_TABLE', table: 'Surpresa' })
        ]));
    });
});
