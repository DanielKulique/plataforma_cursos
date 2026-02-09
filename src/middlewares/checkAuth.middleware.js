const jwt = require('jsonwebtoken');

function checkAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token ){
        return res.status(401).json({ mensagem: 'Token não fornecido' });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    }catch (error) {
        return res.status(401).json({ mensagem: 'Token inválido' });
    }
}

module.exports = checkAuth;