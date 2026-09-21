const db = require('../../config/database');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const {
    calcularExpiracaoCodigo,
    gerarCodigoVerificacao,
    normalizarEmail
} = require('../../utils/identity');

function criarErro(mensagem, status = 400, code) {
    const error = new Error(mensagem);
    error.status = status;
    if (code) error.code = code;
    return error;
}

function hashRecoveryToken(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
}

async function login(email, senha) {
    const emailNormalizado = normalizarEmail(email);
    const [users] = await db.query(
        'SELECT id_usuario, nome_completo, email, telefone, tipo, senha, versao_sessao FROM Usuarios WHERE email = ? LIMIT 1',
        [emailNormalizado]
    );

    if (users.length === 0) {
        throw criarErro('Email ou senha inválidos', 401, 'CREDENCIAIS_INVALIDAS');
    }

    const usuario = users[0];
    const senhaCorreta = await bcrypt.compare(senha, usuario.senha);

    if (!senhaCorreta) {
        throw criarErro('Email ou senha inválidos', 401, 'CREDENCIAIS_INVALIDAS');
    }

    const [verificacoes] = await db.query(
        'SELECT verificado FROM EmailVerificacoes WHERE email = ? LIMIT 1',
        [usuario.email]
    );

    if (verificacoes.length === 0 || Number(verificacoes[0].verificado) !== 1) {
        throw criarErro(
            'E-mail ainda não confirmado. Verifique com o código enviado.',
            403,
            'EMAIL_NAO_VERIFICADO'
        );
    }

    delete usuario.senha; // Remove a senha do objeto de usuário antes de retornar
    return usuario;
}

async function enviarCodigoVerificacaoPorEmail(email) {
    const emailNormalizado = normalizarEmail(email);
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();
        const [users] = await connection.query(
            'SELECT id_usuario, email FROM Usuarios WHERE email = ? LIMIT 1 FOR UPDATE',
            [emailNormalizado]
        );
        if (users.length === 0) {
            await connection.commit();
            return { enviar: false, motivo: 'CONTA_INEXISTENTE' };
        }

        const emailPersistido = users[0].email;
        const [verificacoes] = await connection.query(
            'SELECT verificado FROM EmailVerificacoes WHERE email = ? LIMIT 1 FOR UPDATE',
            [emailPersistido]
        );
        if (verificacoes.length > 0 && Number(verificacoes[0].verificado) === 1) {
            await connection.commit();
            return { enviar: false, jaVerificado: true };
        }

        const codigo = gerarCodigoVerificacao();
        const expiraEm = calcularExpiracaoCodigo();
        if (verificacoes.length === 0) {
            await connection.query(
                `INSERT INTO EmailVerificacoes (email, codigo, verificado, expira_em)
                 VALUES (?, ?, 0, ?)`,
                [emailPersistido, codigo, expiraEm]
            );
        } else {
            await connection.query(
                `UPDATE EmailVerificacoes
                 SET codigo = ?, expira_em = ?, criado_em = CURRENT_TIMESTAMP
                 WHERE email = ? AND verificado = 0`,
                [codigo, expiraEm, emailPersistido]
            );
        }
        await connection.commit();
        return { enviar: true, email: emailPersistido, codigo, expira_em: expiraEm };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function verificarCodigoEmail(email, codigo) {
    const emailNormalizado = normalizarEmail(email);
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();
        const [rows] = await connection.query(
            'SELECT codigo, verificado, expira_em FROM EmailVerificacoes WHERE email = ? LIMIT 1 FOR UPDATE',
            [emailNormalizado]
        );
        if (rows.length === 0) {
            throw criarErro('Código inválido ou expirado.', 400, 'CODIGO_INVALIDO');
        }

        const registro = rows[0];
        if (Number(registro.verificado) === 1) {
            if (String(registro.codigo) !== String(codigo)) {
                throw criarErro('Código inválido.', 400, 'CODIGO_INVALIDO');
            }
            await connection.commit();
            return { jaVerificado: true };
        }
        if (Date.now() >= new Date(registro.expira_em).getTime()) {
            throw criarErro('Código expirado. Solicite um novo código.', 400, 'CODIGO_EXPIRADO');
        }
        if (String(registro.codigo) !== String(codigo)) {
            throw criarErro('Código inválido.', 400, 'CODIGO_INVALIDO');
        }

        await connection.query(
            'UPDATE EmailVerificacoes SET verificado = 1 WHERE email = ? AND verificado = 0',
            [emailNormalizado]
        );
        await connection.commit();
        return { verificado: true };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
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

async function buscarUsuarioSessao(id_usuario) {
    const [users] = await db.query(
        `SELECT id_usuario, nome_completo, email, telefone, tipo, versao_sessao
         FROM Usuarios
         WHERE id_usuario = ?`,
        [id_usuario]
    );

    if (users.length === 0) {
        const error = new Error('Usuário não encontrado');
        error.status = 404;
        throw error;
    }

    return users[0];
}

async function invalidarSessoes(id_usuario) {
    const [result] = await db.query(
        'UPDATE Usuarios SET versao_sessao = versao_sessao + 1 WHERE id_usuario = ?',
        [id_usuario]
    );
    if (result.affectedRows !== 1) throw criarErro('Usuário não encontrado.', 404);
}

async function criarTokenRecuperacao(email) {
    const [users] = await db.query(
        'SELECT id_usuario, nome_completo, email FROM Usuarios WHERE email = ? LIMIT 1',
        [email]
    );
    if (users.length === 0) return null;

    const usuario = users[0];
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashRecoveryToken(token);
    const ttlMinutes = Number(process.env.PASSWORD_RESET_TTL_MINUTES || 20);
    const expiraEm = new Date(Date.now() + ttlMinutes * 60 * 1000);
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();
        await connection.query(
            'UPDATE PasswordResetTokens SET usado_em = COALESCE(usado_em, NOW()) WHERE id_usuario = ? AND usado_em IS NULL',
            [usuario.id_usuario]
        );
        await connection.query(
            `INSERT INTO PasswordResetTokens (id_usuario, token_hash, expira_em)
             VALUES (?, ?, ?)`,
            [usuario.id_usuario, tokenHash, expiraEm]
        );
        await connection.commit();
        return { ...usuario, token, expira_em: expiraEm };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function redefinirSenha(token, novaSenha) {
    const tokenHash = hashRecoveryToken(token);
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();
        const [rows] = await connection.query(
            `SELECT id_token, id_usuario, expira_em, usado_em
             FROM PasswordResetTokens
             WHERE token_hash = ?
             LIMIT 1
             FOR UPDATE`,
            [tokenHash]
        );
        const registro = rows[0];
        if (!registro || registro.usado_em || new Date(registro.expira_em).getTime() <= Date.now()) {
            throw criarErro('O link de recuperação é inválido ou expirou.', 400);
        }

        const senhaHash = await bcrypt.hash(novaSenha, 12);
        await connection.query(
            'UPDATE Usuarios SET senha = ?, versao_sessao = versao_sessao + 1 WHERE id_usuario = ?',
            [senhaHash, registro.id_usuario]
        );
        await connection.query(
            'UPDATE PasswordResetTokens SET usado_em = NOW() WHERE id_usuario = ? AND usado_em IS NULL',
            [registro.id_usuario]
        );
        await connection.commit();
        return { redefinida: true };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = {
    login,
    buscarUsuarioPorId,
    buscarUsuarioSessao,
    invalidarSessoes,
    criarTokenRecuperacao,
    redefinirSenha,
    hashRecoveryToken,
    enviarCodigoVerificacaoPorEmail,
    verificarCodigoEmail
};
