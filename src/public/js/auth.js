const TOKEN_KEY = 'token';

export function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
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

export async function getCurrentUser() {
    const token = getToken();
    if (!token) return null;

    const response = await fetch('/api/auth/me', {
        headers: {
            Authorization: `Bearer ${token}`
        }
    });

    if (response.status === 401) {
        clearToken();
        return null;
    }

    if (!response.ok) {
        throw new Error('Erro ao carregar sessão.');
    }

    const payload = await response.json();
    return payload.usuario;
}

export function getRedirectByRole(tipo) {
    const role = String(tipo || '').toUpperCase();

    if (role === 'ADMIN') return '/index.html?painel=admin';
    if (role === 'PROFESSOR') return '/professor.html';
    return '/sala-virtual.html';
}

export function isAuthenticated(){
    return Boolean(getToken());
}

export function requireAuth(redirect = '/login.html?motivo=auth') {
    if(!isAuthenticated()){
        window.location.href = redirect;
        return false;
    };
    return true;
}

export async function requireRole(rolesPermitidos = [], redirect = '/index.html?motivo=nao_autorizado') {
    if (!requireAuth('/login.html?motivo=auth')) {
        return false;
    }

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