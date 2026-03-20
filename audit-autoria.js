#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════
 *  audit-autoria.js — Agente de Auditoria e Refatoração de UI
 *  Plataforma: Autoria — Não Copie Essa Ideia
 *
 *  USO:
 *    node audit-autoria.js                    → audita todos os .html
 *    node audit-autoria.js --fix              → aplica correções automáticas
 *    node audit-autoria.js --file pagina.html → audita um arquivo específico
 *    node audit-autoria.js --report           → gera audit-report.html navegável
 *
 *  O QUE FAZ:
 *    1. Varre todos os arquivos .html do projeto
 *    2. Detecta violações dos 7 princípios IHC
 *    3. Detecta cores/variáveis fora do padrão do design system
 *    4. Sugere (ou aplica) correções automáticas
 *    5. Gera relatório HTML navegável com score por página
 * ═══════════════════════════════════════════════════════════════════════
 */

'use strict';

const fs   = require('fs');
const path = require('path');

/* ──────────────────────────────────────────────────────────────────────
   DESIGN SYSTEM — fonte da verdade extraída do verificador.html
   Qualquer token fora desta lista é uma violação IHC #5.
   ────────────────────────────────────────────────────────────────────── */
const DESIGN_TOKENS = {
  /* Marca */
  '--bg':           '#080c12',
  '--bg-2':         '#0c1018',
  '--bg-panel':     '#0f1420',
  '--bg-card':      '#111926',
  '--bg-inset':     '#0a0e16',
  /* Acento principal */
  '--yellow':       '#f5c518',
  '--yellow-g':     'rgba(245,197,24,.12)',
  /* Ação / informação */
  '--blue':         '#2563eb',
  '--blue-2':       '#3b82f6',
  '--blue-3':       '#60a5fa',
  '--blue-dim':     'rgba(37,99,235,.16)',
  '--blue-brd':     'rgba(59,130,246,.2)',
  /* Tipografia */
  '--silver':       '#94a3b8',
  '--silver-2':     '#cbd5e1',
  '--white':        '#f1f5f9',
  /* Status semântico */
  '--status-ok':     '#22c55e',
  '--status-warn':   '#f59e0b',
  '--status-error':  '#ef4444',
  '--status-info':   '#60a5fa',
  '--status-neutral':'#94a3b8',
  /* Cor semântica (aliases) */
  '--green':        '#22c55e',
  '--green-dim':    'rgba(34,197,94,.1)',
  '--amber':        '#f59e0b',
  '--amber-dim':    'rgba(245,158,11,.1)',
  '--red':          '#ef4444',
  '--red-dim':      'rgba(239,68,68,.1)',
  /* Bordas e sombras */
  '--border':       'rgba(255,255,255,.06)',
  '--border-2':     'rgba(255,255,255,.1)',
  '--shadow-md':    '0 4px 24px rgba(0,0,0,.7)',
  /* Forma */
  '--r':   '6px',
  '--r2':  '10px',
  '--r3':  '14px',
  /* Motion */
  '--ease': '.18s cubic-bezier(.4,0,.2,1)',
  /* Tipografia */
  '--mono': "'JetBrains Mono',monospace",
};

/* Equivalências do modo claro */
const LIGHT_OVERRIDES = {
  '--bg':      '#f8fafc', '--bg-2':    '#f1f5f9',
  '--bg-panel':'#fff',    '--bg-card': '#fff',    '--bg-inset':'#f1f5f9',
  '--yellow':  '#d97706', '--yellow-g':'rgba(217,119,6,.07)',
  '--blue':    '#1d4ed8', '--blue-2':  '#2563eb', '--blue-3':'#3b82f6',
  '--silver':  '#64748b', '--silver-2':'#475569', '--white':  '#0f172a',
  '--green':   '#16a34a', '--amber':   '#d97706', '--red':    '#dc2626',
};

/* Fontes permitidas */
const ALLOWED_FONTS = ['Sora', 'DM Serif Display', 'JetBrains Mono'];

/* ──────────────────────────────────────────────────────────────────────
   REGRAS IHC — cada regra tem id, descrição, severidade e detector
   ────────────────────────────────────────────────────────────────────── */
const RULES = [

  /* ── IHC #1: ARQUITETURA DA INFORMAÇÃO ──────────────────────────── */
  {
    id: 'IHC-01-breadcrumb',
    principle: 1,
    title: 'Breadcrumb ausente em página interna',
    severity: 'high',
    check: (html, file) => {
      const isInternal = !file.includes('index') && !file.includes('login');
      if (!isInternal) return null;
      if (!html.includes('breadcrumb') && !html.includes('bc-list')) {
        return {
          message: 'Página interna sem breadcrumb. O aluno não consegue saber onde está na hierarquia.',
          fix: 'Adicionar <nav aria-label="Trilha de navegação" class="breadcrumb"> antes do <main>.',
          snippet: `<nav aria-label="Trilha de navegação" class="breadcrumb">
  <ol class="bc-list">
    <li><a href="/index.html">Catálogo</a></li>
    <li aria-current="page"><!-- nome da página atual --></li>
  </ol>
</nav>`,
        };
      }
      return null;
    },
  },

  {
    id: 'IHC-01-active-nav',
    principle: 1,
    title: 'Nenhum item de nav marcado como ativo',
    severity: 'medium',
    check: (html) => {
      if (html.includes('nav-pills') && !html.includes('class="active"') && !html.includes("class='active'")) {
        return {
          message: 'Nenhum link da navegação possui classe "active". O usuário não sabe em qual página está.',
          fix: 'Adicionar class="active" e aria-current="page" no link correspondente à página atual.',
          snippet: `<a href="/verificador.html" class="active" aria-current="page">Verificador</a>`,
        };
      }
      return null;
    },
  },

  {
    id: 'IHC-01-skip-link',
    principle: 1,
    title: 'Skip link de acessibilidade ausente',
    severity: 'medium',
    check: (html) => {
      if (!html.includes('skip-link')) {
        return {
          message: 'Sem "Pular para o conteúdo". Usuários de teclado precisam percorrer toda a nav em cada página.',
          fix: 'Adicionar skip link como primeiro elemento do <body>.',
          snippet: `<a href="#main-content" class="skip-link">Pular para o conteúdo</a>`,
        };
      }
      return null;
    },
  },

  /* ── IHC #2: VISIBILIDADE E FEEDBACK ────────────────────────────── */
  {
    id: 'IHC-02-status-indicator',
    principle: 2,
    title: 'Indicador de status ausente em página com operações assíncronas',
    severity: 'high',
    check: (html) => {
      const hasAsync = html.includes('fetch(') || html.includes('async ') || html.includes('XMLHttpRequest');
      if (hasAsync && !html.includes('sdot') && !html.includes('status-dot') && !html.includes('aria-live')) {
        return {
          message: 'Página executa operações assíncronas mas não tem indicador de status visível.',
          fix: 'Adicionar um status pill com dot colorido e aria-live="polite".',
          snippet: `<div class="status-row" role="status" aria-live="polite" aria-atomic="true">
  <div class="sdot idle" id="sdot" aria-hidden="true"></div>
  <span id="stxt">Pronto</span>
</div>`,
        };
      }
      return null;
    },
  },

  {
    id: 'IHC-02-no-toast',
    principle: 2,
    title: 'Sem sistema de notificação (toast) para feedback de ações',
    severity: 'high',
    check: (html) => {
      const hasActions = html.includes('fetch(') || html.includes('form') || html.includes('submit');
      if (hasActions && !html.includes('toast') && !html.includes('alert(')) {
        return {
          message: 'Página tem ações mas não importa o sistema de toast. O usuário não recebe confirmação visual.',
          fix: 'Importar /js/toast.js e usar toast.success() / toast.error() após cada operação.',
          snippet: `<script type="module" src="/js/toast.js"></script>
<!-- Uso: toast.success('Matriculado!') | toast.error('Erro humanizado') -->`,
        };
      }
      return null;
    },
  },

  {
    id: 'IHC-02-loading-state',
    principle: 2,
    title: 'Botão de ação sem estado de loading',
    severity: 'medium',
    check: (html) => {
      const hasSubmit = html.includes('btn-primary') || html.includes('btn-y') || html.includes('analyze-btn');
      const hasLoading = html.includes('loading') || html.includes('spinner') || html.includes('disabled');
      if (hasSubmit && !hasLoading) {
        return {
          message: 'Botão de ação não tem estado de loading. Usuário pode clicar várias vezes sem feedback.',
          fix: 'Usar withLoading() do /js/utils.js ou adicionar .disabled + spinner manualmente.',
          snippet: `// js/utils.js — withLoading guard
async function handler() {
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Aguarde...';
  try { await minhaOperacao(); }
  finally { btn.disabled = false; btn.innerHTML = textoOriginal; }
}`,
        };
      }
      return null;
    },
  },

  {
    id: 'IHC-02-skeleton',
    principle: 2,
    title: 'Sem skeleton loading em conteúdo dinâmico',
    severity: 'low',
    check: (html) => {
      const hasDynamic = html.includes('Carregando') || html.includes('loading-state') || html.includes('innerHTML');
      if (hasDynamic && !html.includes('skeleton') && !html.includes('shimmer')) {
        return {
          message: 'Conteúdo dinâmico exibe texto "Carregando..." em vez de skeleton com shimmer.',
          fix: 'Substituir textos de carregamento por elementos .skeleton.sk-card.',
          snippet: `<!-- Skeleton para lista de turmas -->
<div class="skeleton sk-card"></div>
<div class="skeleton sk-card"></div>
<div class="skeleton sk-card"></div>
/* CSS (em style.css): */
.skeleton { background: linear-gradient(90deg,
  rgba(255,255,255,.04) 0%, rgba(255,255,255,.09) 50%,
  rgba(255,255,255,.04) 100%);
  background-size: 200% 100%;
  animation: shimmer 1.4s ease infinite;
  border-radius: 6px; }
@keyframes shimmer {
  0%{background-position:200% 0} 100%{background-position:-200% 0} }`,
        };
      }
      return null;
    },
  },

  /* ── IHC #3: CONTROLE E PREVENÇÃO ───────────────────────────────── */
  {
    id: 'IHC-03-no-confirm',
    principle: 3,
    title: 'Ação destrutiva sem confirmação',
    severity: 'high',
    check: (html) => {
      const destructive = /cancel|delet|remov|exclu|sair|logout/i.test(html);
      const hasConfirm = html.includes('confirmar(') || html.includes('confirm(') || html.includes('modal');
      if (destructive && !hasConfirm) {
        return {
          message: 'Página tem ações destrutivas (cancelar/excluir/sair) sem diálogo de confirmação.',
          fix: 'Usar confirmar() do /js/confirm.js antes de executar ações irreversíveis.',
          snippet: `const ok = await confirmar({
  titulo: 'Cancelar matrícula?',
  mensagem: 'Você perderá acesso aos materiais. Esta ação não pode ser desfeita.',
  labelOk: 'Sim, cancelar',
  tipo: 'danger'
});
if (ok) await cancelarMatricula(id);`,
        };
      }
      return null;
    },
  },

  {
    id: 'IHC-03-focus-visible',
    principle: 3,
    title: 'Ausência de :focus-visible para navegação por teclado',
    severity: 'medium',
    check: (html) => {
      if (!html.includes('focus-visible') && !html.includes(':focus')) {
        return {
          message: 'Sem estilo de foco visível. Usuários de teclado não sabem qual elemento está ativo.',
          fix: 'Adicionar :focus-visible no style.css.',
          snippet: `:focus-visible {
  outline: 2px solid var(--yellow);
  outline-offset: 3px;
  border-radius: 4px;
}`,
        };
      }
      return null;
    },
  },

  /* ── IHC #4: MENSAGENS DE ERRO ──────────────────────────────────── */
  {
    id: 'IHC-04-raw-error',
    principle: 4,
    title: 'Mensagem de erro técnica exposta ao usuário',
    severity: 'critical',
    check: (html) => {
      const techPatterns = [
        /err\.message/,
        /error\.stack/,
        /ER_DUP_ENTRY/,
        /ECONNREFUSED/,
        /500 Internal/,
        /jwt malformed/,
        /res\.json\(\s*\{\s*error\s*:\s*err/,
        /res\.json\(\s*err/,
      ];
      const found = techPatterns.find(p => p.test(html));
      if (found) {
        return {
          message: `Mensagem técnica pode vazar ao usuário (padrão: ${found}). Violação crítica de IHC #4.`,
          fix: 'Usar errorHandler.js centralizado. NUNCA enviar err.message ou err.stack ao cliente.',
          snippet: `// ERRADO:
res.json({ error: err.message });

// CERTO — usar catálogo humanizado:
const ERROS = {
  'ER_DUP_ENTRY': 'Este registro já existe.',
  'TokenExpiredError': 'Sessão expirada. Faça login novamente.',
};
res.status(400).json({ erro: ERROS[err.code] || 'Erro inesperado. Tente novamente.' });`,
        };
      }
      return null;
    },
  },

  {
    id: 'IHC-04-alert-error',
    principle: 4,
    title: 'Uso de alert() para mensagens de erro',
    severity: 'high',
    check: (html) => {
      if (/alert\s*\(/.test(html)) {
        return {
          message: 'alert() bloqueia a thread e tem aparência nativa — fora do padrão visual da plataforma.',
          fix: 'Substituir alert() por toast.error() ou toast.warn().',
          snippet: `// ERRADO:
alert('Erro ao salvar!');

// CERTO:
toast.error('Não foi possível salvar. Tente novamente.');`,
        };
      }
      return null;
    },
  },

  /* ── IHC #5: CONSISTÊNCIA ───────────────────────────────────────── */
  {
    id: 'IHC-05-hardcoded-color',
    principle: 5,
    title: 'Cor hex avulsa (fora do design system)',
    severity: 'medium',
    check: (html) => {
      // Detecta hex colors que não estão dentro de uma definição de variável CSS
      const lines = html.split('\n');
      const violations = [];
      const allowedInTokenDef = /--[\w-]+\s*:\s*#/;
      lines.forEach((line, i) => {
        if (allowedInTokenDef.test(line)) return; // é definição de token — ok
        const hexMatch = line.match(/#[0-9a-fA-F]{3,6}\b/g);
        if (hexMatch) {
          hexMatch.forEach(hex => {
            // Verifica se é um valor oficial do design system
            const isToken = Object.values(DESIGN_TOKENS).includes(hex) ||
                            Object.values(LIGHT_OVERRIDES).includes(hex);
            if (!isToken) {
              violations.push(`Linha ${i+1}: ${hex.trim()}`);
            }
          });
        }
      });
      if (violations.length > 0) {
        return {
          message: `${violations.length} cor(es) hex fora do design system: ${violations.slice(0,3).join(', ')}${violations.length > 3 ? '...' : ''}`,
          fix: 'Substituir cores avulsas pelos tokens CSS do design system (var(--yellow), var(--blue-3), etc.).',
          snippet: `/* ERRADO: */  color: #f5c518;
/* CERTO:  */  color: var(--yellow);

/* ERRADO: */  background: #22c55e;
/* CERTO:  */  background: var(--status-ok);`,
        };
      }
      return null;
    },
  },

  {
    id: 'IHC-05-wrong-terminology',
    principle: 5,
    title: 'Terminologia inconsistente (Sala, Grupo, Lição...)',
    severity: 'medium',
    check: (html) => {
      const banned = [
        { word: /\bSala de Aula Virtual\b/i, use: 'Sala Virtual' },
        { word: /\bGrupo\b/i,  use: 'Turma' },
        { word: /\bLição\b/i,  use: 'Aula' },
        { word: /\bUnidade\b/i, use: 'Módulo' },
        { word: /\bInscrever\b/i, use: 'Matricular' },
        { word: /\bCapítulo\b/i, use: 'Módulo' },
        { word: /\bCertificação\b/i, use: 'Certificado' },
      ];
      const found = banned.filter(b => b.word.test(html));
      if (found.length > 0) {
        const list = found.map(f => `"${f.word.source.replace(/\\b/g,'')}" → usar "${f.use}"`).join(', ');
        return {
          message: `Terminologia inconsistente detectada: ${list}`,
          fix: 'Padronizar conforme tabela de terminologia do guia IHC (seção 05).',
          snippet: `/* Vocabulário oficial da plataforma:
   ✅ Turma  (não: Sala, Grupo, Classe)
   ✅ Módulo (não: Unidade, Capítulo)
   ✅ Aula   (não: Lição, Vídeo, Conteúdo)
   ✅ Matricular (não: Inscrever, Entrar)
   ✅ Sala Virtual (não: Área do Aluno, Dashboard)
   ✅ Certificado (não: Diploma, Certificação) */`,
        };
      }
      return null;
    },
  },

  {
    id: 'IHC-05-missing-light-mode',
    principle: 5,
    title: 'Página sem suporte a modo claro (.light-mode)',
    severity: 'medium',
    check: (html) => {
      if (!html.includes('light-mode') && !html.includes('light_mode')) {
        return {
          message: 'Página não implementa .light-mode. O toggle de tema não funciona nela.',
          fix: 'Adicionar bloco .light-mode { } no <style> com os overrides das variáveis.',
          snippet: `.light-mode {
  --bg: #f8fafc; --bg-2: #f1f5f9;
  --bg-panel: #fff; --bg-card: #fff; --bg-inset: #f1f5f9;
  --yellow: #d97706; --yellow-g: rgba(217,119,6,.07);
  --blue: #1d4ed8; --blue-2: #2563eb; --blue-3: #3b82f6;
  --silver: #64748b; --silver-2: #475569; --white: #0f172a;
  --border: rgba(0,0,0,.07); --border-2: rgba(0,0,0,.11);
}`,
        };
      }
      return null;
    },
  },

  {
    id: 'IHC-05-wrong-font',
    principle: 5,
    title: 'Fonte não padronizada',
    severity: 'low',
    check: (html) => {
      const bannedFonts = ['Inter', 'Roboto', 'Arial', 'Helvetica', 'system-ui'];
      const found = bannedFonts.filter(f => html.includes(f));
      if (found.length > 0) {
        return {
          message: `Fonte(s) não autorizada(s): ${found.join(', ')}. Usar apenas Sora, DM Serif Display, JetBrains Mono.`,
          fix: 'Substituir imports e declarações font-family pelas fontes oficiais do projeto.',
          snippet: `<!-- Import correto no <head> -->
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&family=DM+Serif+Display:ital@0;1&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">

/* CSS */
body { font-family: 'Sora', sans-serif; }
code, pre, .mono { font-family: 'JetBrains Mono', monospace; }
h1, .display { font-family: 'DM Serif Display', serif; }`,
        };
      }
      return null;
    },
  },

  {
    id: 'IHC-05-no-design-tokens',
    principle: 5,
    title: 'Design tokens do sistema ausentes no <style>',
    severity: 'high',
    check: (html) => {
      const requiredTokens = ['--bg', '--yellow', '--blue', '--silver', '--status-ok', '--ease'];
      const missing = requiredTokens.filter(t => !html.includes(t));
      if (missing.length > 2) {
        return {
          message: `Tokens essenciais ausentes: ${missing.join(', ')}. O design system não está aplicado.`,
          fix: 'Adicionar o bloco :root { } completo com todos os tokens no início do <style> ou importar style.css.',
          snippet: `/* Adicionar no início do <style> ou verificar se style.css é importado */
:root {
  --bg: #080c12; --bg-2: #0c1018; --bg-panel: #0f1420;
  --yellow: #f5c518; --blue: #2563eb; --blue-3: #60a5fa;
  --status-ok: #22c55e; --status-warn: #f59e0b; --status-error: #ef4444;
  --silver: #94a3b8; --white: #f1f5f9;
  --ease: .18s cubic-bezier(.4,0,.2,1);
  --mono: 'JetBrains Mono', monospace;
}`,
        };
      }
      return null;
    },
  },

  /* ── IHC #6: PERFORMANCE ─────────────────────────────────────────── */
  {
    id: 'IHC-06-missing-indexes',
    principle: 6,
    title: 'Consulta SQL sem índice aparente',
    severity: 'high',
    check: (html) => {
      const hasQuery = /SELECT\s+.+\s+FROM\s+\w+\s+WHERE/is.test(html);
      const hasIndex = /INDEX|index/i.test(html);
      if (hasQuery && !hasIndex) {
        return {
          message: 'Query SQL detectada sem menção a índice. Consultas em tabelas grandes sem índice causam lentidão.',
          fix: 'Verificar se as colunas em WHERE, JOIN ON e ORDER BY têm índices no MySQL.',
          snippet: `-- Verificar e adicionar índices nas colunas mais consultadas:
ALTER TABLE matriculas
  ADD INDEX idx_matriculas_aluno_status (aluno_id, status);
ALTER TABLE progresso
  ADD INDEX idx_progresso_aluno_turma (aluno_id, turma_id);
-- Usar EXPLAIN SELECT ... para confirmar uso do índice.`,
        };
      }
      return null;
    },
  },

  {
    id: 'IHC-06-inline-heavy-css',
    principle: 6,
    title: 'CSS pesado inline em vez de classe reutilizável',
    severity: 'low',
    check: (html) => {
      const inlineMatches = html.match(/style="[^"]{120,}"/g);
      if (inlineMatches && inlineMatches.length > 3) {
        return {
          message: `${inlineMatches.length} elementos com style inline longo (>120 chars). Aumenta tamanho do HTML e dificulta manutenção.`,
          fix: 'Mover estilos repetidos para classes CSS reutilizáveis em style.css.',
          snippet: `/* ERRADO: style="display:flex;align-items:center;gap:10px;padding:12px 16px;..." */
/* CERTO:  class="welcome-left" + regra em style.css */

.welcome-left {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
}`,
        };
      }
      return null;
    },
  },

  /* ── IHC #7: ACESSIBILIDADE E ATALHOS ───────────────────────────── */
  {
    id: 'IHC-07-missing-aria',
    principle: 7,
    title: 'Botões de ícone sem aria-label',
    severity: 'high',
    check: (html) => {
      // Detecta botões que parecem ter só emoji/ícone sem aria-label
      const iconButtons = html.match(/<button[^>]*>[\s]*[🔔🔍✕×📎🌙☀️⚡↩↪][^<]*<\/button>/g) || [];
      const withoutAria = iconButtons.filter(b => !b.includes('aria-label'));
      if (withoutAria.length > 0) {
        return {
          message: `${withoutAria.length} botão(ões) com ícone sem aria-label. Inacessível para leitores de tela.`,
          fix: 'Adicionar aria-label descritivo em todos os botões que contêm apenas ícone.',
          snippet: `<!-- ERRADO: -->
<button class="nav-bell">🔔</button>

<!-- CERTO: -->
<button class="nav-bell" aria-label="Notificações (3 não lidas)" title="Notificações">
  🔔
</button>`,
        };
      }
      return null;
    },
  },

  {
    id: 'IHC-07-no-shortcuts',
    principle: 7,
    title: 'Página interativa sem atalhos de teclado',
    severity: 'low',
    check: (html) => {
      const isInteractive = html.includes('fetch(') || html.includes('form') || html.includes('btnAnalyze');
      if (isInteractive && !html.includes('keydown') && !html.includes('shortcut')) {
        return {
          message: 'Página interativa sem suporte a atalhos de teclado. Usuários experientes perdem eficiência.',
          fix: 'Importar /js/shortcuts.js ou adicionar listener de keydown com os atalhos padrão do projeto.',
          snippet: `// shortcuts mínimos para páginas interativas
document.addEventListener('keydown', e => {
  if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
  if (e.key === '?') mostrarAjuda();
  if ((e.ctrlKey||e.metaKey) && e.key === 'Enter') analisar();
  if (e.key === 'Escape') fecharModais();
});`,
        };
      }
      return null;
    },
  },

  {
    id: 'IHC-07-missing-lang',
    principle: 7,
    title: 'Atributo lang ausente no <html>',
    severity: 'high',
    check: (html) => {
      if (!/<html[^>]+lang=/i.test(html)) {
        return {
          message: 'Tag <html> sem atributo lang. Leitores de tela não sabem o idioma do conteúdo.',
          fix: 'Adicionar lang="pt-BR" na tag <html>.',
          snippet: `<html lang="pt-BR">`,
        };
      }
      return null;
    },
  },

  {
    id: 'IHC-07-main-landmark',
    principle: 7,
    title: 'Falta landmark <main> ou role="main"',
    severity: 'medium',
    check: (html) => {
      if (!html.includes('<main') && !html.includes('role="main"')) {
        return {
          message: 'Página sem elemento <main>. Leitores de tela não conseguem navegar para o conteúdo principal.',
          fix: 'Envolver o conteúdo principal em <main id="main-content">.',
          snippet: `<main id="main-content" role="main">
  <!-- conteúdo principal da página -->
</main>`,
        };
      }
      return null;
    },
  },
];

/* ══════════════════════════════════════════════════════════════════════
   MOTOR DE AUDITORIA
   ══════════════════════════════════════════════════════════════════════ */

/**
 * Audita um único arquivo HTML.
 * @param {string} filePath
 * @returns {{ file, violations, score, passed, total }}
 */
function auditFile(filePath) {
  const html = fs.readFileSync(filePath, 'utf8');
  const fileName = path.basename(filePath);
  const violations = [];

  RULES.forEach(rule => {
    try {
      const result = rule.check(html, fileName);
      if (result) {
        violations.push({
          ...rule,
          ...result,
        });
      }
    } catch (e) {
      // regra não aplicável — ignorar
    }
  });

  const critical = violations.filter(v => v.severity === 'critical').length;
  const high     = violations.filter(v => v.severity === 'high').length;
  const medium   = violations.filter(v => v.severity === 'medium').length;
  const low      = violations.filter(v => v.severity === 'low').length;

  // Score: começa em 100, penalidades por severidade
  const score = Math.max(0,
    100 - (critical * 25) - (high * 10) - (medium * 5) - (low * 2)
  );

  return {
    file: filePath,
    fileName,
    violations,
    score,
    counts: { critical, high, medium, low },
    passed: RULES.length - violations.length,
    total: RULES.length,
  };
}

/* ══════════════════════════════════════════════════════════════════════
   CORREÇÕES AUTOMÁTICAS SEGURAS (--fix)
   Só aplica patches que não quebram funcionalidade.
   ══════════════════════════════════════════════════════════════════════ */
function autoFix(filePath, violations) {
  let html = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  violations.forEach(v => {
    switch (v.id) {
      /* Adiciona lang="pt-BR" se ausente */
      case 'IHC-07-missing-lang':
        if (!/<html[^>]+lang=/i.test(html)) {
          html = html.replace(/^<html(\s|>)/m, '<html lang="pt-BR"$1');
          changed = true;
        }
        break;

      /* Adiciona toast-container se ausente e há toast no JS */
      case 'IHC-02-no-toast':
        if (!html.includes('toast-container') && !html.includes('id="toast-container"')) {
          html = html.replace('</body>',
            `<div id="toast-container" role="status" aria-live="polite" style="position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column-reverse;gap:10px;pointer-events:none;"></div>\n</body>`
          );
          changed = true;
        }
        break;

      /* Adiciona :focus-visible se ausente */
      case 'IHC-03-focus-visible':
        if (!html.includes(':focus-visible')) {
          html = html.replace('</style>',
            `\n/* IHC #3: focus ring para navegação por teclado */\n:focus-visible { outline: 2px solid var(--yellow, #f5c518); outline-offset: 3px; border-radius: 4px; }\n</style>`
          );
          changed = true;
        }
        break;

      /* Adiciona skip link */
      case 'IHC-01-skip-link':
        if (!html.includes('skip-link')) {
          html = html.replace('<body>',
            `<body>\n<a href="#main-content" class="skip-link" style="position:absolute;top:-100px;left:16px;z-index:99999;padding:8px 16px;border-radius:6px;background:var(--yellow,#f5c518);color:#000;font-weight:700;font-size:13px;transition:top .2s;" onfocus="this.style.top='16px'" onblur="this.style.top='-100px'">Pular para o conteúdo</a>`
          );
          changed = true;
        }
        break;
    }
  });

  if (changed) {
    // Backup antes de sobrescrever
    fs.writeFileSync(filePath + '.bak', fs.readFileSync(filePath));
    fs.writeFileSync(filePath, html);
    return true;
  }
  return false;
}

/* ══════════════════════════════════════════════════════════════════════
   GERADOR DE RELATÓRIO HTML
   ══════════════════════════════════════════════════════════════════════ */
function generateReport(results) {
  const totalViolations = results.reduce((s, r) => s + r.violations.length, 0);
  const avgScore = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length);
  const severityColor = { critical:'#ef4444', high:'#f59e0b', medium:'#60a5fa', low:'#94a3b8' };
  const principleNames = {
    1:'Arquitetura da Informação', 2:'Visibilidade e Feedback',
    3:'Controle e Prevenção',       4:'Mensagens de Erro',
    5:'Consistência',               6:'Simplicidade e Performance',
    7:'Flexibilidade e Atalhos',
  };

  const fileCards = results.map(r => {
    const scoreColor = r.score >= 80 ? '#22c55e' : r.score >= 60 ? '#f59e0b' : '#ef4444';
    const violHtml = r.violations.map(v => `
      <div style="border:1px solid rgba(255,255,255,.08);border-left:3px solid ${severityColor[v.severity]};border-radius:8px;padding:12px 16px;margin-bottom:8px;background:#111926;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <span style="font-family:monospace;font-size:10px;padding:2px 7px;border-radius:3px;background:${severityColor[v.severity]}22;color:${severityColor[v.severity]};border:1px solid ${severityColor[v.severity]}44;font-weight:700;text-transform:uppercase;">${v.severity}</span>
          <span style="font-family:monospace;font-size:10px;color:#94a3b8;">IHC-0${v.principle} · ${v.id}</span>
        </div>
        <div style="font-size:13.5px;font-weight:600;color:#f1f5f9;margin-bottom:4px;">${v.title}</div>
        <div style="font-size:12.5px;color:#94a3b8;margin-bottom:8px;line-height:1.6;">${v.message}</div>
        <div style="font-size:12px;color:#60a5fa;margin-bottom:8px;">💡 ${v.fix}</div>
        <details>
          <summary style="font-family:monospace;font-size:10.5px;color:#94a3b8;cursor:pointer;">Ver snippet de correção</summary>
          <pre style="margin-top:8px;padding:10px;background:#0a0e16;border-radius:6px;font-size:11.5px;color:#a78bfa;overflow-x:auto;white-space:pre-wrap;">${v.snippet.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
        </details>
      </div>`).join('');

    return `
      <div id="file-${r.fileName.replace(/\W/g,'-')}" style="background:#0c1018;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:24px;margin-bottom:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,.07);">
          <div>
            <div style="font-size:15px;font-weight:700;color:#f1f5f9;">${r.fileName}</div>
            <div style="font-size:11.5px;color:#94a3b8;margin-top:2px;">${r.passed}/${r.total} regras aprovadas · ${r.violations.length} violação(ões)</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:28px;font-weight:700;color:${scoreColor};line-height:1;">${r.score}</div>
            <div style="font-family:monospace;font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:.8px;">score</div>
          </div>
        </div>
        ${r.violations.length === 0
          ? '<div style="text-align:center;padding:20px;color:#22c55e;font-size:13px;">✅ Nenhuma violação detectada nesta página!</div>'
          : violHtml}
      </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Relatório IHC — Autoria Platform</title>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Sora',sans-serif; background:#080c12; color:#cbd5e1; padding:32px; -webkit-font-smoothing:antialiased; }
summary { cursor:pointer; }
details[open] summary { color:#f1f5f9; }
</style>
</head>
<body>
<div style="max-width:900px;margin:0 auto;">
  <!-- Header -->
  <div style="margin-bottom:32px;">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
      <div style="width:32px;height:32px;border-radius:8px;background:#f5c518;display:flex;align-items:center;justify-content:center;font-size:16px;">🧠</div>
      <div>
        <div style="font-size:14px;font-weight:700;color:#f1f5f9;">Autoria</div>
        <div style="font-size:8px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#94a3b8;">NÃO COPIE ESSA IDEIA</div>
      </div>
    </div>
    <h1 style="font-size:28px;font-weight:700;color:#f1f5f9;margin-bottom:6px;">Relatório de Auditoria IHC</h1>
    <p style="font-size:13px;color:#94a3b8;">Gerado em: ${new Date().toLocaleString('pt-BR')} · ${results.length} páginas auditadas</p>
  </div>

  <!-- Summary cards -->
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:28px;">
    <div style="background:#0f1420;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:16px;text-align:center;">
      <div style="font-size:30px;font-weight:700;color:${avgScore>=80?'#22c55e':avgScore>=60?'#f59e0b':'#ef4444'}">${avgScore}</div>
      <div style="font-family:monospace;font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.8px;margin-top:4px;">Score médio</div>
    </div>
    <div style="background:#0f1420;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:16px;text-align:center;">
      <div style="font-size:30px;font-weight:700;color:#f1f5f9;">${results.length}</div>
      <div style="font-family:monospace;font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.8px;margin-top:4px;">Páginas</div>
    </div>
    <div style="background:#0f1420;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:16px;text-align:center;">
      <div style="font-size:30px;font-weight:700;color:#ef4444;">${totalViolations}</div>
      <div style="font-family:monospace;font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.8px;margin-top:4px;">Violações</div>
    </div>
    <div style="background:#0f1420;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:16px;text-align:center;">
      <div style="font-size:30px;font-weight:700;color:#22c55e;">${results.reduce((s,r)=>s+r.passed,0)}</div>
      <div style="font-family:monospace;font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.8px;margin-top:4px;">Aprovadas</div>
    </div>
  </div>

  <!-- File index -->
  <div style="background:#0f1420;border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:16px;margin-bottom:24px;">
    <div style="font-family:monospace;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#f5c518;margin-bottom:12px;">Índice de páginas</div>
    ${results.map(r => {
      const sc = r.score >= 80 ? '#22c55e' : r.score >= 60 ? '#f59e0b' : '#ef4444';
      return `<a href="#file-${r.fileName.replace(/\W/g,'-')}" style="display:flex;align-items:center;justify-content:space-between;padding:7px 10px;border-radius:7px;text-decoration:none;transition:background .15s;" onmouseover="this.style.background='rgba(255,255,255,.04)'" onmouseout="this.style.background='transparent'">
        <span style="font-size:13px;color:#f1f5f9;">${r.fileName}</span>
        <span style="font-family:monospace;font-size:12px;font-weight:700;color:${sc};">${r.score} · ${r.violations.length} violação(ões)</span>
      </a>`;
    }).join('')}
  </div>

  <!-- File results -->
  ${fileCards}
</div>
</body>
</html>`;
}

/* ══════════════════════════════════════════════════════════════════════
   CLI — PONTO DE ENTRADA
   ══════════════════════════════════════════════════════════════════════ */
function main() {
  const args    = process.argv.slice(2);
  const doFix   = args.includes('--fix');
  const doReport= args.includes('--report');
  const fileArg = args.find(a => a === '--file') ? args[args.indexOf('--file') + 1] : null;

  /* Coletar arquivos */
  let files = [];
  if (fileArg) {
    files = [path.resolve(fileArg)];
  } else {
    /* Busca recursiva por .html, ignora node_modules, dist, .git */
    function walkDir(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      entries.forEach(e => {
        const full = path.join(dir, e.name);
        if (e.isDirectory() && !['node_modules','dist','.git','bak'].includes(e.name)) walkDir(full);
        else if (e.isFile() && e.name.endsWith('.html') && !e.name.endsWith('.bak')) files.push(full);
      });
    }
    walkDir(process.cwd());
  }

  if (files.length === 0) {
    console.log('\n⚠️  Nenhum arquivo .html encontrado. Execute na raiz do projeto.\n');
    process.exit(0);
  }

  /* Auditar */
  console.log('\n' + '═'.repeat(62));
  console.log('  🧠  Autoria — Auditor IHC & Design System');
  console.log('═'.repeat(62));
  console.log(`  Analisando ${files.length} arquivo(s)...\n`);

  const results = [];

  files.forEach(file => {
    const result = auditFile(file);
    results.push(result);

    /* Output no terminal */
    const sc = result.score;
    const icon = sc >= 80 ? '✅' : sc >= 60 ? '⚠️ ' : '❌';
    console.log(`  ${icon} ${result.fileName.padEnd(32)} Score: ${String(sc).padStart(3)} | ${result.violations.length} violação(ões)`);

    if (result.counts.critical > 0) {
      console.log(`     🚨 ${result.counts.critical} CRÍTICA(S) — corrigir imediatamente`);
    }

    /* Aplicar correções automáticas se --fix */
    if (doFix && result.violations.length > 0) {
      const fixed = autoFix(file, result.violations);
      if (fixed) console.log(`     🔧 Correções automáticas aplicadas. Backup: ${result.fileName}.bak`);
    }
  });

  /* Sumário */
  const totalV   = results.reduce((s, r) => s + r.violations.length, 0);
  const critical = results.reduce((s, r) => s + r.counts.critical, 0);
  const high     = results.reduce((s, r) => s + r.counts.high, 0);
  const avgScore = Math.round(results.reduce((s, r) => s + r.score, 0) / results.length);

  console.log('\n' + '─'.repeat(62));
  console.log(`  Score médio: ${avgScore}/100`);
  console.log(`  Total de violações: ${totalV}`);
  if (critical) console.log(`  🚨 Críticas: ${critical} — precisam de correção urgente`);
  if (high)     console.log(`  ⚠️  Altas: ${high}`);

  /* Gerar relatório HTML se --report */
  if (doReport) {
    const reportPath = path.join(process.cwd(), 'audit-report.html');
    fs.writeFileSync(reportPath, generateReport(results));
    console.log(`\n  📄 Relatório gerado: ${reportPath}`);
  }

  if (!doFix) {
    console.log('\n  💡 Dica: rode com --fix para aplicar correções automáticas seguras.');
  }
  if (!doReport) {
    console.log('  💡 Dica: rode com --report para gerar audit-report.html navegável.');
  }
  console.log('\n' + '═'.repeat(62) + '\n');
}

main();

/* ══════════════════════════════════════════════════════════════════════
   REFERÊNCIA RÁPIDA PARA O AGENTE
   ══════════════════════════════════════════════════════════════════════

   CORES DO DESIGN SYSTEM — usar SEMPRE via variável CSS, nunca hex avulso:

   DARK MODE (padrão):
     --bg: #080c12          → fundo da página
     --bg-2: #0c1018        → fundo de nav/topbar
     --bg-panel: #0f1420    → fundo de painéis
     --bg-card: #111926     → fundo de cards
     --bg-inset: #0a0e16    → fundo de inputs/code blocks
     --yellow: #f5c518      → ÚNICO acento de marca (nav ativo, botão principal)
     --blue: #2563eb        → ação secundária, dados
     --blue-2: #3b82f6      → hover do blue
     --blue-3: #60a5fa      → destaque, links
     --silver: #94a3b8      → muted text, labels
     --silver-2: #cbd5e1    → texto corrido
     --white: #f1f5f9       → títulos, ênfase
     --status-ok: #22c55e   → sucesso, aprovado, aberto
     --status-warn: #f59e0b → atenção, paráfrase, em breve
     --status-error: #ef4444→ erro, plágio, bloqueado
     --status-info: #60a5fa → informação neutra
     --border: rgba(255,255,255,.06)
     --border-2: rgba(255,255,255,.1)

   LIGHT MODE (.light-mode):
     --bg: #f8fafc          → fundo claro frio (não branco puro)
     --yellow: #d97706      → ocre (mais legível no claro)
     --blue: #1d4ed8
     --white: #0f172a       → texto escuro no modo claro
     (demais variáveis sobrescritas no bloco .light-mode {})

   FONTES OFICIAIS:
     Body:    'Sora', sans-serif
     Display: 'DM Serif Display', serif
     Code:    'JetBrains Mono', monospace

   PADRÕES OBRIGATÓRIOS EM TODA PÁGINA:
     ✅ <html lang="pt-BR">
     ✅ <a href="#main-content" class="skip-link">Pular para o conteúdo</a>
     ✅ <main id="main-content">
     ✅ <div id="toast-container" role="status" aria-live="polite">
     ✅ Bloco :root { } com todos os tokens (ou <link> para style.css)
     ✅ Bloco .light-mode { } com overrides
     ✅ :focus-visible { outline: 2px solid var(--yellow); }
     ✅ Nav com item .active + aria-current="page"
     ✅ Botões de ícone com aria-label
     ✅ Ações destrutivas com confirmar() antes de executar
     ✅ fetch() com tratamento de erro humanizado (sem err.message ao usuário)
     ✅ Skeleton em vez de "Carregando..." para conteúdo dinâmico

   TERMINOLOGIA OFICIAL (IHC #5):
     Turma       (não: Sala, Grupo, Classe)
     Módulo      (não: Unidade, Capítulo, Seção)
     Aula        (não: Lição, Vídeo, Conteúdo)
     Matricular  (não: Inscrever, Entrar)
     Sala Virtual(não: Área do Aluno, Dashboard)
     Certificado (não: Diploma, Certificação)
   ══════════════════════════════════════════════════════════════════════ */