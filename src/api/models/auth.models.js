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

async function buscarUsuarioPorId(id_usuario) {
    const [users] = await db.query(
        `SELECT id_usuario, nome_completo, email, telefone, tipo
         FROM Usuarios
         WHERE id_usuario = ?`,
        [id_usuario]
    );

    if (users.length === 0) {
        throw new Error('Usuário não encontrado');
    }

    return users[0];
}

module.exports = {
    login,
    buscarUsuarioPorId
};