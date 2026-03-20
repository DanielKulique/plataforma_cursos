const IA_ANALISE_URL = process.env.IA_ANALISE_URL || 'http://localhost:8000/api/analisar';

async function enviarParaAnaliseIA(texto) {
    if (!texto || typeof texto !== 'string' || texto.trim().length === 0) {
        const error = new Error('Texto inválido para análise.');
        error.status = 400;
        throw error;
    }

    try {
        const response = await fetch(IA_ANALISE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ texto })
        });

        if (!response.ok) {
            const details = await response.text();
            const error = new Error(`Falha ao analisar texto na IA externa (${response.status}). ${details}`.trim());
            error.status = 502;
            throw error;
        }

        return await response.json();
    } catch (err) {
        if (err.status) {
            throw err;
        }

        const error = new Error('Não foi possível conectar ao serviço de análise de plágio no momento. Tente novamente em instantes.');
        error.status = 503;
        throw error;
    }
}

module.exports = {
    enviarParaAnaliseIA
};
