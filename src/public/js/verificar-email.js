// =========================================================
// VERIFICAÇÃO DE E-MAIL POR CÓDIGO (versão didática)
// =========================================================

const formVerificacao = document.getElementById('form-verificar-email');
const mensagem = document.getElementById('mensagem-verificacao-email');

function exibirMensagem(texto, tipo = 'info') {
    if (!mensagem) return;

    mensagem.textContent = texto;

    mensagem.classList.remove('mensagem-erro', 'mensagem-sucesso', 'mensagem-info');

    if (tipo === 'erro') {
        mensagem.classList.add('mensagem-erro');
    } else if (tipo === 'sucesso') {
        mensagem.classList.add('mensagem-sucesso');
    } else {
        mensagem.classList.add('mensagem-info');
    }
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

    const email = formVerificacao.email.value.trim();
    const codigo = limparCodigo(formVerificacao.codigo.value);

    if (!email) {
        exibirMensagem('Informe um e-mail.', 'erro');
        return;
    }

    if (codigo.length !== 6) {
        exibirMensagem('O código deve ter 6 dígitos.', 'erro');
        return;
    }

    exibirMensagem('Validando código...', 'info');

    try {
        await verificarCodigo(email, codigo);
        exibirMensagem('E-mail confirmado com sucesso! Redirecionando para login...', 'sucesso');

        setTimeout(() => {
            window.location.href = '/login.html';
        }, 1200);
    } catch (error) {
        exibirMensagem(error.message || 'Falha ao verificar código.', 'erro');
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
