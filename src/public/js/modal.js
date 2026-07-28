/**
 * @fileoverview Componente de modal reutilizável
 * @description Modais de confirmação, alerta e input
 */

import { lockPageScroll } from './page-scroll.js';

let modalSequence = 0;

function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = String(text);
    return element;
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

    const iconMap = {
        warning: '!',
        danger: '!',
        info: 'i',
        success: '✓'
    };
    const normalizedType = Object.hasOwn(iconMap, type) ? type : 'info';
    const titleId = `shared-modal-title-${++modalSequence}`;
    backdrop.setAttribute('aria-labelledby', titleId);

    const container = createElement('div', 'modal-container');
    const header = createElement('div', 'modal-header');
    const icon = createElement(
        'div',
        `modal-icon modal-icon--${normalizedType}`,
        iconMap[normalizedType]
    );
    icon.setAttribute('aria-hidden', 'true');
    const heading = createElement('h2', 'modal-title', title);
    heading.id = titleId;
    header.append(icon, heading);

    const body = createElement('div', 'modal-body');
    body.appendChild(createElement('p', '', message));
    if (showInput) {
        const input = createElement('input', 'modal-input');
        input.type = 'text';
        input.placeholder = String(inputPlaceholder);
        body.appendChild(input);
    }

    const actions = createElement('div', 'modal-actions');
    if (showCancel) {
        const cancel = createElement('button', 'modal-btn modal-btn--cancel', cancelText);
        cancel.type = 'button';
        cancel.dataset.action = 'cancel';
        actions.appendChild(cancel);
    }
    const confirm = createElement(
        'button',
        `modal-btn ${dangerous ? 'modal-btn--danger' : 'modal-btn--confirm'}`,
        confirmText
    );
    confirm.type = 'button';
    confirm.dataset.action = 'confirm';
    actions.appendChild(confirm);

    container.append(header, body, actions);
    backdrop.appendChild(container);

    return backdrop;
}

function getFocusableElements(modal) {
    return [...modal.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter((element) => !element.hidden);
}

function mountModal(modal, initialFocus) {
    const opener = document.activeElement;
    const restorePageScroll = lockPageScroll(document);

    function containFocus(event) {
        if (event.key !== 'Tab') return;
        const focusable = getFocusableElements(modal);
        if (!focusable.length) {
            event.preventDefault();
            modal.focus();
            return;
        }
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }

    modal.tabIndex = -1;
    modal.addEventListener('keydown', containFocus);
    document.body.appendChild(modal);
    (initialFocus || getFocusableElements(modal)[0] || modal).focus();

    let cleaned = false;
    return () => {
        if (cleaned) return;
        cleaned = true;
        modal.removeEventListener('keydown', containFocus);
        modal.remove();
        restorePageScroll();
        if (opener && opener.isConnected !== false && typeof opener.focus === 'function') {
            opener.focus();
        }
    };
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

        const cancelBtn = modal.querySelector('[data-action="cancel"]');
        const unmount = mountModal(modal, cancelBtn);

        function cleanup() {
            document.removeEventListener('keydown', handleKeydown);
            unmount();
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
        document.addEventListener('keydown', handleKeydown);
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
    return new Promise((resolve) => {
        const modal = createModalElement({
            title,
            message,
            type: options.type || 'info',
            confirmText: options.confirmText || 'OK',
            showCancel: false
        });

        const confirmBtn = modal.querySelector('[data-action="confirm"]');
        const unmount = mountModal(modal, confirmBtn);

        function cleanup() {
            document.removeEventListener('keydown', handleKeydown);
            unmount();
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
        document.addEventListener('keydown', handleKeydown);
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

        const input = modal.querySelector('.modal-input');
        if (input) {
            input.value = options.defaultValue || '';
        }
        const unmount = mountModal(modal, input);
        input?.select();

        function cleanup() {
            document.removeEventListener('keydown', handleKeydown);
            unmount();
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
