//importar o express framework
require('dotenv').config();
const express = require('express');
const db = require('./src/config/database'); //importa dados de conexao bd
const path = require('path');

//importa arquivos de rotas
const cursosRoutes = require('./src/api/routes/cursos.routes');
const turmasRoutes = require('./src/api/routes/turmas.routes');
const matriculasRoutes = require('./src/api/routes/matricula.routes');
const usuariosRoutes = require('./src/api/routes/usuarios.routes');
const authRoutes = require('./src/api/routes/auth.routes');

//aplicacao express
const app = express(); //cria instancia express
const PORTA = process.env.PORT || 3000; //define a porta

//midleware essenciais
app.use(express.json()); //permite receber dados em formato json

app.use(express.static(path.join(__dirname, 'src', 'public')));

//registro da rotas apis
app.use('/api/cursos', cursosRoutes);
app.use('/api/turmas', turmasRoutes);
app.use('/api/matriculas', matriculasRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/auth', authRoutes);

/*app.get('/', (req, res) => {  //cria rota teste
    res.send('Servidor funcionando!');
});
*/

app.get('/teste-db', async(req, res) => {
    try {
        const [rows] = await db.query('SELECT 1 + 1 AS solution');
        res.json({
            mensagem: "Conexao com o banco de dados bem-sucedida!",
            resultado: `1 + 1 = ${rows[0].solution}`
        });
    }catch (error){
        res.status(500).json({
            mensagem: "Erro ao conectar com o banco de dados.",
            erro: error.message
        });
    }
});

//inicia o servidor e o faz escutar na porta definida
app.listen(PORTA,() => {
    console.log(`Servidor rodando na porta ${PORTA}. Acesse http://localhost:${PORTA}`);
})
