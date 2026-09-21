import { formatAcademicDate, setAcademicMessage } from './academic-ui.js';

const $ = (id) => document.getElementById(id);
const MAX_FILE_BYTES = Number($('arquivo-certificado').dataset.maxBytes);

const RESULTADOS = Object.freeze({
    VALIDO: {
        title: 'Certificado válido',
        description: 'O código corresponde a um certificado ativo emitido pela plataforma.',
        state: 'valid'
    },
    AUTENTICO: {
        title: 'Certificado autêntico',
        description: 'O PDF corresponde byte a byte ao documento original emitido pela plataforma.',
        state: 'valid'
    },
    REVOGADO: {
        title: 'Certificado revogado',
        description: 'O documento foi emitido pela plataforma, mas sua vigência foi revogada.',
        state: 'revoked'
    },
    NAO_ENCONTRADO: {
        title: 'Certificado não encontrado',
        description: 'Não localizamos um certificado emitido com esse código. Confira todos os caracteres.',
        state: 'not-found'
    },
    NAO_VALIDADO: {
        title: 'Documento não validado',
        description: 'O arquivo não corresponde a um PDF original emitido pela plataforma.',
        state: 'not-found'
    }
});

function normalizarCodigo(value) {
    return String(value || '').trim().toUpperCase();
}

function setBusy(form, button, busy, busyText, idleText) {
    form.setAttribute('aria-busy', String(busy));
    $('validar-codigo').disabled = busy;
    $('validar-arquivo').disabled = busy;
    button.textContent = busy ? busyText : idleText;
}

function renderizarResultado(payload) {
    const definition = RESULTADOS[payload?.resultado] || RESULTADOS.NAO_VALIDADO;
    const result = $('resultado-validacao');
    result.dataset.resultado = definition.state;
    $('titulo-resultado').textContent = definition.title;
    $('descricao-resultado').textContent = definition.description;
    $('marcador-resultado').textContent = definition.state === 'valid' ? 'OK' : definition.state === 'revoked' ? '!' : '—';

    const certificado = payload?.certificado;
    $('dados-certificado').hidden = !certificado;
    if (certificado) {
        $('resultado-aluno').textContent = certificado.aluno || 'Não informado';
        $('resultado-curso').textContent = certificado.curso || 'Não informado';
        $('resultado-turma').textContent = certificado.turma || 'Não informada';
        $('resultado-carga').textContent = `${Number(certificado.carga_horaria) || 0} horas`;
        $('resultado-emissao').textContent = `${formatAcademicDate(certificado.emitido_em)} · Versão ${certificado.versao || 1}`;
        $('resultado-codigo').textContent = certificado.codigo || 'Não informado';
    }

    result.hidden = false;
    result.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    $('titulo-resultado').focus?.();
}

async function respostaJson(response) {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(payload.mensagem || payload.message || 'Não foi possível validar agora.');
        error.status = response.status;
        throw error;
    }
    return payload;
}

$('form-validar-codigo').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $('validar-codigo');
    const codigo = normalizarCodigo($('codigo-certificado').value);
    $('codigo-certificado').value = codigo;
    setAcademicMessage($('mensagem-validacao'), '', 'info');
    $('resultado-validacao').hidden = true;
    setBusy(form, button, true, 'Consultando...', 'Validar código');
    try {
        const response = await fetch(`/api/public/certificados/${encodeURIComponent(codigo)}`, {
            credentials: 'same-origin'
        });
        renderizarResultado(await respostaJson(response));
    } catch (error) {
        setAcademicMessage(
            $('mensagem-validacao'),
            error.status === 429
                ? 'Muitas consultas foram realizadas. Aguarde um instante e tente novamente.'
                : error.message,
            'error'
        );
    } finally {
        setBusy(form, button, false, 'Consultando...', 'Validar código');
    }
});

$('arquivo-certificado').addEventListener('change', (event) => {
    const file = event.currentTarget.files[0];
    if (!file) {
        $('arquivo-certificado-status').textContent = 'Nenhum arquivo selecionado.';
        return;
    }
    $('arquivo-certificado-status').textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`;
});

$('form-validar-arquivo').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $('validar-arquivo');
    const input = $('arquivo-certificado');
    const file = input.files[0];
    setAcademicMessage($('mensagem-validacao'), '', 'info');

    $('resultado-validacao').hidden = true;

    if (!file || file.size < 5 || file.size > MAX_FILE_BYTES || file.type !== 'application/pdf') {
        setAcademicMessage($('mensagem-validacao'), 'Selecione um PDF válido de até 10 MB.', 'error');
        input.focus();
        return;
    }

    setBusy(form, button, true, 'Verificando...', 'Verificar arquivo');
    try {
        const data = new FormData();
        data.append('arquivo', file, file.name);
        const response = await fetch('/api/public/certificados/validar-arquivo', {
            method: 'POST',
            body: data,
            credentials: 'same-origin'
        });
        renderizarResultado(await respostaJson(response));
    } catch (error) {
        setAcademicMessage(
            $('mensagem-validacao'),
            error.status === 429
                ? 'Muitos arquivos foram verificados. Aguarde um instante e tente novamente.'
                : error.message,
            'error'
        );
    } finally {
        setBusy(form, button, false, 'Verificando...', 'Verificar arquivo');
    }
});

function obterCodigoInicial() {
    try {
        return decodeURIComponent(window.location.pathname.split('/').filter(Boolean)[2] || '');
    } catch {
        return '';
    }
}
const codigoInicial = obterCodigoInicial();
if (codigoInicial) {
    $('codigo-certificado').value = normalizarCodigo(codigoInicial);
    $('form-validar-codigo').requestSubmit();
}
