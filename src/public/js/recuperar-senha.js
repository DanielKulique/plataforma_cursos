const form = document.getElementById('form-recuperacao');
const message = document.getElementById('mensagem-recuperacao');
const button = form?.querySelector('button[type="submit"]');

form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    message.textContent = 'Enviando solicitação...';

    try {
        const response = await fetch('/api/auth/recuperar-senha', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: form.email.value.trim() })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.mensagem || 'Não foi possível enviar a solicitação.');
        message.textContent = payload.mensagem;
        message.setAttribute('role', 'status');
        form.reset();
    } catch (error) {
        message.textContent = error.message;
        message.setAttribute('role', 'alert');
    } finally {
        button.disabled = false;
        form.setAttribute('aria-busy', 'false');
    }
});
