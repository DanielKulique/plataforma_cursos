export function showAdminDialog(dialog, { initialFocus, documentRef = document } = {}) {
    const opener = documentRef.activeElement;
    const body = documentRef.body;
    const previousOverflow = body.style.overflow;

    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('tabindex', '-1');
    body.style.overflow = 'hidden';

    const restorePage = () => {
        body.style.overflow = previousOverflow;
        dialog.remove();
        const schedule = documentRef.defaultView?.setTimeout?.bind(documentRef.defaultView)
            || setTimeout;
        schedule(() => {
            if (opener && opener.isConnected !== false && typeof opener.focus === 'function') {
                opener.focus();
            }
        }, 0);
    };
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
}
