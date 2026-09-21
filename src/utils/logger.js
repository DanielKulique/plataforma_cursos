const REDACTED = '[REDACTED]';

const SENSITIVE_KEYS = new Set([
    'apikey', 'authorization', 'codigodeverificacao', 'codigodebug', 'codigo',
    'cookie', 'cookies', 'cpf', 'dbpassword', 'email', 'fullname', 'idtoken',
    'jwt', 'jwtsecret', 'mail', 'mobile', 'nome', 'nomecompleto', 'otp',
    'password', 'passwd', 'phone', 'pin', 'proxyauthorization', 'refreshtoken',
    'resendapikey', 'secret', 'senha', 'setcookie', 'telefone', 'telephone',
    'token', 'verificationcode', 'accesstoken'
]);

const SENSITIVE_OBJECT_KEYS = new Set([
    'body', 'headers', 'payload', 'req', 'request', 'response', 'user', 'usuario'
]);

function normalizeKey(key) {
    return String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isSensitiveKey(key) {
    const normalized = normalizeKey(key);
    return SENSITIVE_KEYS.has(normalized) || SENSITIVE_OBJECT_KEYS.has(normalized);
}

function redactString(value) {
    return String(value)
        .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
        .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, REDACTED)
        .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, REDACTED)
        // Do not mistake an all-numeric UUID segment for a telephone number.
        .replace(/(?<![A-Fa-f0-9-])\+?\d{10,15}(?![A-Fa-f0-9-])/g, REDACTED)
        .replace(/((?:c[oó]digo|senha|password|secret)\s*[:=]\s*)\S+/gi, `$1${REDACTED}`)
        .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, REDACTED);
}

function redact(value, seen = new WeakMap()) {
    if (typeof value === 'string') return redactString(value);
    if (value === null || typeof value !== 'object') return value;

    if (seen.has(value)) return '[CIRCULAR]';
    seen.set(value, true);

    if (value instanceof Error) {
        return {
            name: value.name,
            code: value.code || value.errno || 'UNEXPECTED_ERROR',
            stack: value.stack ? redactString(value.stack) : undefined
        };
    }

    if (Array.isArray(value)) return value.map((item) => redact(item, seen));

    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
        key,
        isSensitiveKey(key) ? REDACTED : redact(item, seen)
    ]));
}

function write(level, operation, details = {}) {
    const event = {
        timestamp: new Date().toISOString(),
        level,
        operation: redactString(operation),
        ...redact(details)
    };
    const method = typeof console[level] === 'function' ? level : 'log';
    console[method](JSON.stringify(event));
}

module.exports = {
    REDACTED,
    redact,
    isSensitiveKey,
    info: (operation, details) => write('info', operation, details),
    warn: (operation, details) => write('warn', operation, details),
    error: (operation, details) => write('error', operation, details)
};
