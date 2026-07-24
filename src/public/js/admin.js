import { clearToken, getToken } from './auth.js';
import { initSessionUI } from './session-ui.js';
import { showAdminDialog } from './admin-dialog.js';

const state = {
    user: null,
    active: 'usuarios',
    loading: false,
    usuarios: [],
    cursos: [],
    turmas: [],
    filters: {
        usuarios: { query: '', tipo: '' },
        cursos: { query: '' },
        turmas: { query: '', status: '' }
    }
};

let root;
let content;
let feedback;

function el(tag, { className, text, type, id } = {}) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    if (type) node.type = type;
    if (id) node.id = id;
    return node;
}

function actionButton(label, className, handler) {
    const button = el('button', { className, text: label, type: 'button' });
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

async function api(path, { method = 'GET', body } = {}) {
    const headers = { Authorization: `Bearer ${getToken()}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const response = await fetch(path, {
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
        const error = new Error(mensagemErro(payload, `Operação recusada (HTTP ${response.status}).`));
        error.status = response.status;
        throw error;
    }
    return payload;
}

function showFeedback(message, type = 'success') {
    feedback.className = `admin-feedback admin-feedback--${type}`;
    feedback.textContent = message;
    feedback.hidden = false;
    feedback.focus();
}

function clearFeedback() {
    feedback.hidden = true;
    feedback.textContent = '';
}

function renderLoading(label) {
    content.replaceChildren(el('p', {
        className: 'loading-state',
        text: `Carregando ${label}...`
    }));
}

function renderError(error) {
    const box = el('section', { className: 'error-state' });
    box.setAttribute('role', 'alert');
    box.append(
        el('p', { text: error.message || 'Não foi possível carregar os dados.' }),
        actionButton('Tentar novamente', 'btn btn-ghost btn-sm', () => loadActive())
    );
    content.replaceChildren(box);
}

function emptyState(message) {
    return el('p', { className: 'empty-state', text: message });
}

function inputControl({ label, name, type = 'text', value = '', required = false, maxLength, min, pattern, options }) {
    const wrapper = el('label', { className: 'admin-field' });
    const caption = el('span', { text: label });
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

    control.name = name;
    control.value = value === null || value === undefined ? '' : String(value);
    control.required = required;
    if (maxLength) control.maxLength = maxLength;
    if (min !== undefined) control.min = String(min);
    if (pattern) control.pattern = pattern;
    control.autocomplete = type === 'password' ? 'new-password' : 'off';
    wrapper.append(caption, control);
    return { wrapper, control };
}

function openForm({ title, fields, submitLabel, onSubmit }) {
    const dialog = el('dialog', { className: 'admin-dialog' });
    dialog.setAttribute('aria-labelledby', 'admin-dialog-title');
    const form = el('form', { className: 'admin-form' });
    form.method = 'dialog';
    const heading = el('h2', { id: 'admin-dialog-title', text: title });
    const formError = el('p', { className: 'admin-form-error' });
    formError.hidden = true;
    formError.setAttribute('role', 'alert');
    const controls = {};

    fields.forEach((field) => {
        const built = inputControl(field);
        controls[field.name] = built.control;
        form.appendChild(built.wrapper);
    });

    const actions = el('div', { className: 'admin-form-actions' });
    const cancel = actionButton('Cancelar', 'btn btn-ghost', () => dialog.close());
    const submit = el('button', { className: 'btn btn-primary', text: submitLabel, type: 'submit' });
    actions.append(cancel, submit);
    form.prepend(heading, formError);
    form.appendChild(actions);
    dialog.appendChild(form);
    document.body.appendChild(dialog);

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;

        submit.disabled = true;
        cancel.disabled = true;
        formError.hidden = true;
        try {
            const values = Object.fromEntries(
                Object.entries(controls).map(([name, control]) => [name, control.value])
            );
            await onSubmit(values);
            dialog.close();
        } catch (error) {
            formError.textContent = error.message;
            formError.hidden = false;
            submit.disabled = false;
            cancel.disabled = false;
        }
    });

    showAdminDialog(dialog, { initialFocus: controls[fields[0]?.name] });
}

function makeTable(headers, rows) {
    const container = el('div', { className: 'table-container admin-table' });
    const table = el('table');
    const thead = el('thead');
    const headerRow = el('tr');
    headers.forEach((header) => headerRow.appendChild(el('th', { text: header })));
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
    table.append(thead, tbody);
    container.appendChild(table);
    return container;
}

function toolbar({ query, onQuery, filter, onFilter, filterOptions, addLabel, onAdd, extraAction }) {
    const bar = el('div', { className: 'admin-toolbar' });
    const search = el('input');
    search.type = 'search';
    search.placeholder = 'Buscar...';
    search.value = query;
    search.setAttribute('aria-label', 'Buscar registros');
    search.addEventListener('change', () => onQuery(search.value));
    bar.appendChild(search);

    if (filterOptions) {
        const select = el('select');
        select.setAttribute('aria-label', 'Filtrar registros');
        filterOptions.forEach((option) => {
            const item = el('option', { text: option.label });
            item.value = option.value;
            select.appendChild(item);
        });
        select.value = filter;
        select.addEventListener('change', () => onFilter(select.value));
        bar.appendChild(select);
    }

    if (extraAction) bar.appendChild(extraAction);
    bar.appendChild(actionButton(addLabel, 'btn btn-primary btn-sm', onAdd));
    return bar;
}

function rowActions(onEdit, onDelete) {
    const actions = el('div', { className: 'admin-row-actions' });
    actions.append(
        actionButton('Editar', 'btn btn-ghost btn-sm', onEdit),
        actionButton('Excluir', 'btn btn-danger btn-sm', onDelete)
    );
    return actions;
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
            showFeedback('Senha alterada com sucesso.');
        }
    });
}

async function deleteUser(usuario) {
    if (!window.confirm(`Excluir fisicamente o usuário “${usuario.nome_completo}”? Esta ação não pode ser desfeita.`)) return;
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
    const term = filter.query.trim().toLocaleLowerCase('pt-BR');
    const users = state.usuarios.filter((usuario) => {
        const matchesQuery = !term
            || usuario.nome_completo.toLocaleLowerCase('pt-BR').includes(term)
            || usuario.email.toLocaleLowerCase('pt-BR').includes(term);
        return matchesQuery && (!filter.tipo || usuario.tipo === filter.tipo);
    });

    const passwordButton = actionButton('Trocar minha senha', 'btn btn-ghost btn-sm', openPasswordChange);
    const bar = toolbar({
        query: filter.query,
        onQuery: (value) => { filter.query = value; renderUsers(); },
        filter: filter.tipo,
        onFilter: (value) => { filter.tipo = value; renderUsers(); },
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
        ? emptyState('Nenhum usuário encontrado para os filtros selecionados.')
        : makeTable(
            ['Nome', 'E-mail', 'CPF', 'Telefone', 'Papel', 'Ações'],
            users.map((usuario) => [
                usuario.nome_completo,
                usuario.email,
                usuario.cpf,
                usuario.telefone,
                usuario.tipo,
                rowActions(() => openEditUser(usuario), () => deleteUser(usuario))
            ])
        );
    content.replaceChildren(bar, body);
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
    if (!window.confirm(`Excluir o curso “${curso.nome_curso}”?`)) return;
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
        query: filter.query,
        onQuery: (value) => { filter.query = value; renderCourses(); },
        addLabel: 'Novo curso',
        onAdd: openCreateCourse
    });
    const body = courses.length === 0
        ? emptyState('Nenhum curso encontrado.')
        : makeTable(
            ['Curso', 'Descrição', 'Carga horária', 'Ações'],
            courses.map((curso) => [
                curso.nome_curso,
                curso.descricao,
                `${curso.carga_horaria} h`,
                rowActions(() => openEditCourse(curso), () => deleteCourse(curso))
            ])
        );
    content.replaceChildren(bar, body);
}

function dateValue(value) {
    if (!value) return '';
    return String(value).slice(0, 10);
}

function classFields(turma = null) {
    const professores = state.usuarios.filter((usuario) => usuario.tipo === 'PROFESSOR');
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
            label: 'Professor', name: 'id_professor', value: turma?.id_professor, required: true,
            options: [
                { value: '', label: 'Selecione um professor' },
                ...professores.map((usuario) => ({ value: usuario.id_usuario, label: usuario.nome_completo }))
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
    if (!window.confirm(`Excluir a turma “${turma.nome_turma}”?`)) return;
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
    const term = filter.query.trim().toLocaleLowerCase('pt-BR');
    const classes = state.turmas.filter((turma) => {
        const haystack = `${turma.nome_turma} ${turma.nome_curso} ${turma.nome_professor}`.toLocaleLowerCase('pt-BR');
        return (!term || haystack.includes(term)) && (!filter.status || turma.status === filter.status);
    });
    const bar = toolbar({
        query: filter.query,
        onQuery: (value) => { filter.query = value; renderClasses(); },
        filter: filter.status,
        onFilter: (value) => { filter.status = value; renderClasses(); },
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
        ? emptyState('Nenhuma turma encontrada.')
        : makeTable(
            ['Turma', 'Curso', 'Professor', 'Período', 'Status', 'Ações'],
            classes.map((turma) => [
                turma.nome_turma,
                turma.nome_curso,
                turma.nome_professor,
                `${dateValue(turma.data_inicio)} — ${dateValue(turma.data_fim) || 'sem término'}`,
                turma.status,
                rowActions(() => openEditClass(turma), () => deleteClass(turma))
            ])
        );
    content.replaceChildren(bar, body);
}

async function loadActive() {
    state.loading = true;
    renderLoading(state.active);
    try {
        if (state.active === 'usuarios') {
            state.usuarios = await api('/api/admin/usuarios');
            renderUsers();
        } else if (state.active === 'cursos') {
            state.cursos = await api('/api/cursos');
            renderCourses();
        } else {
            const [turmas, cursos, usuarios] = await Promise.all([
                api('/api/turmas'),
                api('/api/cursos'),
                api('/api/admin/usuarios')
            ]);
            state.turmas = turmas;
            state.cursos = cursos;
            state.usuarios = usuarios;
            renderClasses();
        }
    } catch (error) {
        renderError(error);
    } finally {
        state.loading = false;
    }
}

function renderShell() {
    root.setAttribute('aria-busy', 'false');
    const header = el('header', { className: 'admin-header' });
    const identity = el('div');
    identity.append(
        el('h2', { text: 'Gestão administrativa' }),
        el('p', { text: `${state.user.nome_completo} · papel confirmado pelo servidor: ADMIN` })
    );
    header.appendChild(identity);

    const tabs = el('nav', { className: 'admin-tabs' });
    tabs.setAttribute('aria-label', 'Módulos administrativos');
    const labels = { usuarios: 'Usuários', cursos: 'Cursos', turmas: 'Turmas' };
    Object.entries(labels).forEach(([key, label]) => {
        const tab = actionButton(label, `admin-tab${state.active === key ? ' active' : ''}`, async () => {
            if (state.loading || state.active === key) return;
            state.active = key;
            clearFeedback();
            renderShell();
            await loadActive();
        });
        tab.setAttribute('aria-current', state.active === key ? 'page' : 'false');
        tabs.appendChild(tab);
    });

    feedback = el('p', { className: 'admin-feedback' });
    feedback.hidden = true;
    feedback.tabIndex = -1;
    feedback.setAttribute('role', 'status');
    feedback.setAttribute('aria-live', 'polite');
    content = el('section', { className: 'admin-content' });
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
