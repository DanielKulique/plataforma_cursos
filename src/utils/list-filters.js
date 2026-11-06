'use strict';

function parseListFilters(query = {}, enums = {}) {
    const filters = {};
    if (query.q !== undefined) {
        if (typeof query.q !== 'string' || query.q.length > 200) {
            throw Object.assign(new Error('A busca deve ser um texto de até 200 caracteres.'), { status: 400, code: 'FILTRO_INVALIDO' });
        }
        if (query.q.trim()) filters.q = query.q.trim();
    }
    for (const [key, allowed] of Object.entries(enums)) {
        if (query[key] === undefined || query[key] === '') continue;
        if (!allowed.includes(query[key])) {
            throw Object.assign(new Error(`Filtro ${key} inválido.`), { status: 400, code: 'FILTRO_INVALIDO' });
        }
        filters[key] = query[key];
    }
    return filters;
}

// Preserve literal substring searches: %, _ and the escape character are data.
function containsPattern(value) {
    return `%${value.replace(/[!%_]/g, '!$&')}%`;
}

module.exports = { parseListFilters, containsPattern };
