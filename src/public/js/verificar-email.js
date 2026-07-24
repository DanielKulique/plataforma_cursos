// =========================================================
// VERIFICAÇÃO DE E-MAIL POR CÓDIGO (versão didática)
// =========================================================

const formVerificacao = document.getElementById('form-verificar-email');
const mensagem = document.getElementById('mensagem-verificacao-email');
const submitButton = formVerificacao?.querySelector('button[type="submit"]');
let submitting = false;
let completed = false;

function exibirMensagem(texto, tipo = 'info') {
    if (!mensagem) return;

    mensagem.textContent = texto;
    mensagem.classList.remove('is-error', 'is-success', 'is-info');
    mensagem.classList.add(`is-${tipo}`);

    const isError = tipo === 'error';
    mensagem.setAttribute('role', isError ? 'alert' : 'status');
    mensagem.setAttribute('aria-live', isError ? 'assertive' : 'polite');
}

function setFormBusy(isBusy) {
    submitting = isBusy;
    formVerificacao?.setAttribute('aria-busy', String(isBusy));

    if (!submitButton) return;
    submitButton.disabled = isBusy;
    submitButton.setAttribute('aria-busy', String(isBusy));
    submitButton.textContent = isBusy
        ? 'Validando código...'
        : submitButton.dataset.idleLabel || 'Confirmar e-mail';
}

function setFormCompleted() {
    submitting = false;
    formVerificacao?.setAttribute('aria-busy', 'false');
    if (!submitButton) return;
    submitButton.disabled = true;
    submitButton.setAttribute('aria-busy', 'false');
    submitButton.textContent = 'E-mail confirmado';
}

function clearFieldErrors() {
    formVerificacao?.email?.removeAttribute('aria-invalid');
    formVerificacao?.codigo?.removeAttribute('aria-invalid');
}

function markFieldError(fieldName) {
    const field = formVerificacao?.[fieldName];
    if (!field) return;
    field.setAttribute('aria-invalid', 'true');
    field.focus();
}

function limparCodigo(codigo) {
    return String(codigo || '').replace(/\D/g, '').slice(0, 6);
}

function preencherEmailPorQueryString() {
    if (!formVerificacao) return;

    const params = new URLSearchParams(window.location.search);
    const email = params.get('email');

    if (email) {
        formVerificacao.email.value = email;
    }
}

async function verificarCodigo(email, codigo) {
    const response = await fetch('/api/auth/verificar-codigo-email', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, codigo })
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(payload?.mensagem || 'Não foi possível verificar o código.');
    }

    return payload;
}

async function onSubmit(event) {
    event.preventDefault();
    if (submitting || completed) return;

    const email = formVerificacao.email.value.trim();
    const codigo = limparCodigo(formVerificacao.codigo.value);
    clearFieldErrors();

    if (!email) {
        markFieldError('email');
        exibirMensagem('Informe um e-mail.', 'error');
        return;
    }

    if (codigo.length !== 6) {
        markFieldError('codigo');
        exibirMensagem('O código deve ter 6 dígitos.', 'error');
        return;
    }

    setFormBusy(true);
    exibirMensagem('Validando código...', 'info');

    try {
        await verificarCodigo(email, codigo);
        completed = true;
        exibirMensagem('E-mail confirmado com sucesso! Redirecionando para login...', 'success');

        setTimeout(() => {
            window.location.href = '/login.html';
        }, 1200);
    } catch (error) {
        exibirMensagem(error.message || 'Falha ao verificar código.', 'error');
    } finally {
        if (completed) {
            setFormCompleted();
        } else {
            setFormBusy(false);
        }
    }
}

function inicializar() {
    if (!formVerificacao) return;

    preencherEmailPorQueryString();

    formVerificacao.codigo.addEventListener('input', () => {
        formVerificacao.codigo.value = limparCodigo(formVerificacao.codigo.value);
    });

    formVerificacao.addEventListener('submit', onSubmit);
}

inicializar();
