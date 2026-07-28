import { getToken } from './auth.js';
import { initSessionUI } from './session-ui.js';
import { lockPageScroll } from './page-scroll.js';

'use strict';

const ANALYSIS_ENDPOINT = '/api/plagio/analisar';
const MAX_CHARS = 15000;
const AUTO_ANALYZE_DELAY = 2200;

export function getVerifierTabTargetIndex(key, currentIndex, total) {
  if (!Number.isInteger(total) || total < 1) return null;
  if (key === 'ArrowRight') return (currentIndex + 1) % total;
  if (key === 'ArrowLeft') return (currentIndex - 1 + total) % total;
  if (key === 'Home') return 0;
  if (key === 'End') return total - 1;
  return null;
}

export function getSimilarityPresentation(score) {
  const numericScore = Number(score);
  if (numericScore >= 80) {
    return {
      level: 'high',
      label: 'Alta similaridade',
      explanation: 'Os textos apresentam alta proximidade semântica segundo a faixa visual existente.'
    };
  }
  if (numericScore >= 60) {
    return {
      level: 'moderate',
      label: 'Similaridade moderada',
      explanation: 'Os textos apresentam proximidade semântica moderada segundo a faixa visual existente.'
    };
  }
  return {
    level: 'low',
    label: 'Baixa similaridade',
    explanation: 'Os textos apresentam baixa proximidade semântica segundo a faixa visual existente.'
  };
}

export function getVerifierErrorMessage(status, error = {}) {
  const detail = typeof error.detail === 'string' ? error.detail.trim() : '';
  if (detail) return detail;
  if (error.name === 'TimeoutError' || error.code === 'timeout') {
    return 'A análise excedeu o tempo limite de 10 segundos. Tente novamente.';
  }
  if (status === 400 || status === 422) {
    return 'Os textos enviados não atendem aos critérios de validação.';
  }
  if (status === 401) return 'Sua sessão expirou. Entre novamente para analisar.';
  if (status === 403) return 'Seu perfil não possui permissão para executar esta análise.';
  if (status === 500) return 'O servidor encontrou um erro interno ao processar a análise.';
  if (status === 502) return 'A plataforma recebeu uma resposta inválida do motor de similaridade.';
  if (status === 503) return 'O motor de similaridade está indisponível no momento.';
  if (error.name === 'TypeError') {
    return 'Não foi possível conectar ao serviço. Verifique a conexão e tente novamente.';
  }
  return 'Não foi possível concluir a análise. Tente novamente.';
}

function createElement(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = String(text ?? '');
  return element;
}

function formatScore(score) {
  return String(score).replace('.', ',');
}

function getResponseDetail(payload) {
  if (!payload || typeof payload !== 'object') return '';
  if (typeof payload.mensagem === 'string') return payload.mensagem;
  if (typeof payload.message === 'string') return payload.message;
  if (typeof payload.detail === 'string') return payload.detail;
  if (Array.isArray(payload.detail)) {
    return payload.detail
      .map((item) => item && typeof item.msg === 'string' ? item.msg : '')
      .filter(Boolean)
      .join(' ');
  }
  if (Array.isArray(payload.errors)) {
    return payload.errors
      .map((item) => item && typeof item.msg === 'string' ? item.msg : '')
      .filter(Boolean)
      .join(' ');
  }
  return '';
}

const form = document.getElementById('verifier-form');
const textoOriginal = document.getElementById('textoOriginal');
const textoSuspeito = document.getElementById('textoSuspeito');
const originalCount = document.getElementById('originalCount');
const suspectCount = document.getElementById('suspectCount');
const originalError = document.getElementById('originalError');
const suspectError = document.getElementById('suspectError');
const formError = document.getElementById('formError');
const btnAnalyze = document.getElementById('btnAnalyze');
const analyzeLabel = document.getElementById('analyzeLabel');
const btnClear = document.getElementById('btnClear');
const feedback = document.getElementById('feedback');
const resultEmpty = document.getElementById('resultEmpty');
const resultLoading = document.getElementById('resultLoading');
const resultContent = document.getElementById('resultContent');
const detailsEmpty = document.getElementById('detailsEmpty');
const detailsContent = document.getElementById('detailsContent');
const scoreValue = document.getElementById('scoreValue');
const scoreProgress = document.getElementById('scoreProgress');
const scoreLevel = document.getElementById('scoreLevel');
const scoreExplanation = document.getElementById('scoreExplanation');
const motorStatus = document.getElementById('motorStatus');
const httpStatus = document.getElementById('httpStatus');
const sourcesContent = document.getElementById('sourcesContent');
const statusText = document.getElementById('analysisStatusText');
const shortcutsDialog = document.getElementById('shortcutsDialog');
const clearDialog = document.getElementById('clearDialog');

let isAnalyzing = false;
let hasResult = false;
let autoAnalyzeTimer = null;

function setAnalysisState(state, message) {
  document.body.dataset.analysisState = state;
  statusText.textContent = message;
}

function setFeedback(message = '', type = 'status') {
  feedback.textContent = message;
  feedback.hidden = !message;
  feedback.dataset.type = type;
  feedback.setAttribute('role', type === 'error' ? 'alert' : 'status');
}

function updateCounter(field, counter) {
  counter.textContent = `${field.value.length.toLocaleString('pt-BR')} / ${MAX_CHARS.toLocaleString('pt-BR')}`;
  counter.dataset.limitState = field.value.length > MAX_CHARS * 0.9
    ? 'danger'
    : field.value.length > MAX_CHARS * 0.75 ? 'warning' : 'normal';
}

function updateCounters() {
  updateCounter(textoOriginal, originalCount);
  updateCounter(textoSuspeito, suspectCount);
}

function clearFieldErrors() {
  [
    [textoOriginal, originalError],
    [textoSuspeito, suspectError]
  ].forEach(([field, error]) => {
    field.removeAttribute('aria-invalid');
    error.textContent = '';
    error.hidden = true;
  });
  formError.textContent = '';
  formError.hidden = true;
}

function setFieldError(field, error, message) {
  field.setAttribute('aria-invalid', 'true');
  error.textContent = message;
  error.hidden = false;
}

function validateForm({ focusInvalid = true } = {}) {
  clearFieldErrors();
  const invalidFields = [];
  const original = textoOriginal.value.trim();
  const suspect = textoSuspeito.value.trim();

  if (!original) {
    setFieldError(textoOriginal, originalError, 'Informe o texto original de referência.');
    invalidFields.push(textoOriginal);
  }
  if (!suspect) {
    setFieldError(textoSuspeito, suspectError, 'Informe o texto suspeito para comparação.');
    invalidFields.push(textoSuspeito);
  } else if (suspect.length < 50) {
    setFieldError(textoSuspeito, suspectError, 'O texto suspeito deve possuir pelo menos 50 caracteres.');
    invalidFields.push(textoSuspeito);
  }
  if (textoOriginal.value.length > MAX_CHARS) {
    setFieldError(textoOriginal, originalError, 'O texto original excede 15.000 caracteres.');
    invalidFields.push(textoOriginal);
  }
  if (textoSuspeito.value.length > MAX_CHARS) {
    setFieldError(textoSuspeito, suspectError, 'O texto suspeito excede 15.000 caracteres.');
    invalidFields.push(textoSuspeito);
  }

  if (invalidFields.length > 0) {
    formError.textContent = 'Revise os campos indicados antes de iniciar a análise.';
    formError.hidden = false;
    if (focusInvalid) invalidFields[0].focus();
    return false;
  }
  return true;
}

function setBusy(busy) {
  isAnalyzing = busy;
  form.setAttribute('aria-busy', String(busy));
  btnAnalyze.disabled = busy;
  btnClear.disabled = busy;
  analyzeLabel.textContent = busy ? 'Analisando…' : 'Analisar similaridade';
}

function showLoading() {
  document.body.dataset.analysisState = 'loading';
  resultEmpty.hidden = true;
  resultContent.hidden = true;
  resultLoading.hidden = false;
  setAnalysisState('loading', 'Análise em andamento. Aguarde o retorno do motor.');
}

function restoreResultAfterError() {
  resultLoading.hidden = true;
  resultContent.hidden = !hasResult;
  resultEmpty.hidden = hasResult;
}

function resetResult() {
  hasResult = false;
  resultEmpty.hidden = false;
  resultLoading.hidden = true;
  resultContent.hidden = true;
  detailsEmpty.hidden = false;
  detailsContent.hidden = true;
  scoreValue.textContent = '—';
  delete scoreValue.dataset.rawScore;
  scoreProgress.value = 0;
  scoreProgress.textContent = '0%';
  scoreLevel.textContent = 'Aguardando';
  scoreLevel.dataset.level = 'idle';
  scoreExplanation.textContent = '';
  motorStatus.textContent = '—';
  httpStatus.textContent = '—';
  document.getElementById('resultOriginal').textContent = '';
  document.getElementById('resultSuspect').textContent = '';
  sourcesContent.replaceChildren();
  setAnalysisState('idle', 'Aguardando os textos para análise.');
}

function renderSources(sources) {
  sourcesContent.replaceChildren();
  if (!Array.isArray(sources) || sources.length === 0) {
    sourcesContent.appendChild(createElement(
      'p',
      'verifier-no-sources',
      'O motor não retornou fontes ou trechos segmentados nesta análise.'
    ));
    return;
  }

  const list = createElement('ul', 'verifier-source-list');
  sources.forEach((source, index) => {
    const item = createElement('li');
    if (source && typeof source === 'object') {
      const label = source.trecho ?? source.texto ?? source.nome ?? source.fonte ?? `Fonte ${index + 1}`;
      item.appendChild(createElement('span', '', label));
      const safeUrl = window.SecurityUtils?.toSafeUrl(source.url, { baseUrl: location.origin });
      if (safeUrl) {
        const link = createElement('a', '', 'Abrir fonte');
        link.href = safeUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        item.appendChild(link);
      }
    } else {
      item.appendChild(createElement('span', '', source));
    }
    list.appendChild(item);
  });
  sourcesContent.appendChild(list);
}

function renderResult(payload, original, suspect, responseStatus) {
  const rawScore = payload?.resultado?.score_similaridade;
  const numericScore = Number(rawScore);
  if (
    rawScore === null ||
    rawScore === undefined ||
    rawScore === '' ||
    !Number.isFinite(numericScore) ||
    numericScore < 0 ||
    numericScore > 100
  ) {
    const error = new Error('O motor retornou um resultado vazio ou inválido.');
    error.code = 'empty_result';
    throw error;
  }

  const presentation = getSimilarityPresentation(numericScore);
  const returnedStatus = payload?.resultado?.bruto?.status ?? payload?.status;
  const sources = payload?.resultado?.fontes_encontradas;

  scoreValue.textContent = `${formatScore(rawScore)}%`;
  scoreValue.dataset.rawScore = String(rawScore);
  scoreProgress.value = numericScore;
  scoreProgress.textContent = `${formatScore(rawScore)}%`;
  scoreLevel.textContent = presentation.label;
  scoreLevel.dataset.level = presentation.level;
  scoreExplanation.textContent = presentation.explanation;
  motorStatus.textContent = returnedStatus ? String(returnedStatus) : 'Não informado';
  httpStatus.textContent = `HTTP ${responseStatus}`;
  document.getElementById('resultOriginal').textContent = original;
  document.getElementById('resultSuspect').textContent = suspect;
  renderSources(sources);

  hasResult = true;
  resultLoading.hidden = true;
  resultEmpty.hidden = true;
  resultContent.hidden = false;
  detailsEmpty.hidden = true;
  detailsContent.hidden = false;
  setAnalysisState('success', 'Análise concluída com sucesso.');
  setFeedback(`Análise concluída. Similaridade retornada: ${formatScore(rawScore)}%.`, 'status');
  resultContent.focus({ preventScroll: true });
}

async function runAnalysis() {
  if (isAnalyzing) return;
  if (!validateForm()) {
    setAnalysisState('invalid', 'Existem campos que precisam ser revisados.');
    return;
  }

  clearTimeout(autoAnalyzeTimer);
  setFeedback();
  setBusy(true);
  showLoading();
  const original = textoOriginal.value.trim();
  const suspect = textoSuspeito.value.trim();

  try {
    const response = await fetch(ANALYSIS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken() || ''}`
      },
      body: JSON.stringify({
        texto_original: original,
        texto_suspeito: suspect
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error('Falha na análise.');
      error.status = response.status;
      error.detail = getResponseDetail(payload);
      throw error;
    }
    renderResult(payload, original, suspect, response.status);
  } catch (error) {
    restoreResultAfterError();
    const message = error.code === 'empty_result'
      ? error.message
      : getVerifierErrorMessage(error.status, error);
    setAnalysisState('error', message);
    setFeedback(message, 'error');
    feedback.focus();
  } finally {
    setBusy(false);
  }
}

function scheduleAutomaticAnalysis() {
  clearTimeout(autoAnalyzeTimer);
  if (
    isAnalyzing ||
    !textoOriginal.value.trim() ||
    textoSuspeito.value.trim().length <= 80
  ) return;
  setAnalysisState('idle', 'Aguardando uma pausa na digitação para analisar.');
  autoAnalyzeTimer = setTimeout(runAnalysis, AUTO_ANALYZE_DELAY);
}

[textoOriginal, textoSuspeito].forEach((field) => {
  field.addEventListener('input', () => {
    updateCounters();
    if (field.getAttribute('aria-invalid') === 'true') clearFieldErrors();
    scheduleAutomaticAnalysis();
  });
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  runAnalysis();
});

const tabs = [...document.querySelectorAll('.verifier-tab')];
const panels = [...document.querySelectorAll('.verifier-panel')];

function activateTab(tabName, { focus = false } = {}) {
  tabs.forEach((tab) => {
    const selected = tab.dataset.tab === tabName;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focus) tab.focus();
  });
  panels.forEach((panel) => {
    panel.hidden = panel.id !== `panel-${tabName}`;
  });
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => activateTab(tab.dataset.tab));
  tab.addEventListener('keydown', (event) => {
    const targetIndex = getVerifierTabTargetIndex(event.key, index, tabs.length);
    if (targetIndex === null) return;
    event.preventDefault();
    activateTab(tabs[targetIndex].dataset.tab, { focus: true });
  });
});

function getFocusable(dialog) {
  return [...dialog.querySelectorAll(
    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter((element) => !element.hidden);
}

function openDialog(dialog, initialFocus) {
  if (dialog.open) return;
  const returnFocus = document.activeElement;
  const restorePageScroll = lockPageScroll(document);

  function containFocus(event) {
    if (event.key !== 'Tab') return;
    const focusable = getFocusable(dialog);
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function cleanup() {
    dialog.removeEventListener('keydown', containFocus);
    restorePageScroll();
    if (returnFocus && typeof returnFocus.focus === 'function') returnFocus.focus();
  }

  dialog.addEventListener('keydown', containFocus);
  dialog.addEventListener('close', cleanup, { once: true });
  dialog.showModal();
  requestAnimationFrame(() => (initialFocus || getFocusable(dialog)[0] || dialog).focus());
}

document.getElementById('helpButton').addEventListener('click', (event) => {
  openDialog(shortcutsDialog, document.getElementById('closeShortcuts'));
  event.currentTarget.setAttribute('aria-expanded', 'true');
});

shortcutsDialog.addEventListener('close', () => {
  document.getElementById('helpButton').setAttribute('aria-expanded', 'false');
});
document.getElementById('closeShortcuts').addEventListener('click', () => shortcutsDialog.close());

btnClear.addEventListener('click', () => {
  if (!textoOriginal.value && !textoSuspeito.value && !hasResult) {
    textoOriginal.focus();
    return;
  }
  openDialog(clearDialog, document.getElementById('cancelClear'));
});

document.getElementById('closeClearDialog').addEventListener('click', () => clearDialog.close());
document.getElementById('cancelClear').addEventListener('click', () => clearDialog.close());
document.getElementById('confirmClear').addEventListener('click', () => {
  clearTimeout(autoAnalyzeTimer);
  textoOriginal.value = '';
  textoSuspeito.value = '';
  clearFieldErrors();
  updateCounters();
  resetResult();
  setFeedback('Os textos e o resultado foram removidos.', 'status');
  clearDialog.close();
});

document.addEventListener('keydown', (event) => {
  const modifier = event.ctrlKey || event.metaKey;
  const editable = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName);

  if (modifier && event.key === 'Enter') {
    event.preventDefault();
    runAnalysis();
    return;
  }
  if (modifier && event.key === 'Delete') {
    event.preventDefault();
    btnClear.click();
    return;
  }
  if (event.altKey && ['1', '2', '3'].includes(event.key)) {
    event.preventDefault();
    activateTab(['result', 'details', 'guidance'][Number(event.key) - 1], { focus: true });
    return;
  }
  if (event.altKey && event.key.toLowerCase() === 't') {
    event.preventDefault();
    document.getElementById('theme-toggle').click();
    return;
  }
  if (event.key === '?' && !editable && !shortcutsDialog.open && !clearDialog.open) {
    event.preventDefault();
    openDialog(shortcutsDialog, document.getElementById('closeShortcuts'));
  }
});

updateCounters();
resetResult();
initSessionUI();
