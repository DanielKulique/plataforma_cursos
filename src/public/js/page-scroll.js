const locks = new WeakMap();

/**
 * Bloqueia a rolagem do documento por classe e devolve uma função idempotente
 * de restauração. O contador preserva diálogos eventualmente aninhados.
 */
export function lockPageScroll(documentRef = document) {
    const existing = locks.get(documentRef);
    if (existing) {
        existing.count += 1;
    } else {
        const state = {
            count: 1,
            bodyWasLocked: documentRef.body.classList.contains('is-scroll-locked'),
            rootWasLocked: documentRef.documentElement.classList.contains('is-scroll-locked')
        };
        locks.set(documentRef, state);
        documentRef.body.classList.add('is-scroll-locked');
        documentRef.documentElement.classList.add('is-scroll-locked');
    }

    let restored = false;
    return () => {
        if (restored) return;
        restored = true;
        const state = locks.get(documentRef);
        if (!state) return;
        state.count -= 1;
        if (state.count > 0) return;
        if (!state.bodyWasLocked) documentRef.body.classList.remove('is-scroll-locked');
        if (!state.rootWasLocked) documentRef.documentElement.classList.remove('is-scroll-locked');
        locks.delete(documentRef);
    };
}
