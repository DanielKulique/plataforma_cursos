//importar o express framework
require('dotenv').config();
const express = require('express');
const db = require('./src/config/database'); //importa dados de conexao bd

//cria instancia express
const app = express();
//define a porta
const PORTA = 3000;

//cria rota teste
app.get('/', (req, res) => {
    res.send('Servidor funcionando!');
});

app.get('/teste-db', async(req, res) => {
    try {
        const [rows] = await db.query('SELECT 1 + 1 AS solution');
        res.json({
            mensagem: "Conexao com o banco de dados bem-sucedida!",
            resultado: `1 + 1 = ${rows[0].solution}`
        });
    }catch (error){
        res.status(500).json({
            mesagem: "Erro ao conectar com o banco de dados.",
            erro: error.message
        });
    }
});

//inicia o servidor e o faz escutar na porta definida
app.listen(PORTA,() => {
    console.log(`Servidor rodandando na porta ${PORTA}. Acesse http://localhost:${PORTA}`);
})