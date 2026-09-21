import { APIError, post } from './api.js';
import { initSessionUI } from './session-ui.js';
import { lockPageScroll } from './page-scroll.js';
import {
  createIncrementalCoordinator,
  currentReferences,
  reconcileEditorSegments
} from './incremental-editor.js';

const INCREMENTAL_ENDPOINT = '/analises/contextual/segmento';
const COMPLETE_ENDPOINT = '/analises/contextual/documento';
const LIMITS = Object.freeze({ documento: 100000, fonte: 50000, autores: 20 });
const DEFAULT_PARAMETERS = Object.freeze({ semantico: '0.8', reproducao: '0.7', parafrase: '0.2' });
const SEVERITY_ORDER = Object.freeze({ ALTA: 0, MEDIA: 1, BAIXA: 2, INFORMATIVA: 3 });
const ALLOWED_REFERENCE_ORIGINS = Object.freeze([
  'https://doi.org',
  'https://www.youtube.com'
]);

export const RULE_GUIDANCE = Object.freeze({
  'REG-01': { title: 'Possível reprodução sem atribuição', guidance: 'Revise o trecho e confirme se a fonte deve ser citada ou se a reprodução exige marcação de citação direta.' },
  'REG-02': { title: 'Possível paráfrase sem atribuição', guidance: 'Confira se a ideia foi devidamente atribuída ao autor original.' },
  'REG-03': { title: 'Uso possivelmente atribuído', guidance: 'A citação e a referência foram localizadas. Confira a formatação e a fidelidade ao conteúdo original.' },
  'REG-04': { title: 'Citação sem referência vinculada', guidance: 'Verifique se a obra citada foi incluída na lista de referências.' },
  'REG-05': { title: 'Referência sem citação no texto', guidance: 'Inconsistência documental: confira se a obra foi utilizada e deveria possuir uma chamada no corpo do documento.' },
  'REG-06': { title: 'Possível inconformidade em citação direta', guidance: 'Confira aspas ou bloco destacado e a indicação da página ou localização da passagem.' },
  'REG-07': { title: 'Possível divergência de atribuição', guidance: 'A fonte indicada pode não corresponder à fonte comparada. Confira a obra original.' }
});

function byId(id) { return document.getElementById(id); }

export function getVerifierTabTargetIndex(key, currentIndex, total) {
  if (!Number.isInteger(total) || total < 1) return null;
  if (key === 'ArrowRight') return (currentIndex + 1) % total;
  if (key === 'ArrowLeft') return (currentIndex - 1 + total) % total;
  if (key === 'Home') return 0;
  if (key === 'End') return total - 1;
  return null;
}

export function formatPercent(score) {
  const value = Math.round(Number(score) * 100);
  return `${Number.isFinite(value) ? value : 0}%`;
}

export function getContextualErrorMessage(error) {
  const status = Number(error?.status);
  if (status === 401) return 'Sua sessão expirou. Entre novamente para continuar.';
  if (status === 403) return 'Seu perfil não possui permissão para executar esta análise.';
  if (status === 413) return 'O conteúdo excede o limite permitido. Reduza o tamanho dos textos e tente novamente.';
  if (status === 422 || status === 400) return error?.message || 'Revise os dados informados antes de analisar.';
  if (status === 429) return 'Muitas análises foram solicitadas em pouco tempo. Aguarde e tente novamente.';
  if (status === 503 || status === 0) return 'O serviço de análise está temporariamente indisponível. Tente novamente mais tarde.';
  if (status === 504 || status === 408) return 'A análise ultrapassou o tempo esperado. O conteúdo não foi perdido; tente novamente.';
  if (status === 502) return 'A análise foi concluída, mas a resposta recebida possui formato incompatível. Tente novamente ou contate o suporte.';
  return 'Não foi possível concluir a análise agora. Tente novamente.';
}

export function buildContextualPayload(values) {
  const payload = { documento: values.documento.trim(), fonte_comparada: values.fonteComparada.trim() };
  const authors = values.autores.split(';').map((author) => author.trim()).filter(Boolean);
  const metadata = {};
  if (authors.length) metadata.autores = authors;
  if (values.ano) metadata.ano = Number(values.ano);
  if (values.titulo.trim()) metadata.titulo = values.titulo.trim();
  if (values.doi.trim()) metadata.doi = values.doi.trim();
  if (values.url.trim()) metadata.url = values.url.trim();
  if (Object.keys(metadata).length) payload.metadados_fonte = metadata;
  if (values.advancedOpen) {
    payload.parametros = {
      limiar_semantico: Number(values.limiarSemantico),
      limiar_lexical_reproducao: Number(values.limiarReproducao),
      limiar_lexical_parafrase: Number(values.limiarParafrase)
    };
  }
  return payload;
}

function metadataFromFields() {
  const authors = fields.autores.value.split(';').map((author) => author.trim()).filter(Boolean);
  const source = {
    fonte_id: 'fonte-manual-sessao',
    trecho_fonte_id: 'trecho-manual-sessao',
    texto_trecho: fields.fonteComparada.value.trim(),
    origem: 'MANUAL'
  };
  if (authors.length) source.autores = authors;
  if (fields.ano.value) source.ano = Number(fields.ano.value);
  if (fields.titulo.value.trim()) source.titulo = fields.titulo.value.trim();
  if (fields.doi.value.trim()) source.doi = fields.doi.value.trim();
  if (fields.url.value.trim()) source.url = fields.url.value.trim();
  return source;
}

function detectorParameters() {
  if (!advancedSettings.open) return undefined;
  return {
    limiar_semantico: Number(fields.limiarSemantico.value),
    limiar_lexical_reproducao: Number(fields.limiarReproducao.value),
    limiar_lexical_parafrase: Number(fields.limiarParafrase.value)
  };
}

function sourceSettings() {
  const mode = fields.modoFontes.value;
  const value = { modo_fontes: mode, limite_candidatos: 5 };
  if (mode !== 'BUSCA_AUTOMATICA') value.fonte_manual = metadataFromFields();
  const parameters = detectorParameters();
  if (parameters) value.parametros = parameters;
  return value;
}

export function buildIncrementalPayload(segment, segments, temporarySessionId, settings) {
  const previous = segments[segment.indice - 1];
  const next = segments[segment.indice + 1];
  return {
    sessao_id: temporarySessionId,
    segmento_id: segment.segmento_id,
    versao: segment.versao,
    indice: segment.indice,
    texto_segmento: segment.texto,
    inicio: segment.inicio,
    fim: segment.fim,
    tipo: segment.tipo,
    analisavel: segment.analisavel,
    contexto: {
      segmento_anterior: previous?.texto || null,
      segmento_seguinte: next?.texto || null,
      referencias_atuais: currentReferences(segments)
    },
    ...settings
  };
}

export function buildCompletePayload(documentText, settings) {
  return { documento: documentText.trim(), ...settings };
}

export function isContextualResponse(payload) {
  const data = payload?.data;
  return payload?.success === true
    && data?.versao_contrato === '1.0'
    && data?.status_analise === 'CONCLUIDO'
    && data?.resumo && typeof data.resumo === 'object'
    && data?.parametros_aplicados && typeof data.parametros_aplicados === 'object'
    && ['segmentos', 'alertas', 'citacoes', 'referencias', 'associacoes'].every((key) => Array.isArray(data[key]));
}

export function isIncrementalResponse(payload) {
  const data = payload?.data;
  return payload?.success === true
    && data?.versao_contrato === '2.0'
    && data?.modo_analise === 'INCREMENTAL'
    && typeof data?.sessao_id === 'string'
    && typeof data?.segmento_id === 'string'
    && Number.isInteger(data?.versao)
    && ['fontes_candidatas', 'metricas', 'citacoes', 'referencias', 'associacoes', 'alertas']
      .every((key) => Array.isArray(data[key]));
}

export function isCompleteResponse(payload) {
  const data = payload?.data;
  return payload?.success === true
    && data?.versao_contrato === '2.0'
    && data?.modo_analise === 'COMPLETA'
    && data?.resumo && typeof data.resumo === 'object'
    && ['segmentos', 'fontes_candidatas', 'alertas', 'citacoes', 'referencias', 'associacoes']
      .every((key) => Array.isArray(data[key]));
}

function normalizeCompleteData(data) {
  const citations = Array.isArray(data.citacoes) ? data.citacoes : [];
  return {
    ...data,
    segmentos: data.segmentos.map((segment, index) => ({
      ...segment,
      id: segment.segmento_id,
      indice: Number.isInteger(segment.indice) ? segment.indice : index,
      metricas: Array.isArray(segment.metricas) && segment.metricas.length
        ? {
            score_semantico: segment.metricas[0].score_semantico,
            score_lexical: segment.metricas[0].score_lexical
          }
        : null,
      citacoes: citations
        .filter((citation) => citation.segmento_id === segment.segmento_id)
        .map((citation) => citation.texto_original)
    }))
  };
}

export function buildSegmentHighlightModel(segment) {
  const text = typeof segment?.texto === 'string' && segment.texto.trim()
    ? segment.texto.trim()
    : 'Trecho não informado.';
  const alerts = Array.isArray(segment?.alertas) ? segment.alertas : [];
  const alert = [...alerts].sort(
    (a, b) => (SEVERITY_ORDER[a?.gravidade] ?? 9) - (SEVERITY_ORDER[b?.gravidade] ?? 9)
  )[0];
  return {
    text,
    detections: alert ? [{
      id: String(alert.codigo_regra || segment?.segmento_id || segment?.id || ''),
      lvl: alert.gravidade === 'ALTA' ? 'red' : 'amber',
      txt: text
    }] : []
  };
}

export function safeExternalUrl(value, {
  baseUrl = globalThis.location?.origin || 'http://localhost',
  allowedOrigins = ALLOWED_REFERENCE_ORIGINS
} = {}) {
  try {
    const base = new URL(baseUrl);
    const url = new URL(String(value || '').trim(), base);
    if (url.username || url.password) return null;
    const sameOrigin = url.origin === base.origin;
    const allowedExternalOrigin = url.protocol === 'https:' && allowedOrigins.includes(url.origin);
    if (!sameOrigin && !allowedExternalOrigin) return null;
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = String(value ?? '');
  return node;
}

function textOrFallback(value, fallback = 'Não informado') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function renderSegmentText(segment) {
  const paragraph = element('p', 'verifier-segment-text');
  const model = buildSegmentHighlightModel(segment);
  const renderer = globalThis.SecurityUtils?.renderHighlightedText;
  if (typeof renderer !== 'function') {
    paragraph.textContent = model.text;
    return paragraph;
  }

  renderer(paragraph, model.text, model.detections, document);
  paragraph.querySelectorAll('mark').forEach((mark) => {
    const openAlerts = () => {
      activateTab('summary');
      byId('alertsContent').scrollIntoView({ block: 'start' });
    };
    mark.addEventListener('click', openAlerts);
    mark.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openAlerts();
    });
  });
  return paragraph;
}

function createMetric(label, value) {
  const item = element('div', 'verifier-summary-metric');
  item.append(element('dt', '', label), element('dd', '', value));
  return item;
}

function severityLabel(severity) {
  return ({ INFORMATIVA: 'Informativa', BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta' })[severity] || 'Não informada';
}

function associationLabel(status) {
  return ({ VINCULADA: 'Vinculada', NAO_ENCONTRADA: 'Não encontrada', AMBIGUA: 'Ambígua', DADOS_INSUFICIENTES: 'Dados insuficientes' })[status] || 'Dados insuficientes';
}

function sortAlerts(alerts) {
  return [...alerts].sort((a, b) => (SEVERITY_ORDER[a?.gravidade] ?? 9) - (SEVERITY_ORDER[b?.gravidade] ?? 9));
}

const form = byId('verifier-form');
const fields = {
  documento: byId('documento'), fonteComparada: byId('fonteComparada'), autores: byId('autores'), ano: byId('ano'),
  titulo: byId('tituloFonte'), doi: byId('doi'), url: byId('urlFonte'), limiarSemantico: byId('limiarSemantico'),
  limiarReproducao: byId('limiarReproducao'), limiarParafrase: byId('limiarParafrase'),
  modoFontes: byId('modoFontes')
};
const fieldErrors = { documento: byId('documentoError'), fonteComparada: byId('fonteError') };
const counters = { documento: byId('documentoCount'), fonte: byId('fonteCount') };
const statusText = byId('analysisStatusText');
const formError = byId('formError');
const feedback = byId('feedback');
const resultEmpty = byId('resultEmpty');
const resultLoading = byId('resultLoading');
const resultContent = byId('resultContent');
const advancedSettings = byId('advancedSettings');
const clearDialog = byId('clearDialog');
const shortcutsDialog = byId('shortcutsDialog');
const incrementalStatus = byId('incrementalStatus');
const incrementalSegments = byId('incrementalSegments');
let isAnalyzing = false;
let hasResult = false;
let detectorAvailable = false;
let segmentSequence = 0;
let editorSegments = [];
const segmentViews = new Map();
const sessionId = globalThis.crypto?.randomUUID?.() || `sessao-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function setAnalysisState(state, message) {
  document.body.dataset.analysisState = state;
  statusText.textContent = message;
}

function setFeedback(message = '', kind = 'status') {
  feedback.textContent = message;
  feedback.hidden = !message;
  feedback.dataset.type = kind;
  feedback.setAttribute('role', kind === 'error' ? 'alert' : 'status');
}

function updateCounter(key) {
  const field = key === 'documento' ? fields.documento : fields.fonteComparada;
  const limit = key === 'documento' ? LIMITS.documento : LIMITS.fonte;
  counters[key].textContent = `${field.value.length.toLocaleString('pt-BR')} / ${limit.toLocaleString('pt-BR')}`;
  counters[key].dataset.limitState = field.value.length > limit * 0.9 ? 'danger' : field.value.length > limit * 0.75 ? 'warning' : 'normal';
}

function clearErrors() {
  Object.entries(fieldErrors).forEach(([key, error]) => {
    fields[key].removeAttribute('aria-invalid');
    error.hidden = true;
    error.textContent = '';
  });
  formError.hidden = true;
  formError.textContent = '';
}

function setFieldError(key, message) {
  fields[key].setAttribute('aria-invalid', 'true');
  fieldErrors[key].textContent = message;
  fieldErrors[key].hidden = false;
}

function validateForm({ focusInvalid = true } = {}) {
  clearErrors();
  const invalid = [];
  if (!fields.documento.value.trim()) { setFieldError('documento', 'Informe o documento ou trecho acadêmico.'); invalid.push(fields.documento); }
  if (fields.modoFontes.value !== 'BUSCA_AUTOMATICA' && !fields.fonteComparada.value.trim()) {
    setFieldError('fonteComparada', 'Informe a fonte manual para o modo selecionado.');
    invalid.push(fields.fonteComparada);
  }
  if (fields.documento.value.length > LIMITS.documento) { setFieldError('documento', 'O documento excede 100.000 caracteres.'); invalid.push(fields.documento); }
  if (fields.fonteComparada.value.length > LIMITS.fonte) { setFieldError('fonteComparada', 'A fonte excede 50.000 caracteres.'); invalid.push(fields.fonteComparada); }
  const authors = fields.autores.value.split(';').map((item) => item.trim()).filter(Boolean);
  if (authors.length > LIMITS.autores) { setFieldError('documento', 'Informe no máximo 20 autores na fonte.'); invalid.push(fields.autores); }
  if (fields.ano.value && (!Number.isInteger(Number(fields.ano.value)) || Number(fields.ano.value) < 1500 || Number(fields.ano.value) > 2100)) { setFieldError('documento', 'Informe um ano entre 1500 e 2100.'); invalid.push(fields.ano); }
  if (advancedSettings.open) {
    const parameterValues = [fields.limiarSemantico.value, fields.limiarReproducao.value, fields.limiarParafrase.value].map(Number);
    if (parameterValues.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) { setFieldError('documento', 'Os limiares devem estar entre 0,0 e 1,0.'); invalid.push(fields.limiarSemantico); }
    if (parameterValues[2] >= parameterValues[1]) { setFieldError('documento', 'O limiar de paráfrase deve ser menor que o limiar de reprodução.'); invalid.push(fields.limiarParafrase); }
  }
  if (!invalid.length) return true;
  formError.textContent = 'Revise os campos indicados antes de iniciar a análise.';
  formError.hidden = false;
  if (focusInvalid) invalid[0].focus();
  return false;
}

function setBusy(busy) {
  isAnalyzing = busy;
  form.setAttribute('aria-busy', String(busy));
  byId('btnAnalyze').disabled = busy;
  byId('btnClear').disabled = busy;
  byId('btnResetSettings').disabled = busy;
  byId('analyzeLabel').textContent = busy ? 'Analisando documento…' : 'Executar análise completa';
}

function resetResults() {
  hasResult = false;
  resultEmpty.hidden = false;
  resultLoading.hidden = true;
  resultContent.hidden = true;
  ['summaryContent', 'alertsContent', 'segmentsContent', 'citationsContent', 'referencesContent', 'associationsContent'].forEach((id) => byId(id).replaceChildren());
  setAnalysisState('idle', 'Preencha os textos para iniciar uma análise contextual.');
}

function renderSummary(data) {
  const content = byId('summaryContent');
  const section = element('section', 'verifier-summary');
  const heading = element('h3', '', data.resumo.total_alertas ? 'Resumo da análise' : 'Análise concluída sem alertas');
  const note = element('p', 'verifier-summary-note', data.resumo.total_alertas
    ? 'A gravidade representa prioridade de revisão e não uma conclusão sobre autoria.'
    : 'Nenhum alerta contextual foi gerado com os parâmetros atuais. Esse resultado não substitui a revisão humana nem garante a ausência de problemas acadêmicos.');
  const list = element('dl', 'verifier-summary-grid');
  list.append(
    createMetric('Segmentos identificados', data.resumo.total_segmentos),
    createMetric('Segmentos analisados', data.resumo.segmentos_analisados),
    createMetric('Total de alertas', data.resumo.total_alertas),
    createMetric('Gravidade máxima', severityLabel(data.resumo.gravidade_maxima)),
    createMetric('Citações encontradas', data.citacoes.length),
    createMetric('Referências encontradas', data.referencias.length)
  );
  const legend = element('p', 'verifier-severity-legend', 'Prioridades de revisão: Informativa, Baixa, Média e Alta.');
  section.append(heading, note, list, legend);
  content.replaceChildren(section);
}

function renderAlert(alert) {
  const info = RULE_GUIDANCE[alert?.codigo_regra] || { title: 'Alerta contextual', guidance: 'Revise o contexto e as fontes relacionadas antes de tomar qualquer decisão.' };
  const card = element('article', 'verifier-alert-card');
  card.dataset.severity = String(alert?.gravidade || 'INFORMATIVA');
  const header = element('div', 'verifier-alert-header');
  header.append(element('span', 'verifier-rule-code', textOrFallback(alert?.codigo_regra, 'REG')), element('span', 'verifier-severity', severityLabel(alert?.gravidade)));
  const title = element('h4', '', info.title);
  const message = element('p', 'verifier-alert-message', textOrFallback(alert?.mensagem, 'A API não forneceu uma mensagem complementar.'));
  const guidance = element('p', 'verifier-alert-guidance', info.guidance);
  const evidence = alert?.evidencias && typeof alert.evidencias === 'object' ? Object.entries(alert.evidencias).filter(([, value]) => typeof value === 'string' || typeof value === 'number') : [];
  const evidenceList = element('dl', 'verifier-evidence-list');
  evidence.forEach(([key, value]) => evidenceList.append(createMetric(key.replaceAll('_', ' '), value)));
  card.append(header, title, message, element('h5', '', 'Ação recomendada'), guidance);
  if (evidence.length) { card.append(element('h5', '', 'Evidências retornadas'), evidenceList); }
  return card;
}

function renderAlerts(data) {
  const content = byId('alertsContent');
  if (!data.alertas.length) { content.replaceChildren(element('p', 'verifier-no-sources', 'Não há alertas contextuais para listar nesta análise.')); return; }
  const fragment = document.createDocumentFragment();
  sortAlerts(data.alertas).forEach((alert) => fragment.append(renderAlert(alert)));
  content.replaceChildren(fragment);
}

function renderScore(label, score) {
  const numeric = Number(score);
  const item = element('div', 'verifier-score');
  const title = element('strong', '', label);
  const value = element('span', '', formatPercent(numeric));
  const progress = document.createElement('progress');
  progress.max = 100;
  progress.value = Math.round(numeric * 100);
  progress.setAttribute('aria-label', `${label}: ${formatPercent(numeric)}. Similaridade não é percentual de plágio.`);
  progress.textContent = formatPercent(numeric);
  item.append(title, value, progress);
  return item;
}

function renderSegments(data) {
  const content = byId('segmentsContent');
  if (!data.segmentos.length) { content.replaceChildren(element('p', 'verifier-no-sources', 'O detector não retornou segmentos para esta análise.')); return; }
  const fragment = document.createDocumentFragment();
  data.segmentos.forEach((segment, index) => {
    const details = element('details', 'verifier-segment');
    const summary = element('summary', '', `Segmento ${Number(segment?.indice) + 1 || index + 1}`);
    const body = element('div', 'verifier-segment-body');
    body.append(renderSegmentText(segment));
    if (segment?.metricas) body.append(element('div', 'verifier-score-grid'), renderScore('Similaridade semântica', segment.metricas.score_semantico), renderScore('Sobreposição lexical', segment.metricas.score_lexical));
    const citations = Array.isArray(segment?.citacoes) && segment.citacoes.length ? segment.citacoes.join(' · ') : 'Nenhuma citação identificada neste segmento.';
    body.append(element('p', 'verifier-segment-citations', `Citações identificadas: ${citations}`));
    if (Array.isArray(segment?.alertas) && segment.alertas.length) {
      const localAlerts = element('div', 'verifier-segment-alerts');
      localAlerts.append(element('h4', '', 'Alertas aplicáveis'));
      sortAlerts(segment.alertas).forEach((alert) => localAlerts.append(renderAlert(alert)));
      body.append(localAlerts);
    }
    details.append(summary, body);
    fragment.append(details);
  });
  content.replaceChildren(fragment);
}

function renderListSection(id, title, values, renderItem, emptyMessage) {
  const content = byId(id);
  const section = element('section', 'verifier-result-section');
  section.append(element('h3', '', title));
  if (!values.length) { section.append(element('p', 'verifier-no-sources', emptyMessage)); content.replaceChildren(section); return; }
  const list = element('div', 'verifier-source-list');
  values.forEach((value, index) => list.append(renderItem(value, index)));
  section.append(list);
  content.replaceChildren(section);
}

function renderSources(data) {
  renderListSection('citationsContent', 'Citações identificadas', data.citacoes, (citation) => {
    const item = element('article', 'verifier-source-item');
    item.append(element('p', '', textOrFallback(citation?.texto_original, 'Texto da citação não informado.')));
    item.append(element('p', 'verifier-source-meta', `Autor: ${textOrFallback(citation?.autores)} · Ano: ${textOrFallback(citation?.ano)} · Página: ${textOrFallback(citation?.pagina)} · Tipo: ${textOrFallback(citation?.tipo)}`));
    return item;
  }, 'Nenhuma citação foi identificada.');
  renderListSection('referencesContent', 'Referências identificadas', data.referencias, (reference) => {
    const item = element('article', 'verifier-source-item');
    item.append(element('p', '', `${textOrFallback(reference?.autores)} (${textOrFallback(reference?.ano)}). ${textOrFallback(reference?.titulo)}.`));
    if (reference?.doi) item.append(element('p', 'verifier-source-meta', `DOI: ${reference.doi}`));
    const url = safeExternalUrl(reference?.url);
    if (url) { const link = element('a', '', 'Abrir URL da referência'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; item.append(link); }
    return item;
  }, 'Nenhuma referência foi identificada.');
  renderListSection('associationsContent', 'Associações', data.associacoes, (association) => {
    const item = element('article', 'verifier-source-item');
    const label = associationLabel(association?.status);
    item.append(element('p', '', `Status: ${label}`), element('p', 'verifier-source-meta', `Citação: ${textOrFallback(association?.citacao)}`));
    if (association?.status === 'AMBIGUA') item.append(element('p', 'verifier-association-note', 'Mais de uma referência pode corresponder a esta citação.'));
    return item;
  }, 'Não há associações para esta análise.');
}

function renderResult(payload) {
  if (!isCompleteResponse(payload) && !isContextualResponse(payload)) {
    throw Object.assign(new Error('Resposta incompatível.'), { status: 502 });
  }
  const data = isCompleteResponse(payload) ? normalizeCompleteData(payload.data) : payload.data;
  renderSummary(data);
  renderAlerts(data);
  renderSegments(data);
  renderSources(data);
  hasResult = true;
  resultEmpty.hidden = true;
  resultLoading.hidden = true;
  resultContent.hidden = false;
  setAnalysisState('success', data.resumo.total_alertas ? 'Análise concluída. Revise os alertas contextualizados.' : 'Análise concluída sem alertas contextuais.');
  setFeedback('Análise contextual concluída. Os resultados são indícios para revisão humana.', 'status');
  resultContent.focus({ preventScroll: true });
}

async function runAnalysis() {
  if (!detectorAvailable) {
    setFeedback('O verificador experimental está desabilitado neste ambiente.', 'error');
    return;
  }
  if (isAnalyzing) return;
  if (!validateForm()) { setAnalysisState('invalid', 'Existem campos que precisam ser revisados.'); return; }
  setFeedback();
  setBusy(true);
  resultEmpty.hidden = true;
  resultContent.hidden = true;
  resultLoading.hidden = false;
  setAnalysisState('loading', 'Analisando os trechos…');
  try {
    const payload = await post(
      COMPLETE_ENDPOINT,
      buildCompletePayload(fields.documento.value, sourceSettings()),
      { timeout: 30000 }
    );
    renderResult(payload);
  } catch (error) {
    resultLoading.hidden = true;
    resultEmpty.hidden = hasResult;
    resultContent.hidden = !hasResult;
    const message = getContextualErrorMessage(error instanceof APIError ? error : error || {});
    setAnalysisState('error', message);
    setFeedback(message, 'error');
    feedback.focus();
  } finally { setBusy(false); }
}

function createSegmentId() {
  segmentSequence += 1;
  return `segmento-${segmentSequence}-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
}

function segmentView(segment) {
  let view = segmentViews.get(segment.segmento_id);
  if (!view) {
    if (!segmentViews.size) incrementalSegments.replaceChildren();
    const root = element('article', 'verifier-incremental-segment');
    const heading = element('h4');
    const state = element('p', 'verifier-incremental-state');
    const content = element('div', 'verifier-incremental-content');
    root.append(heading, state, content);
    incrementalSegments.append(root);
    view = { root, heading, state, content };
    segmentViews.set(segment.segmento_id, view);
  }
  view.heading.textContent = `Parágrafo ${segment.indice + 1} · versão ${segment.versao}`;
  return view;
}

function setIncrementalSegmentState(segment, state, error) {
  const view = segmentView(segment);
  view.root.dataset.state = state;
  const messages = {
    PENDENTE: 'Aguardando a pausa de digitação…',
    ANALISANDO: 'Recuperando candidatas e analisando este parágrafo…',
    ERRO: getContextualErrorMessage(error),
    SEM_FONTE: 'Aguardando a fonte manual exigida pelo modo selecionado.',
    CONTEXTO_DESATUALIZADO: 'Referências ou metadados mudaram. As associações serão consolidadas na análise completa; os scores existentes não foram recalculados.'
  };
  view.state.textContent = messages[state] || state;
  if (state !== 'CONCLUIDO') view.content.replaceChildren();
  incrementalStatus.textContent = view.state.textContent;
}

function renderIncrementalResult(segment, data) {
  const view = segmentView(segment);
  const statusLabels = {
    ANALISE_PARCIAL: 'Análise parcial concluída',
    REFERENCIAS_NAO_FORNECIDAS: 'Análise parcial: referências ainda não fornecidas',
    SEM_CANDIDATOS: 'Nenhuma fonte candidata encontrada',
    RECUPERACAO_INDISPONIVEL: 'Busca automática indisponível',
    RECUPERACAO_PARCIAL: 'Resultado parcial com a fonte manual',
    CONTEXTO_INSUFICIENTE: 'Contexto insuficiente'
  };
  view.root.dataset.state = 'CONCLUIDO';
  view.state.textContent = statusLabels[data.status_contexto] || 'Análise incremental concluída';
  const fragment = document.createDocumentFragment();
  if (!data.fontes_candidatas.length) {
    fragment.append(element(
      'p',
      'verifier-no-sources',
      data.status_recuperacao === 'INDISPONIVEL'
        ? 'Nenhuma candidata foi simulada: configure um provedor autorizado para habilitar a busca.'
        : 'Nenhuma candidata relevante foi retornada para este trecho.'
    ));
  }
  data.fontes_candidatas.forEach((candidate) => {
    const card = element('article', 'verifier-source-item');
    card.append(
      element('strong', '', textOrFallback(candidate.titulo, 'Fonte candidata')),
      element('p', 'verifier-source-meta', `Origem: ${textOrFallback(candidate.origem)} · relevância de recuperação: ${candidate.score_recuperacao == null ? 'não informada' : formatPercent(candidate.score_recuperacao)}`),
      element('p', '', String(candidate.texto_trecho || '').slice(0, 500))
    );
    const url = safeExternalUrl(candidate.url);
    if (url) {
      const link = element('a', '', 'Abrir origem informada');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      card.append(link);
    }
    fragment.append(card);
  });
  data.alertas.forEach((alert) => fragment.append(renderAlert(alert)));
  if (!data.alertas.length) fragment.append(element('p', 'verifier-no-sources', 'Nenhum alerta foi gerado para esta versão do parágrafo.'));
  view.content.replaceChildren(fragment);
  incrementalStatus.textContent = `${view.state.textContent} no parágrafo ${segment.indice + 1}.`;
}

async function sendIncremental(payload, signal) {
  const envelope = await post(INCREMENTAL_ENDPOINT, payload, { timeout: 10000, signal });
  if (!isIncrementalResponse(envelope)) throw Object.assign(new Error('Resposta incompatível.'), { status: 502 });
  return envelope;
}

const incrementalCoordinator = createIncrementalCoordinator({
  sessionId,
  send: sendIncremental,
  getCurrentSegment: (id) => editorSegments.find((segment) => segment.segmento_id === id),
  onState: setIncrementalSegmentState,
  onResult: renderIncrementalResult,
  onDiscard: () => {
    incrementalStatus.textContent = 'Uma resposta obsoleta foi descartada; a versão atual permanece ativa.';
  }
});

function scheduleIncremental(segment) {
  if (!detectorAvailable || !segment?.analisavel) return;
  if (fields.modoFontes.value !== 'BUSCA_AUTOMATICA' && !fields.fonteComparada.value.trim()) {
    incrementalCoordinator.cancel(segment.segmento_id);
    setIncrementalSegmentState(segment, 'SEM_FONTE');
    return;
  }
  incrementalCoordinator.schedule(
    segment,
    () => buildIncrementalPayload(segment, editorSegments, sessionId, sourceSettings())
  );
}

function reconcileAndSchedule() {
  const previous = editorSegments;
  const previousById = new Map(previous.map((segment) => [segment.segmento_id, segment]));
  editorSegments = reconcileEditorSegments(previous, fields.documento.value, createSegmentId);
  const currentIds = editorSegments.map((segment) => segment.segmento_id);
  incrementalCoordinator.retain(currentIds);
  [...segmentViews.keys()].forEach((id) => {
    if (!currentIds.includes(id)) {
      segmentViews.get(id)?.root.remove();
      segmentViews.delete(id);
    }
  });
  const referencesChanged = editorSegments.some((segment) => {
    const old = previousById.get(segment.segmento_id);
    return segment.tipo === 'REFERENCIA' && (!old || old.versao !== segment.versao);
  }) || previous.some((segment) => segment.tipo === 'REFERENCIA' && !currentIds.includes(segment.segmento_id));
  const changed = editorSegments.filter((segment) => {
    const old = previousById.get(segment.segmento_id);
    return segment.analisavel && (!old || old.versao !== segment.versao);
  });
  if (referencesChanged) markContextStale();
  changed.forEach(scheduleIncremental);
}

function scheduleAllSegments() {
  editorSegments.filter((segment) => segment.analisavel).forEach(scheduleIncremental);
}

function markContextStale() {
  editorSegments.filter((segment) => segment.analisavel && segmentViews.has(segment.segmento_id))
    .forEach((segment) => setIncrementalSegmentState(segment, 'CONTEXTO_DESATUALIZADO'));
}

function updateSourceMode() {
  const automatic = fields.modoFontes.value === 'BUSCA_AUTOMATICA';
  fields.fonteComparada.required = !automatic;
  fields.fonteComparada.disabled = automatic;
  byId('manualRequired').hidden = automatic;
  byId('sourceMetadata').querySelectorAll('input').forEach((input) => { input.disabled = automatic; });
  incrementalStatus.textContent = automatic
    ? 'Busca automática selecionada. Sem provedor configurado, o sistema informará indisponibilidade sem inventar candidatas.'
    : 'Fonte manual ativa. A análise será iniciada após uma pausa na edição.';
  scheduleAllSegments();
}

function activateTab(tabName, { focus = false } = {}) {
  const tabs = [...document.querySelectorAll('.verifier-tab')];
  const panels = [...document.querySelectorAll('.verifier-panel')];
  tabs.forEach((tab) => { const selected = tab.dataset.tab === tabName; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; if (selected && focus) tab.focus(); });
  panels.forEach((panel) => { panel.hidden = panel.id !== `panel-${tabName}`; });
}

function getFocusable(dialog) { return [...dialog.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((node) => !node.hidden); }

function openDialog(dialog, initialFocus) {
  if (dialog.open) return;
  const returnFocus = document.activeElement;
  const restorePageScroll = lockPageScroll(document);
  const trap = (event) => {
    if (event.key !== 'Tab') return;
    const items = getFocusable(dialog); if (!items.length) return;
    if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
    if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
  };
  dialog.addEventListener('keydown', trap);
  dialog.addEventListener('close', () => { dialog.removeEventListener('keydown', trap); restorePageScroll(); returnFocus?.focus(); }, { once: true });
  dialog.showModal();
  requestAnimationFrame(() => (initialFocus || getFocusable(dialog)[0] || dialog).focus());
}

function clearPage() {
  incrementalCoordinator.cancelAll();
  editorSegments = [];
  segmentViews.forEach((view) => view.root.remove());
  segmentViews.clear();
  form.reset();
  fields.limiarSemantico.value = DEFAULT_PARAMETERS.semantico;
  fields.limiarReproducao.value = DEFAULT_PARAMETERS.reproducao;
  fields.limiarParafrase.value = DEFAULT_PARAMETERS.parafrase;
  advancedSettings.open = false;
  clearErrors(); updateCounter('documento'); updateCounter('fonte'); resetResults();
  updateSourceMode();
  incrementalSegments.replaceChildren(element('p', 'verifier-no-sources', 'Os estados dos parágrafos aparecerão aqui sem interromper a escrita.'));
  setFeedback('Os campos e o resultado foram removidos desta página.', 'status');
  clearDialog.close(); fields.documento.focus();
}

fields.documento.addEventListener('input', () => {
  updateCounter('documento');
  if (fields.documento.getAttribute('aria-invalid') === 'true') clearErrors();
  reconcileAndSchedule();
});
fields.fonteComparada.addEventListener('input', () => {
  updateCounter('fonte');
  if (fields.fonteComparada.getAttribute('aria-invalid') === 'true') clearErrors();
  scheduleAllSegments();
});
fields.modoFontes.addEventListener('change', updateSourceMode);
byId('sourceMetadata').addEventListener('input', markContextStale);
form.addEventListener('submit', (event) => { event.preventDefault(); runAnalysis(); });
document.querySelectorAll('.verifier-tab').forEach((tab, index, tabs) => { tab.addEventListener('click', () => activateTab(tab.dataset.tab)); tab.addEventListener('keydown', (event) => { const target = getVerifierTabTargetIndex(event.key, index, tabs.length); if (target !== null) { event.preventDefault(); activateTab(tabs[target].dataset.tab, { focus: true }); } }); });
byId('btnResetSettings').addEventListener('click', () => { fields.limiarSemantico.value = DEFAULT_PARAMETERS.semantico; fields.limiarReproducao.value = DEFAULT_PARAMETERS.reproducao; fields.limiarParafrase.value = DEFAULT_PARAMETERS.parafrase; });
byId('helpButton').addEventListener('click', (event) => { openDialog(shortcutsDialog, byId('closeShortcuts')); event.currentTarget.setAttribute('aria-expanded', 'true'); });
shortcutsDialog.addEventListener('close', () => byId('helpButton').setAttribute('aria-expanded', 'false'));
byId('closeShortcuts').addEventListener('click', () => shortcutsDialog.close());
byId('btnClear').addEventListener('click', () => { if (!fields.documento.value && !fields.fonteComparada.value && !hasResult) { fields.documento.focus(); return; } openDialog(clearDialog, byId('cancelClear')); });
byId('closeClearDialog').addEventListener('click', () => clearDialog.close());
byId('cancelClear').addEventListener('click', () => clearDialog.close());
byId('confirmClear').addEventListener('click', clearPage);
document.addEventListener('keydown', (event) => { const modifier = event.ctrlKey || event.metaKey; if (modifier && event.key === 'Enter') { event.preventDefault(); runAnalysis(); } if (modifier && event.key === 'Delete') { event.preventDefault(); byId('btnClear').click(); } });

updateCounter('documento');
updateCounter('fonte');
resetResults();
updateSourceMode();
initSessionUI({ requiredRoles: ['ALUNO', 'PROFESSOR', 'ADMIN'] }).then((session) => {
  detectorAvailable = session.capabilities?.features?.detector?.enabled === true;
  if (detectorAvailable) return;
  incrementalCoordinator.cancelAll();
  form.querySelectorAll('input, textarea, select, button').forEach((control) => {
    control.disabled = true;
  });
  setFeedback('O verificador experimental está desabilitado neste ambiente.', 'error');
});
