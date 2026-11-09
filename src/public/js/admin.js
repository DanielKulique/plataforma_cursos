import { authenticatedFetch, clearToken } from './auth.js';
import { initSessionUI } from './session-ui.js';
import { showAdminDialog } from './admin-dialog.js';
import { userMessage } from './user-message.js';

const state = {
    user: null,
    active: 'usuarios',
    loading: false,
    usuarios: [],
    cursos: [],
    turmas: [],
    pagination: {
        usuarios: { page: 1, limit: 25, total: 0 },
        turmas: { page: 1, limit: 25, total: 0 }
    },
    filters: {
        usuarios: { query: '', tipo: '' },
        cursos: { query: '' },
        turmas: { query: '', status: '' }
    }
};

let root;
let content;
let feedback;
let tabsBySection = new Map();
let dialogSequence = 0;
let elementSequence = 0;
let loadSequence = 0;
let feedbackTimer;

function el(tag, { className, text, type, id } = {}) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    if (type) node.type = type;
    if (id) node.id = id;
    return node;
}

function actionButton(label, className, handler, { ariaLabel } = {}) {
    const button = el('button', { className, text: label, type: 'button' });
    if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
    button.addEventListener('click', (event) => {
        button.focus();
        handler(event);
    });
    return button;
}

function mensagemErro(payload, fallback) {
    if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
        return payload.errors.map((item) => item.msg).filter(Boolean).join(' ');
    }
    return payload?.message || payload?.mensagem || fallback;
}

async function api(path, { method = 'GET', body, headers: customHeaders = {} } = {}) {
    const headers = { ...customHeaders };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await authenticatedFetch(path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
    });

    if (response.status === 401) {
        clearToken();
        window.location.href = '/login.html?motivo=auth';
        throw new Error('Sua sessão expirou. Entre novamente.');
    }

    const payload = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) {
        const fallback = 'Não foi possível concluir a operação. Tente novamente.';
        const error = new Error(response.status >= 500 ? fallback : userMessage(mensagemErro(payload, fallback), fallback));
        error.status = response.status;
        throw error;
    }
    return payload;
}

function showFeedback(message, type = 'success') {
    clearTimeout(feedbackTimer);
    feedback.className = `admin-feedback admin-feedback--${type}`;
    feedback.textContent = message;
    feedback.hidden = false;
    feedback.setAttribute('role', type === 'error' ? 'alert' : 'status');
    feedback.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
    feedback.focus();
    if (type === 'success') feedbackTimer = setTimeout(clearFeedback, 8000);
}

function clearFeedback() {
    clearTimeout(feedbackTimer);
    feedback.hidden = true;
    feedback.textContent = '';
}

function renderLoading(label) {
    content.setAttribute('aria-busy', 'true');
    const box = el('div', { className: 'ui-state is-loading' });
    box.setAttribute('role', 'status');
    box.append(
        el('strong', { text: `Carregando ${label}` }),
        el('span', { text: 'Aguarde enquanto os dados são consultados.' })
    );
    content.replaceChildren(box);
}

function renderError(error) {
    content.setAttribute('aria-busy', 'false');
    const box = el('section', { className: 'ui-state is-error' });
    box.setAttribute('role', 'alert');
    const heading = 'Não foi possível carregar';
    box.append(
        el('strong', { text: heading }),
        el('span', { text: userMessage(error, 'Não foi possível carregar os dados. Tente novamente.') }),
        actionButton('Tentar novamente', 'btn btn-ghost btn-sm', () => loadActive())
    );
    content.replaceChildren(box);
}

function emptyState(title, description) {
    const box = el('section', { className: 'ui-state is-empty admin-empty-state' });
    box.append(
        el('strong', { text: title }),
        el('span', { text: description })
    );
    return box;
}

function inputControl({
    label,
    name,
    type = 'text',
    value = '',
    required = false,
    maxLength,
    min,
    pattern,
    placeholder,
    options,
    professorLookup = false
}, dialogId) {
    const wrapper = el('div', { className: 'admin-field' });
    const controlId = `${dialogId}-${name}`;
    const errorId = `${controlId}-error`;
    const caption = el('label', { text: label });
    caption.htmlFor = controlId;
    if (required) {
        const marker = el('span', { className: 'admin-required-marker', text: ' *' });
        marker.setAttribute('aria-hidden', 'true');
        caption.appendChild(marker);
    }
    let control;

    if (options) {
        control = el('select');
        options.forEach((option) => {
            const item = el('option', { text: option.label });
            item.value = String(option.value);
            control.appendChild(item);
        });
    } else if (type === 'textarea') {
        control = el('textarea');
        control.rows = 4;
    } else {
        control = el('input');
        control.type = type;
    }

    control.id = controlId;
    control.name = name;
    control.value = value === null || value === undefined ? '' : String(value);
    control.required = required;
    if (required) control.setAttribute('aria-required', 'true');
    if (maxLength) control.maxLength = maxLength;
    if (min !== undefined) control.min = String(min);
    if (pattern) control.pattern = pattern;
    if (placeholder) control.placeholder = placeholder;
    if (type === 'password') {
        control.autocomplete = name === 'senha_atual' ? 'current-password' : 'new-password';
    } else {
        control.autocomplete = 'off';
    }

    const fieldError = el('p', { className: 'admin-field-error' });
    fieldError.id = errorId;
    fieldError.hidden = true;
    fieldError.setAttribute('aria-live', 'polite');
    control.setAttribute('aria-describedby', errorId);
    control.addEventListener('invalid', () => {
        control.setAttribute('aria-invalid', 'true');
        fieldError.textContent = control.validationMessage;
        fieldError.hidden = false;
    });
    control.addEventListener('input', () => {
        control.removeAttribute('aria-invalid');
        fieldError.textContent = '';
        fieldError.hidden = true;
    });

    wrapper.append(caption, control, fieldError);
    if (professorLookup) addProfessorLookup(wrapper, control, dialogId);
    return { wrapper, control, fieldError };
}

function paginationControls(meta, label, onPage) {
    const pages = Math.max(1, Math.ceil(meta.total / meta.limit));
    const nav = el('nav', { className: 'admin-pagination' });
    nav.setAttribute('aria-label', `Paginação de ${label}`);
    const status = el('span', { text: `Página ${meta.page} de ${pages} · ${meta.total} ${meta.total === 1 ? 'registro' : 'registros'}` });
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.tabIndex = -1;
    const previous = actionButton('Anterior', 'btn btn-ghost btn-sm', () => onPage(meta.page - 1), {
        ariaLabel: `Página anterior de ${label}`
    });
    const next = actionButton('Próxima', 'btn btn-ghost btn-sm', () => onPage(meta.page + 1), {
        ariaLabel: `Próxima página de ${label}`
    });
    previous.disabled = meta.page <= 1;
    next.disabled = meta.page >= pages;
    nav.append(previous, status, next);
    return nav;
}

function listPagination(section, label) {
    return paginationControls(state.pagination[section], label, (page) => {
        state.pagination[section].page = page;
        loadActive({ focus: true });
    });
}

function changeFilter(section, values) {
    Object.assign(state.filters[section], values);
    state.pagination[section].page = 1;
    loadActive({ focus: true });
}

function addProfessorLookup(wrapper, control, dialogId) {
    const search = el('input');
    search.type = 'search';
    search.id = `${dialogId}-professor-search`;
    search.maxLength = 200;
    const label = el('label', { text: 'Buscar professores' });
    label.htmlFor = search.id;
    const message = el('p');
    message.setAttribute('aria-live', 'polite');
    const results = el('ul', { className: 'admin-professor-results' });
    results.setAttribute('aria-label', 'Resultados da busca de professores');
    const paging = el('div');
    let sequence = 0;
    let query = '';
    let page = 1;
    const retry = actionButton('Tentar novamente professores', 'btn btn-ghost btn-sm', () => load(true));
    retry.hidden = true;
    const submit = actionButton('Buscar professores', 'btn btn-ghost btn-sm', () => {
        query = search.value.trim();
        page = 1;
        load(true);
    });
    search.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        submit.click();
    });
    const lookup = el('div', { className: 'admin-field' });
    lookup.append(label, search, submit, results, message, paging, retry);
    wrapper.appendChild(lookup);

    async function load(focus = false) {
        const current = ++sequence;
        lookup.setAttribute('aria-busy', 'true');
        message.setAttribute('role', 'status');
        message.textContent = 'Carregando professores...';
        results.replaceChildren();
        retry.hidden = true;
        paging.querySelectorAll('button').forEach(button => { button.disabled = true; });
        try {
            const result = await api(`/api/admin/usuarios?${new URLSearchParams({ tipo: 'PROFESSOR', q: query, page, limit: 25 })}`);
            if (current !== sequence || !control.isConnected) return;
            const selected = control.value;
            const selectedLabel = control.selectedOptions[0]?.textContent;
            const options = result.items.map(user => ({ value: String(user.id_usuario), label: user.nome_completo }));
            if (selected && !options.some(option => option.value === selected)) options.unshift({ value: selected, label: selectedLabel });
            control.replaceChildren();
            for (const option of [{ value: '', label: 'Selecione um professor' }, ...options]) {
                const node = el('option', { text: option.label });
                node.value = option.value;
                control.appendChild(node);
            }
            control.value = selected;
            for (const user of result.items) {
                const item = el('li');
                const choose = actionButton(`${user.nome_completo} · ${user.email} · ID ${user.id_usuario}`, 'btn btn-ghost btn-sm', () => {
                    control.value = String(user.id_usuario);
                    control.dispatchEvent(new Event('input', { bubbles: true }));
                    control.dispatchEvent(new Event('change', { bubbles: true }));
                    results.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', 'false'));
                    choose.setAttribute('aria-pressed', 'true');
                    message.textContent = `Professor selecionado: ${user.nome_completo}.`;
                });
                choose.value = String(user.id_usuario);
                choose.setAttribute('aria-pressed', String(String(user.id_usuario) === selected));
                item.append(choose);
                results.append(item);
            }
            page = result.page;
            message.textContent = result.total ? '' : 'Nenhum professor encontrado.';
            paging.replaceChildren(paginationControls(result, 'professores', (next) => { page = next; load(true); }));
            if (focus) paging.querySelector('[role="status"]').focus();
        } catch (error) {
            if (current !== sequence || !control.isConnected) return;
            message.setAttribute('role', 'alert');
            message.textContent = `Não foi possível carregar professores: ${error.message}`;
            retry.hidden = false;
        } finally {
            if (current === sequence) lookup.setAttribute('aria-busy', 'false');
        }
    }
    control.addEventListener('change', () => {
        results.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.value === control.value)));
    });
    load();
}

function setFormBusy({ form, submit, cancel, close, busy, submitLabel }) {
    form.setAttribute('aria-busy', String(busy));
    submit.disabled = busy;
    cancel.disabled = busy;
    close.disabled = busy;
    submit.textContent = busy ? 'Processando...' : submitLabel;
}

function openForm({
    title,
    description = 'Preencha os campos abaixo. Os campos marcados com asterisco são obrigatórios.',
    fields,
    submitLabel,
    onSubmit,
    onSuccess,
    contentBeforeFields,
    dialogClassName = '',
    opener
}) {
    const dialogId = `admin-dialog-${++dialogSequence}`;
    const dialog = el('dialog', { className: 'admin-dialog' });
    if (dialogClassName) dialog.classList.add(dialogClassName);
    dialog.id = dialogId;
    dialog.setAttribute('aria-labelledby', `${dialogId}-title`);
    dialog.setAttribute('aria-describedby', `${dialogId}-description`);

    const header = el('header', { className: 'admin-dialog__header' });
    const heading = el('h2', { id: `${dialogId}-title`, text: title });
    const close = actionButton('×', 'admin-dialog__close', () => dialog.close(), {
        ariaLabel: `Fechar ${title.toLocaleLowerCase('pt-BR')}`
    });
    close.firstChild?.setAttribute?.('aria-hidden', 'true');
    header.append(heading, close);

    const descriptionNode = el('p', {
        className: 'admin-dialog__description',
        id: `${dialogId}-description`,
        text: description
    });
    const form = el('form', { className: 'admin-form' });
    form.method = 'dialog';
    const formError = el('p', { className: 'admin-form-error' });
    formError.hidden = true;
    formError.tabIndex = -1;
    formError.setAttribute('role', 'alert');
    const controls = {};
    let submitting = false;

    if (contentBeforeFields) form.appendChild(contentBeforeFields);

    fields.forEach((field) => {
        const built = inputControl(field, dialogId);
        controls[field.name] = built.control;
        form.appendChild(built.wrapper);
    });

    const actions = el('div', { className: 'admin-form-actions' });
    const cancel = actionButton('Cancelar', 'btn btn-ghost', () => dialog.close());
    const submit = el('button', { className: 'btn btn-primary', text: submitLabel, type: 'submit' });
    actions.append(cancel, submit);
    form.prepend(formError);
    form.appendChild(actions);
    dialog.append(header, descriptionNode, form);
    document.body.appendChild(dialog);

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (submitting) return;
        if (!form.checkValidity()) {
            form.reportValidity();
            form.querySelector(':invalid')?.focus();
            return;
        }

        submitting = true;
        setFormBusy({ form, submit, cancel, close, busy: true, submitLabel });
        formError.hidden = true;
        formError.textContent = '';
        try {
            const values = Object.fromEntries(
                Object.entries(controls).map(([name, control]) => [name, control.value])
            );
            const result = await onSubmit(values);
            if (dialog.open) dialog.close();
            if (onSuccess) await onSuccess(result);
        } catch (error) {
            formError.textContent = error.message;
            if (error.status) formError.dataset.httpStatus = String(error.status);
            formError.hidden = false;
            formError.focus();
        } finally {
            submitting = false;
            if (dialog.open) {
                setFormBusy({ form, submit, cancel, close, busy: false, submitLabel });
            }
        }
    });

    showAdminDialog(dialog, { initialFocus: controls[fields[0]?.name], opener });
    return { dialog, form, controls };
}

function makeTable({ caption, headers, rows, regionLabel }) {
    const hintId = `admin-table-hint-${++elementSequence}`;
    const region = el('section', { className: 'admin-table-region' });
    const hint = el('p', {
        className: 'admin-table-scroll-hint',
        id: hintId,
        text: 'Deslize horizontalmente para consultar todas as colunas e ações.'
    });
    const container = el('div', { className: 'admin-table-scroll' });
    container.tabIndex = 0;
    container.setAttribute('role', 'region');
    container.setAttribute('aria-label', regionLabel);
    container.setAttribute('aria-describedby', hintId);
    const table = el('table');
    table.className = 'admin-table';
    const tableCaption = el('caption', { className: 'sr-only', text: caption });
    const thead = el('thead');
    const headerRow = el('tr');
    headers.forEach((header) => {
        const cell = el('th', { text: header });
        cell.scope = 'col';
        headerRow.appendChild(cell);
    });
    thead.appendChild(headerRow);
    const tbody = el('tbody');
    rows.forEach((cells) => {
        const row = el('tr');
        cells.forEach((cell) => {
            const td = el('td');
            if (cell instanceof Node) td.appendChild(cell);
            else td.textContent = String(cell ?? '—');
            row.appendChild(td);
        });
        tbody.appendChild(row);
    });
    table.append(tableCaption, thead, tbody);
    container.appendChild(table);
    region.append(hint, container);
    return region;
}

function toolbar({
    sectionLabel,
    query,
    onQuery,
    filter,
    onFilter,
    filterOptions,
    onClear,
    addLabel,
    onAdd,
    extraAction
}) {
    const bar = el('form', { className: 'admin-toolbar' });
    bar.setAttribute('role', 'search');
    bar.setAttribute('aria-label', `Busca e filtros de ${sectionLabel}`);
    const searchGroup = el('div', { className: 'admin-toolbar__field admin-toolbar__search' });
    const searchId = `admin-search-${++elementSequence}`;
    const searchLabel = el('label', { text: `Buscar ${sectionLabel}` });
    searchLabel.htmlFor = searchId;
    const search = el('input');
    search.id = searchId;
    search.type = 'search';
    search.maxLength = 200;
    search.placeholder = `Buscar em ${sectionLabel}`;
    search.value = query;
    searchGroup.append(searchLabel, search);
    bar.appendChild(searchGroup);
    bar.addEventListener('submit', (event) => {
        event.preventDefault();
        onQuery(search.value);
    });

    if (filterOptions) {
        const filterGroup = el('div', { className: 'admin-toolbar__field' });
        const filterId = `admin-filter-${++elementSequence}`;
        const filterLabel = el('label', { text: 'Filtrar por' });
        filterLabel.htmlFor = filterId;
        const select = el('select');
        select.id = filterId;
        filterOptions.forEach((option) => {
            const item = el('option', { text: option.label });
            item.value = option.value;
            select.appendChild(item);
        });
        select.value = filter;
        select.addEventListener('change', () => onFilter(select.value));
        filterGroup.append(filterLabel, select);
        bar.appendChild(filterGroup);
    }

    const actions = el('div', { className: 'admin-toolbar__actions' });
    actions.appendChild(el('button', { className: 'btn btn-ghost btn-sm', text: 'Buscar', type: 'submit' }));
    const clear = actionButton('Limpar filtros', 'btn btn-ghost btn-sm', onClear);
    clear.disabled = !query && !filter;
    actions.appendChild(clear);
    if (extraAction) actions.appendChild(extraAction);
    actions.appendChild(actionButton(addLabel, 'btn btn-primary btn-sm', onAdd));
    bar.appendChild(actions);
    return bar;
}

function rowActions(itemType, itemLabel, onEdit, onDelete, extraActions = []) {
    const actions = el('div', { className: 'admin-row-actions' });
    extraActions.forEach(({ label, handler, ariaLabel, className = 'btn btn-ghost btn-sm' }) => {
        actions.appendChild(actionButton(label, className, handler, { ariaLabel }));
    });
    actions.append(
        actionButton('Editar', 'btn btn-ghost btn-sm', onEdit, {
            ariaLabel: `Editar ${itemType} ${itemLabel}`
        }),
        actionButton('Excluir', 'btn btn-danger btn-sm', onDelete, {
            ariaLabel: `Excluir ${itemType} ${itemLabel}`
        })
    );
    return actions;
}

function statusBadge(value, label = value) {
    const normalized = String(value || '').toLocaleLowerCase('pt-BR');
    const badge = el('span', { className: `badge admin-badge admin-badge--${normalized}`, text: label });
    return badge;
}

function confirmAction({ title, message, confirmLabel }) {
    return new Promise((resolve) => {
        const dialogId = `admin-dialog-${++dialogSequence}`;
        const dialog = el('dialog', { className: 'admin-dialog admin-confirm-dialog' });
        dialog.id = dialogId;
        dialog.setAttribute('aria-labelledby', `${dialogId}-title`);
        dialog.setAttribute('aria-describedby', `${dialogId}-description`);

        const header = el('header', { className: 'admin-dialog__header' });
        const heading = el('h2', { id: `${dialogId}-title`, text: title });
        const close = actionButton('×', 'admin-dialog__close', () => dialog.close(), {
            ariaLabel: `Fechar ${title.toLocaleLowerCase('pt-BR')}`
        });
        header.append(heading, close);
        const description = el('p', {
            className: 'admin-dialog__description',
            id: `${dialogId}-description`,
            text: message
        });
        const actions = el('div', { className: 'admin-form-actions' });
        const cancel = actionButton('Cancelar', 'btn btn-ghost', () => dialog.close());
        const confirm = actionButton(confirmLabel, 'btn btn-danger', () => {
            resolve(true);
            dialog.close();
        });
        actions.append(cancel, confirm);
        dialog.append(header, description, actions);
        dialog.addEventListener('close', () => resolve(false), { once: true });
        document.body.appendChild(dialog);
        showAdminDialog(dialog, { initialFocus: cancel });
    });
}

async function mutate(operation, successMessage) {
    clearFeedback();
    await operation();
    showFeedback(successMessage);
    await loadActive();
}

function userFields(usuario = null) {
    const fields = [
        { label: 'Nome completo', name: 'nome_completo', value: usuario?.nome_completo, required: true, maxLength: 150 },
        { label: 'CPF (11 dígitos)', name: 'cpf', value: usuario?.cpf, required: true, maxLength: 11 },
        { label: 'E-mail', name: 'email', type: 'email', value: usuario?.email, required: true, maxLength: 150 },
        { label: 'Telefone', name: 'telefone', type: 'tel', value: usuario?.telefone, maxLength: 20, pattern: '[0-9()+\\-\\s]{8,20}' },
        {
            label: 'Papel', name: 'tipo', value: usuario?.tipo || 'ALUNO', required: true,
            options: ['ALUNO', 'PROFESSOR', 'ADMIN'].map((tipo) => ({ value: tipo, label: tipo }))
        }
    ];
    if (!usuario) {
        fields.splice(4, 0, {
            label: 'Senha forte', name: 'senha', type: 'password', required: true, maxLength: 128
        });
    }
    return fields;
}

function openCreateUser() {
    openForm({
        title: 'Criar usuário',
        fields: userFields(),
        submitLabel: 'Criar usuário',
        onSubmit: (values) => mutate(
            () => api('/api/admin/usuarios', { method: 'POST', body: values }),
            'Usuário criado com sucesso.'
        )
    });
}

function openEditUser(usuario) {
    openForm({
        title: 'Editar usuário',
        fields: userFields(usuario),
        submitLabel: 'Salvar alterações',
        onSubmit: (values) => mutate(
            () => api(`/api/admin/usuarios/${usuario.id_usuario}`, { method: 'PATCH', body: values }),
            'Usuário atualizado com sucesso.'
        )
    });
}

function openPasswordChange() {
    openForm({
        title: 'Trocar minha senha',
        fields: [
            { label: 'Senha atual', name: 'senha_atual', type: 'password', required: true, maxLength: 128 },
            { label: 'Nova senha forte', name: 'nova_senha', type: 'password', required: true, maxLength: 128 }
        ],
        submitLabel: 'Alterar senha',
        onSubmit: async (values) => {
            await api(`/api/usuarios/${state.user.id_usuario}/senha`, { method: 'PATCH', body: values });
            clearToken();
            window.location.href = '/login.html?motivo=senha_alterada';
        }
    });
}

async function deleteUser(usuario) {
    const confirmed = await confirmAction({
        title: 'Excluir usuário',
        message: `Excluir fisicamente o usuário “${usuario.nome_completo}”? Esta ação não pode ser desfeita.`,
        confirmLabel: 'Excluir usuário'
    });
    if (!confirmed) return;
    try {
        await mutate(
            () => api(`/api/admin/usuarios/${usuario.id_usuario}`, { method: 'DELETE' }),
            'Usuário excluído com sucesso.'
        );
    } catch (error) {
        showFeedback(error.message, 'error');
    }
}

function renderUsers() {
    const filter = state.filters.usuarios;
    const users = state.usuarios;

    const passwordButton = actionButton(
        'Trocar minha senha',
        'btn btn-ghost btn-sm',
        openPasswordChange
    );
    const bar = toolbar({
        sectionLabel: 'usuários',
        query: filter.query,
        onQuery: (value) => changeFilter('usuarios', { query: value }),
        filter: filter.tipo,
        onFilter: (value) => changeFilter('usuarios', { tipo: value }),
        onClear: () => changeFilter('usuarios', { query: '', tipo: '' }),
        filterOptions: [
            { value: '', label: 'Todos os papéis' },
            { value: 'ALUNO', label: 'Alunos' },
            { value: 'PROFESSOR', label: 'Professores' },
            { value: 'ADMIN', label: 'Administradores' }
        ],
        addLabel: 'Novo usuário',
        onAdd: openCreateUser,
        extraAction: passwordButton
    });

    const body = users.length === 0
        ? (!filter.query && !filter.tipo
            ? emptyState('Nenhum usuário cadastrado', 'Cadastre o primeiro usuário administrativo.')
            : emptyState('Nenhum resultado', 'Nenhum usuário corresponde à busca ou ao papel selecionado.'))
        : makeTable({
            caption: 'Usuários cadastrados na plataforma',
            regionLabel: 'Tabela de usuários cadastrados',
            headers: ['Nome', 'E-mail', 'CPF', 'Telefone', 'Papel', 'Ações'],
            rows: users.map((usuario) => [
                usuario.nome_completo,
                usuario.email,
                usuario.cpf,
                usuario.telefone,
                statusBadge(usuario.tipo),
                rowActions(
                    'usuário',
                    usuario.nome_completo,
                    () => openEditUser(usuario),
                    () => deleteUser(usuario)
                )
            ])
        });
    content.setAttribute('aria-busy', 'false');
    content.replaceChildren(bar, listPagination('usuarios', 'usuários'), body);
}

function courseFields(curso = null) {
    return [
        { label: 'Nome do curso', name: 'nome_curso', value: curso?.nome_curso, required: true, maxLength: 100 },
        { label: 'Descrição', name: 'descricao', type: 'textarea', value: curso?.descricao, maxLength: 5000 },
        { label: 'Carga horária', name: 'carga_horaria', type: 'number', value: curso?.carga_horaria, required: true, min: 1 }
    ];
}

function coursePayload(values) {
    return { ...values, carga_horaria: Number(values.carga_horaria), descricao: values.descricao || null };
}

function openCreateCourse() {
    openForm({
        title: 'Criar curso',
        fields: courseFields(),
        submitLabel: 'Criar curso',
        onSubmit: (values) => mutate(
            () => api('/api/cursos', { method: 'POST', body: coursePayload(values) }),
            'Curso criado com sucesso.'
        )
    });
}

function openEditCourse(curso) {
    openForm({
        title: 'Editar curso',
        fields: courseFields(curso),
        submitLabel: 'Salvar alterações',
        onSubmit: (values) => mutate(
            () => api(`/api/cursos/${curso.id_curso}`, { method: 'PUT', body: coursePayload(values) }),
            'Curso atualizado com sucesso.'
        )
    });
}

async function deleteCourse(curso) {
    const confirmed = await confirmAction({
        title: 'Excluir curso',
        message: `Excluir o curso “${curso.nome_curso}”? Cursos com turmas vinculadas permanecem protegidos.`,
        confirmLabel: 'Excluir curso'
    });
    if (!confirmed) return;
    try {
        await mutate(
            () => api(`/api/cursos/${curso.id_curso}`, { method: 'DELETE' }),
            'Curso excluído com sucesso.'
        );
    } catch (error) {
        showFeedback(error.message, 'error');
    }
}

function renderCourses() {
    const filter = state.filters.cursos;
    const term = filter.query.trim().toLocaleLowerCase('pt-BR');
    const courses = state.cursos.filter((curso) => !term
        || curso.nome_curso.toLocaleLowerCase('pt-BR').includes(term)
        || String(curso.descricao || '').toLocaleLowerCase('pt-BR').includes(term));
    const bar = toolbar({
        sectionLabel: 'cursos',
        query: filter.query,
        onQuery: (value) => { filter.query = value; renderCourses(); },
        onClear: () => {
            filter.query = '';
            renderCourses();
        },
        addLabel: 'Novo curso',
        onAdd: openCreateCourse
    });
    const body = courses.length === 0
        ? (state.cursos.length === 0
            ? emptyState('Nenhum curso cadastrado', 'Cadastre o primeiro curso para organizar as turmas.')
            : emptyState('Nenhum resultado', 'Nenhum curso corresponde ao termo buscado.'))
        : makeTable({
            caption: 'Cursos cadastrados na plataforma',
            regionLabel: 'Tabela de cursos cadastrados',
            headers: ['Curso', 'Descrição', 'Carga horária', 'Ações'],
            rows: courses.map((curso) => [
                curso.nome_curso,
                curso.descricao,
                `${curso.carga_horaria} h`,
                rowActions(
                    'curso',
                    curso.nome_curso,
                    () => openEditCourse(curso),
                    () => deleteCourse(curso)
                )
            ])
        });
    content.setAttribute('aria-busy', 'false');
    content.replaceChildren(bar, body);
}

function dateValue(value) {
    if (!value) return '';
    return String(value).slice(0, 10);
}

function formatDate(value) {
    const normalized = dateValue(value);
    if (!normalized) return '';
    const [year, month, day] = normalized.split('-').map(Number);
    return new Intl.DateTimeFormat('pt-BR').format(new Date(year, month - 1, day));
}

function classFields(turma = null) {
    return [
        { label: 'Nome da turma', name: 'nome_turma', value: turma?.nome_turma, required: true, maxLength: 100 },
        {
            label: 'Curso', name: 'id_curso', value: turma?.id_curso, required: true,
            options: [
                { value: '', label: 'Selecione um curso' },
                ...state.cursos.map((curso) => ({ value: curso.id_curso, label: curso.nome_curso }))
            ]
        },
        {
            label: 'Professor', name: 'id_professor', value: turma?.id_professor, required: true, professorLookup: true,
            options: [
                { value: '', label: 'Selecione um professor' },
                ...(turma ? [{ value: turma.id_professor, label: turma.nome_professor }] : [])
            ]
        },
        { label: 'Data inicial', name: 'data_inicio', type: 'date', value: dateValue(turma?.data_inicio), required: true },
        { label: 'Data final', name: 'data_fim', type: 'date', value: dateValue(turma?.data_fim) },
        {
            label: 'Status', name: 'status', value: turma?.status || 'ABERTA', required: true,
            options: [
                { value: 'ABERTA', label: 'Inscrições abertas' },
                { value: 'FECHADA', label: 'Inscrições fechadas' },
                { value: 'ENCERRADA', label: 'Encerrada' }
            ]
        }
    ];
}

function classPayload(values) {
    return {
        ...values,
        id_curso: Number(values.id_curso),
        id_professor: Number(values.id_professor),
        data_fim: values.data_fim || null
    };
}

function replicationFields(turma) {
    return [
        {
            label: 'Nome da nova turma',
            name: 'nome_turma',
            required: true,
            maxLength: 100,
            placeholder: `${turma.nome_turma} — próxima edição`
        },
        {
            label: 'Professor responsável', name: 'id_professor', required: true, professorLookup: true,
            options: [
                { value: '', label: 'Selecione um professor' },
            ]
        },
        { label: 'Data inicial', name: 'data_inicio', type: 'date', value: dateValue(turma.data_inicio), required: true },
        { label: 'Data final', name: 'data_fim', type: 'date', value: dateValue(turma.data_fim) },
        {
            label: 'Status inicial', name: 'status', value: 'ABERTA', required: true,
            options: [
                { value: 'ABERTA', label: 'Inscrições abertas' },
                { value: 'FECHADA', label: 'Inscrições fechadas' },
                { value: 'ENCERRADA', label: 'Encerrada' }
            ]
        }
    ];
}

function createReplicationKey() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `rep-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function replicationSummaryShell(turma) {
    const section = el('section', { className: 'admin-replication-summary' });
    section.setAttribute('aria-live', 'polite');
    const origin = el('div', { className: 'admin-replication-origin' });
    origin.append(
        el('span', { text: 'Turma de origem' }),
        el('strong', { text: turma.nome_turma }),
        el('small', { text: `${turma.nome_curso} · ${turma.status === 'ENCERRADA' ? 'encerrada, preservada como modelo' : 'estrutura atual preservada'}` })
    );
    const loading = el('p', { className: 'admin-replication-loading', text: 'Conferindo a estrutura acadêmica…' });
    loading.setAttribute('role', 'status');
    section.append(origin, loading);
    return section;
}

function summaryList(title, items, className = '') {
    const group = el('section', { className: `admin-replication-group ${className}`.trim() });
    group.appendChild(el('h3', { text: title }));
    const list = el('ul');
    items.forEach((item) => list.appendChild(el('li', { text: item })));
    group.appendChild(list);
    return group;
}

function renderReplicationSummary(container, resumo) {
    const origin = container.querySelector('.admin-replication-origin');
    const copied = [
        `${resumo.modulos} ${resumo.modulos === 1 ? 'módulo' : 'módulos'}`,
        `${resumo.conteudos} conteúdos (${resumo.videos} vídeos, ${resumo.pdfs} PDFs, ${resumo.textos} textos)`,
        `${resumo.links} links e ${resumo.atividades} atividades`,
        `${resumo.questionarios} questionários e ${resumo.provas} provas`,
        `${resumo.perguntas} perguntas e ${resumo.alternativas} alternativas`
    ];
    const excluded = [
        'Alunos e matrículas',
        'Progresso e conclusões',
        'Tentativas, respostas e notas',
        'Certificados e histórico individual'
    ];
    const groups = el('div', { className: 'admin-replication-groups' });
    groups.append(
        summaryList('Estrutura que será replicada', copied, 'admin-replication-group--copied'),
        summaryList('Dados que ficarão de fora', excluded, 'admin-replication-group--excluded')
    );
    container.replaceChildren(origin, groups);
}

function renderReplicationSummaryError(container, turma) {
    const origin = container.querySelector('.admin-replication-origin');
    const warning = el('p', {
        className: 'admin-replication-warning',
        text: 'Não foi possível calcular o resumo agora. A replicação continuará protegida pelas mesmas regras do servidor.'
    });
    container.replaceChildren(origin, warning);
    showFeedback(`Não foi possível conferir a estrutura de “${turma.nome_turma}”.`, 'error');
}

function showReplicationSuccess(novaTurma) {
    const dialogId = `admin-dialog-${++dialogSequence}`;
    const dialog = el('dialog', { className: 'admin-dialog admin-confirm-dialog admin-replication-success' });
    dialog.id = dialogId;
    dialog.setAttribute('aria-labelledby', `${dialogId}-title`);
    dialog.setAttribute('aria-describedby', `${dialogId}-description`);
    const header = el('header', { className: 'admin-dialog__header' });
    const heading = el('h2', { id: `${dialogId}-title`, text: 'Turma replicada com sucesso' });
    const close = actionButton('×', 'admin-dialog__close', () => dialog.close(), {
        ariaLabel: 'Fechar confirmação da replicação'
    });
    header.append(heading, close);
    const description = el('p', {
        className: 'admin-dialog__description',
        id: `${dialogId}-description`,
        text: `“${novaTurma.nome_turma}” foi criada como uma turma independente e sem dados acadêmicos de alunos.`
    });
    const actions = el('div', { className: 'admin-form-actions' });
    const done = actionButton('Concluir', 'btn btn-ghost', () => dialog.close());
    const open = actionButton('Abrir nova turma', 'btn btn-primary', () => {
        dialog.close();
        setTimeout(() => openEditClass(novaTurma), 0);
    });
    actions.append(done, open);
    dialog.append(header, description, actions);
    document.body.appendChild(dialog);
    showAdminDialog(dialog, { initialFocus: open });
}

function openReplicateClass(turma, opener) {
    const summary = replicationSummaryShell(turma);
    const replicationKey = createReplicationKey();
    openForm({
        title: 'Replicar estrutura da turma',
        description: 'Crie uma nova turma independente usando somente a estrutura acadêmica da origem.',
        fields: replicationFields(turma),
        submitLabel: 'Replicar turma',
        contentBeforeFields: summary,
        dialogClassName: 'admin-dialog--replication',
        opener,
        onSubmit: async (values) => {
            clearFeedback();
            const result = await api(`/api/turmas/${turma.id_turma}/replicar`, {
                method: 'POST',
                headers: { 'Idempotency-Key': replicationKey },
                body: {
                    nome_turma: values.nome_turma,
                    id_professor: Number(values.id_professor),
                    data_inicio: values.data_inicio,
                    data_fim: values.data_fim || null,
                    status: values.status
                }
            });
            showFeedback('Turma replicada com sucesso.');
            await loadActive();
            return result;
        },
        onSuccess: (result) => showReplicationSuccess(result.turma)
    });

    api(`/api/turmas/${turma.id_turma}/replicacao-resumo`)
        .then((result) => renderReplicationSummary(summary, result.resumo))
        .catch(() => renderReplicationSummaryError(summary, turma));
}

function openCreateClass() {
    openForm({
        title: 'Criar turma',
        fields: classFields(),
        submitLabel: 'Criar turma',
        onSubmit: (values) => mutate(
            () => api('/api/turmas', { method: 'POST', body: classPayload(values) }),
            'Turma criada com sucesso.'
        )
    });
}

function openEditClass(turma) {
    openForm({
        title: 'Editar turma',
        fields: classFields(turma),
        submitLabel: 'Salvar alterações',
        onSubmit: (values) => mutate(
            () => api(`/api/turmas/${turma.id_turma}`, { method: 'PATCH', body: classPayload(values) }),
            'Turma atualizada com sucesso.'
        )
    });
}

async function deleteClass(turma) {
    const confirmed = await confirmAction({
        title: 'Excluir turma',
        message: `Excluir a turma “${turma.nome_turma}”? Turmas com matrículas permanecem protegidas.`,
        confirmLabel: 'Excluir turma'
    });
    if (!confirmed) return;
    try {
        await mutate(
            () => api(`/api/turmas/${turma.id_turma}`, { method: 'DELETE' }),
            'Turma excluída com sucesso.'
        );
    } catch (error) {
        showFeedback(error.message, 'error');
    }
}

function renderClasses() {
    const filter = state.filters.turmas;
    const classes = state.turmas;
    const bar = toolbar({
        sectionLabel: 'turmas',
        query: filter.query,
        onQuery: (value) => changeFilter('turmas', { query: value }),
        filter: filter.status,
        onFilter: (value) => changeFilter('turmas', { status: value }),
        onClear: () => changeFilter('turmas', { query: '', status: '' }),
        filterOptions: [
            { value: '', label: 'Todos os status' },
            { value: 'ABERTA', label: 'Inscrições abertas' },
            { value: 'FECHADA', label: 'Inscrições fechadas' },
            { value: 'ENCERRADA', label: 'Encerradas' }
        ],
        addLabel: 'Nova turma',
        onAdd: openCreateClass
    });
    const body = classes.length === 0
        ? (!filter.query && !filter.status
            ? emptyState('Nenhuma turma cadastrada', 'Cadastre a primeira turma após criar curso e professor.')
            : emptyState('Nenhum resultado', 'Nenhuma turma corresponde à busca ou ao status selecionado.'))
        : makeTable({
            caption: 'Turmas cadastradas na plataforma',
            regionLabel: 'Tabela de turmas cadastradas',
            headers: ['Turma', 'Curso', 'Professor', 'Período', 'Status', 'Ações'],
            rows: classes.map((turma) => [
                turma.nome_turma,
                turma.nome_curso,
                turma.nome_professor,
                `${formatDate(turma.data_inicio)} — ${formatDate(turma.data_fim) || 'sem término'}`,
                statusBadge(
                    turma.status,
                    {
                        ABERTA: 'Inscrições abertas',
                        FECHADA: 'Inscrições fechadas',
                        ENCERRADA: 'Encerrada'
                    }[turma.status] || turma.status
                ),
                rowActions(
                    'turma',
                    turma.nome_turma,
                    () => openEditClass(turma),
                    () => deleteClass(turma),
                    [{
                        label: 'Conteúdos',
                        handler: () => { window.location.href = `/professor-turma.html?id_turma=${turma.id_turma}`; },
                        ariaLabel: `Abrir painel da turma ${turma.nome_turma}`
                    }, {
                        label: 'Replicar',
                        handler: (event) => openReplicateClass(turma, event.currentTarget),
                        ariaLabel: `Replicar estrutura da turma ${turma.nome_turma}`
                    }]
                )
            ])
        });
    content.setAttribute('aria-busy', 'false');
    content.replaceChildren(bar, listPagination('turmas', 'turmas'), body);
}

async function loadActive({ focus = false } = {}) {
    const currentLoad = ++loadSequence;
    const section = state.active;
    state.loading = true;
    root.setAttribute('aria-busy', 'true');
    renderLoading(state.active);
    try {
        if (section === 'usuarios') {
            const filter = state.filters.usuarios;
            const usuarios = await api(`/api/admin/usuarios?${new URLSearchParams({ page: state.pagination.usuarios.page,
                limit: 25, q: filter.query, tipo: filter.tipo })}`);
            if (currentLoad !== loadSequence) return;
            state.pagination.usuarios = { page: usuarios.page, limit: usuarios.limit, total: usuarios.total };
            state.usuarios = usuarios.items;
        } else if (section === 'cursos') {
            const cursos = await api('/api/cursos');
            if (currentLoad !== loadSequence) return;
            state.cursos = cursos;
        } else {
            const filter = state.filters.turmas;
            const [turmas, cursos] = await Promise.all([
                api(`/api/turmas?${new URLSearchParams({ page: state.pagination.turmas.page,
                    limit: 25, q: filter.query, status: filter.status })}`),
                api('/api/cursos')
            ]);
            if (currentLoad !== loadSequence) return;
            state.turmas = turmas.items;
            state.pagination.turmas = { page: turmas.page, limit: turmas.limit, total: turmas.total };
            state.cursos = cursos;
        }
        const meta = state.pagination[section];
        const lastPage = meta ? Math.max(1, Math.ceil(meta.total / meta.limit)) : 1;
        if (meta && meta.page > lastPage) {
            meta.page = lastPage;
            return await loadActive({ focus });
        }
        if (section === 'usuarios') renderUsers();
        else if (section === 'cursos') renderCourses();
        else renderClasses();
        if (focus) content.querySelector('.admin-pagination [role="status"]')?.focus();
    } catch (error) {
        if (currentLoad !== loadSequence) return;
        renderError(error);
    } finally {
        if (currentLoad === loadSequence) {
            state.loading = false;
            root.setAttribute('aria-busy', 'false');
        }
    }
}

export function getAdminTabTargetIndex(key, currentIndex, total) {
    if (!Number.isInteger(currentIndex) || currentIndex < 0 || total < 1) return null;
    if (key === 'Home') return 0;
    if (key === 'End') return total - 1;
    if (key === 'ArrowRight') return (currentIndex + 1) % total;
    if (key === 'ArrowLeft') return (currentIndex - 1 + total) % total;
    return null;
}

function updateTabs() {
    tabsBySection.forEach((tab, section) => {
        const selected = section === state.active;
        tab.classList.toggle('active', selected);
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
    });
    content?.setAttribute('aria-labelledby', `admin-tab-${state.active}`);
}

async function activateTab(section) {
    if (!tabsBySection.has(section) || state.active === section) return;
    state.active = section;
    clearFeedback();
    updateTabs();
    await loadActive();
}

function handleTabKeydown(event) {
    const tabs = [...tabsBySection.values()];
    const currentIndex = tabs.indexOf(event.currentTarget);
    const targetIndex = getAdminTabTargetIndex(event.key, currentIndex, tabs.length);
    if (targetIndex === null) return;
    event.preventDefault();
    const target = tabs[targetIndex];
    target.focus();
    activateTab(target.dataset.adminSection);
}

function renderShell() {
    root.setAttribute('aria-labelledby', 'admin-panel-heading');
    const header = el('header', { className: 'admin-header academic-panel__header' });
    const identity = el('div');
    identity.append(
        el('p', { className: 'academic-section-label', text: 'Operações protegidas' }),
        el('h2', { id: 'admin-panel-heading', text: 'Gestão administrativa' }),
        el('p', { text: `${state.user.nome_completo} · papel confirmado pelo servidor: ADMIN` })
    );
    header.append(identity, statusBadge('ADMIN', 'Administrador'));

    const tabs = el('div', { className: 'admin-tabs' });
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Módulos administrativos');
    const labels = { usuarios: 'Usuários', cursos: 'Cursos', turmas: 'Turmas' };
    tabsBySection = new Map();
    Object.entries(labels).forEach(([key, label]) => {
        const tab = actionButton(label, 'admin-tab', () => activateTab(key));
        tab.id = `admin-tab-${key}`;
        tab.dataset.adminSection = key;
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-controls', 'admin-panel-content');
        tab.addEventListener('keydown', handleTabKeydown);
        tabsBySection.set(key, tab);
        tabs.appendChild(tab);
    });

    feedback = el('p', { className: 'admin-feedback' });
    feedback.hidden = true;
    feedback.tabIndex = -1;
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    content = el('section', { className: 'admin-content', id: 'admin-panel-content' });
    content.setAttribute('role', 'tabpanel');
    content.tabIndex = 0;
    updateTabs();
    root.replaceChildren(header, tabs, feedback, content);
}

export async function initAdminPanel() {
    const session = await initSessionUI({ requiredRoles: ['ADMIN'] });
    if (session.state !== 'authenticated') return;

    root = document.getElementById('admin-root') || document.body;
    state.user = session.user;
    renderShell();
    await loadActive();
}

initAdminPanel();
