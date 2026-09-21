const form = document.getElementById('form-redefinicao');
const message = document.getElementById('mensagem-redefinicao');
const button = form?.querySelector('button[type="submit"]');
const token = new URLSearchParams(window.location.hash.slice(1)).get('token');

if (token) history.replaceState(null, '', '/redefinir-senha.html');

if (!token) {
    message.textContent = 'Este link de recuperação é inválido ou está incompleto.';
    message.setAttribute('role', 'alert');
    button.disabled = true;
}

form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = form.nova_senha.value;
    if (password !== form.confirmar_senha.value) {
        message.textContent = 'As senhas informadas não coincidem.';
        message.setAttribute('role', 'alert');
        return;
    }
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    message.textContent = 'Redefinindo senha...';

    try {
        const response = await fetch('/api/auth/redefinir-senha', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, nova_senha: password })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.mensagem || 'Não foi possível redefinir a senha.');
        message.textContent = `${payload.mensagem} Você já pode entrar.`;
        message.setAttribute('role', 'status');
        form.reset();
        form.querySelectorAll('input, button').forEach((element) => { element.disabled = true; });
    } catch (error) {
        message.textContent = error.message;
        message.setAttribute('role', 'alert');
        button.disabled = false;
    } finally {
        form.setAttribute('aria-busy', 'false');
    }
});
