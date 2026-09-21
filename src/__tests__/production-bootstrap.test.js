'use strict';

const manifest = require('../../production-content/manifest.json');
const { validateManifest, importableQuestion, configuration, assertTarget, inspectMaterials } = require('../../scripts/production_bootstrap');

describe('manifesto de produção', () => {
    test('prévia mantém PDF criptografado pendente sem alterar o original', async () => {
        const fs = require('fs');
        const path = require('path');
        const root = fs.mkdtempSync(path.join(require('os').tmpdir(), 'bootstrap-rejected-'));
        try {
            const bytes = fs.readFileSync(path.join(__dirname, 'fixtures', 'encrypted-material.pdf'));
            fs.writeFileSync(path.join(root, 'protected.pdf'), bytes);
            const input = { sources: [], lessons: [{ contents: [{ file: 'protected.pdf', type: 'PDF', order: 1 }] }] };
            const result = await inspectMaterials(input, root);
            expect(result.get(1)).toMatchObject({ status: 'PDF_REJECTED', code: 'PDF_CRIPTOGRAFADO' });
            expect(fs.readFileSync(path.join(root, 'protected.pdf'))).toEqual(bytes);
        } finally { fs.rmSync(root, { recursive: true, force: true }); }
    });
    test('preserva as nove aulas e só permite questões confirmadas com pontos conhecidos', () => {
        expect(validateManifest(manifest)).toBe(manifest);
        expect(manifest.assessments[0].questions.filter(importableQuestion)).toHaveLength(11);
        expect(manifest.assessments[1].questions.filter(importableQuestion)).toHaveLength(0);
        expect(manifest.lessons.flatMap((l) => l.contents).filter((c) => c.type === 'XLSX')).toHaveLength(2);
    });
    test('não transforma gabarito proposto em confirmado nem ativa avaliações', () => {
        const altered = structuredClone(manifest);
        altered.assessments[0].questions[0].correctOption = 2;
        expect(() => validateManifest(altered)).toThrow('Gabarito proposto');
        altered.assessments[0].questions[0].correctOption = null;
        altered.assessments[1].active = true;
        expect(() => validateManifest(altered)).toThrow('indisponíveis');
    });
    test('usa carga horária, datas e professor oficiais e recusa datas impossíveis', () => {
        expect(configuration(manifest, {})).toEqual({ hours: 6, teacherEmail: 'joao@utfpr.edu.br', startDate: '2026-09-30', endDate: null });
        expect(() => configuration(manifest, { BOOTSTRAP_START_DATE: '2026-02-30' })).toThrow('Data inválida');
    });
    test('recusa staging e MySQL nativo', () => {
        const env = { NODE_ENV: 'production', APP_ENV: 'staging', DB_HOST: 'db', DB_PORT: '3306', DB_USER: 'app', DB_PASSWORD: 'test-only', DB_NAME: 'plataforma_cursos_staging', DB_ENVIRONMENT_IDENTITY: 'plataforma_cursos_staging', ALLOW_PRODUCTION_CONTENT_BOOTSTRAP: 'I_UNDERSTAND' };
        expect(() => assertTarget(env)).toThrow('produção isolada');
        expect(() => assertTarget({ ...env, DB_HOST: '127.0.0.1' })).toThrow('Refusing connection');
    });
});
