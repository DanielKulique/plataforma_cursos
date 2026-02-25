const db = require('../../config/database');

async function status(req, res) {
    try {
        const [rows] = await db.query('SELECT 1 AS ok');

        return res.status(200).json({
            mensagem: 'Aplicação e banco de dados estão operacionais.',
            banco: rows?.[0]?.ok === 1 ? 'ok' : 'indefinido'
        });
    } catch (error) {
        return res.status(500).json({
            mensagem: 'Falha ao verificar status do banco de dados.',
            erro: error.message
        });
    }
}

module.exports = {
    status
};
