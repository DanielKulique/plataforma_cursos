'use strict';

const manifest = require('../../production-content/manifest.json');
const { validateManifest, importableQuestion, configuration, assertTarget } = require('../../scripts/production_bootstrap');

describe('manifesto de produção', () => {
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
    test('não inventa carga horária, datas ou professor e recusa datas impossíveis', () => {
        expect(configuration(manifest, {})).toEqual({ hours: null, teacherEmail: null, startDate: null, endDate: null });
        expect(() => configuration(manifest, { BOOTSTRAP_START_DATE: '2026-02-30' })).toThrow('Data inválida');
    });
    test('recusa staging e MySQL nativo', () => {
        const env = { NODE_ENV: 'production', APP_ENV: 'staging', DB_HOST: 'db', DB_PORT: '3306', DB_USER: 'app', DB_PASSWORD: 'test-only', DB_NAME: 'plataforma_cursos_staging', DB_ENVIRONMENT_IDENTITY: 'plataforma_cursos_staging', ALLOW_PRODUCTION_CONTENT_BOOTSTRAP: 'I_UNDERSTAND' };
        expect(() => assertTarget(env)).toThrow('produção isolada');
        expect(() => assertTarget({ ...env, DB_HOST: '127.0.0.1' })).toThrow('Refusing connection');
    });
});
