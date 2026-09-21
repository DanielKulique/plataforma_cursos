const INVALID_SESSION_STATUSES = new Set([401, 403, 404]);
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

let cachedUser = null;
let csrfToken = null;
let sessionResolved = false;
let sessionPromise = null;
let capabilitiesPromise = null;

function resetSessionCache() {
    cachedUser = null;
    csrfToken = null;
    sessionResolved = false;
    sessionPromise = null;
    capabilitiesPromise = null;
}

export function clearToken() {
    resetSessionCache();
}

export async function login(email, senha) {
    const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload.mensagem || payload.message || 'Falha ao autenticar.');
    }

    resetSessionCache();
    cachedUser = payload.usuario;
    csrfToken = payload.csrf_token || null;
    sessionResolved = true;
    return payload;
}

export async function getCurrentUser({ force = false } = {}) {
    if (!force && sessionResolved) return cachedUser;
    if (!force && sessionPromise) return sessionPromise;

    sessionPromise = (async () => {
        const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
        if (INVALID_SESSION_STATUSES.has(response.status)) {
            resetSessionCache();
            sessionResolved = true;
            return null;
        }
        if (!response.ok) throw new Error('Erro ao carregar sessão.');

        const payload = await response.json().catch(() => ({}));
        if (!payload.usuario?.id_usuario || !payload.usuario?.tipo) {
            resetSessionCache();
            sessionResolved = true;
            return null;
        }
        cachedUser = payload.usuario;
        sessionResolved = true;
        return cachedUser;
    })();

    try {
        return await sessionPromise;
    } finally {
        sessionPromise = null;
    }
}

export async function getCsrfToken() {
    if (csrfToken) return csrfToken;
    const response = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
    if (!response.ok) {
        if (response.status === 401) resetSessionCache();
        throw new Error('Não foi possível validar a proteção da sessão.');
    }
    const payload = await response.json().catch(() => ({}));
    if (!payload.csrf_token) throw new Error('Resposta CSRF inválida.');
    csrfToken = payload.csrf_token;
    return csrfToken;
}

export async function authenticatedFetch(input, init = {}) {
    const method = String(init.method || 'GET').toUpperCase();
    const headers = new Headers(init.headers || {});
    if (MUTATING_METHODS.has(method)) {
        headers.set('X-CSRF-Token', await getCsrfToken());
    }
    const response = await fetch(input, {
        ...init,
        method,
        headers,
        credentials: 'same-origin'
    });
    if (response.status === 401) resetSessionCache();
    return response;
}

export async function logout() {
    try {
        await authenticatedFetch('/api/auth/logout', { method: 'POST' });
    } finally {
        resetSessionCache();
    }
}

export async function getCapabilities() {
    if (!capabilitiesPromise) {
        capabilitiesPromise = authenticatedFetch('/api/capabilities')
            .then(async (response) => {
                if (!response.ok) return { features: { detector: { enabled: false, experimental: true } } };
                return response.json();
            })
            .catch(() => ({ features: { detector: { enabled: false, experimental: true } } }));
    }
    return capabilitiesPromise;
}

export function getRedirectByRole(tipo) {
    const role = String(tipo || '').toUpperCase();
    if (role === 'ADMIN') return '/admin.html';
    if (role === 'PROFESSOR') return '/professor.html';
    return '/sala-virtual.html';
}

export async function requireAuth(redirect = '/login.html?motivo=auth') {
    const user = await getCurrentUser();
    if (!user) {
        window.location.href = redirect;
        return false;
    }
    return true;
}

export async function requireRole(rolesPermitidos = [], redirect = '/index.html?motivo=nao_autorizado') {
    const user = await getCurrentUser();
    if (!user) {
        window.location.href = '/login.html?motivo=auth';
        return false;
    }
    const roleUser = String(user.tipo || '').toUpperCase();
    const roles = rolesPermitidos.map((role) => String(role).toUpperCase());
    if (!roles.includes(roleUser)) {
        window.location.href = redirect;
        return false;
    }
    return true;
}
