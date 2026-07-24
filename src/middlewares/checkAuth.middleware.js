const jwt = require('jsonwebtoken');
const authModel = require('../api/models/auth.models');

function obterTokenBearer(authHeader) {
    if (typeof authHeader !== 'string') return null;

    const match = authHeader.match(/^Bearer\s+(\S+)$/i);
    return match ? match[1] : null;
}

async function checkAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = obterTokenBearer(authHeader);

    if (!token) {
        return res.status(401).json({ mensagem: 'Token não fornecido' });
    }

    let decoded;

    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
        return res.status(401).json({ mensagem: 'Token inválido' });
    }

    if (!decoded?.id_usuario) {
        return res.status(401).json({ mensagem: 'Token inválido' });
    }

    try {
        // O banco é a fonte de verdade para existência e papel atual do usuário.
        req.user = await authModel.buscarUsuarioPorId(decoded.id_usuario);
        return next();
    } catch (error) {
        if (error?.status === 404 || error?.message === 'Usuário não encontrado') {
            return res.status(401).json({ mensagem: 'Sessão inválida' });
        }

        return res.status(500).json({ mensagem: 'Não foi possível validar a sessão.' });
    }
}

module.exports = checkAuth;
