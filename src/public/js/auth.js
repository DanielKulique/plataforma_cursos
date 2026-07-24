const TOKEN_KEY = 'token';
const INVALID_SESSION_STATUSES = new Set([401, 403, 404]);

let cachedToken = null;
let cachedUser = null;
let sessionResolved = false;
let sessionPromise = null;

function resetSessionCache() {
    cachedToken = null;
    cachedUser = null;
    sessionResolved = false;
    sessionPromise = null;
}

export function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
    resetSessionCache();
    localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    resetSessionCache();
}

export async function login(email, senha) {
    const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, senha })
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(payload.mensagem || payload.message || 'Falha ao autenticar.');
    }

    return payload;
}

export async function getCurrentUser({ force = false } = {}) {
    const token = getToken();
    if (!token) {
        resetSessionCache();
        sessionResolved = true;
        return null;
    }

    if (cachedToken !== token) {
        resetSessionCache();
        cachedToken = token;
    }

    if (!force && sessionResolved) return cachedUser;
    if (!force && sessionPromise) return sessionPromise;

    sessionPromise = (async () => {
        const response = await fetch('/api/auth/me', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (INVALID_SESSION_STATUSES.has(response.status)) {
            clearToken();
            sessionResolved = true;
            return null;
        }

        if (!response.ok) {
            throw new Error('Erro ao carregar sessão.');
        }

        const payload = await response.json().catch(() => ({}));
        if (!payload.usuario?.id_usuario || !payload.usuario?.tipo) {
            clearToken();
            sessionResolved = true;
            return null;
        }

        cachedToken = token;
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
