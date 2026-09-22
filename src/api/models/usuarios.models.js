const bcrypt = require('bcrypt');
const db = require('../../config/database');
const {
    calcularExpiracaoCodigo,
    gerarCodigoVerificacao,
    normalizarEmail
} = require('../../utils/identity');

const FATOR_CUSTO = 10;
const TIPOS_USUARIO = ['ALUNO', 'PROFESSOR', 'ADMIN'];

function erroDominio(message, status, code) {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    return error;
}

function traduzirDuplicidade(error) {
    if (error?.errno !== 1062) return error;

    const detalhe = `${error.message || ''} ${error.sqlMessage || ''}`;
    if (/cpf/i.test(detalhe)) {
        return erroDominio('CPF já cadastrado.', 409, 'CPF_DUPLICADO');
    }
    if (/email/i.test(detalhe)) {
        return erroDominio('E-mail já cadastrado.', 409, 'EMAIL_DUPLICADO');
    }
    return erroDominio('Usuário duplicado.', 409, 'USUARIO_DUPLICADO');
}

async function criarUsuario(usuario) {
    const { nome_completo, cpf, senha, telefone, tipo } = usuario;
    const email = normalizarEmail(usuario.email);
    const hash = await bcrypt.hash(senha, FATOR_CUSTO);

    try {
        const [result] = await db.query(
            'INSERT INTO Usuarios (nome_completo, cpf, email, senha, telefone, tipo) VALUES (?, ?, ?, ?, ?, ?)',
            [nome_completo, cpf, email, hash, telefone || null, tipo]
        );
        if (result.affectedRows === 0) {
            throw new Error('Erro ao criar usuário');
        }
        return { id_usuario: result.insertId, nome_completo, cpf, email, telefone: telefone || null, tipo };
    } catch (error) {
        throw traduzirDuplicidade(error);
    }
}

async function criarUsuarioComVerificacao(usuario, verificado) {
    const { nome_completo, cpf, senha, telefone, tipo } = usuario;
    const email = normalizarEmail(usuario.email);
    const hash = await bcrypt.hash(senha, FATOR_CUSTO);
    const codigo = verificado ? null : gerarCodigoVerificacao();
    const expiraEm = verificado ? null : calcularExpiracaoCodigo();
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();
        const [result] = await connection.query(
            'INSERT INTO Usuarios (nome_completo, cpf, email, senha, telefone, tipo) VALUES (?, ?, ?, ?, ?, ?)',
            [nome_completo, cpf, email, hash, telefone || null, tipo]
        );
        if (result.affectedRows !== 1) throw new Error('Erro ao criar usuário');

        await connection.query(
            `INSERT INTO EmailVerificacoes (email, codigo, verificado, expira_em)
             VALUES (?, ?, ?, ?)`,
            [email, codigo, verificado ? 1 : 0, expiraEm]
        );
        await connection.commit();

        return {
            usuario: {
                id_usuario: result.insertId,
                nome_completo,
                cpf,
                email,
                telefone: telefone || null,
                tipo
            },
            verificacao: { codigo, expira_em: expiraEm, verificado: Boolean(verificado) }
        };
    } catch (error) {
        await connection.rollback();
        throw traduzirDuplicidade(error);
    } finally {
        connection.release();
    }
}

function criarAlunoComVerificacao(usuario, verificado = false) {
    return criarUsuarioComVerificacao({ ...usuario, tipo: 'ALUNO' }, verificado);
}

function criarUsuarioAdministrativo(usuario) {
    return criarUsuarioComVerificacao(usuario, true);
}

async function atualizarUsuario(id, dadosParaAtualizar) {
    const camposPermitidos = ['nome_completo', 'cpf', 'email', 'telefone'];
    const colunas = Object.keys(dadosParaAtualizar).filter((campo) => camposPermitidos.includes(campo));

    if (colunas.length === 0) {
        throw erroDominio('Nenhum campo válido para atualizar.', 400, 'SEM_CAMPOS_VALIDOS');
    }

    const setClause = colunas.map((coluna) => `${coluna} = ?`).join(', ');
    const valores = colunas.map((coluna) => dadosParaAtualizar[coluna]);

    try {
        const [result] = await db.query(
            `UPDATE Usuarios SET ${setClause} WHERE id_usuario = ?`,
            [...valores, id]
        );
        if (result.affectedRows === 0) {
            throw erroDominio('Usuário não encontrado.', 404, 'USUARIO_NAO_ENCONTRADO');
        }
        return buscarUsuarioPorId(id);
    } catch (error) {
        throw traduzirDuplicidade(error);
    }
}

async function buscarUsuarioPorId(id) {
    const [rows] = await db.query(
        'SELECT id_usuario, nome_completo, cpf, email, telefone, tipo, data_cadastro FROM Usuarios WHERE id_usuario = ?',
        [id]
    );
    if (rows.length === 0) {
        throw erroDominio('Usuário não encontrado.', 404, 'USUARIO_NAO_ENCONTRADO');
    }
    return rows[0];
}

async function buscarTodosUsuarios(pagination) {
    const [[count]] = await db.query('SELECT COUNT(*) AS total FROM Usuarios');
    const [rows] = await db.query(
        `SELECT id_usuario, nome_completo, cpf, email, telefone, tipo, data_cadastro
         FROM Usuarios ORDER BY nome_completo, id_usuario LIMIT ? OFFSET ?`,
        [pagination.limit, pagination.offset]
    );
    return { items: rows, total: Number(count.total) };
}

async function obterVinculos(connection, id) {
    const [rows] = await connection.query(
        `SELECT
            (SELECT COUNT(*) FROM Turmas WHERE id_professor = ?) AS turmas,
            (SELECT COUNT(*) FROM Matriculas WHERE id_aluno = ?) AS matriculas,
            (SELECT COUNT(*) FROM Q_Tentativas WHERE id_usuario = ?) AS tentativas,
            (SELECT COUNT(*) FROM Q_Respostas WHERE id_usuario = ?) AS respostas,
            (SELECT COUNT(*) FROM ConteudosProgresso WHERE id_aluno = ?) AS progresso,
            (SELECT COUNT(*) FROM AnalisesPlagio WHERE usuario_id = ?) AS analises`,
        [id, id, id, id, id, id]
    );
    return rows[0];
}

function possuiVinculoAluno(vinculos) {
    return Number(vinculos.matriculas) > 0
        || Number(vinculos.tentativas) > 0
        || Number(vinculos.respostas) > 0
        || Number(vinculos.progresso) > 0
        || Number(vinculos.analises) > 0;
}

async function protegerUltimoAdmin(connection, usuario, novoTipo) {
    if (usuario.tipo !== 'ADMIN' || novoTipo === 'ADMIN') return;

    const [admins] = await connection.query(
        "SELECT id_usuario FROM Usuarios WHERE tipo = 'ADMIN' FOR UPDATE"
    );
    if (admins.length <= 1) {
        throw erroDominio('O último ADMIN não pode perder o papel administrativo.', 409, 'ULTIMO_ADMIN');
    }
}

async function atualizarUsuarioAdmin(id, dadosParaAtualizar) {
    const camposPermitidos = ['nome_completo', 'cpf', 'email', 'telefone', 'tipo'];
    const colunas = Object.keys(dadosParaAtualizar).filter((campo) => camposPermitidos.includes(campo));

    if (colunas.length === 0) {
        throw erroDominio('Nenhum campo válido para atualizar.', 400, 'SEM_CAMPOS_VALIDOS');
    }
    if (dadosParaAtualizar.tipo && !TIPOS_USUARIO.includes(dadosParaAtualizar.tipo)) {
        throw erroDominio('Tipo de usuário inválido.', 400, 'TIPO_INVALIDO');
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [rows] = await connection.query(
            'SELECT id_usuario, nome_completo, cpf, email, telefone, tipo, data_cadastro FROM Usuarios WHERE id_usuario = ? FOR UPDATE',
            [id]
        );
        if (rows.length === 0) {
            throw erroDominio('Usuário não encontrado.', 404, 'USUARIO_NAO_ENCONTRADO');
        }

        const usuario = rows[0];
        const novoTipo = dadosParaAtualizar.tipo || usuario.tipo;
        if (novoTipo !== usuario.tipo) {
            await protegerUltimoAdmin(connection, usuario, novoTipo);
            const vinculos = await obterVinculos(connection, id);
            if (usuario.tipo === 'PROFESSOR' && Number(vinculos.turmas) > 0 && novoTipo !== 'PROFESSOR') {
                throw erroDominio('Professor com turmas associadas não pode mudar para esse papel.', 409, 'PROFESSOR_COM_TURMAS');
            }
            if (usuario.tipo === 'ALUNO' && possuiVinculoAluno(vinculos) && novoTipo !== 'ALUNO') {
                throw erroDominio('Aluno com vínculos acadêmicos não pode mudar para esse papel.', 409, 'ALUNO_COM_VINCULOS');
            }
        }

        const setClause = colunas.map((coluna) => `${coluna} = ?`).join(', ');
        const valores = colunas.map((coluna) => dadosParaAtualizar[coluna]);
        await connection.query(
            `UPDATE Usuarios SET ${setClause} WHERE id_usuario = ?`,
            [...valores, id]
        );

        const [atualizado] = await connection.query(
            'SELECT id_usuario, nome_completo, cpf, email, telefone, tipo, data_cadastro FROM Usuarios WHERE id_usuario = ?',
            [id]
        );
        await connection.commit();
        return atualizado[0];
    } catch (error) {
        await connection.rollback();
        throw traduzirDuplicidade(error);
    } finally {
        connection.release();
    }
}

async function alterarSenha(id, atorId, senhaAtual, novaSenha) {
    if (Number(id) !== Number(atorId)) {
        throw erroDominio('Você só pode alterar a própria senha.', 403, 'SENHA_OUTRO_USUARIO');
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [rows] = await connection.query(
            'SELECT id_usuario, senha FROM Usuarios WHERE id_usuario = ? FOR UPDATE',
            [id]
        );
        if (rows.length === 0) {
            throw erroDominio('Usuário não encontrado.', 404, 'USUARIO_NAO_ENCONTRADO');
        }
        if (!await bcrypt.compare(senhaAtual, rows[0].senha)) {
            throw erroDominio('Senha atual incorreta.', 403, 'SENHA_ATUAL_INCORRETA');
        }
        if (await bcrypt.compare(novaSenha, rows[0].senha)) {
            throw erroDominio('A nova senha deve ser diferente da senha atual.', 409, 'SENHA_REPETIDA');
        }

        const hash = await bcrypt.hash(novaSenha, FATOR_CUSTO);
        await connection.query(
            'UPDATE Usuarios SET senha = ?, versao_sessao = versao_sessao + 1 WHERE id_usuario = ?',
            [hash, id]
        );
        await connection.commit();
        return true;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function deletarUsuario(id, atorId) {
    if (Number(id) === Number(atorId)) {
        throw erroDominio('Autoexclusão administrativa não é permitida.', 409, 'AUTOEXCLUSAO');
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [rows] = await connection.query(
            'SELECT id_usuario, email, tipo FROM Usuarios WHERE id_usuario = ? FOR UPDATE',
            [id]
        );
        if (rows.length === 0) {
            throw erroDominio('Usuário não encontrado.', 404, 'USUARIO_NAO_ENCONTRADO');
        }

        const usuario = rows[0];
        await protegerUltimoAdmin(connection, usuario, null);
        const vinculos = await obterVinculos(connection, id);
        if (Object.values(vinculos).some((total) => Number(total) > 0)) {
            throw erroDominio('Usuário possui vínculos e não pode ser excluído.', 409, 'USUARIO_COM_VINCULOS');
        }

        await connection.query('DELETE FROM EmailVerificacoes WHERE email = ?', [usuario.email]);
        await connection.query('DELETE FROM Usuarios WHERE id_usuario = ?', [id]);
        await connection.commit();
        return true;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

async function verificarDisponibilidade(email, cpf) {
    const [rows] = await db.query(
        'SELECT email, cpf FROM Usuarios WHERE email = ? OR cpf = ? LIMIT 10',
        [email, cpf]
    );

    return {
        email_disponivel: !rows.some((item) => item.email === email),
        cpf_disponivel: !rows.some((item) => item.cpf === cpf)
    };
}

module.exports = {
    criarAlunoComVerificacao,
    criarUsuario,
    criarUsuarioAdministrativo,
    atualizarUsuario,
    atualizarUsuarioAdmin,
    alterarSenha,
    buscarUsuarioPorId,
    buscarTodosUsuarios,
    deletarUsuario,
    verificarDisponibilidade
};
