'use strict';

const INTERNAL_ERROR_MESSAGE = 'Erro interno do servidor.';

function normalizeStatus(error) {
    const status = Number(error?.status);
    return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}

function buildErrorResponse(error, options = {}) {
    const status = normalizeStatus(error);
    const isDomainError = status < 500;
    const internalMessage = options.internalMessage || INTERNAL_ERROR_MESSAGE;
    const message = isDomainError && typeof error?.message === 'string' && error.message.trim()
        ? error.message
        : internalMessage;
    const body = { error: message };

    if (isDomainError && error?.code) body.code = error.code;
    if (options.legacyKey) body[options.legacyKey] = message;

    return { status, body };
}

function sendHttpError(res, error, options = {}) {
    const response = buildErrorResponse(error, options);
    return res.status(response.status).json(response.body);
}

module.exports = {
    INTERNAL_ERROR_MESSAGE,
    buildErrorResponse,
    sendHttpError
};
