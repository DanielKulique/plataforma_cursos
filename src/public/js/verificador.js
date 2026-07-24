import { getToken } from './auth.js';
import { initSessionUI } from './session-ui.js';

'use strict';

function createElement(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = String(text ?? '');
  return element;
}

/* ══════════════════════════════════════════════════════
   TOAST SYSTEM
   ══════════════════════════════════════════════════════ */
const toast = (() => {
  const container = document.getElementById('toast-container');
  const STYLES = {
    success:{ bg:'rgba(34,197,94,.12)',  brd:'rgba(34,197,94,.35)',  icon:'✅', color:'#86efac' },
    error:  { bg:'rgba(239,68,68,.12)',  brd:'rgba(239,68,68,.4)',   icon:'❌', color:'#fca5a5' },
    warn:   { bg:'rgba(245,158,11,.1)',  brd:'rgba(245,158,11,.35)', icon:'⚠️', color:'#fde68a' },
    info:   { bg:'rgba(124,58,237,.1)',  brd:'rgba(124,58,237,.3)',  icon:'ℹ️', color:'#c4b5fd' },
  };
  function show(msg, type='info', dur=4200) {
    const s = STYLES[type] || STYLES.info;
    const el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role','alert');
    el.style.cssText = `background:${s.bg};border:1px solid ${s.brd};color:${s.color};`;
    const icon = createElement('span', '', s.icon);
    icon.setAttribute('aria-hidden', 'true');
    el.append(icon, createElement('span', '', msg));
    el.addEventListener('click', () => dismiss(el));
    container.appendChild(el);
    setTimeout(() => dismiss(el), dur);
  }
  function dismiss(el) {
    el.style.animation = 'toastOut .2s ease forwards';
    setTimeout(() => el.remove(), 220);
  }
  return {
    success:(m,d)=>show(m,'success',d), error:(m,d)=>show(m,'error',d),
    warn:(m,d)=>show(m,'warn',d),       info:(m,d)=>show(m,'info',d),
  };
})();

/* ══════════════════════════════════════════════════════
   CONFIRM MODAL
   ══════════════════════════════════════════════════════ */
function confirmar({ titulo, mensagem, labelOk='Confirmar', tipo='danger' }) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.setAttribute('aria-labelledby','modal-title');
    const box = createElement('div', 'modal-box');
    const title = createElement('div', 'modal-title', titulo);
    title.id = 'modal-title';
    const message = createElement('div', 'modal-msg', mensagem);
    const actions = createElement('div', 'modal-btns');
    const cancel = createElement('button', 'modal-cancel', 'Cancelar');
    cancel.id = 'mCancel';
    cancel.type = 'button';
    cancel.setAttribute('aria-label', 'Cancelar');
    const confirm = createElement('button', tipo === 'danger' ? 'modal-ok-danger' : 'modal-ok', labelOk);
    confirm.id = 'mOk';
    confirm.type = 'button';
    confirm.setAttribute('aria-label', 'Confirmar');
    actions.append(cancel, confirm);
    box.append(title, message, actions);
    overlay.append(box);
    document.body.appendChild(overlay);
    overlay.querySelector('#mCancel').focus();
    overlay.querySelector('#mOk').addEventListener('click', () => { overlay.remove(); resolve(true); });
    overlay.querySelector('#mCancel').addEventListener('click', () => { overlay.remove(); resolve(false); });
    overlay.addEventListener('keydown', e => { if(e.key==='Escape'){ overlay.remove(); resolve(false); } });
  });
}

/* ══════════════════════════════════════════════════════
   DOUBLE-SUBMIT GUARD
   ══════════════════════════════════════════════════════ */
function withLoading(btn, labelEl, loadingLabel, handler) {
  return async (...args) => {
    if (btn.disabled) return;
    const orig = labelEl.textContent;
    btn.disabled = true;
    btn.classList.add('loading');
    labelEl.textContent = loadingLabel;
    try { await handler(...args); }
    finally {
      btn.disabled = false;
      btn.classList.remove('loading');
      labelEl.textContent = orig;
    }
  };
}

/* ══════════════════════════════════════════════════════
   MENSAGENS DE ERRO HUMANIZADAS
   ══════════════════════════════════════════════════════ */
const ERROS = {
  offline:     'Sem conexão. Verifique sua internet e tente novamente.',
  timeout:     'O servidor demorou mais que o esperado. Tente novamente em instantes.',
  too_long:    'O texto é muito longo. Use até 15.000 caracteres por análise.',
  too_short:   'O texto é curto demais para análise. Insira pelo menos 50 caracteres.',
  upload_type: 'Tipo de arquivo não suportado. Use PDF, DOCX ou TXT.',
  upload_size: 'O arquivo é muito grande. O limite é de 10 MB.',
  server:      'Algo deu errado no servidor. Nossa equipe foi notificada.',
  session:     'Sua sessão expirou. Faça login novamente.',
};

/* ══════════════════════════════════════════════════════
   SKELETON HELPERS
   ══════════════════════════════════════════════════════ */
function showSkeleton() {
  document.getElementById('edSkeleton').classList.add('visible');
  document.getElementById('scoreSkeleton').style.display = 'flex';
  document.getElementById('scoreEmpty').style.display = 'none';
  document.getElementById('scoreContent').style.display = 'none';
}
function hideSkeleton() {
  document.getElementById('edSkeleton').classList.remove('visible');
  document.getElementById('scoreSkeleton').style.display = 'none';
}

/* ══════════════════════════════════════════════════════
   STATUS BAR
   ══════════════════════════════════════════════════════ */
function setStatus(type, txt) {
  const dot = document.getElementById('sdot');
  const label = document.getElementById('stxt');
  dot.className = 'sdot ' + type;
  label.textContent = txt;
}

/* ══════════════════════════════════════════════════════
   TABS
   ══════════════════════════════════════════════════════ */
function switchTab(tabName) {
  document.querySelectorAll('.ptab').forEach(b => {
    const isActive = b.dataset.tab === tabName;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-selected', isActive);
  });
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.getElementById('pane-' + tabName).classList.add('active');
}
document.querySelectorAll('.ptab').forEach(btn =>
  btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

/* ══════════════════════════════════════════════════════
   EDITOR — WORD COUNT + CHAR LIMIT
   ══════════════════════════════════════════════════════ */
const editor    = document.getElementById('editor');
const textoOriginal = document.getElementById('textoOriginal');
const wcBadge   = document.getElementById('wcBadge');
const footInfo  = document.getElementById('footInfo');
const MAX_CHARS = 15000;

function updateCount() {
  const txt   = editor.value.trim();
  const words = txt ? txt.split(/\s+/).length : 0;
  const chars = editor.value.length;
  const pct   = chars / MAX_CHARS;

  wcBadge.textContent = words + ' palavras';
  wcBadge.classList.toggle('has-text', words > 0);
  footInfo.textContent = `${words} palavras · ${chars.toLocaleString('pt-BR')} / ${MAX_CHARS.toLocaleString('pt-BR')} caracteres`;

  footInfo.className = 'foot-info' + (pct > .9 ? ' danger' : pct > .75 ? ' warn' : '');
  editor.className   = 'ed-ta' + (pct > .9 ? ' at-limit' : pct > .75 ? ' near-limit' : '');
}
editor.addEventListener('input', updateCount);

/* ══════════════════════════════════════════════════════
   ANÁLISE — DEBOUNCE AUTOMÁTICO
   ══════════════════════════════════════════════════════ */
let debounceTimer;
editor.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  if (editor.value.trim().length > 80) {
    setStatus('idle', 'Aguardando pausa...');
    debounceTimer = setTimeout(() => runAnalysis(), 2200);
  }
});

/* ══════════════════════════════════════════════════════
   BOTÃO ANALISAR
   ══════════════════════════════════════════════════════ */
const btnAnalyze  = document.getElementById('btnAnalyze');
const analyzeLabel = document.getElementById('analyzeLabel');
const guardedAnalyze = withLoading(btnAnalyze, analyzeLabel, 'Analisando...', async () => {
  await runAnalysis();
});
btnAnalyze.addEventListener('click', guardedAnalyze);

/* ══════════════════════════════════════════════════════
   LIMPAR
   ══════════════════════════════════════════════════════ */
document.getElementById('btnClear').addEventListener('click', async () => {
  if (!editor.value.trim()) return;
  const ok = await confirmar({
    titulo: 'Limpar o editor?',
    mensagem: 'O texto e todos os resultados de análise serão removidos. Tem certeza?',
    labelOk: 'Sim, limpar tudo',
    tipo: 'danger',
  });
  if (!ok) return;
  editor.value = '';
  document.getElementById('hlLayer').replaceChildren();
  updateCount();
  resetPanel();
  toast.info('Editor limpo.');
});

/* ══════════════════════════════════════════════════════
   UPLOAD
   ══════════════════════════════════════════════════════ */
const uploadStrip = document.getElementById('uploadStrip');
const fileInput   = document.getElementById('fileInput');

function handleUploadTrigger() { fileInput.click(); }
uploadStrip.addEventListener('click', handleUploadTrigger);
uploadStrip.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' ') handleUploadTrigger(); });

fileInput.addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;

  const EXT_OK = ['.pdf','.docx','.txt'];
  const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
  if (!EXT_OK.includes(ext)) { toast.error(ERROS.upload_type); return; }
  if (f.size > 10 * 1024 * 1024) { toast.error(ERROS.upload_size); return; }

  document.getElementById('usName').textContent = '📄 ' + f.name;
  uploadStrip.classList.add('uploading');
  toast.info(`Extraindo texto de "${f.name}"...`);

  await new Promise(r => setTimeout(r, 900));
  uploadStrip.classList.remove('uploading');

  editor.value = `[Texto extraído de "${f.name}" pelo script Python (POST /api/extract) apareceria aqui.\n\nO backend FastAPI converte o arquivo, limpa o texto e retorna o conteúdo puro para análise.]`;
  updateCount();
  toast.success('Texto extraído com sucesso! Pronto para análise.');
  fileInput.value = '';
});

/* ══════════════════════════════════════════════════════
   RESET PANEL
   ══════════════════════════════════════════════════════ */
function resetPanel() {
  document.getElementById('scoreEmpty').style.display = 'flex';
  document.getElementById('scoreContent').style.display = 'none';
  document.getElementById('detEmpty').style.display = 'flex';
  const dl = document.getElementById('detList');
  dl.style.display = 'none'; dl.replaceChildren();
  document.getElementById('detBadge').textContent = '0';
  document.getElementById('detBadge').className = 'pbadge muted';
  document.getElementById('btnExport').disabled = true;
  setStatus('idle', 'Pronto para analisar');
}

/* ══════════════════════════════════════════════════════
   ANÁLISE PRINCIPAL
   ══════════════════════════════════════════════════════ */
async function runAnalysis() {
  const txt = editor.value.trim();
  const original = textoOriginal.value.trim();

  if (!txt || !original) { toast.warn('Informe os textos original e suspeito.'); return; }
  if (txt.length < 50) { toast.warn(ERROS.too_short); return; }
  if (editor.value.length > MAX_CHARS) { toast.warn(ERROS.too_long); return; }

  setStatus('busy', 'Analisando…');
  showSkeleton();

  try {
    const response = await fetch('/api/plagio/analisar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() || ''}` },
      body: JSON.stringify({ texto_original: original, texto_suspeito: txt })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { const error = new Error(payload.mensagem || 'Falha na análise.'); error.status = response.status; throw error; }
    const similaridade = Math.max(0, Math.min(100, Number(payload.resultado.score_similaridade) || 0));
    const data = { orig: Math.round(100 - similaridade), plag: Math.round(similaridade), para: 0, dets: [] };

    hideSkeleton();
    renderScore(data);
    renderDets(data.dets);
    renderHL(data.dets);
    document.getElementById('btnExport').disabled = false;
    setStatus('done', 'Análise concluída');

    const verdict = data.orig >= 80 ? '✅ Texto aprovado!' :
                    data.orig >= 60 ? '⚠️ Atenção: revisar trechos identificados.' :
                                      '❌ Alto índice de similaridade detectado.';
    toast[data.orig >= 80 ? 'success' : data.orig >= 60 ? 'warn' : 'error'](verdict);

    if (data.dets.length > 0) {
      setTimeout(() => {
        switchTab('detect');
        toast.info('Clique em um card para ver a fonte e navegar no texto.');
      }, 1200);
    }

  } catch(err) {
    hideSkeleton();
    setStatus('error', 'Erro na análise');
    const errorKey = typeof err === 'object' && err && 'code' in err ? err.code : null;
    const msg = err.status === 401 ? 'Sua sessão expirou. Faça login novamente.' : err.status === 403 ? 'Você não tem permissão para analisar.' : err.status === 503 ? 'O motor de IA está indisponível no momento.' : ((errorKey && ERROS[errorKey]) ? ERROS[errorKey] : err.message || ERROS.server);
    toast.error(msg);
  }
}

/* ══════════════════════════════════════════════════════
   RENDER SCORE
   ══════════════════════════════════════════════════════ */
function renderScore(d) {
  document.getElementById('scoreEmpty').style.display = 'none';
  const sc = document.getElementById('scoreContent');
  sc.style.display = 'flex';
  const C = 2 * Math.PI * 42;
  const fill = document.getElementById('gFill');
  fill.style.strokeDasharray  = C;
  fill.style.strokeDashoffset = C - (C * d.orig / 100);
  fill.className = 'g-fi ' + (d.orig >= 80 ? 'green' : d.orig >= 60 ? 'amber' : 'red');
  document.getElementById('gNum').textContent = d.orig + '%';
  document.getElementById('gLbl').textContent = d.orig >= 80 ? 'ORIGINAL' : d.orig >= 60 ? 'ATENÇÃO' : 'CRÍTICO';
  document.getElementById('sO').textContent = d.orig + '%';
  document.getElementById('sP').textContent = d.plag + '%';
  document.getElementById('sA').textContent = d.para + '%';
  const v = document.getElementById('sV');
  v.textContent = d.orig >= 80 ? 'Aprovado' : d.orig >= 60 ? 'Revisar' : 'Reprovado';
  v.className = 'chip ' + (d.orig >= 80 ? 'cg' : d.orig >= 60 ? 'ca' : 'cr');
  setTimeout(() => {
    [['O', d.orig], ['A', d.para], ['P', d.plag]].forEach(([k, val]) => {
      const bar = document.getElementById('d'+k);
      bar.style.width = val + '%';
      bar.parentElement.setAttribute('aria-valuenow', val);
      document.getElementById('dv'+k).textContent = val + '%';
    });
  }, 80);
}

/* ══════════════════════════════════════════════════════
   RENDER DETECTIONS
   ══════════════════════════════════════════════════════ */
function renderDets(dets) {
  document.getElementById('detEmpty').style.display = 'none';
  const list = document.getElementById('detList');
  list.style.display = 'flex'; list.replaceChildren();
  const reds = dets.filter(d => d.lvl === 'red').length;
  const badge = document.getElementById('detBadge');
  badge.textContent = dets.length;
  badge.setAttribute('aria-label', `${dets.length} detecções`);
  badge.className = 'pbadge ' + (reds > 0 ? 'red' : 'amber');

  dets.forEach((det, i) => {
    const el = document.createElement('div');
    el.className = 'det ' + det.lvl;
    el.dataset.id = det.id;
    el.setAttribute('role', 'listitem');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', `Detecção ${i+1}: ${det.lvl === 'red' ? 'Alta similaridade' : 'Paráfrase'} — ${det.sim}%`);
    const top = createElement('div', 'det-top');
    const toggle = createElement('span', 'det-toggle', '›');
    toggle.setAttribute('aria-hidden', 'true');
    top.append(
      createElement('span', 'det-badge', det.lvl === 'red' ? 'Alta sim.' : 'Paráfrase'),
      createElement('span', 'det-txt', det.txt),
      createElement('span', 'det-pct', `${Number(det.sim) || 0}%`),
      toggle
    );

    const body = createElement('div', 'det-body');
    body.setAttribute('role', 'region');
    body.setAttribute('aria-label', 'Detalhes da detecção');
    const comparison = createElement('div', 'cmp');
    const student = createElement('div', 'cbox stu');
    student.append(createElement('span', 'clbl', 'Seu texto'), createElement('span', 'ctxt', det.stu));
    const source = createElement('div', 'cbox ori');
    source.append(createElement('span', 'clbl', 'Fonte suspeita'), createElement('span', 'ctxt', det.ori));
    const safeSourceUrl = window.SecurityUtils?.toSafeUrl(det.url, { baseUrl: location.origin });
    if (safeSourceUrl) {
      const sourceLink = createElement('a', 'src-a', `🔗 ${det.src || 'Abrir fonte'}`);
      sourceLink.href = safeSourceUrl;
      sourceLink.target = '_blank';
      sourceLink.rel = 'noopener noreferrer';
      source.append(createElement('br'), sourceLink);
    }
    comparison.append(student, source);
    body.append(comparison);
    el.append(top, body);

    function toggleCard() {
      const wasOpen = el.classList.contains('open');
      document.querySelectorAll('.det.open').forEach(d => d.classList.remove('open'));
      document.querySelectorAll('.det.focused').forEach(d => d.classList.remove('focused'));
      if (!wasOpen) {
        el.classList.add('open', 'focused');
        scrollToSnippet(det.txt, det.id);
      }
    }

    top.addEventListener('click', toggleCard);
    el.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' ') { e.preventDefault(); toggleCard(); } });
    list.appendChild(el);
  });
}

/* ══════════════════════════════════════════════════════
   RENDER HIGHLIGHTS
   ══════════════════════════════════════════════════════ */
function renderHL(dets) {
  const layer = document.getElementById('hlLayer');
  window.SecurityUtils.renderHighlightedText(layer, editor.value, dets, document);

  layer.querySelectorAll('mark').forEach(m => {
    function activate() {
      switchTab('detect');
      const card = [...document.querySelectorAll('.det')].find((item) => item.dataset.id === m.dataset.id);
      if (card) {
        document.querySelectorAll('.det.open').forEach(d => d.classList.remove('open'));
        document.querySelectorAll('.det.focused').forEach(d => d.classList.remove('focused'));
        card.classList.add('open', 'focused');
        card.scrollIntoView({ behavior:'smooth', block:'nearest' });
      }
    }
    m.addEventListener('click', activate);
    m.addEventListener('keydown', e => { if(e.key==='Enter') activate(); });
  });
}

/* Scroll to snippet */
function scrollToSnippet(txt, id) {
  const idx = editor.value.toLowerCase().indexOf(txt.toLowerCase().slice(0, 30));
  if (idx > -1) {
    editor.focus();
    editor.setSelectionRange(idx, idx + txt.length);
    document.querySelectorAll('mark.hl-focus').forEach(m => m.classList.remove('hl-focus'));
    document.querySelectorAll('mark[data-id]').forEach((mark) => {
      if (mark.dataset.id === String(id)) mark.classList.add('hl-focus');
    });
  }
}

/* Sync scroll */
editor.addEventListener('scroll', () => {
  document.getElementById('hlLayer').scrollTop = editor.scrollTop;
});

/* ══════════════════════════════════════════════════════
   ATALHOS DE TECLADO
   ══════════════════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  const inInput = ['INPUT','SELECT'].includes(e.target.tagName);
  const mod = e.ctrlKey || e.metaKey;
  const inEditor = e.target === editor;

  if (mod && e.key === 'Enter') {
    e.preventDefault();
    guardedAnalyze();
    return;
  }
  if (mod && e.key === 'Delete' && !inInput) {
    document.getElementById('btnClear').click();
    return;
  }
  if (inInput || inEditor) return;

  if (e.altKey && e.key === '1') { e.preventDefault(); switchTab('score'); }
  if (e.altKey && e.key === '2') { e.preventDefault(); switchTab('detect'); }
  if (e.altKey && e.key === '3') { e.preventDefault(); switchTab('tips'); }
  if (e.altKey && e.key.toLowerCase() === 't') {
    e.preventDefault();
    document.getElementById('theme-toggle').click();
  }
  if (e.key === '?') {
    const ov = document.getElementById('shortcutOverlay');
    ov.style.display = ov.style.display === 'none' ? 'flex' : 'none';
  }
  if (e.key === 'Escape') {
    document.getElementById('shortcutOverlay').style.display = 'none';
  }
});

document.getElementById('shortcutOverlay').addEventListener('click', function(e) {
  if (e.target === this) this.style.display = 'none';
});

initSessionUI();
