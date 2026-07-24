const mysql = require('mysql2/promise');
const logger = require('../utils/logger');
require('dotenv').config({ quiet: true });//carrega variaveis do .env

if (process.env.DB_NAME === 'site_cursos') {
	throw new Error('Configuração recusada: site_cursos é o banco legado protegido e não pode ser usado pelo runtime.');
}

//cria pool de conexoes 
const pool = mysql.createPool({
	host: process.env.DB_HOST,
	port: Number(process.env.DB_PORT || 3306),
	user: process.env.DB_USER,
	password: process.env.DB_PASSWORD,
	database: process.env.DB_NAME,
	waitForConnections:true,
	connectionLimit: 10,
	queueLimit: 0
});

logger.info('database.pool.created');

module.exports = pool;
