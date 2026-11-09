import { userMessage } from './user-message.js';

const MESSAGE_CLASSES = Object.freeze(['is-info', 'is-success', 'is-error']);
const messageTimers = new WeakMap();

export function setAcademicMessage(element, text, type = 'info') {
    if (!element) return;
    clearTimeout(messageTimers.get(element));

    const normalizedType = ['info', 'success', 'error'].includes(type) ? type : 'info';
    element.textContent = normalizedType === 'error' && text ? userMessage(text) : String(text ?? '');
    element.classList.remove(...MESSAGE_CLASSES);
    element.classList.add(`is-${normalizedType}`);
    element.hidden = !text;

    const isError = normalizedType === 'error';
    element.setAttribute('role', isError ? 'alert' : 'status');
    element.setAttribute('aria-live', isError ? 'assertive' : 'polite');
    element.setAttribute('aria-atomic', 'true');
    if (text && normalizedType === 'success') {
        messageTimers.set(element, setTimeout(() => {
            element.textContent = '';
            element.hidden = true;
        }, 8000));
    }
}

export function setAcademicBusy(element, busy) {
    if (element) element.setAttribute('aria-busy', String(Boolean(busy)));
}

export function formatAcademicDate(value) {
    if (!value) return 'Não informado';

    const calendarMatch = typeof value === 'string'
        ? value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
        : null;
    const date = calendarMatch
        ? new Date(
            Number(calendarMatch[1]),
            Number(calendarMatch[2]) - 1,
            Number(calendarMatch[3])
        )
        : value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);

    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).format(date);
}

export function preferredScrollBehavior(view = window) {
    return view.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth';
}

export function createAcademicState(message, type = 'empty', documentRef = document) {
    const item = documentRef.createElement('li');
    const normalizedType = ['loading', 'empty', 'error'].includes(type) ? type : 'empty';
    item.className = `ui-state is-${normalizedType}`;
    item.textContent = String(message ?? '');
    item.setAttribute('role', normalizedType === 'error' ? 'alert' : 'status');
    return item;
}
