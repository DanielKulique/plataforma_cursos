// =========================================================
// CADASTRO DE USUÁRIO (PAIR PROGRAMMING - VERSÃO DIDÁTICA)
// =========================================================

const formCadastro = document.getElementById('form-cadastro');
const mensagemCadastro = document.getElementById('mensagem-cadastro');
const blocoPosCadastro = document.getElementById('bloco-pos-cadastro');
const linkConfirmarEmail = document.getElementById('link-confirmar-email');

/**
 * Exibe mensagens de feedback para o usuário.
 * @param {string} texto
 * @param {'sucesso'|'erro'|'info'} tipo
 */
function exibirMensagem(texto, tipo = 'info') {
    if (!mensagemCadastro) return;

    mensagemCadastro.textContent = texto;

    mensagemCadastro.classList.remove('mensagem-erro', 'mensagem-sucesso', 'mensagem-info');

    if (tipo === 'erro') {
        mensagemCadastro.classList.add('mensagem-erro');
    } else if (tipo === 'sucesso') {
        mensagemCadastro.classList.add('mensagem-sucesso');
    } else {
        mensagemCadastro.classList.add('mensagem-info');
    }
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
        return 'Informe um nome completo com pelo menos 3 caracteres.';
    }

    if (!dados.cpf || dados.cpf.length !== 11) {
        return 'CPF inválido. Digite exatamente 11 números.';
    }

    if (!dados.email || !dados.email.includes('@')) {
        return 'E-mail inválido.';
    }

    if (!dados.senha || !senhaEhForte(dados.senha)) {
        return 'Senha fraca. Use 8+ caracteres com maiúscula, minúscula, número e símbolo.';
    }

    if (dados.senha !== dados.confirmar_senha) {
        return 'As senhas não coincidem. Confira e tente novamente.';
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
    const email = formCadastro.email.value.trim();
    const senha = formCadastro.senha.value;
    const confirmar_senha = formCadastro.confirmar_senha.value;

    return { nome_completo, cpf, email, senha, confirmar_senha };
}

/**
 * Fluxo principal do submit.
 */
async function onSubmitCadastro(event) {
    event.preventDefault();

    const dados = obterDadosDoFormulario();
    const erroValidacao = validarFormulario(dados);

    if (erroValidacao) {
        exibirMensagem(erroValidacao, 'erro');
        return;
    }

    exibirMensagem('Criando conta...', 'info');

    try {
        // Pré-validação opcional: se falhar, seguimos com cadastro e deixamos o backend final validar.
        try {
            const disponibilidade = await verificarDisponibilidadeCadastro(dados.email, dados.cpf);
            if (!disponibilidade?.email_disponivel) {
                exibirMensagem('Este e-mail já está cadastrado. Tente fazer login.', 'erro');
                return;
            }

            if (!disponibilidade?.cpf_disponivel) {
                exibirMensagem('Este CPF já está cadastrado.', 'erro');
                return;
            }
        } catch (erroPreCheck) {
            console.warn('Pré-checagem de disponibilidade indisponível. Seguindo com cadastro...', erroPreCheck);
        }

        await cadastrarUsuario(dados);
        await solicitarCodigoVerificacao(dados.email);

        exibirMensagem('Cadastro realizado! Código enviado para seu e-mail.', 'sucesso');

        if (blocoPosCadastro) {
            blocoPosCadastro.hidden = false;
        }

        if (linkConfirmarEmail) {
            const emailParam = encodeURIComponent(dados.email);
            linkConfirmarEmail.href = `/verificar-email.html?email=${emailParam}`;
        }
    } catch (error) {
        exibirMensagem(error.message || 'Erro ao cadastrar usuário.', 'erro');
    }
}

function inicializarCadastro() {
    if (!formCadastro) return;

    // Melhoria de UX: enquanto digita CPF, mantém apenas números
    formCadastro.cpf.addEventListener('input', () => {
        formCadastro.cpf.value = limparCpf(formCadastro.cpf.value).slice(0, 11);
    });

    formCadastro.addEventListener('submit', onSubmitCadastro);
}

inicializarCadastro();
