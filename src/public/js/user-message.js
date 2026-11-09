// Only user-facing text is normalized; logs and API contracts stay unchanged.
export function userMessage(value, fallback = 'Não foi possível concluir a operação. Tente novamente.') {
    const message = typeof value === 'string' ? value : value?.message;
    if (typeof message !== 'string' || !message.trim() || message.length > 300
        || [...message].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
        || /\b(?:HTTP|JSON|backend|stack|traceback|TypeError|SyntaxError|ECONN\w*|ER_\w+|SELECT|INSERT|UPDATE|DELETE)\b|\/(?:app|home|srv|var)\//i.test(message)
        || /failed to fetch|networkerror|fetch failed|unexpected token/i.test(message)) return fallback;
    return message;
}
