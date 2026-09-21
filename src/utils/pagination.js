'use strict';

function paginationError(message) {
    return Object.assign(new Error(message), { status: 400, code: 'PAGINACAO_INVALIDA' });
}

function parsePagination(query = {}, options = {}) {
    const defaultLimit = Number(options.defaultLimit || process.env.DEFAULT_PAGE_SIZE || 50);
    const maxLimit = Number(options.maxLimit || process.env.MAX_PAGE_SIZE || 100);
    const rawPage = query.page === undefined ? '1' : String(query.page);
    const rawLimit = query.limit === undefined ? String(defaultLimit) : String(query.limit);
    if (!/^\d+$/.test(rawPage) || !/^\d+$/.test(rawLimit)) {
        throw paginationError('page e limit devem ser inteiros positivos.');
    }
    const page = Number(rawPage);
    const requestedLimit = Number(rawLimit);
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(requestedLimit) || requestedLimit < 1) {
        throw paginationError('page e limit devem ser inteiros positivos.');
    }
    const limit = Math.min(requestedLimit, maxLimit);
    return Object.freeze({ page, limit, offset: (page - 1) * limit });
}

function paginated(items, total, pagination) {
    return {
        items,
        page: pagination.page,
        limit: pagination.limit,
        total: Number(total)
    };
}

module.exports = { paginated, parsePagination };
