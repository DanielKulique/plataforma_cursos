const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
].join(',');

export function createAcademicDialog(dialog, {
    initialFocus,
    documentRef = document
} = {}) {
    if (!dialog || typeof dialog.showModal !== 'function') {
        throw new TypeError('Um elemento <dialog> nativo é obrigatório.');
    }

    let opener = null;
    let previousOverflow = '';
    let restoreFocus = true;

    function getFocusableElements() {
        return [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)]
            .filter((element) => !element.hidden && !element.disabled);
    }

    function focusInitialElement() {
        const candidate = typeof initialFocus === 'function'
            ? initialFocus()
            : initialFocus;
        const target = candidate && !candidate.disabled
            ? candidate
            : getFocusableElements()[0] || dialog;
        target.focus();
    }

    function open(trigger = documentRef.activeElement) {
        if (dialog.open) return;

        opener = trigger;
        restoreFocus = true;
        previousOverflow = documentRef.body.style.overflow;
        documentRef.body.style.overflow = 'hidden';
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('tabindex', '-1');
        dialog.showModal();
        focusInitialElement();
    }

    function close({ shouldRestoreFocus = true } = {}) {
        if (!dialog.open) return;
        restoreFocus = shouldRestoreFocus;
        dialog.close();
    }

    dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        close();
    });

    dialog.addEventListener('close', () => {
        documentRef.body.style.overflow = previousOverflow;
        const focusTarget = opener;
        const shouldFocus = restoreFocus;
        opener = null;
        restoreFocus = true;

        if (!shouldFocus) return;
        const schedule = documentRef.defaultView?.setTimeout?.bind(documentRef.defaultView)
            || setTimeout;
        schedule(() => {
            if (
                focusTarget
                && focusTarget.isConnected !== false
                && typeof focusTarget.focus === 'function'
            ) {
                focusTarget.focus();
            }
        }, 0);
    });

    dialog.addEventListener('keydown', (event) => {
        if (event.key !== 'Tab') return;

        const focusable = getFocusableElements();
        if (!focusable.length) {
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
    });

    return Object.freeze({ open, close, getFocusableElements });
}
