const OBRIGATORIAS = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'JWT_SECRET'];

function validarAmbiente(env = process.env) {
    const ausentes = OBRIGATORIAS.filter((nome) => !String(env[nome] || '').trim());
    if (ausentes.length) {
        const erro = new Error(`Variáveis de ambiente obrigatórias ausentes: ${ausentes.join(', ')}`);
        erro.code = 'CONFIGURACAO_INVALIDA';
        throw erro;
    }
}

module.exports = { validarAmbiente };
