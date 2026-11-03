const path = require('path');

const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
const { loadEnvironment } = require('./src/config/loadEnvironment');
const environmentMode = isTest
    ? 'test'
    : String(process.env.APP_ENV || process.env.NODE_ENV || 'development').toLowerCase();
loadEnvironment(environmentMode, __dirname);

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');
const { validarAmbiente } = require('./src/config/env');
const requestContext = require('./src/middlewares/requestContext.middleware');
const httpObservability = require('./src/middlewares/httpObservability.middleware');
const logger = require('./src/utils/logger');
const { buildRuntimeConfig, sanitizedRuntimeSummary } = require('./src/config/runtime-config');
const { sendHttpError } = require('./src/utils/http-response');

const cursosRoutes = require('./src/api/routes/cursos.routes');
const turmasRoutes = require('./src/api/routes/turmas.routes');
const matriculasRoutes = require('./src/api/routes/matricula.routes');
const usuariosRoutes = require('./src/api/routes/usuarios.routes');
const adminRoutes = require('./src/api/routes/admin.routes');
const authRoutes = require('./src/api/routes/auth.routes');
const healthRoutes = require('./src/api/routes/health.routes');
const healthController = require('./src/api/controllers/health.controller');
const plagioRoutes = require('./src/api/routes/plagio.routes');
const questoesRoutes = require('./src/api/routes/questoes.routes');
const conteudosRoutes = require('./src/api/routes/conteudos.routes');
const analisesContextuaisRoutes = require('./src/api/routes/analises-contextuais.routes');
const indexedAnalysisRoutes = require('./src/api/routes/indexed-analysis.routes');
const capabilitiesRoutes = require('./src/api/routes/capabilities.routes');
const certificadosRoutes = require('./src/api/routes/certificados.routes');
const publicCertificadosRoutes = require('./src/api/routes/public-certificados.routes');
const { detectorEnabled } = require('./src/middlewares/featureFlag.middleware');
const db = require('./src/config/database');

const runtimeConfig = buildRuntimeConfig(process.env);

function createApp(config = runtimeConfig) {
    const app = express();
    app.disable('x-powered-by');
    if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
    app.use(requestContext);
    app.use(httpObservability({ slowRequestMs: config.http.slowRequestMs }));
    app.use(helmet({
        contentSecurityPolicy: {
            useDefaults: true,
            reportOnly: process.env.CSP_REPORT_ONLY === 'true',
            directives: {
                'default-src': ["'self'"],
                'script-src': ["'self'"],
                'script-src-attr': ["'none'"],
                'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
                'font-src': ["'self'", 'https://fonts.gstatic.com'],
                'img-src': ["'self'", 'data:'],
                'connect-src': ["'self'"],
                'frame-src': ["'self'", 'https://www.youtube.com', 'https://www.youtube-nocookie.com'],
                'object-src': ["'none'"],
                'base-uri': ["'self'"],
                'frame-ancestors': ["'self'"],
                'upgrade-insecure-requests': process.env.NODE_ENV === 'production' ? [] : null
            }
        }
    }));
    const origens = String(process.env.CORS_ORIGIN || '').split(',').map((item) => item.trim()).filter(Boolean);
    app.use(cors({ origin: origens.length ? origens : false }));
    app.use(express.json({ limit: '256kb', inflate: false }));
    app.use('/assets/materiais', (req, res) => res.status(404).json({
        mensagem: 'Material acadêmico disponível somente pela rota autenticada do conteúdo.'
    }));
    const publicDir = path.join(__dirname, 'src', 'public');
    const enviarValidadorCertificado = (req, res) => (
        res.sendFile(path.join(publicDir, 'certificados-validar.html'))
    );
    app.get('/certificados/validar', enviarValidadorCertificado);
    app.get('/certificados/validar/:codigo', enviarValidadorCertificado);
    app.use(express.static(publicDir));

    const limitadorAuth = rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: Number(process.env.AUTH_RATE_LIMIT_MAX || (process.env.NODE_ENV === 'test' ? 1000 : 20)),
        standardHeaders: 'draft-8',
        legacyHeaders: false
    });
    app.use('/api/auth/login', limitadorAuth);

    app.get('/healthz', healthController.publicStatus);
    app.get('/readyz', healthController.readyStatus);

    app.use('/api/health', healthRoutes);
    app.use('/api/cursos', cursosRoutes);
    app.use('/api/turmas', turmasRoutes);
    app.use('/api/matriculas', matriculasRoutes);
    app.use('/api/usuarios', usuariosRoutes);
    app.use('/api/admin', adminRoutes);
    app.use('/api/auth', authRoutes);
    app.use('/api/capabilities', capabilitiesRoutes);
    app.use('/api/certificados', certificadosRoutes);
    app.use('/api/public/certificados', publicCertificadosRoutes);
    app.use('/api/plagio', detectorEnabled, plagioRoutes);
    app.use('/api/analises', detectorEnabled, analisesContextuaisRoutes);
    app.use('/api', indexedAnalysisRoutes);
    app.use('/api', questoesRoutes);
    app.use('/api', conteudosRoutes);

    app.use('/api', (req, res) => res.status(404).json({ mensagem: 'Endpoint da API não encontrado.' }));

    app.use((err, req, res, next) => {
        logger.error('http.unhandled_error', { requestId: req.id, error: err });

        if (res.headersSent) {
            return next(err);
        }

        return sendHttpError(res, err, { legacyKey: 'mensagem' });
    });

    return app;
}

const app = createApp();
let server = null;

async function iniciarServidor() {
    try {
        validarAmbiente();
        const { directory } = require('./src/api/services/private-storage.service');
        const { obterDiretorioMateriais } = require('./src/config/material-storage');
        const { obterDiretorioCertificados } = require('./src/config/certificate-storage');
        require('./src/config/storage-policy').storagePolicy();
        if (obterDiretorioMateriais() === obterDiretorioCertificados()) throw new Error('Namespaces de storage devem ser separados.');
        await directory(obterDiretorioMateriais(), true);
        await directory(obterDiretorioCertificados(), true);
        await db.ensureDatabaseIdentity();
        server = app.listen(runtimeConfig.appPort, () => {
            logger.info('server.started', sanitizedRuntimeSummary(runtimeConfig));
        });
    } catch (error) {
        logger.error('server.startup_failed', { error });
        process.exit(1);
    }
}

async function encerrarServidor(signal) {
    logger.info('server.shutdown.started', { signal });
    if (server) {
        await new Promise((resolve) => server.close(resolve));
        server = null;
    }
    await db.end();
    logger.info('server.shutdown.completed', { signal });
}

// Exporta app e iniciarServidor para testes
module.exports = { app, createApp, encerrarServidor, iniciarServidor };

// Inicia o servidor se não estiver em modo teste
// The isolated Playwright environment runs the production entrypoint against its
// disposable MySQL service while retaining the test database identity.
if (process.env.NODE_ENV !== 'test' || process.env.E2E_RUN === '1') {
    iniciarServidor();
    for (const signal of ['SIGTERM', 'SIGINT']) {
        process.once(signal, () => {
            encerrarServidor(signal)
                .then(() => process.exit(0))
                .catch((error) => {
                    logger.error('server.shutdown.failed', { signal, error });
                    process.exit(1);
                });
        });
    }
}
