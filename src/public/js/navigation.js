/**
 * Disclosure responsivo da navegação pública.
 * Mantém uma única lista de destinos para desktop e telas menores.
 */

const MOBILE_NAV_QUERY = '(max-width: 900px)';

export function initMobileNavigation(root = document, view = window) {
    const toggle = root.getElementById('mobile-nav-toggle');
    const menu = root.getElementById('primary-navigation');
    const nav = toggle?.closest?.('nav');

    if (!toggle || !menu || !nav) return null;

    function isOpen() {
        return toggle.getAttribute('aria-expanded') === 'true';
    }

    function setOpen(open, { restoreFocus = false } = {}) {
        const nextState = Boolean(open);
        toggle.setAttribute('aria-expanded', String(nextState));
        toggle.setAttribute(
            'aria-label',
            nextState ? 'Fechar menu de navegação' : 'Abrir menu de navegação'
        );
        menu.dataset.mobileOpen = String(nextState);

        if (!nextState && restoreFocus) toggle.focus();
    }

    function closeForNavigation() {
        if (isOpen()) setOpen(false);
    }

    setOpen(false);

    toggle.addEventListener('click', () => {
        setOpen(!isOpen());
    });

    menu.addEventListener('click', (event) => {
        if (event.target?.closest?.('a[href]')) closeForNavigation();
    });

    root.addEventListener('click', (event) => {
        if (!isOpen() || nav.contains(event.target)) return;
        setOpen(false);
    });

    root.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || !isOpen()) return;
        event.preventDefault();
        setOpen(false, { restoreFocus: true });
    });

    const mediaQuery = view.matchMedia?.(MOBILE_NAV_QUERY);
    mediaQuery?.addEventListener?.('change', (event) => {
        if (!event.matches) setOpen(false);
    });

    return Object.freeze({
        isOpen,
        open: () => setOpen(true),
        close: () => setOpen(false)
    });
}

function initialize() {
    initMobileNavigation();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
} else {
    initialize();
}
