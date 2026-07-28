/**
 * @fileoverview Funções utilitárias compartilhadas do frontend
 * @description Centraliza funções reutilizáveis para evitar duplicação de código
 */

// ============================================================
// SANITIZAÇÃO E SEGURANÇA
// ============================================================

/**
 * Escapa HTML para prevenir XSS
 * @param {string} text - Texto a ser escapado
 * @returns {string} Texto seguro para uso em HTML
 */
export function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };
    return String(text || '').replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Cria elemento de texto seguro (sem innerHTML)
 * @param {string} tag - Nome da tag HTML
 * @param {string} text - Conteúdo de texto
 * @param {string} [className] - Classes CSS opcionais
 * @returns {HTMLElement}
 */
export function createTextElement(tag, text, className = '') {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) element.className = className;
    return element;
}

// ============================================================
// FORMATAÇÃO DE STATUS
// ============================================================

/**
 * Retorna a classe CSS para badge de status de turma
 * @param {string} status - Status da turma
 * @returns {string} Classe CSS do badge
 */
export function formatarStatusTurma(status) {
    const texto = String(status || '').trim();
    const upper = texto.toUpperCase();

    if (upper.includes('ABERTA')) return 'badge badge-success';
    if (upper.includes('ANDAMENTO')) return 'badge badge-warning';
    if (upper.includes('ENCERRADA') || upper.includes('CANCELADA')) return 'badge badge-danger';
    return 'badge badge-neutral';
}

/**
 * Retorna a classe CSS para tag de turma (novo design)
 * @param {string} status - Status da turma
 * @returns {string} Classe CSS da tag
 */
export function formatarTagTurma(status) {
    const texto = String(status || '').trim();
    const upper = texto.toUpperCase();

    if (upper.includes('ABERTA')) return 'tag tag-open';
    if (upper.includes('BREVE') || upper.includes('ANDAMENTO')) return 'tag tag-soon';
    if (upper.includes('INSCRI')) return 'tag tag-enroll';
    if (upper.includes('ENCERRADA') || upper.includes('CANCELADA')) return 'tag tag-closed';
    return 'tag tag-open';
}

/**
 * Retorna a classe CSS para a barra lateral colorida de turma
 * @param {string} status - Status da turma
 * @returns {string} Classe CSS
 */
export function formatarCorTurma(status) {
    const texto = String(status || '').trim();
    const upper = texto.toUpperCase();

    if (upper.includes('ABERTA')) return 'cl-green';
    if (upper.includes('BREVE') || upper.includes('ANDAMENTO')) return 'cl-pink';
    return 'cl-purple';
}

/**
 * Formata data para exibição em pt-BR
 * @param {string|Date} data - Data a ser formatada
 * @returns {string} Data formatada ou 'N/A'
 */
export function formatarData(data) {
    if (!data) return 'N/A';
    try {
        return new Date(data).toLocaleDateString('pt-BR');
    } catch {
        return 'N/A';
    }
}

/**
 * Formata data e hora para exibição em pt-BR
 * @param {string|Date} data - Data a ser formatada
 * @returns {string} Data e hora formatadas ou 'N/A'
 */
export function formatarDataHora(data) {
    if (!data) return 'N/A';
    try {
        return new Date(data).toLocaleString('pt-BR');
    } catch {
        return 'N/A';
    }
}

// ============================================================
// VALIDAÇÃO DE DADOS
// ============================================================

/**
 * Remove caracteres não numéricos do CPF
 * @param {string} cpf - CPF com ou sem formatação
 * @returns {string} CPF apenas com números
 */
export function limparCpf(cpf) {
    return String(cpf || '').replace(/\D/g, '');
}

/**
 * Verifica se a senha atende aos requisitos de segurança
 * @param {string} senha - Senha a ser validada
 * @returns {{valido: boolean, requisitos: object}} Resultado da validação
 */
export function validarForcaSenha(senha) {
    const requisitos = {
        tamanhoMinimo: senha.length >= 8,
        maiuscula: /[A-Z]/.test(senha),
        minuscula: /[a-z]/.test(senha),
        numero: /\d/.test(senha),
        simbolo: /[^A-Za-z0-9]/.test(senha)
    };

    const valido = Object.values(requisitos).every(Boolean);

    return { valido, requisitos };
}

/**
 * Verifica se a senha é forte (versão simplificada)
 * @param {string} senha - Senha a ser validada
 * @returns {boolean}
 */
export function senhaEhForte(senha) {
    return validarForcaSenha(senha).valido;
}

/**
 * Valida formato de email
 * @param {string} email - Email a ser validado
 * @returns {boolean}
 */
export function emailValido(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(String(email || '').trim());
}

// ============================================================
// MANIPULAÇÃO DE URL
// ============================================================

/**
 * Obtém parâmetros da URL atual
 * @returns {URLSearchParams}
 */
export function getUrlParams() {
    return new URLSearchParams(window.location.search);
}

/**
 * Adiciona parâmetros a uma URL
 * @param {string} url - URL base
 * @param {Object} params - Parâmetros a adicionar
 * @returns {string}
 */
export function addUrlParams(url, params = {}) {
    const urlObj = new URL(url, window.location.origin);
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            urlObj.searchParams.set(key, value);
        }
    });
    return urlObj.pathname + urlObj.search;
}

// ============================================================
// UI HELPERS
// ============================================================

/**
 * Mostra estado de carregamento em um container
 * @param {HTMLElement} container - Elemento container
 * @param {string} [mensagem='Carregando...'] - Mensagem de loading
 */
export function showLoading(container, mensagem = 'Carregando...') {
    if (!container) return;
    container.replaceChildren(createTextElement('div', mensagem, 'loading-state'));
}

/**
 * Mostra estado vazio em um container
 * @param {HTMLElement} container - Elemento container
 * @param {string} mensagem - Mensagem para exibir
 */
export function showEmpty(container, mensagem) {
    if (!container) return;
    container.replaceChildren(createTextElement('div', mensagem, 'empty-state'));
}

/**
 * Mostra estado de erro em um container
 * @param {HTMLElement} container - Elemento container
 * @param {string} mensagem - Mensagem de erro
 */
export function showError(container, mensagem) {
    if (!container) return;
    container.replaceChildren(createTextElement('div', mensagem, 'error-state'));
}

/**
 * Exibe mensagem de feedback para o usuário
 * @param {HTMLElement} elemento - Elemento para exibir mensagem
 * @param {string} texto - Texto da mensagem
 * @param {'sucesso'|'erro'|'info'} tipo - Tipo da mensagem
 */
export function exibirMensagem(elemento, texto, tipo = 'info') {
    if (!elemento) return;

    elemento.textContent = texto;
    elemento.classList.remove('error', 'success', 'info', 'mensagem-erro', 'mensagem-sucesso', 'mensagem-info');

    const classMap = {
        erro: 'error',
        sucesso: 'success',
        info: 'info'
    };

    elemento.classList.add(classMap[tipo] || 'info');
}

/**
 * Desabilita botão durante operação async
 * @param {HTMLButtonElement} button - Botão a desabilitar
 * @param {string} [loadingText='Carregando...'] - Texto durante loading
 * @returns {Function} Função para restaurar o botão
 */
export function disableButton(button, loadingText = 'Carregando...') {
    if (!button) return () => {};

    const originalText = button.textContent;
    const originalDisabled = button.disabled;

    button.disabled = true;
    button.textContent = loadingText;
    button.classList.add('btn-loading');

    return () => {
        button.disabled = originalDisabled;
        button.textContent = originalText;
        button.classList.remove('btn-loading');
    };
}

// ============================================================
// DEBOUNCE / THROTTLE
// ============================================================

/**
 * Cria função debounced
 * @param {Function} fn - Função a ser debounced
 * @param {number} delay - Delay em ms
 * @returns {Function}
 */
export function debounce(fn, delay = 300) {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}

/**
 * Cria função throttled
 * @param {Function} fn - Função a ser throttled
 * @param {number} limit - Limite em ms
 * @returns {Function}
 */
export function throttle(fn, limit = 300) {
    let inThrottle;
    return (...args) => {
        if (!inThrottle) {
            fn(...args);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), limit);
        }
    };
}
