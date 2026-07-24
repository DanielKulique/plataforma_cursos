const db = require('../../config/database');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

function criarErro(mensagem, status = 400) {
    const error = new Error(mensagem);
    error.status = status;
    return error;
}

async function login(email, senha) {
    const [users] = await db.query(
        'SELECT id_usuario, nome_completo, email, telefone, tipo, senha FROM Usuarios WHERE email = ? LIMIT 1',
        [email]
    );

    if (users.length === 0) {
        throw criarErro('Email ou senha inválidos', 401);
    }

    const usuario = users[0];
    const senhaCorreta = await bcrypt.compare(senha, usuario.senha);

    if (!senhaCorreta) {
        throw criarErro('Email ou senha inválidos', 401);
    }

    const [verificacoes] = await db.query(
        'SELECT verificado FROM EmailVerificacoes WHERE email = ? LIMIT 1',
        [email]
    );

    if (verificacoes.length > 0 && Number(verificacoes[0].verificado) !== 1) {
        throw criarErro('E-mail ainda não confirmado. Verifique com o código enviado.', 403);
    }

    delete usuario.senha; // Remove a senha do objeto de usuário antes de retornar
    return usuario;
}

async function enviarCodigoVerificacaoPorEmail(email) {
    const [users] = await db.query('SELECT id_usuario, email FROM Usuarios WHERE email = ? LIMIT 1', [email]);
    if (users.length === 0) {
        throw criarErro('Usuário não encontrado para este e-mail.', 404);
    }

    const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    const expiraEm = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

    await db.query(
        `INSERT INTO EmailVerificacoes (email, codigo, verificado, expira_em)
         VALUES (?, ?, 0, ?)
         ON DUPLICATE KEY UPDATE
            codigo = VALUES(codigo),
            verificado = 0,
            expira_em = VALUES(expira_em),
            criado_em = CURRENT_TIMESTAMP`,
        [email, codigo, expiraEm]
    );

    return {
        email,
        codigo,
        expira_em: expiraEm
    };
}

async function verificarCodigoEmail(email, codigo) {
    const [rows] = await db.query(
        'SELECT codigo, verificado, expira_em FROM EmailVerificacoes WHERE email = ? LIMIT 1',
        [email]
    );

    if (rows.length === 0) {
        throw criarErro('Nenhum código de verificação foi solicitado para este e-mail.', 404);
    }

    const registro = rows[0];

    if (Number(registro.verificado) === 1) {
        return { jaVerificado: true };
    }

    const agora = new Date();
    if (agora > new Date(registro.expira_em)) {
        throw criarErro('Código expirado. Solicite um novo código.', 400);
    }

    if (String(registro.codigo) !== String(codigo)) {
        throw criarErro('Código inválido.', 400);
    }

    await db.query(
        'UPDATE EmailVerificacoes SET verificado = 1 WHERE email = ?',
        [email]
    );

    return { verificado: true };
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
    buscarUsuarioPorId,
    enviarCodigoVerificacaoPorEmail,
    verificarCodigoEmail
};
