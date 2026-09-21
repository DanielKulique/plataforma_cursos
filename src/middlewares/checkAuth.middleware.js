const jwt = require('jsonwebtoken');
const authModel = require('../api/models/auth.models');
const { getSessionCookie, safeEqual } = require('../config/session');

function obterTokenBearer(authHeader) {
    if (typeof authHeader !== 'string') return null;

    const match = authHeader.match(/^Bearer\s+(\S+)$/i);
    return match ? match[1] : null;
}

async function checkAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const bearerToken = obterTokenBearer(authHeader);
    const cookieToken = getSessionCookie(req);
    const token = cookieToken || bearerToken;

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
        const usuario = await authModel.buscarUsuarioSessao(decoded.id_usuario);
        if (Number(decoded.sv || 0) !== Number(usuario.versao_sessao || 0)) {
            return res.status(401).json({ mensagem: 'Sessão inválida' });
        }

        if (cookieToken && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
            const csrfToken = req.get('X-CSRF-Token');
            if (!safeEqual(csrfToken, decoded.csrf)) {
                return res.status(403).json({
                    codigo: 'CSRF_INVALIDO',
                    mensagem: 'Token CSRF ausente ou inválido.'
                });
            }
        }

        const { versao_sessao: _sessionVersion, ...publicUser } = usuario;
        req.user = publicUser;
        req.auth = {
            csrf: decoded.csrf,
            transport: cookieToken ? 'cookie' : 'bearer'
        };
        return next();
    } catch (error) {
        if (error?.status === 404 || error?.message === 'Usuário não encontrado') {
            return res.status(401).json({ mensagem: 'Sessão inválida' });
        }

        return res.status(500).json({ mensagem: 'Não foi possível validar a sessão.' });
    }
}

module.exports = checkAuth;
module.exports.obterTokenBearer = obterTokenBearer;
