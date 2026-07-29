const path = require('path');
const fs = require('fs');

const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
const envTestExists = fs.existsSync(path.join(__dirname, '.env.test'));
const { loadEnvironment } = require('./src/config/loadEnvironment');
loadEnvironment(isTest && envTestExists ? 'test' : 'development', __dirname);

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');
const { validarAmbiente } = require('./src/config/env');
const requestContext = require('./src/middlewares/requestContext.middleware');
const logger = require('./src/utils/logger');
const { ALLOWED_EXTERNAL_ORIGINS } = require('./src/public/js/security-utils');

const cursosRoutes = require('./src/api/routes/cursos.routes');
const turmasRoutes = require('./src/api/routes/turmas.routes');
const matriculasRoutes = require('./src/api/routes/matricula.routes');
const usuariosRoutes = require('./src/api/routes/usuarios.routes');
const adminRoutes = require('./src/api/routes/admin.routes');
const authRoutes = require('./src/api/routes/auth.routes');
const healthRoutes = require('./src/api/routes/health.routes');
const plagioRoutes = require('./src/api/routes/plagio.routes');
const questoesRoutes = require('./src/api/routes/questoes.routes');
const conteudosRoutes = require('./src/api/routes/conteudos.routes');
const analisesContextuaisRoutes = require('./src/api/routes/analises-contextuais.routes');

const app = express();
const PORTA = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use(requestContext);
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
            'frame-src': ["'self'", ...ALLOWED_EXTERNAL_ORIGINS],
            'object-src': ["'none'"],
            'base-uri': ["'self'"],
            'frame-ancestors': ["'self'"],
            'upgrade-insecure-requests': process.env.NODE_ENV === 'production' ? [] : null
        }
    }
}));
const origens = String(process.env.CORS_ORIGIN || '').split(',').map((item) => item.trim()).filter(Boolean);
app.use(cors({ origin: origens.length ? origens : false }));
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname, 'src', 'public')));

const limitadorAuth = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });
app.use('/api/auth/login', limitadorAuth);
app.use('/api/auth/verificar-email', limitadorAuth);
app.use('/api/auth/reenviar-codigo', limitadorAuth);

app.use('/api/health', healthRoutes);
app.use('/api/cursos', cursosRoutes);
app.use('/api/turmas', turmasRoutes);
app.use('/api/matriculas', matriculasRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/plagio', plagioRoutes);
app.use('/api/analises', analisesContextuaisRoutes);
app.use('/api', questoesRoutes);
app.use('/api', conteudosRoutes);

app.use('/api', (req, res) => res.status(404).json({ mensagem: 'Endpoint da API não encontrado.' }));

app.use((err, req, res, next) => {
    logger.error('http.unhandled_error', { requestId: req.id, error: err });

    if (res.headersSent) {
        return next(err);
    }

    return res.status(err.status || 500).json({
        mensagem: err.status && err.status < 500 ? err.message : 'Ocorreu um erro no servidor.'
    });
});

async function iniciarServidor() {
    try {
        validarAmbiente();
        app.listen(PORTA, () => {
            logger.info('server.started', { port: Number(PORTA) });
        });
    } catch (error) {
        logger.error('server.startup_failed', { error });
        process.exit(1);
    }
}

// Exporta app e iniciarServidor para testes
module.exports = { app, iniciarServidor };

// Inicia o servidor se não estiver em modo teste
if (process.env.NODE_ENV !== 'test') {
    iniciarServidor();
}
