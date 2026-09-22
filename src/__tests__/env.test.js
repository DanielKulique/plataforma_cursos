const { validarAmbiente } = require('../config/env');

const productionEnv = Object.freeze({
    NODE_ENV: 'production',
    DB_HOST: 'db',
    DB_PORT: '3306',
    DB_USER: 'app',
    DB_PASSWORD: 'database-password',
    DB_NAME: 'plataforma_cursos',
    DB_ENVIRONMENT_IDENTITY: 'plataforma_cursos_prod',
    JWT_SECRET: 'um-segredo-com-mais-de-trinta-e-dois-caracteres',
    APP_BASE_URL: 'https://cursos.example.test',
    RESEND_API_KEY: 'resend-test-placeholder',
    MAIL_FROM: 'Cursos <no-reply@example.test>',
    DETECTOR_ENABLED: 'false'
});

describe('validação do ambiente de produção', () => {
    it('aceita o MVP sem configuração nem dependência do detector', () => {
        expect(() => validarAmbiente({
            ...productionEnv,
            DETECTOR_API_URL: 'valor-ignorado-quando-desabilitado'
        })).not.toThrow();
    });

    it.each(['APP_BASE_URL', 'RESEND_API_KEY', 'MAIL_FROM'])('falha sem %s', (key) => {
        const env = { ...productionEnv };
        delete env[key];
        expect(() => validarAmbiente(env)).toThrow(key);
    });

    it('aceita staging de produção com entrega de e-mail explicitamente desabilitada', () => {
        const env = {
            ...productionEnv,
            APP_ENV: 'staging',
            DB_NAME: 'plataforma_cursos_staging',
            DB_ENVIRONMENT_IDENTITY: 'plataforma_cursos_staging',
            EMAIL_DELIVERY_ENABLED: 'false'
        };
        delete env.RESEND_API_KEY;
        delete env.MAIL_FROM;
        expect(() => validarAmbiente(env)).not.toThrow();
    });

    it('recusa flag de entrega de e-mail inválida', () => {
        expect(() => validarAmbiente({ ...productionEnv, EMAIL_DELIVERY_ENABLED: 'talvez' }))
            .toThrow('EMAIL_DELIVERY_ENABLED deve ser true ou false');
    });

    it('valida a flag explícita de verificação no cadastro público', () => {
        expect(() => validarAmbiente({
            ...productionEnv,
            PUBLIC_REGISTRATION_EMAIL_VERIFICATION_REQUIRED: 'false'
        })).not.toThrow();
        expect(() => validarAmbiente({
            ...productionEnv,
            PUBLIC_REGISTRATION_EMAIL_VERIFICATION_REQUIRED: 'talvez'
        })).toThrow('PUBLIC_REGISTRATION_EMAIL_VERIFICATION_REQUIRED deve ser true ou false');
    });

    it('exige HTTPS e JWT forte', () => {
        expect(() => validarAmbiente({ ...productionEnv, APP_BASE_URL: 'http://example.test' }))
            .toThrow('APP_BASE_URL deve usar HTTPS');
        expect(() => validarAmbiente({ ...productionEnv, JWT_SECRET: 'curto' }))
            .toThrow('JWT_SECRET deve possuir ao menos 32');
    });

    it('valida URL e segredo interno somente quando o detector está habilitado', () => {
        expect(() => validarAmbiente({
            ...productionEnv,
            DETECTOR_ENABLED: 'true',
            DETECTOR_API_URL: 'http://motor-ia:8000',
            IA_ANALISE_URL: 'http://motor-ia:8000/api/analisar'
        })).toThrow('MOTOR_IA_INTERNAL_API_TOKEN');
        expect(() => validarAmbiente({
            ...productionEnv,
            DETECTOR_ENABLED: 'true',
            DETECTOR_API_URL: 'url-invalida',
            IA_ANALISE_URL: 'http://motor-ia:8000/api/analisar',
            MOTOR_IA_INTERNAL_API_TOKEN: 'segredo-interno'
        })).toThrow('DETECTOR_API_URL inválida');
    });
});
