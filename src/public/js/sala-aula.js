import { clearToken, getToken } from './auth.js';
import { initSessionUI } from './session-ui.js';
import { buscarQuestionarioDisponivel } from './questionario-disponibilidade.js';
import {
    createAcademicState,
    formatAcademicDate,
    preferredScrollBehavior,
    setAcademicBusy,
    setAcademicMessage
} from './academic-ui.js';

const $ = (id) => document.getElementById(id);
const idTurma = Number(new URLSearchParams(location.search).get('id_turma'));
const icones = { VIDEO: '🎥', TEXTO: '📄', PDF: '📕', LINK: '🔗', ATIVIDADE: '✏️' };
let conteudos = [];
let modulos = [];
let selecionado = null;
let filtro = 'todos';
let progressoPercentual = null;
let salvandoConclusao = false;

function texto(elemento, valor) {
    if (elemento) elemento.textContent = String(valor ?? '');
}

async function configurarQuestionarios(token) {
    const avaliacoes = [
        { tipo: 'exercicio', link: $('link-exercicios') },
        { tipo: 'prova', link: $('link-prova') }
    ];
    avaliacoes.forEach(({ link }) => {
        link.hidden = true;
        link.removeAttribute('href');
    });
    setAcademicMessage(
        $('mensagem-questionarios'),
        'Verificando questionários disponíveis...',
        'info'
    );

    const verificacoes = await Promise.allSettled(avaliacoes.map(async (avaliacao) => ({
        ...avaliacao,
        questionario: await buscarQuestionarioDisponivel({
            idTurma,
            tipo: avaliacao.tipo,
            token
        })
    })));
    const falhas = verificacoes.filter(({ status }) => status === 'rejected');
    const sessaoExpirada = falhas.find(({ reason }) => reason?.status === 401);
    if (sessaoExpirada) throw sessaoExpirada.reason;

    const disponiveis = verificacoes
        .filter(({ status }) => status === 'fulfilled')
        .map(({ value }) => value)
        .filter(({ questionario }) => Boolean(questionario));
    disponiveis.forEach(({ tipo, link }) => {
        link.href = `/questionario.html?tipo=${tipo}&id_turma=${idTurma}`;
        link.hidden = false;
    });
    setAcademicMessage(
        $('mensagem-questionarios'),
        falhas.length
            ? 'Não foi possível verificar todos os questionários. Tente recarregar a página.'
            : disponiveis.length
            ? `${disponiveis.length} questionário${disponiveis.length === 1 ? '' : 's'} disponível${disponiveis.length === 1 ? '' : 'is'}.`
            : 'Nenhum questionário ativo está disponível para esta turma.',
        falhas.length ? 'error' : 'info'
    );
}

function atualizarResumo() {
    const concluidos = conteudos.filter((conteudo) => Boolean(conteudo.concluido)).length;
    const calculado = conteudos.length ? Math.round((concluidos / conteudos.length) * 100) : 0;
    const percentual = progressoPercentual === null ? calculado : progressoPercentual;
    texto($('conteudos-concluidos'), concluidos);
    texto($('total-conteudos'), conteudos.length);
    texto($('progresso-label'), `${percentual}%`);
    // Exceção dinâmica documentada: o percentual real não cabe em classes fixas.
    $('progress-bar-fill').style.setProperty('--progress-value', `${percentual}%`);
    $('progress-bar').setAttribute('aria-valuenow', String(percentual));
    texto($('progresso-turma'), `${percentual}%`);
}

function criarItemConteudo(conteudo) {
    const item = document.createElement('li');
    item.className = 'module-item';
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'module-item-action';
    action.setAttribute('aria-label', `Abrir conteúdo: ${conteudo.titulo}`);
    const icone = document.createElement('span');
    icone.className = 'module-item-icon';
    icone.setAttribute('aria-hidden', 'true');
    texto(icone, icones[conteudo.tipo] || '📎');

    const corpo = document.createElement('div');
    corpo.className = 'module-item-body';
    const titulo = document.createElement('h4');
    texto(titulo, conteudo.titulo);
    const descricao = document.createElement('p');
    texto(descricao, [
        conteudo.descricao,
        conteudo.duracao_minutos ? `${conteudo.duracao_minutos} min` : null
    ].filter(Boolean).join(' · '));
    corpo.append(titulo, descricao);

    const status = document.createElement('span');
    status.className = `module-item-status ${
        conteudo.concluido ? 'concluido' : conteudo.em_andamento ? 'em-andamento' : 'nao-iniciado'
    }`;
    texto(status, conteudo.concluido ? 'Concluído' : conteudo.em_andamento ? 'Em andamento' : 'Não iniciado');
    action.append(icone, corpo, status);
    action.addEventListener('click', () => abrirConteudo(conteudo));
    item.append(action);
    return item;
}

function renderizar() {
    const lista = $('lista-conteudos');
    lista.replaceChildren();
    setAcademicBusy(lista, false);
    const visiveis = conteudos.filter(
        (conteudo) => filtro === 'todos' || conteudo.tipo.toLowerCase() === filtro
    );
    if (!visiveis.length) {
        lista.appendChild(createAcademicState(
            conteudos.length
                ? 'Nenhum conteúdo corresponde ao filtro.'
                : 'Nenhum conteúdo disponível.',
            'empty'
        ));
        atualizarResumo();
        return;
    }

    for (const modulo of modulos) {
        const itens = visiveis.filter(
            (conteudo) => Number(conteudo.id_modulo) === Number(modulo.id_modulo)
        );
        if (!itens.length) continue;
        const cabecalho = document.createElement('li');
        cabecalho.className = 'module-group-title';
        const titulo = document.createElement('strong');
        texto(titulo, modulo.titulo);
        const descricao = document.createElement('span');
        texto(descricao, modulo.descricao || '');
        cabecalho.append(titulo, descricao);
        lista.appendChild(cabecalho);
        itens.forEach((conteudo) => lista.appendChild(criarItemConteudo(conteudo)));
    }

    const semModulo = visiveis.filter((conteudo) => !conteudo.id_modulo);
    if (semModulo.length) {
        const cabecalho = document.createElement('li');
        cabecalho.className = 'module-group-title';
        texto(cabecalho, 'Conteúdos complementares');
        lista.appendChild(cabecalho);
        semModulo.forEach((conteudo) => lista.appendChild(criarItemConteudo(conteudo)));
    }
    atualizarResumo();
}

async function salvarProgresso(conteudo, status) {
    const response = await fetch(`/api/conteudos/${conteudo.id_conteudo}/progresso`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`
        },
        body: JSON.stringify({ status })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.mensagem || 'Não foi possível salvar o progresso.');

    conteudo.status_progresso = body.status;
    conteudo.concluido = body.status === 'CONCLUIDO';
    conteudo.em_andamento = body.status === 'INICIADO';
    progressoPercentual = Number(body.progresso_percentual);
    renderizar();
    return body;
}

function fecharVisualizadores() {
    $('player-video-container').hidden = true;
    $('video-player').src = '';
    $('conteudo-texto-container').hidden = true;
    texto($('conteudo-corpo'), '');
}

async function abrirConteudo(conteudo) {
    selecionado = conteudo;
    setAcademicMessage($('mensagem-sala-aula'), 'Abrindo conteúdo...', 'info');
    try {
        if (!conteudo.concluido) await salvarProgresso(conteudo, 'INICIADO');
        fecharVisualizadores();
        const urlSegura = conteudo.url
            ? window.SecurityUtils?.toSafeUrl(conteudo.url, { baseUrl: location.origin })
            : null;
        if (conteudo.url && !urlSegura) {
            throw new Error('A URL deste conteúdo não pertence a uma origem permitida.');
        }
        if (conteudo.tipo === 'VIDEO' && urlSegura) {
            $('player-video-container').hidden = false;
            $('video-player').src = urlSegura;
            texto($('video-nome-conteudo'), conteudo.titulo);
            $('player-video-container').scrollIntoView({
                behavior: preferredScrollBehavior()
            });
        } else if (urlSegura) {
            window.open(urlSegura, '_blank', 'noopener,noreferrer');
        } else if (conteudo.corpo) {
            $('conteudo-texto-container').hidden = false;
            texto($('conteudo-texto-titulo'), conteudo.titulo);
            texto($('conteudo-corpo'), conteudo.corpo);
            $('conteudo-texto-container').scrollIntoView({
                behavior: preferredScrollBehavior()
            });
        } else {
            throw new Error('Este conteúdo não possui material disponível para abertura.');
        }
        texto($('status-conteudo'), conteudo.concluido ? 'Concluído' : 'Em andamento');
        setAcademicMessage(
            $('mensagem-sala-aula'),
            'Conteúdo aberto e progresso salvo.',
            'success'
        );
    } catch (error) {
        setAcademicMessage($('mensagem-sala-aula'), error.message, 'error');
    }
}

$('btn-marcar-concluido').addEventListener('click', async () => {
    if (!selecionado || salvandoConclusao) return;
    salvandoConclusao = true;
    const button = $('btn-marcar-concluido');
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    const idleLabel = button.textContent;
    button.textContent = 'Salvando conclusão...';
    try {
        await salvarProgresso(selecionado, 'CONCLUIDO');
        setAcademicMessage($('mensagem-sala-aula'), 'Conteúdo concluído.', 'success');
    } catch (error) {
        setAcademicMessage($('mensagem-sala-aula'), error.message, 'error');
    } finally {
        salvandoConclusao = false;
        button.disabled = false;
        button.setAttribute('aria-busy', 'false');
        button.textContent = idleLabel;
    }
});
$('btn-fechar-video').addEventListener('click', fecharVisualizadores);
$('btn-fechar-texto').addEventListener('click', fecharVisualizadores);
document.querySelectorAll('.filter-chip').forEach((chip) => chip.addEventListener('click', () => {
    document.querySelectorAll('.filter-chip').forEach((item) => {
        item.classList.remove('active');
        item.setAttribute('aria-pressed', 'false');
    });
    chip.classList.add('active');
    chip.setAttribute('aria-pressed', 'true');
    filtro = chip.dataset.filtro;
    renderizar();
}));

window.addEventListener('load', async () => {
    const session = await initSessionUI({ requiredRoles: ['ALUNO'] });
    if (session.state !== 'authenticated') return;
    if (!Number.isInteger(idTurma) || idTurma <= 0) {
        location.href = '/sala-virtual.html?motivo=turma_invalida';
        return;
    }
    try {
        texto($('status-usuario'), session.user.nome_completo);
        setAcademicBusy($('lista-conteudos'), true);
        const headers = { Authorization: `Bearer ${getToken()}` };
        const [salaResponse, conteudosResponse] = await Promise.all([
            fetch('/api/matriculas/minha-sala', { headers }),
            fetch(`/api/turmas/${idTurma}/conteudos`, { headers })
        ]);
        const salaBody = await salaResponse.json().catch(() => ({}));
        const conteudosBody = await conteudosResponse.json().catch(() => ({}));
        if (!salaResponse.ok) throw new Error(salaBody.mensagem || salaBody.message || 'Falha ao carregar a sala virtual.');
        if (!conteudosResponse.ok) throw new Error(conteudosBody.mensagem || 'Acesso negado à turma.');

        const turma = (salaBody.turmas || []).find((item) => Number(item.id_turma) === idTurma);
        if (!turma) throw new Error('A turma não está disponível na sua sala virtual.');
        texto($('titulo-turma'), turma.nome_turma);
        texto($('nome-curso'), turma.nome_curso);
        texto($('badge-status-turma'), turma.status_turma);
        texto($('carga-horaria'), `${turma.carga_horaria}h`);
        texto($('descricao-curso'), turma.descricao_curso || '');
        const periodo = [turma.data_inicio, turma.data_fim]
            .filter(Boolean)
            .map(formatAcademicDate)
            .join(' — ');
        texto($('periodo-turma'), periodo || 'Não informado');
        const statusClass = String(turma.status_turma || '').toUpperCase() === 'ABERTA'
            ? 'badge--success'
            : String(turma.status_turma || '').toUpperCase() === 'FECHADA'
                ? 'badge--warning'
                : String(turma.status_turma || '').toUpperCase() === 'ENCERRADA'
                    ? 'badge--danger'
                    : 'badge--neutral';
        $('badge-status-turma').className = `badge ${statusClass}`;
        progressoPercentual = Number(turma.progresso_percentual) || 0;
        conteudos = Array.isArray(conteudosBody.conteudos) ? conteudosBody.conteudos : [];
        modulos = Array.isArray(conteudosBody.modulos) ? conteudosBody.modulos : [];
        renderizar();
        await configurarQuestionarios(getToken());
        setAcademicMessage(
            $('mensagem-sala-aula'),
            conteudos.length
                ? 'Módulos e conteúdos carregados do banco.'
                : 'A turma ainda não possui conteúdos publicados.',
            'info'
        );
    } catch (error) {
        if (error.status === 401) {
            clearToken();
            location.href = '/login.html?motivo=auth';
            return;
        }
        setAcademicMessage($('mensagem-sala-aula'), error.message, 'error');
        conteudos = [];
        modulos = [];
        renderizar();
    }
});
