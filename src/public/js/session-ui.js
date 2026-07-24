import { clearToken, getCurrentUser, getRedirectByRole, getToken } from './auth.js';

const ROLE_CONFIG = Object.freeze({
    ALUNO: { label: 'Aluno', areaLabel: 'Sala virtual', areaUrl: '/sala-virtual.html' },
    PROFESSOR: { label: 'Professor', areaLabel: 'Minhas turmas', areaUrl: '/professor.html' },
    ADMIN: { label: 'Administrador', areaLabel: 'Administração', areaUrl: '/admin.html' }
});

function byId(id) {
    return document.getElementById(id);
}

function setVisible(element, visible) {
    if (element) element.hidden = !visible;
}

function setText(element, value) {
    if (element) element.textContent = String(value ?? '');
}

function setSessionState(state) {
    if (document.body) document.body.dataset.sessionState = state;
}

function renderPrivateControls(role = null) {
    document.querySelectorAll('[data-session-private]').forEach((element) => {
        const allowed = String(element.dataset.sessionRoles || '')
            .split(',')
            .map((value) => value.trim().toUpperCase())
            .filter(Boolean);
        element.hidden = !role || (allowed.length > 0 && !allowed.includes(role));
    });
}

function getInitials(name) {
    return String(name || '?')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase() || '?';
}

function redirect(url) {
    window.location.href = url;
}

function logout() {
    clearToken();
    redirect('/index.html');
}

function ensureAvatarMenu(avatar, user, roleConfig) {
    let menu = byId('avatar-menu');

    if (!menu) {
        menu = document.createElement('div');
        menu.id = 'avatar-menu';
        menu.className = 'avatar-menu';
        menu.hidden = true;
        menu.setAttribute('role', 'menu');
        menu.setAttribute('aria-label', 'Menu do perfil');

        const identity = document.createElement('div');
        identity.className = 'avatar-menu__identity';

        const name = document.createElement('strong');
        name.id = 'avatar-menu-name';
        const role = document.createElement('span');
        role.id = 'avatar-menu-role';
        identity.append(name, role);

        const area = document.createElement('a');
        area.id = 'avatar-menu-area';
        area.className = 'avatar-menu__item';
        area.setAttribute('role', 'menuitem');
        area.textContent = 'Minha área';

        const exit = document.createElement('button');
        exit.id = 'avatar-menu-logout';
        exit.type = 'button';
        exit.className = 'avatar-menu__item avatar-menu__item--exit';
        exit.setAttribute('role', 'menuitem');
        exit.textContent = 'Sair';
        exit.addEventListener('click', logout);

        menu.append(identity, area, exit);
        avatar.insertAdjacentElement('afterend', menu);

        avatar.addEventListener('click', () => {
            const willOpen = menu.hidden;
            menu.hidden = !willOpen;
            avatar.setAttribute('aria-expanded', String(willOpen));
            if (willOpen) area.focus();
        });

        document.addEventListener('click', (event) => {
            if (menu.hidden || menu.contains(event.target) || avatar.contains(event.target)) return;
            menu.hidden = true;
            avatar.setAttribute('aria-expanded', 'false');
        });

        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape' || menu.hidden) return;
            menu.hidden = true;
            avatar.setAttribute('aria-expanded', 'false');
            avatar.focus();
        });
    }

    setText(byId('avatar-menu-name'), user.nome_completo);
    setText(byId('avatar-menu-role'), roleConfig.label);
    const area = byId('avatar-menu-area');
    if (area) area.href = roleConfig.areaUrl;
}

function renderLoading() {
    setSessionState('loading');
    renderPrivateControls();
    setText(byId('status-usuario'), 'Validando sessão...');
    setVisible(byId('aviso-acesso'), false);
    setVisible(byId('link-login'), false);
    setVisible(byId('link-login-mobile'), false);
    setVisible(byId('link-sala'), false);
    setVisible(byId('avatar'), false);
    setVisible(byId('btn-logout'), false);
    setVisible(byId('badge-role'), false);
    setVisible(byId('btn-continuar'), false);
}

function renderAnonymous(state = 'anonymous', message = 'Faça login para acessar sua área.') {
    setSessionState(state);
    renderPrivateControls();
    setText(byId('status-usuario'), state === 'error' ? 'Sessão indisponível' : 'Visitante');
    setText(byId('aviso-acesso'), message);
    setVisible(byId('aviso-acesso'), true);
    setVisible(byId('link-login'), true);
    setVisible(byId('link-login-mobile'), true);
    setVisible(byId('link-sala'), false);
    setVisible(byId('avatar'), false);
    setVisible(byId('btn-logout'), false);
    setVisible(byId('badge-role'), false);
    setVisible(byId('btn-continuar'), false);

    const menu = byId('avatar-menu');
    setVisible(menu, false);
}

function renderAuthenticated(user) {
    const role = String(user.tipo || '').toUpperCase();
    const roleConfig = ROLE_CONFIG[role];
    if (!roleConfig) return false;

    setSessionState(role.toLowerCase());
    renderPrivateControls(role);
    setText(byId('status-usuario'), `Bem-vindo, ${user.nome_completo}!`);
    setVisible(byId('aviso-acesso'), false);
    setVisible(byId('link-login'), false);
    setVisible(byId('link-login-mobile'), false);
    setVisible(byId('btn-logout'), false);

    const areaLink = byId('link-sala');
    if (areaLink) {
        areaLink.href = roleConfig.areaUrl;
        areaLink.textContent = roleConfig.areaLabel;
        areaLink.hidden = false;
    }

    const badge = byId('badge-role');
    setText(badge, roleConfig.label);
    setVisible(badge, true);

    const continueButton = byId('btn-continuar');
    if (continueButton) {
        continueButton.href = roleConfig.areaUrl;
        continueButton.textContent = `▶ ${roleConfig.areaLabel}`;
        continueButton.hidden = false;
    }

    const avatar = byId('avatar');
    if (avatar) {
        avatar.textContent = getInitials(user.nome_completo);
        avatar.setAttribute('aria-label', `Abrir menu do perfil de ${user.nome_completo}`);
        avatar.setAttribute('aria-haspopup', 'menu');
        avatar.setAttribute('aria-expanded', 'false');
        avatar.hidden = false;
        ensureAvatarMenu(avatar, user, roleConfig);
    }

    const legacyLogout = byId('btn-logout');
    if (legacyLogout && legacyLogout.dataset.sessionListener !== 'true') {
        legacyLogout.dataset.sessionListener = 'true';
        legacyLogout.addEventListener('click', logout);
    }

    return true;
}

export function getRoleArea(role) {
    return ROLE_CONFIG[String(role || '').toUpperCase()] || null;
}

export async function initSessionUI({
    requiredRoles = [],
    loginRedirect = '/login.html?motivo=auth',
    unauthorizedRedirect = '/index.html?motivo=nao_autorizado'
} = {}) {
    renderLoading();
    const hadToken = Boolean(getToken());

    let user;
    try {
        user = await getCurrentUser();
    } catch (error) {
        renderAnonymous('error', 'Não foi possível validar sua sessão agora. Tente novamente.');
        return { state: 'error', user: null, error };
    }

    if (!user) {
        const state = hadToken ? 'invalid' : 'anonymous';
        const message = hadToken
            ? 'Sua sessão expirou ou não é mais válida. Entre novamente.'
            : 'Faça login para acessar sua área.';
        renderAnonymous(state, message);
        if (requiredRoles.length > 0) redirect(loginRedirect);
        return { state, user: null };
    }

    const currentRole = String(user.tipo || '').toUpperCase();
    if (!ROLE_CONFIG[currentRole]) {
        clearToken();
        renderAnonymous('invalid', 'Sua conta não possui um papel de acesso válido.');
        if (requiredRoles.length > 0) redirect(loginRedirect);
        return { state: 'invalid', user: null };
    }

    const allowedRoles = requiredRoles.map((role) => String(role).toUpperCase());
    if (allowedRoles.length > 0 && !allowedRoles.includes(currentRole)) {
        setSessionState('unauthorized');
        renderPrivateControls();
        redirect(unauthorizedRedirect);
        return { state: 'unauthorized', user };
    }

    renderAuthenticated(user);

    return { state: 'authenticated', user };
}

export function redirectToCurrentArea(user) {
    redirect(getRedirectByRole(user?.tipo));
}
