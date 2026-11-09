export function questionnaireRoute(search) {
    const params = new URLSearchParams(search);
    const id = (name, optional = false) => {
        if (optional && !params.has(name)) return null;
        const raw = params.get(name) || '';
        if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new Error('Este endereço de avaliação é inválido. Volte à Sala Virtual e escolha uma avaliação da sua turma.');
        return Number(raw);
    };
    const idTurma = id('id_turma');
    const idQuestionario = id('id_questionario', true);
    const tipo = String(params.get('tipo') ?? 'exercicio').toLowerCase();
    if (!['prova', 'exercicio'].includes(tipo)) throw new Error('Este tipo de avaliação não existe. Volte à Sala Virtual e escolha uma avaliação.');
    return { idTurma, idQuestionario, tipo };
}
