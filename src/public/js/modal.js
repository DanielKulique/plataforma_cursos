/**
 * @fileoverview Componente de modal reutilizável
 * @description Modais de confirmação, alerta e input
 */

import { escapeHtml } from './utils.js';

// ============================================================
// ESTILOS DO MODAL (injetados dinamicamente)
// ============================================================

const MODAL_STYLES = `
.modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    animation: modal-fade-in 0.2s ease;
}

@keyframes modal-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
}

@keyframes modal-slide-in {
    from {
        opacity: 0;
        transform: scale(0.95) translateY(-10px);
    }
    to {
        opacity: 1;
        transform: scale(1) translateY(0);
    }
}

.modal-container {
    background: var(--surface, #101a2f);
    border: 1px solid var(--border, rgba(148, 163, 184, 0.35));
    border-radius: var(--radius-lg, 20px);
    padding: 24px;
    max-width: 420px;
    width: 90%;
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
    animation: modal-slide-in 0.25s ease;
}

.modal-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
}

.modal-icon {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
    flex-shrink: 0;
}

.modal-icon--warning {
    background: rgba(251, 191, 36, 0.2);
    color: var(--warning, #fbbf24);
}

.modal-icon--danger {
    background: rgba(248, 113, 113, 0.2);
    color: var(--danger, #f87171);
}

.modal-icon--info {
    background: rgba(56, 189, 248, 0.2);
    color: var(--primary, #38bdf8);
}

.modal-icon--success {
    background: rgba(52, 211, 153, 0.2);
    color: var(--success, #34d399);
}

.modal-title {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--text, #e2e8f0);
}

.modal-body {
    margin-bottom: 20px;
    color: var(--muted, #94a3b8);
    line-height: 1.5;
}

.modal-input {
    width: 100%;
    padding: 10px 14px;
    margin-top: 12px;
    background: var(--bg-soft, #111c33);
    border: 1px solid var(--border, rgba(148, 163, 184, 0.35));
    border-radius: var(--radius-sm, 10px);
    color: var(--text, #e2e8f0);
    font-size: 0.95rem;
}

.modal-input:focus {
    outline: none;
    border-color: var(--primary, #38bdf8);
}

.modal-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
}

.modal-btn {
    padding: 10px 18px;
    border-radius: var(--radius-sm, 10px);
    font-size: 0.92rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    border: 1px solid transparent;
}

.modal-btn--cancel {
    background: transparent;
    border-color: var(--border, rgba(148, 163, 184, 0.35));
    color: var(--text, #e2e8f0);
}

.modal-btn--cancel:hover {
    background: rgba(148, 163, 184, 0.1);
}

.modal-btn--confirm {
    background: var(--primary, #38bdf8);
    color: #0c1929;
}

.modal-btn--confirm:hover {
    background: var(--primary-hover, #0ea5e9);
}

.modal-btn--danger {
    background: var(--danger, #f87171);
    color: #1f1f1f;
}

.modal-btn--danger:hover {
    background: #ef4444;
}
`;

// ============================================================
// INJEÇÃO DE ESTILOS
// ============================================================

let stylesInjected = false;

function injectStyles() {
    if (stylesInjected) return;

    const style = document.createElement('style');
    style.textContent = MODAL_STYLES;
    document.head.appendChild(style);
    stylesInjected = true;
}

// ============================================================
// CRIAÇÃO DO MODAL
// ============================================================

/**
 * Cria estrutura HTML do modal
 * @param {Object} options
 * @returns {HTMLElement}
 */
function createModalElement(options) {
    const {
        title,
        message,
        type = 'info',
        confirmText = 'Confirmar',
        cancelText = 'Cancelar',
        showCancel = true,
        inputPlaceholder = '',
        showInput = false,
        dangerous = false
    } = options;

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-labelledby', 'modal-title');

    const iconMap = {
        warning: '!',
        danger: '!',
        info: 'i',
        success: '✓'
    };

    backdrop.innerHTML = `
        <div class="modal-container">
            <div class="modal-header">
                <div class="modal-icon modal-icon--${type}">
                    ${iconMap[type] || 'i'}
                </div>
                <h2 class="modal-title" id="modal-title">${escapeHtml(title)}</h2>
            </div>
            <div class="modal-body">
                <p>${escapeHtml(message)}</p>
                ${showInput ? `<input type="text" class="modal-input" placeholder="${escapeHtml(inputPlaceholder)}" />` : ''}
            </div>
            <div class="modal-actions">
                ${showCancel ? `<button class="modal-btn modal-btn--cancel" data-action="cancel">${escapeHtml(cancelText)}</button>` : ''}
                <button class="modal-btn ${dangerous ? 'modal-btn--danger' : 'modal-btn--confirm'}" data-action="confirm">${escapeHtml(confirmText)}</button>
            </div>
        </div>
    `;

    return backdrop;
}

// ============================================================
// FUNÇÕES PÚBLICAS
// ============================================================

/**
 * Modal de confirmação
 * @param {string} title - Título do modal
 * @param {string} message - Mensagem do modal
 * @param {Object} [options] - Opções adicionais
 * @returns {Promise<boolean>}
 */
export function confirm(title, message, options = {}) {
    injectStyles();

    return new Promise((resolve) => {
        const modal = createModalElement({
            title,
            message,
            type: options.type || 'warning',
            confirmText: options.confirmText || 'Confirmar',
            cancelText: options.cancelText || 'Cancelar',
            showCancel: true,
            dangerous: options.dangerous || false
        });

        document.body.appendChild(modal);

        // Focus no botão cancelar por segurança
        const cancelBtn = modal.querySelector('[data-action="cancel"]');
        if (cancelBtn) cancelBtn.focus();

        function cleanup() {
            modal.remove();
        }

        function handleClick(e) {
            const action = e.target.dataset?.action;
            if (action === 'confirm') {
                cleanup();
                resolve(true);
            } else if (action === 'cancel') {
                cleanup();
                resolve(false);
            }
        }

        function handleKeydown(e) {
            if (e.key === 'Escape') {
                cleanup();
                resolve(false);
            }
        }

        // Click no backdrop fecha o modal
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                cleanup();
                resolve(false);
            }
        });

        modal.addEventListener('click', handleClick);
        document.addEventListener('keydown', handleKeydown, { once: true });
    });
}

/**
 * Modal de alerta (apenas OK)
 * @param {string} title - Título do modal
 * @param {string} message - Mensagem do modal
 * @param {Object} [options] - Opções adicionais
 * @returns {Promise<void>}
 */
export function alert(title, message, options = {}) {
    injectStyles();

    return new Promise((resolve) => {
        const modal = createModalElement({
            title,
            message,
            type: options.type || 'info',
            confirmText: options.confirmText || 'OK',
            showCancel: false
        });

        document.body.appendChild(modal);

        const confirmBtn = modal.querySelector('[data-action="confirm"]');
        if (confirmBtn) confirmBtn.focus();

        function cleanup() {
            modal.remove();
            resolve();
        }

        function handleClick(e) {
            if (e.target.dataset?.action === 'confirm') {
                cleanup();
            }
        }

        function handleKeydown(e) {
            if (e.key === 'Escape' || e.key === 'Enter') {
                cleanup();
            }
        }

        modal.addEventListener('click', (e) => {
            if (e.target === modal) cleanup();
        });

        modal.addEventListener('click', handleClick);
        document.addEventListener('keydown', handleKeydown, { once: true });
    });
}

/**
 * Modal com input de texto
 * @param {string} title - Título do modal
 * @param {string} message - Mensagem do modal
 * @param {Object} [options] - Opções adicionais
 * @returns {Promise<string|null>} Valor digitado ou null se cancelado
 */
export function prompt(title, message, options = {}) {
    injectStyles();

    return new Promise((resolve) => {
        const modal = createModalElement({
            title,
            message,
            type: options.type || 'info',
            confirmText: options.confirmText || 'OK',
            cancelText: options.cancelText || 'Cancelar',
            showCancel: true,
            showInput: true,
            inputPlaceholder: options.placeholder || ''
        });

        document.body.appendChild(modal);

        const input = modal.querySelector('.modal-input');
        if (input) {
            input.value = options.defaultValue || '';
            input.focus();
            input.select();
        }

        function cleanup() {
            modal.remove();
        }

        function handleClick(e) {
            const action = e.target.dataset?.action;
            if (action === 'confirm') {
                cleanup();
                resolve(input?.value || '');
            } else if (action === 'cancel') {
                cleanup();
                resolve(null);
            }
        }

        function handleKeydown(e) {
            if (e.key === 'Escape') {
                cleanup();
                resolve(null);
            } else if (e.key === 'Enter' && e.target === input) {
                cleanup();
                resolve(input?.value || '');
            }
        }

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                cleanup();
                resolve(null);
            }
        });

        modal.addEventListener('click', handleClick);
        document.addEventListener('keydown', handleKeydown);
    });
}

/**
 * Modal de confirmação para ação perigosa (logout, deletar, etc)
 * @param {string} title - Título do modal
 * @param {string} message - Mensagem do modal
 * @returns {Promise<boolean>}
 */
export function confirmDanger(title, message) {
    return confirm(title, message, {
        type: 'danger',
        dangerous: true,
        confirmText: 'Sim, tenho certeza',
        cancelText: 'Cancelar'
    });
}

/**
 * Modal de confirmação para ação positiva (matrícula, sucesso, etc)
 * @param {string} title - Título do modal
 * @param {string} message - Mensagem do modal
 * @param {string} confirmText - Texto do botão de confirmação
 * @returns {Promise<boolean>}
 */
export function confirmSuccess(title, message, confirmText = 'Confirmar') {
    return confirm(title, message, {
        type: 'success',
        confirmText: confirmText,
        cancelText: 'Cancelar'
    });
}

/**
 * Modal de sucesso
 * @param {string} title - Título do modal
 * @param {string} message - Mensagem do modal
 * @returns {Promise<void>}
 */
export function success(title, message) {
    return alert(title, message, { type: 'success' });
}

/**
 * Modal de erro
 * @param {string} title - Título do modal
 * @param {string} message - Mensagem do modal
 * @returns {Promise<void>}
 */
export function error(title, message) {
    return alert(title, message, { type: 'danger' });
}

// ============================================================
// EXPORT PADRÃO
// ============================================================

export default {
    confirm,
    alert,
    prompt,
    confirmDanger,
    success,
    error
};
