import { lockPageScroll } from './page-scroll.js';

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
].join(',');

export function getAdminDialogFocusableElements(dialog) {
    if (typeof dialog.querySelectorAll !== 'function') return [];
    return Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR))
        .filter((element) => !element.hidden && element.getAttribute?.('aria-hidden') !== 'true');
}

export function showAdminDialog(dialog, {
    initialFocus,
    opener,
    documentRef = document
} = {}) {
    const returnFocusTo = opener || documentRef.activeElement;
    const restorePageScroll = lockPageScroll(documentRef);
    let restored = false;

    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('tabindex', '-1');
    const containFocus = (event) => {
        if (event.key !== 'Tab') return;
        const focusable = getAdminDialogFocusableElements(dialog);
        if (focusable.length === 0) {
            event.preventDefault();
            dialog.focus();
            return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && documentRef.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && documentRef.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };

    const restorePage = () => {
        if (restored) return;
        restored = true;
        restorePageScroll();
        dialog.removeEventListener?.('keydown', containFocus);
        dialog.remove();
        const schedule = documentRef.defaultView?.setTimeout?.bind(documentRef.defaultView)
            || setTimeout;
        schedule(() => {
            if (returnFocusTo && returnFocusTo.isConnected !== false && typeof returnFocusTo.focus === 'function') {
                returnFocusTo.focus();
            }
        }, 0);
    };

    dialog.addEventListener('keydown', containFocus);
    dialog.addEventListener('close', restorePage, { once: true });
    dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        dialog.close();
    }, { once: true });

    dialog.showModal();
    const focusTarget = initialFocus && typeof initialFocus.focus === 'function'
        ? initialFocus
        : dialog;
    focusTarget.focus();

    return {
        close: () => {
            if (dialog.open) dialog.close();
        }
    };
}
