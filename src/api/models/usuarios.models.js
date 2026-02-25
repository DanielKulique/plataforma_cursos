const bcrypt = require('bcrypt');
const db = require('../../config/database');
const fatorCusto = 10;


async function criarUsuario(usuario) {
    const {nome_completo, cpf, email, senha, telefone, tipo } = usuario;

    //hash da senha
    const hash = await bcrypt.hash(senha, fatorCusto);
    const [result] = await db.query('INSERT INTO Usuarios (nome_completo, cpf, email, senha, telefone, tipo) VALUES (?, ?, ?, ?, ?, ?)', [nome_completo, cpf, email, hash, telefone, tipo]);
    if (result.affectedRows === 0) {
        throw new Error('Erro ao criar usuário');
    }
    return { id_usuario: result.insertId, nome_completo, cpf, email, telefone, tipo };
}

async function atualizarUsuario(id, dadosParaAtualizar) {
    const camposPermitidos = ['nome_completo', 'cpf', 'email', 'senha', 'telefone'];
    const colunasParaAtualizar = Object.keys(dadosParaAtualizar).filter((coluna) => camposPermitidos.includes(coluna));

    if (colunasParaAtualizar.length === 0) {
        throw new Error('Nenhum campo válido para atualizar.');
    }

    const setClause = colunasParaAtualizar.map(coluna => `${coluna} = ?`).join(',');
    const valoresParaAtualizar = colunasParaAtualizar.map((coluna) => dadosParaAtualizar[coluna]);
    const [result] = await db.query(`UPDATE Usuarios SET ${setClause} WHERE id_usuario = ?`, [...valoresParaAtualizar, id]);

    if (result.affectedRows === 0) {
        throw new Error('Usuário não encontrado!');
    }

    return { affectedRows: result.affectedRows };
}

async function buscarUsuarioPorId(id) {
    const [affectedRows] = await db.query(
        'SELECT id_usuario, nome_completo, cpf, email, telefone, tipo, data_cadastro FROM Usuarios WHERE id_usuario = ?',
        [id]
    );
    if (affectedRows.length === 0) {
        throw new Error('Usuário não encontrado!');
    } else {
        return affectedRows[0];
    }
}

async function buscarTodosUsuarios() {
    const [affectedRows] = await db.query(
        'SELECT id_usuario, nome_completo, cpf, email, telefone, tipo, data_cadastro FROM Usuarios'
    );
    return affectedRows;
}

async function deletarUsuario(id) {
    const [result] = await db.query('DELETE FROM Usuarios WHERE id_usuario = ?', [id]);
    if (result.affectedRows === 0) {
        console.error("Usuário não encontrado para deletar.");
        throw new Error('Usuário não encontrado para deletar!');
    } else {
        console.log("Usuário deletado com sucesso:", id);
        return { affectedRows: result.affectedRows };
    }
}

async function count(){
    const [result] = await db.query('SELECT COUNT(*) as total FROM Usuarios');
	return result[0].total;
}

async function verificarDisponibilidade(email, cpf) {
    const [rows] = await db.query(
        'SELECT email, cpf FROM Usuarios WHERE email = ? OR cpf = ? LIMIT 10',
        [email, cpf]
    );

    const emailDisponivel = !rows.some((item) => item.email === email);
    const cpfDisponivel = !rows.some((item) => item.cpf === cpf);

    return {
        email_disponivel: emailDisponivel,
        cpf_disponivel: cpfDisponivel
    };
}


module.exports = {
    criarUsuario,
    atualizarUsuario,
    buscarUsuarioPorId,
    buscarTodosUsuarios,
    deletarUsuario,
    count,
    verificarDisponibilidade
}