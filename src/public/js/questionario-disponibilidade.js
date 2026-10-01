import { authenticatedFetch } from './auth.js';

export async function buscarQuestionarioDisponivel({
    idTurma,
    tipo,
    request = authenticatedFetch
}) {
    const response = await request(
        `/api/turmas/${idTurma}/questionarios/disponivel?tipo=${encodeURIComponent(tipo)}`,
        { credentials: 'same-origin' }
    );
    const body = await response.json().catch(() => ({}));

    if (response.status === 403 || response.status === 404) return null;
    if (!response.ok) {
        const error = new Error(body.mensagem || 'Não foi possível verificar os questionários.');
        error.status = response.status;
        throw error;
    }

    const questionario = body.questionario;
    const perguntasValidas = Array.isArray(questionario?.perguntas)
        && questionario.perguntas.length > 0
        && questionario.perguntas.every((pergunta) => {
            if (pergunta.tipo_pergunta === 'ASSOCIACAO') {
                return Array.isArray(pergunta.itens_esquerda) && Array.isArray(pergunta.itens_direita)
                    && pergunta.itens_esquerda.length >= 2
                    && pergunta.itens_esquerda.length === pergunta.itens_direita.length;
            }
            if (pergunta.tipo_pergunta === 'VERDADEIRO_FALSO' && pergunta.formato_resposta === 'BOOLEANO') {
                return true;
            }
            return Array.isArray(pergunta.opcoes) && pergunta.opcoes.length >= 2;
        });
    if (!perguntasValidas) {
        throw new Error('O questionário ativo está incompleto.');
    }

    return questionario;
}
