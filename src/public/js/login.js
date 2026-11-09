import { login, getCurrentUser, getRedirectByRole } from './auth.js';

const form = document.getElementById('form-login');
const mensagem = document.getElementById('mensagem-login');
const submitButton = form?.querySelector('button[type="submit"]');
let submitting = false;

function exibirMensagem(texto, tipo = 'info') {
    if (!mensagem) return;

    const safeText = String(texto ?? '');
    mensagem.textContent = /HTTP|JSON|backend|stack|TypeError|SyntaxError|failed to fetch|networkerror|unexpected token/i.test(safeText)
        ? 'Não foi possível concluir a operação. Confira sua conexão e tente novamente.' : safeText;
    mensagem.hidden = !mensagem.textContent;
    mensagem.classList.remove('is-info', 'is-success', 'is-error');
    mensagem.classList.add(`is-${tipo}`);

    const isError = tipo === 'error';
    mensagem.setAttribute('role', isError ? 'alert' : 'status');
    mensagem.setAttribute('aria-live', isError ? 'assertive' : 'polite');
}

function setFormBusy(isBusy) {
    submitting = isBusy;
    form?.setAttribute('aria-busy', String(isBusy));

    if (!submitButton) return;
    submitButton.disabled = isBusy;
    submitButton.setAttribute('aria-busy', String(isBusy));
    submitButton.textContent = isBusy
        ? 'Entrando...'
        : submitButton.dataset.idleLabel || 'Entrar';
}

function mostrarMensagemPorMotivo() {
    if (!mensagem) return;

    const params = new URLSearchParams(window.location.search);
    const motivo = params.get('motivo');

    if (motivo === 'auth') {
        exibirMensagem('Faça login para continuar.', 'info');
        return;
    }

    if (motivo === 'nao_autorizado') {
        exibirMensagem('Você não tem permissão para acessar esta área.', 'error');
        return;
    }

    if (motivo === 'senha_alterada') {
        exibirMensagem('Senha alterada. Entre novamente para continuar.', 'success');
    }
}

async function redirecionarSeJaLogado() {
    try {
        const usuario = await getCurrentUser();
        if (usuario) {
            window.location.href = getRedirectByRole(usuario.tipo);
        }
    } catch (error) {
        // sem bloqueio da tela
    }
}

if (form) {
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (submitting) return;

        const email = form.email.value.trim();
        const senha = form.senha.value;
        let completed = false;

        form.email.removeAttribute('aria-invalid');
        form.senha.removeAttribute('aria-invalid');
        setFormBusy(true);
        exibirMensagem('Autenticando...', 'info');

        try {
            const payload = await login(email, senha);
            exibirMensagem('Login realizado com sucesso! Redirecionando...', 'success');

            const tipo = payload?.usuario?.tipo;
            completed = true;
            window.location.href = getRedirectByRole(tipo);
        } catch (error) {
            form.email.setAttribute('aria-invalid', 'true');
            form.senha.setAttribute('aria-invalid', 'true');
            exibirMensagem(error.message || 'Não foi possível realizar login.', 'error');
        } finally {
            if (!completed) setFormBusy(false);
        }
    });
}

redirecionarSeJaLogado();
mostrarMensagemPorMotivo();
