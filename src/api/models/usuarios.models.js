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
    const colunasParaAtualizar = Object.keys(dadosParaAtualizar);
    const setClause = colunasParaAtualizar.map(coluna => `${coluna} = ?`).join(',');
    const valoresParaAtualizar = Object.values(dadosParaAtualizar);
    const [result] = await db.query(`UPDATE Usuarios SET ${setClause} WHERE id_usuario = ?`, [...valoresParaAtualizar, id]);
    return { affectedRows: result.affectedRows };
}

async function buscarUsuarioPorId(id) {
    const [affectedRows] = await db.query('SELECT * FROM Usuarios WHERE id_usuario = ?', [id]);
    if (affectedRows.length === 0) {
        console.error("Usuário não encontrado:", error);
        throw new Error('Usuário não encontrado!');
    }else{
        console.log("Usuário encontrado:", affectedRows[0]);
        return affectedRows[0];
    }
}

async function buscarTodosUsuarios() {
    const [affectedRows] = await db.query('SELECT * FROM Usuarios');
    if (affectedRows.length === 0) {
        console.error("Nenhum usuário encontrado.");
        throw new error('Nenhum usuário encontrado!');
    } else {
        console.log("Usuários encontrados:", affectedRows);
        return affectedRows;
    }
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
    return [result[0].total];
}


module.exports = {
    criarUsuario,
    atualizarUsuario,
    buscarUsuarioPorId,
    buscarTodosUsuarios,
    deletarUsuario,
    count
}