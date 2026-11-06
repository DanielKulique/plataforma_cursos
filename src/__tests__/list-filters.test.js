'use strict';
const { parseListFilters, containsPattern } = require('../utils/list-filters');

test('preserves unfiltered requests and trims literal search text', () => {
    expect(parseListFilters({})).toEqual({});
    expect(parseListFilters({ q: '  Maria  ', tipo: 'PROFESSOR' }, { tipo: ['PROFESSOR'] }))
        .toEqual({ q: 'Maria', tipo: 'PROFESSOR' });
    expect(parseListFilters({ q: ' ', tipo: '' }, { tipo: ['PROFESSOR'] })).toEqual({});
    expect(containsPattern("100%_!'" )).toBe("%100!%!_!!'%");
});

test.each([{ q: ['a', 'b'] }, { q: { nested: 'a' } }, { q: 'a'.repeat(201) },
    { tipo: 'ADMIN' }, { tipo: ['PROFESSOR'] }])('rejects malformed filter %j before querying', query => {
    expect(() => parseListFilters(query, { tipo: ['PROFESSOR'] })).toThrow();
    try { parseListFilters(query, { tipo: ['PROFESSOR'] }); } catch (error) {
        expect(error).toMatchObject({ status: 400, code: 'FILTRO_INVALIDO' });
    }
});
