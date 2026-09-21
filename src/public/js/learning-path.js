// Presentation only: academic totals continue to come from the server.
export const tipoMaterial = { TEXTO: 'Texto', VIDEO: 'Vídeo', PDF: 'PDF', LINK: 'Link', ATIVIDADE: 'Atividade', EXERCICIO: 'Exercício', PROVA: 'Prova' };

export function ordenarItens(itens) {
    return [...itens].sort((a, b) => Number(a.ordem) - Number(b.ordem)
        || (a.id_questionario ? 1 : 0) - (b.id_questionario ? 1 : 0)
        || String(a.tipo || '').localeCompare(String(b.tipo || ''), 'pt-BR')
        || String(a.titulo).localeCompare(String(b.titulo), 'pt-BR'));
}

export function progressoAula(itens) {
    const total = itens.length;
    const concluidos = itens.filter((item) => Boolean(Number(item.concluido))).length;
    const iniciado = concluidos > 0 || itens.some((item) => Boolean(Number(item.em_andamento)));
    return {
        total, concluidos, percentual: total ? Math.round(concluidos / total * 100) : 0,
        estado: !total ? 'Sem materiais publicados' : concluidos === total ? 'Concluída' : iniciado ? 'Em andamento' : 'Não iniciada'
    };
}

export function montarAulas(modulos, conteudos, questionarios) {
    return ordenarItens(modulos).map((modulo, indice) => {
        const itens = ordenarItens([...conteudos, ...questionarios].filter((item) =>
            Number(item.id_modulo) === Number(modulo.id_modulo)));
        return { ...modulo, numero: indice + 1, itens, progresso: progressoAula(itens) };
    });
}

export function correspondeFiltro(item, filtro, busca) {
    return (filtro === 'todos' || item.tipo.toLowerCase() === filtro)
        && `${item.titulo} ${item.descricao || ''}`.toLocaleLowerCase('pt-BR')
            .includes(busca.trim().toLocaleLowerCase('pt-BR'));
}
