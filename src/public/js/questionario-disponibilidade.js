export async function buscarQuestionarioDisponivel({
    idTurma,
    tipo,
    token,
    request = fetch
}) {
    const response = await request(
        `/api/turmas/${idTurma}/questionarios/disponivel?tipo=${encodeURIComponent(tipo)}`,
        { headers: { Authorization: `Bearer ${token}` } }
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
        && questionario.perguntas.every(
            (pergunta) => Array.isArray(pergunta.opcoes) && pergunta.opcoes.length >= 2
        );
    if (!perguntasValidas) {
        throw new Error('O questionário ativo está incompleto.');
    }

    return questionario;
}
