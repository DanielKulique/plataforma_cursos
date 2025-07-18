//importar o express framework
const express = require('express');

//cria instancia express
const app = express();

//define a porta

const PORTA = 3000;

//cria rota teste
app.get('/', (req, res) => {
    res.send('Servidor funcionando!');
});

//inicia o servidor e o faz escutar na porta definida
app.listen(PORTA,() => {
    console.log(`Servidor rodandando na porta ${PORTA}. Acesse http://localhost:${PORTA}`);
})