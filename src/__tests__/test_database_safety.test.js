const {
    LEGACY_DATABASE,
    DEVELOPMENT_DATABASE,
    TEST_DATABASE,
    assertTestDatabaseIsDisposable,
    assertDevelopmentDatabase,
    assertLegacyDatabaseReadOnly,
    assertCanonicalWritableDatabase
} = require('../../scripts/test_database_safety');

describe('proteção do banco de integração', () => {
    it('aceita somente o nome canônico descartável', () => {
        expect(assertTestDatabaseIsDisposable({ NODE_ENV: 'test', DB_NAME: TEST_DATABASE })).toBe(TEST_DATABASE);
    });

    it('recusa execução fora de NODE_ENV=test', () => {
        expect(() => assertTestDatabaseIsDisposable({ NODE_ENV: 'production', DB_NAME: TEST_DATABASE }))
            .toThrow('NODE_ENV deve ser test');
    });

    it('recusa execução sem DB_NAME explícito', () => {
        expect(() => assertTestDatabaseIsDisposable({ NODE_ENV: 'test' }))
            .toThrow('DB_NAME do banco de teste é obrigatório');
    });

    it.each(['site_cursos_test', 'teste-integracao', 'app_test_ci'])('recusa alias não canônico: %s', (database) => {
        expect(() => assertTestDatabaseIsDisposable({ NODE_ENV: 'test', DB_NAME: database }))
            .toThrow(`deve ser exatamente ${TEST_DATABASE}`);
    });

    it('recusa explicitamente o banco legado', () => {
        expect(() => assertTestDatabaseIsDisposable({ NODE_ENV: 'test', DB_NAME: LEGACY_DATABASE }))
            .toThrow('banco legado protegido');
    });
});

describe('proteção do banco de desenvolvimento', () => {
    it('aceita somente o banco canônico em ambiente development', () => {
        expect(assertDevelopmentDatabase({
            NODE_ENV: 'development',
            DB_NAME: DEVELOPMENT_DATABASE
        })).toBe(DEVELOPMENT_DATABASE);
    });

    it('recusa ambiente incorreto', () => {
        expect(() => assertDevelopmentDatabase({ NODE_ENV: 'test', DB_NAME: DEVELOPMENT_DATABASE }))
            .toThrow('NODE_ENV deve ser development');
    });

    it('recusa o banco legado', () => {
        expect(() => assertDevelopmentDatabase({ NODE_ENV: 'development', DB_NAME: LEGACY_DATABASE }))
            .toThrow('banco legado protegido');
    });

    it('recusa outro banco de desenvolvimento', () => {
        expect(() => assertDevelopmentDatabase({ NODE_ENV: 'development', DB_NAME: 'dev_local' }))
            .toThrow(`deve ser exatamente ${DEVELOPMENT_DATABASE}`);
    });
});

describe('auditoria somente leitura do banco legado', () => {
    it('aceita somente o nome legado exato', () => {
        expect(assertLegacyDatabaseReadOnly({ DB_NAME: LEGACY_DATABASE })).toBe(LEGACY_DATABASE);
        expect(() => assertLegacyDatabaseReadOnly({ DB_NAME: DEVELOPMENT_DATABASE }))
            .toThrow(`exatamente para ${LEGACY_DATABASE}`);
    });
});

describe('proteção comum de scripts com escrita', () => {
    it('aceita somente os dois bancos canônicos nos ambientes correspondentes', () => {
        expect(assertCanonicalWritableDatabase({ NODE_ENV: 'development', DB_NAME: DEVELOPMENT_DATABASE }))
            .toBe(DEVELOPMENT_DATABASE);
        expect(assertCanonicalWritableDatabase({ NODE_ENV: 'test', DB_NAME: TEST_DATABASE }))
            .toBe(TEST_DATABASE);
    });

    it.each([LEGACY_DATABASE, 'mydb', 'banco_qualquer'])('recusa alvo de escrita não canônico: %s', (database) => {
        expect(() => assertCanonicalWritableDatabase({ NODE_ENV: 'development', DB_NAME: database }))
            .toThrow('Operação recusada');
    });
});
