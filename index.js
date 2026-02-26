const path = require('path');
const fs = require('fs');

// Prioridade para .env.test se estiver em contexto de teste (Jest)
const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
const envTestExists = fs.existsSync(path.join(__dirname, '.env.test'));
const envExists = fs.existsSync(path.join(__dirname, '.env'));

let envFile = '.env';
if (isTest && envTestExists) {
    envFile = '.env.test';
} else if (!envExists && envTestExists) {
    envFile = '.env.test';
}

require('dotenv').config({ path: path.join(__dirname, envFile), override: true });

const express = require('express');
const { garantirTabelaVerificacaoEmail } = require('./src/api/models/auth.models');

const cursosRoutes = require('./src/api/routes/cursos.routes');
const turmasRoutes = require('./src/api/routes/turmas.routes');
const matriculasRoutes = require('./src/api/routes/matricula.routes');
const usuariosRoutes = require('./src/api/routes/usuarios.routes');
const adminRoutes = require('./src/api/routes/admin.routes');
const authRoutes = require('./src/api/routes/auth.routes');
const healthRoutes = require('./src/api/routes/health.routes');

const app = express();
const PORTA = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'src', 'public')));

app.use('/api/health', healthRoutes);
app.use('/api/cursos', cursosRoutes);
app.use('/api/turmas', turmasRoutes);
app.use('/api/matriculas', matriculasRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/auth', authRoutes);

app.use((err, req, res, next) => {
    console.error('Erro não tratado:', err);

    if (res.headersSent) {
        return next(err);
    }

    return res.status(err.status || 500).json({
        mensagem: err.message || 'Ocorreu um erro no servidor.'
    });
});

async function iniciarServidor() {
    try {
        await garantirTabelaVerificacaoEmail();

        app.listen(PORTA, () => {
            console.log(`Servidor rodando na porta ${PORTA}. Acesse http://localhost:${PORTA}`);
        });
    } catch (error) {
        console.error('Erro ao inicializar servidor:', error);
        process.exit(1);
    }
}

// Exporta app e iniciarServidor para testes
module.exports = { app, iniciarServidor };

// Inicia o servidor se não estiver em modo teste
if (process.env.NODE_ENV !== 'test') {
    iniciarServidor();
}
