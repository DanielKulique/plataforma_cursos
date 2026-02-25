import { login, setToken, getCurrentUser, getRedirectByRole } from './auth.js';

const form = document.getElementById('form-login');
const mensagem = document.getElementById('mensagem-login');

function mostrarMensagemPorMotivo() {
    if (!mensagem) return;

    const params = new URLSearchParams(window.location.search);
    const motivo = params.get('motivo');

    if (motivo === 'auth') {
        mensagem.textContent = 'Faça login para continuar.';
        return;
    }

    if (motivo === 'nao_autorizado') {
        mensagem.textContent = 'Você não tem permissão para acessar esta área.';
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

        const email = form.email.value.trim();
        const senha = form.senha.value;

        mensagem.textContent = 'Autenticando...';

        try {
            const payload = await login(email, senha);
            setToken(payload.token);
            mensagem.textContent = 'Login realizado com sucesso! Redirecionando...';

            const tipo = payload?.usuario?.tipo;
            window.location.href = getRedirectByRole(tipo);
        } catch (error) {
            mensagem.textContent = error.message || 'Não foi possível realizar login.';
        }
    });
}

redirecionarSeJaLogado();
mostrarMensagemPorMotivo();
