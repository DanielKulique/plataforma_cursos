'use strict';

// Load the real entrypoint without reading local secrets or opening a database.
function replaceModule(relativePath, exports) {
    const filename = require.resolve(relativePath);
    require.cache[filename] = { id: filename, filename, loaded: true, exports };
}

replaceModule('../../config/loadEnvironment', { loadEnvironment: () => process.env });
const noDatabase = () => { throw new Error('Database access forbidden in parser fixture'); };
replaceModule('../../config/database', {
    query: noDatabase, execute: noDatabase, getConnection: noDatabase,
    ensureDatabaseIdentity: noDatabase
});

const user = {
    id_usuario: 1, nome_completo: 'Parser Fixture', email: 'parser@example.test',
    tipo: 'ALUNO', versao_sessao: 0
};
replaceModule('../../api/models/auth.models', {
    login: async (email, senha) => {
        if (email !== user.email || senha !== 'json-á-válido') {
            throw Object.assign(new Error('Invalid fixture credentials'), { status: 401 });
        }
        return user;
    },
    buscarUsuarioSessao: async () => user,
    invalidarSessoes: async () => {}
});

// Auth middleware, JWT, CSRF, parser, routes and error handling are all real.
const { app } = require('../../../index');
const server = app.listen(0, '127.0.0.1', () => {
    process.send({ port: server.address().port });
});
process.on('message', (message) => {
    if (message === 'stop') server.close(() => process.exit(0));
});
