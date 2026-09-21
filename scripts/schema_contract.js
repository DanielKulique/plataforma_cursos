'use strict';

const path = require('path');

const CONTRACT_PATH = path.join(__dirname, 'schema-contract.json');
const TECHNICAL_TABLES = Object.freeze(['environment_identity', 'schema_migrations']);

function normalizeText(value) {
    return value === null || value === undefined
        ? null
        : String(value).replace(/[`]/g, '').replace(/\s+/g, ' ').trim();
}

function normalizeSql(value) {
    const text = normalizeText(value);
    if (text === null) return null;
    let result = '';
    let cursor = 0;
    for (const match of text.matchAll(/'(?:''|[^'])*'/g)) {
        result += text.slice(cursor, match.index).toLowerCase();
        result += match[0];
        cursor = match.index + match[0].length;
    }
    return result + text.slice(cursor).toLowerCase();
}

function normalizeDefault(value) {
    if (value === null || value === undefined) return null;
    const normalized = normalizeText(value).replace(/^'(.*)'$/s, '$1');
    return /^current_timestamp(?:[(]\d+[)])?$/i.test(normalized) ? normalized.toLowerCase() : normalized;
}

function normalizeColumn(row) {
    return {
        name: String(row.COLUMN_NAME),
        ordinal: Number(row.ORDINAL_POSITION),
        type: normalizeSql(row.COLUMN_TYPE),
        nullable: String(row.IS_NULLABLE).toUpperCase() === 'YES',
        default: normalizeDefault(row.COLUMN_DEFAULT),
        extra: normalizeSql(row.EXTRA) || '',
        generationExpression: normalizeSql(row.GENERATION_EXPRESSION) || '',
        characterSet: row.CHARACTER_SET_NAME ? String(row.CHARACTER_SET_NAME).toLowerCase() : null,
        collation: row.COLLATION_NAME ? String(row.COLLATION_NAME).toLowerCase() : null
    };
}

function normalizeCheckClause(value) {
    let normalized = normalizeSql(value) || '';
    while (normalized.startsWith('(') && normalized.endsWith(')')) {
        let depth = 0;
        let enclosesWholeExpression = true;
        for (let index = 0; index < normalized.length; index += 1) {
            if (normalized[index] === '(') depth += 1;
            if (normalized[index] === ')') depth -= 1;
            if (depth === 0 && index < normalized.length - 1) {
                enclosesWholeExpression = false;
                break;
            }
        }
        if (!enclosesWholeExpression) break;
        normalized = normalized.slice(1, -1).trim();
    }
    return normalized;
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

async function readSchemaMetadata(connection, database) {
    const [tableRows] = await connection.query(
        `SELECT TABLE_NAME, ENGINE, TABLE_COLLATION
         FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
         ORDER BY TABLE_NAME`,
        [database]
    );
    const [columnRows] = await connection.query(
        `SELECT TABLE_NAME, COLUMN_NAME, ORDINAL_POSITION, COLUMN_TYPE, IS_NULLABLE,
                COLUMN_DEFAULT, EXTRA, GENERATION_EXPRESSION, CHARACTER_SET_NAME, COLLATION_NAME
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = ?
         ORDER BY TABLE_NAME, ORDINAL_POSITION`,
        [database]
    );
    const [indexRows] = await connection.query(
        `SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, INDEX_TYPE, SEQ_IN_INDEX,
                COLUMN_NAME, SUB_PART, COLLATION
         FROM INFORMATION_SCHEMA.STATISTICS
         WHERE TABLE_SCHEMA = ?
         ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
        [database]
    );
    const [foreignKeyRows] = await connection.query(
        `SELECT k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION, k.COLUMN_NAME,
                k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME,
                r.UPDATE_RULE, r.DELETE_RULE
         FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE k
         JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS r
           ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
          AND r.TABLE_NAME = k.TABLE_NAME
          AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
         WHERE k.CONSTRAINT_SCHEMA = ? AND k.REFERENCED_TABLE_NAME IS NOT NULL
         ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION`,
        [database]
    );
    const [checkRows] = await connection.query(
        `SELECT tc.TABLE_NAME, tc.CONSTRAINT_NAME, cc.CHECK_CLAUSE
         FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
         JOIN INFORMATION_SCHEMA.CHECK_CONSTRAINTS cc
           ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
          AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
         WHERE tc.CONSTRAINT_SCHEMA = ? AND tc.CONSTRAINT_TYPE = 'CHECK'
         ORDER BY tc.TABLE_NAME, tc.CONSTRAINT_NAME`,
        [database]
    );

    const tables = {};
    for (const row of tableRows) {
        tables[row.TABLE_NAME] = {
            engine: String(row.ENGINE || '').toLowerCase(),
            collation: String(row.TABLE_COLLATION || '').toLowerCase(),
            columns: columnRows.filter((item) => item.TABLE_NAME === row.TABLE_NAME).map(normalizeColumn),
            indexes: [],
            foreignKeys: [],
            checks: []
        };
    }

    for (const table of Object.keys(tables)) {
        const groupedIndexes = new Map();
        for (const row of indexRows.filter((item) => item.TABLE_NAME === table)) {
            if (!groupedIndexes.has(row.INDEX_NAME)) {
                groupedIndexes.set(row.INDEX_NAME, {
                    name: String(row.INDEX_NAME),
                    unique: Number(row.NON_UNIQUE) === 0,
                    type: String(row.INDEX_TYPE || '').toLowerCase(),
                    columns: []
                });
            }
            groupedIndexes.get(row.INDEX_NAME).columns.push({
                name: String(row.COLUMN_NAME),
                ordinal: Number(row.SEQ_IN_INDEX),
                prefixLength: row.SUB_PART === null ? null : Number(row.SUB_PART),
                order: String(row.COLLATION || 'A').toUpperCase()
            });
        }
        tables[table].indexes = [...groupedIndexes.values()];

        const groupedForeignKeys = new Map();
        for (const row of foreignKeyRows.filter((item) => item.TABLE_NAME === table)) {
            if (!groupedForeignKeys.has(row.CONSTRAINT_NAME)) {
                groupedForeignKeys.set(row.CONSTRAINT_NAME, {
                    name: String(row.CONSTRAINT_NAME),
                    columns: [],
                    referencedTable: String(row.REFERENCED_TABLE_NAME),
                    referencedColumns: [],
                    onUpdate: String(row.UPDATE_RULE).toUpperCase(),
                    onDelete: String(row.DELETE_RULE).toUpperCase()
                });
            }
            const definition = groupedForeignKeys.get(row.CONSTRAINT_NAME);
            definition.columns.push(String(row.COLUMN_NAME));
            definition.referencedColumns.push(String(row.REFERENCED_COLUMN_NAME));
        }
        tables[table].foreignKeys = [...groupedForeignKeys.values()];
        tables[table].checks = checkRows.filter((item) => item.TABLE_NAME === table).map((row) => ({
            name: String(row.CONSTRAINT_NAME),
            clause: normalizeCheckClause(row.CHECK_CLAUSE)
        }));
    }
    return tables;
}

function compareNamedDefinitions(expected, actual, table, category, errors) {
    const actualByName = new Map(actual.map((item) => [item.name, item]));
    const expectedNames = new Set(expected.map((item) => item.name));
    for (const definition of expected) {
        const found = actualByName.get(definition.name);
        if (!found) {
            errors.push({ type: `${category}_MISSING`, table, name: definition.name, expected: definition, actual: null });
        } else if (JSON.stringify(found) !== JSON.stringify(definition)) {
            errors.push({ type: `${category}_MISMATCH`, table, name: definition.name, expected: definition, actual: found });
        }
    }
    for (const definition of actual) {
        if (!expectedNames.has(definition.name)) {
            errors.push({ type: `UNEXPECTED_${category}`, table, name: definition.name, expected: null, actual: definition });
        }
    }
}

function schemaError(result) {
    const first = result.errors[0];
    const location = [first.table, first.column || first.name].filter(Boolean).join('.');
    const error = new Error(`Schema incompatível: ${first.type}${location ? ` em ${location}` : ''}.`);
    error.code = 'SCHEMA_INCOMPATIVEL';
    error.validation = result;
    return error;
}

function loadContract() {
    delete require.cache[require.resolve(CONTRACT_PATH)];
    return require(CONTRACT_PATH);
}

async function validateCanonicalSchema(connection, database, options = {}) {
    const contract = options.contract || loadContract();
    const actualTables = await readSchemaMetadata(connection, database);
    const expectedTables = contract.tables;
    const errors = [];
    const optionalMissing = new Set(options.allowMissingMigrationLedger ? ['schema_migrations'] : []);

    for (const table of Object.keys(expectedTables)) {
        if (!actualTables[table] && !optionalMissing.has(table)) {
            errors.push({ type: 'TABLE_MISSING', table, expected: expectedTables[table], actual: null });
        }
    }
    for (const table of Object.keys(actualTables)) {
        if (!expectedTables[table]) {
            errors.push({ type: 'UNEXPECTED_TABLE', table, expected: null, actual: actualTables[table] });
        }
    }

    for (const [table, expected] of Object.entries(expectedTables)) {
        const actual = actualTables[table];
        if (!actual) continue;
        if (actual.engine !== expected.engine) {
            errors.push({ type: 'TABLE_ENGINE_MISMATCH', table, expected: expected.engine, actual: actual.engine });
        }
        if (actual.collation !== expected.collation) {
            errors.push({ type: 'TABLE_COLLATION_MISMATCH', table, expected: expected.collation, actual: actual.collation });
        }

        const actualColumns = new Map(actual.columns.map((column) => [column.name, column]));
        const expectedColumnNames = new Set(expected.columns.map((column) => column.name));
        for (const column of expected.columns) {
            const found = actualColumns.get(column.name);
            if (!found) {
                errors.push({ type: 'COLUMN_MISSING', table, column: column.name, expected: column, actual: null });
            } else if (JSON.stringify(found) !== JSON.stringify(column)) {
                errors.push({ type: 'COLUMN_DEFINITION_MISMATCH', table, column: column.name, expected: column, actual: found });
            }
        }
        for (const column of actual.columns) {
            if (!expectedColumnNames.has(column.name)) {
                errors.push({ type: 'UNEXPECTED_COLUMN', table, column: column.name, expected: null, actual: column });
            }
        }
        compareNamedDefinitions(expected.indexes, actual.indexes, table, 'INDEX', errors);
        compareNamedDefinitions(expected.foreignKeys, actual.foreignKeys, table, 'FOREIGN_KEY', errors);
        compareNamedDefinitions(expected.checks, actual.checks, table, 'CHECK', errors);
    }

    const includedTables = Object.entries(expectedTables).filter(([table]) => actualTables[table]);
    const counts = {
        tablesChecked: includedTables.length,
        columnsChecked: includedTables.reduce((total, [, table]) => total + table.columns.length, 0),
        indexesChecked: includedTables.reduce((total, [, table]) => total + table.indexes.length, 0),
        primaryKeysChecked: includedTables.reduce(
            (total, [, table]) => total + table.indexes.filter((index) => index.name === 'PRIMARY').length,
            0
        ),
        uniqueIndexesChecked: includedTables.reduce(
            (total, [, table]) => total + table.indexes.filter((index) => index.unique && index.name !== 'PRIMARY').length,
            0
        ),
        foreignKeysChecked: includedTables.reduce((total, [, table]) => total + table.foreignKeys.length, 0),
        checksChecked: includedTables.reduce((total, [, table]) => total + table.checks.length, 0)
    };
    counts.constraintsChecked = counts.primaryKeysChecked + counts.uniqueIndexesChecked
        + counts.foreignKeysChecked + counts.checksChecked;

    return {
        status: errors.length ? 'error' : 'ok',
        database,
        expectedVersion: contract.expectedVersion,
        technicalTables: TECHNICAL_TABLES,
        ...counts,
        errors
    };
}

async function assertCanonicalSchema(connection, database, options = {}) {
    const result = await validateCanonicalSchema(connection, database, options);
    if (result.errors.length) throw schemaError(result);
    return result;
}

module.exports = {
    CONTRACT_PATH,
    TECHNICAL_TABLES,
    assertCanonicalSchema,
    listTables,
    loadContract,
    normalizeCheckClause,
    normalizeColumn,
    normalizeSql,
    readSchemaMetadata,
    schemaError,
    validateCanonicalSchema
};
