const db = require('../../config/database');
const bcrypt = require('bcrypt');

async function login(email, senha) {
    const [users] = await db.query('SELECT * FROM Usuarios WHERE email = ?', [email])

    if (users.length === 0) {
        throw new Error('Email ou senha inválidos');
    }

    const usuario = users[0];
    const senhaCorreta = await bcrypt.compare(senha, usuario.senha);

    if (!senhaCorreta) {
        throw new Error('Email ou senha inválidos');
    }

    delete usuario.senha; // Remove a senha do objeto de usuário antes de retornar
    return usuario;
}

module.exports = {
    login
};