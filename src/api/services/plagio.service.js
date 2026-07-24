const IA_ANALISE_URL = process.env.IA_ANALISE_URL || 'http://127.0.0.1:8000/api/analisar';
const TIMEOUT_MS = Number(process.env.IA_ANALISE_TIMEOUT_MS || 10000);

async function enviarParaAnaliseIA(texto_original, texto_suspeito) {
    if (![texto_original, texto_suspeito].every((texto) => typeof texto === 'string' && texto.trim())) {
        const error = new Error('Os textos original e suspeito são obrigatórios.');
        error.status = 400;
        throw error;
    }

    try {
        const response = await fetch(IA_ANALISE_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ texto_original, texto_suspeito }),
            signal: AbortSignal.timeout(TIMEOUT_MS)
        });

        if (!response.ok) {
            const details = await response.text();
            const error = new Error(`Falha ao analisar texto na IA externa (${response.status}). ${details}`.trim());
            error.status = response.status === 503 ? 503 : 502;
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
