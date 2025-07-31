const authModel = require('../models/auth.models');
const jwt = require('jsonwebtoken');

async function login(req, res) {
    const { email, senha } = req.body;

    try {
        const usuario = await authModel.login(email, senha);

        const payload = {
            id_usuario: usuario.id_usuario,
            tipo: usuario.tipo
        }
        const token = jwt.sign(payload, process.env.JWT_SECRET, {
            expiresIn: '8h' // Token válido por 8 horas
        });

        res.status(200).json({
            mensagem: `Bem vindo, ${usuario.nome_completo}`,
            token,
            usuario: {
                id_usuario: usuario.id_usuario,
                nome_completo: usuario.nome_completo,
                email: usuario.email,
                telefone: usuario.telefone,
                tipo: usuario.tipo
            }
        })
    }catch (error) {
        return res.status(401).json({ mensagem: error.message });
    }
}

module.exports = {
    login
};
