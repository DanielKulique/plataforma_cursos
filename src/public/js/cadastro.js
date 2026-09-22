// =========================================================
// CADASTRO DE USUÁRIO (PAIR PROGRAMMING - VERSÃO DIDÁTICA)
// =========================================================

const formCadastro = document.getElementById('form-cadastro');
const mensagemCadastro = document.getElementById('mensagem-cadastro');
const blocoPosCadastro = document.getElementById('bloco-pos-cadastro');
const linkConfirmarEmail = document.getElementById('link-confirmar-email');
const textoPosCadastro = document.getElementById('texto-pos-cadastro');
const botaoReenviarCodigo = document.getElementById('botao-reenviar-codigo');
const submitButton = formCadastro?.querySelector('button[type="submit"]');
let submitting = false;
let completed = false;
let emailCadastrado = '';

/**
 * Exibe mensagens de feedback para o usuário.
 * @param {string} texto
 * @param {'success'|'error'|'info'} tipo
 */
function exibirMensagem(texto, tipo = 'info') {
    if (!mensagemCadastro) return;

    mensagemCadastro.textContent = texto;
    mensagemCadastro.classList.remove('is-error', 'is-success', 'is-info');
    mensagemCadastro.classList.add(`is-${tipo}`);

    const isError = tipo === 'error';
    mensagemCadastro.setAttribute('role', isError ? 'alert' : 'status');
    mensagemCadastro.setAttribute('aria-live', isError ? 'assertive' : 'polite');
}

function setFormBusy(isBusy) {
    submitting = isBusy;
    formCadastro?.setAttribute('aria-busy', String(isBusy));

    if (!submitButton) return;
    submitButton.disabled = isBusy;
    submitButton.setAttribute('aria-busy', String(isBusy));
    submitButton.textContent = isBusy
        ? 'Criando conta...'
        : submitButton.dataset.idleLabel || 'Cadastrar';
}

function setFormCompleted() {
    submitting = false;
    formCadastro?.setAttribute('aria-busy', 'false');
    if (!submitButton) return;
    submitButton.disabled = true;
    submitButton.setAttribute('aria-busy', 'false');
    submitButton.textContent = 'Cadastro concluído';
}

function setRegistrationAvailable(isAvailable, message) {
    if (!formCadastro || isAvailable) return;
    completed = true;
    for (const control of formCadastro.elements) control.disabled = true;
    formCadastro.setAttribute('aria-disabled', 'true');
    exibirMensagem(message || 'Novos cadastros estão temporariamente indisponíveis.', 'info');
}

function clearFieldErrors() {
    ['nome_completo', 'cpf', 'email', 'senha', 'confirmar_senha'].forEach((fieldName) => {
        formCadastro?.[fieldName]?.removeAttribute('aria-invalid');
    });
}

function markFieldError(fieldName) {
    const field = formCadastro?.[fieldName];
    if (!field) return;
    field.setAttribute('aria-invalid', 'true');
    field.focus();
}

/**
 * Normaliza o CPF para conter apenas números.
 * @param {string} cpf
 */
function limparCpf(cpf) {
    return String(cpf || '').replace(/\D/g, '');
}

function senhaEhForte(senha) {
    // Regras: 8+ chars, maiúscula, minúscula, número e símbolo
    const temTamanhoMinimo = senha.length >= 8;
    const temMaiuscula = /[A-Z]/.test(senha);
    const temMinuscula = /[a-z]/.test(senha);
    const temNumero = /\d/.test(senha);
    const temSimbolo = /[^A-Za-z0-9]/.test(senha);

    return temTamanhoMinimo && temMaiuscula && temMinuscula && temNumero && temSimbolo;
}

/**
 * Validação básica no front (antes de chamar API).
 * @param {{nome_completo:string, cpf:string, email:string, senha:string, confirmar_senha:string}} dados
 */
function validarFormulario(dados) {
    if (!dados.nome_completo || dados.nome_completo.trim().length < 3) {
        return {
            message: 'Informe um nome completo com pelo menos 3 caracteres.',
            field: 'nome_completo'
        };
    }

    if (!dados.cpf || dados.cpf.length !== 11) {
        return {
            message: 'CPF inválido. Digite exatamente 11 números.',
            field: 'cpf'
        };
    }

    if (!dados.email || !dados.email.includes('@')) {
        return { message: 'E-mail inválido.', field: 'email' };
    }

    if (!dados.senha || !senhaEhForte(dados.senha)) {
        return {
            message: 'Senha fraca. Use 8+ caracteres com maiúscula, minúscula, número e símbolo.',
            field: 'senha'
        };
    }

    if (dados.senha !== dados.confirmar_senha) {
        return {
            message: 'As senhas não coincidem. Confira e tente novamente.',
            field: 'confirmar_senha'
        };
    }

    return null;
}

/**
 * Chama o endpoint de criação de usuário.
 * Endpoint atual: POST /api/usuarios
 */
async function cadastrarUsuario(dados) {
    // Enviamos apenas os campos que o backend de /api/usuarios espera.
    const payloadCadastro = {
        nome_completo: dados.nome_completo,
        cpf: dados.cpf,
        email: dados.email,
        senha: dados.senha
    };

    const response = await fetch('/api/usuarios', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payloadCadastro)
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        // Backend pode devolver message, mensagem ou errors
        const mensagemErro =
            payload?.message ||
            payload?.mensagem ||
            payload?.errors?.[0]?.msg ||
            'Não foi possível realizar o cadastro.';

        throw new Error(mensagemErro);
    }

    return payload;
}

async function verificarDisponibilidadeCadastro(email, cpf) {
    const response = await fetch('/api/usuarios/verificar-disponibilidade', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, cpf })
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        const err = new Error(payload?.message || payload?.mensagem || 'Não foi possível validar disponibilidade de cadastro.');
        err.status = response.status;
        throw err;
    }

    return payload;
}

/**
 * Solicita código de verificação por e-mail.
 */
async function solicitarCodigoVerificacao(email) {
    const response = await fetch('/api/auth/enviar-codigo-verificacao', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email })
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(payload?.mensagem || 'Não foi possível enviar o código de verificação.');
    }

    return payload;
}

/**
 * Captura valores do form e organiza no formato esperado pela API.
 */
function obterDadosDoFormulario() {
    const nome_completo = formCadastro.nome_completo.value.trim();
    const cpf = limparCpf(formCadastro.cpf.value);
    const email = formCadastro.email.value.trim().toLowerCase();
    const senha = formCadastro.senha.value;
    const confirmar_senha = formCadastro.confirmar_senha.value;

    return { nome_completo, cpf, email, senha, confirmar_senha };
}

/**
 * Fluxo principal do submit.
 */
async function onSubmitCadastro(event) {
    event.preventDefault();
    if (submitting || completed) return;

    const dados = obterDadosDoFormulario();
    const erroValidacao = validarFormulario(dados);
    clearFieldErrors();

    if (erroValidacao) {
        markFieldError(erroValidacao.field);
        exibirMensagem(erroValidacao.message, 'error');
        return;
    }

    setFormBusy(true);
    exibirMensagem('Criando conta...', 'info');

    try {
        // Pré-validação opcional: se falhar, seguimos com cadastro e deixamos o backend final validar.
        try {
            const disponibilidade = await verificarDisponibilidadeCadastro(dados.email, dados.cpf);
            if (!disponibilidade?.email_disponivel) {
                markFieldError('email');
                exibirMensagem('Este e-mail já está cadastrado. Tente fazer login.', 'error');
                return;
            }

            if (!disponibilidade?.cpf_disponivel) {
                markFieldError('cpf');
                exibirMensagem('Este CPF já está cadastrado.', 'error');
                return;
            }
        } catch (erroPreCheck) {
            console.warn('Pré-checagem de disponibilidade indisponível. Seguindo com cadastro...', erroPreCheck);
        }

        const cadastro = await cadastrarUsuario(dados);

        completed = true;
        emailCadastrado = cadastro.email || dados.email;
        const estadoVerificacao = cadastro?.verificacao?.estado;
        const emailEnviado = cadastro?.verificacao?.email_enviado === true;

        if (estadoVerificacao === 'VERIFICADO') {
            exibirMensagem('Cadastro concluído. Sua conta já está pronta para entrar.', 'success');
            if (blocoPosCadastro) blocoPosCadastro.hidden = true;
            return;
        }

        exibirMensagem(
            cadastro.mensagem || (emailEnviado
                ? 'Cadastro realizado. Enviamos o código de verificação por e-mail.'
                : 'Cadastro realizado, mas o envio não foi confirmado. Solicite um novo código.'),
            emailEnviado ? 'success' : 'info'
        );

        if (blocoPosCadastro) {
            blocoPosCadastro.hidden = false;
        }

        if (textoPosCadastro) {
            textoPosCadastro.textContent = emailEnviado
                ? 'Sua conta está pendente. Digite o código recebido para confirmar o e-mail.'
                : 'Sua conta está pendente e nenhum envio foi confirmado. Tente reenviar o código.';
        }

        if (linkConfirmarEmail) {
            const emailParam = encodeURIComponent(emailCadastrado);
            linkConfirmarEmail.href = `/verificar-email.html?email=${emailParam}`;
        }
    } catch (error) {
        exibirMensagem(error.message || 'Erro ao cadastrar usuário.', 'error');
    } finally {
        if (completed) {
            setFormCompleted();
        } else {
            setFormBusy(false);
        }
    }
}

async function onReenviarCodigo() {
    if (!botaoReenviarCodigo || !emailCadastrado || botaoReenviarCodigo.disabled) return;

    botaoReenviarCodigo.disabled = true;
    botaoReenviarCodigo.textContent = 'Solicitando...';
    try {
        const resposta = await solicitarCodigoVerificacao(emailCadastrado);
        exibirMensagem(
            resposta.mensagem || 'Se sua conta estiver pendente, enviaremos um novo código.',
            'info'
        );
        if (textoPosCadastro) {
            textoPosCadastro.textContent = 'Confira também a caixa de spam. Você pode solicitar outro código após alguns minutos.';
        }
    } catch (error) {
        exibirMensagem(error.message || 'Não foi possível solicitar outro código agora.', 'error');
    } finally {
        botaoReenviarCodigo.disabled = false;
        botaoReenviarCodigo.textContent = 'Reenviar código';
    }
}

async function inicializarCadastro() {
    if (!formCadastro) return;

    // Melhoria de UX: enquanto digita CPF, mantém apenas números
    formCadastro.cpf.addEventListener('input', () => {
        formCadastro.cpf.value = limparCpf(formCadastro.cpf.value).slice(0, 11);
    });

    formCadastro.addEventListener('submit', onSubmitCadastro);
    botaoReenviarCodigo?.addEventListener('click', onReenviarCodigo);

    try {
        const response = await fetch('/api/usuarios/cadastro-status');
        const payload = await response.json().catch(() => ({}));
        if (response.ok && payload.disponivel === false) {
            setRegistrationAvailable(false, payload.mensagem);
        }
    } catch {
        // O POST continua sendo a decisão autoritativa e falha fechado no servidor.
    }
}

inicializarCadastro();
