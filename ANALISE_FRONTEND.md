# 📋 Análise e Melhorias do Frontend

## 1. VISÃO GERAL

A plataforma possui um frontend estático (HTML/CSS/JS vanilla) bem estruturado, servido pelo Express. O design é moderno (dark mode, glassmorphism), responsivo e acessível. Porém, existem oportunidades significativas de melhoria em maintainability, performance, segurança e UX.

### Estatísticas
- **Arquivos HTML**: 10 páginas estáticas
- **CSS**: 1 arquivo monolítico (~820 linhas)
- **JavaScript**: 12 arquivos (~1600 linhas) sem framework
- **Autenticação**: JWT via localStorage
- **Comunicação**: Fetch API pura

---

## 2. PONTOS FORTES ✅

### 2.1 Arquitetura & Qualidade
- ✅ HTML semântico com `aria-labels` e `role="status"`
- ✅ Design moderno com CSS Grid/Flexbox e variáveis CSS
- ✅ Módulos ES6 com `import/export` (não é spaghetti code global)
- ✅ Tratamento de estados (loading, empty, error) em muitos fluxos
- ✅ Feedback visual com badges (status de turmas)
- ✅ Validações básicas no frontend (CPF, email, senha forte)

### 2.2 UX/UI
- ✅ Design consistente em todas as páginas (tema dark-mode acessível)
- ✅ Mensagens contextuais para usuários (motivos de redirecionamento via query params)
- ✅ Links de volta e navegação clara
- ✅ Indicadores de carregamento

### 2.3 Segurança Básica
- ✅ Validação de roles no frontend (redundância - o backend já valida)
- ✅ Limpeza de token em caso de 401
- ✅ Proteção de rotas com `requireRole()` e `requireAuth()`

---

## 3. PROBLEMAS & OPORTUNIDADES 🎯

### 3.1 REPETIÇÃO DE CÓDIGO - CRÍTICO 🔴
**Severidade**: ALTA | **Impacto**: Maintainability

#### Problema
Código duplicado em múltiplos arquivos:
- `formatarStatusTurma()` está em `script.js`, `sala-virtual.js`, `professor.js`
- `configurarLogout()` em `script.js`, `sala-virtual.js`, `professor.js`, `professor-turma.js`
- `carregarSessaoUsuario()` em múltiplas páginas (com variações)
- Padrão de fetch + tratamento de erro + renderização

#### Exemplo
```javascript
// script.js (linhas 3-11)
function formatarStatusTurma(status) {
    const texto = String(status || '').trim();
    const upper = texto.toUpperCase();
    if (upper.includes('ABERTA')) return 'badge badge--success';
    // ... (mesmo código em sala-virtual.js, professor.js)
}
```

#### Proposta de Melhoria
**Criar `src/public/js/utils.js` com funções compartilhadas:**
```javascript
// utils.js
export function formatarStatusTurma(status) { /* ... */ }
export function formatarData(data) { /* ... */ }
export function limparCpf(cpf) { /* ... */ }
export function senhaEhForte(senha) { /* ... */ }

// Usar em qualquer arquivo
import { formatarStatusTurma, formatarData } from './utils.js';
```

**Impacto**: -200 linhas de código, +1 arquivo utilitário

---

### 3.2 VULNERABILIDADE XSS - CRÍTICO 🔴
**Severidade**: ALTA | **Impacto**: Segurança

#### Problema
Uso de `innerHTML` com dados dinâmicos sem sanitização:

```javascript
// script.js:102, sala-virtual.js:82, professor.js:52
item.innerHTML = `
    <span class="card-item__title">${curso.nome_curso}</span>
    <p class="card-item__description">${curso.descricao || '...'}</p>
`;
```

Se alguém alterar o banco com `"<img src=x onerror='alert(1)'>"`, será executado.

#### Proposta de Melhoria
**Opção A - Usar `textContent` + `createElement`:**
```javascript
const title = document.createElement('span');
title.classList.add('card-item__title');
title.textContent = curso.nome_curso; // textContent é seguro
item.appendChild(title);
```

**Opção B - Usar função sanitizadora:**
```javascript
// utils.js
export function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

// Uso
item.innerHTML = `<span>${escapeHtml(curso.nome_curso)}</span>`;
```

**Opção C - Web Components with Shadow DOM (mais moderno):**
```javascript
class CourseCard extends HTMLElement {
    set data(curso) {
        this.shadowRoot.querySelector('.title').textContent = curso.nome_curso;
    }
}
```

**Recomendação**: Opção A ou B (simples + safe), considerar C para refatoração futura.

---

### 3.3 FALTA DE ABSTRAÇÃO NA COMUNICAÇÃO COM API 🟡
**Severidade**: MÉDIA | **Impacto**: Maintainability + Performance

#### Problema
Código repetido em cada arquivo:
```javascript
// script.js:83, sala-virtual.js:150, professor.js:98
const response = await fetch('/api/endpoint', {
    headers: { Authorization: `Bearer ${token}` }
});
if (response.status === 401) { clearToken(); window.location.href = '...'; }
if (response.status === 403) { window.location.href = '...'; }
if (!response.ok) throw new Error('...');
const payload = await response.json();
```

#### Proposta de Melhoria
**Criar `src/public/js/api.js` com cliente HTTP:**
```javascript
// api.js
const API_BASE = '/api';

export class APIError extends Error {
    constructor(message, status) {
        super(message);
        this.status = status;
    }
}

export async function apiRequest(endpoint, options = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json', ...options.headers };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
    });

    // Tratamento centralizado
    if (response.status === 401) {
        clearToken();
        throw new APIError('Sessão expirada', 401);
    }
    if (response.status === 403) {
        throw new APIError('Acesso negado', 403);
    }
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new APIError(error.mensagem || error.message || 'Erro na requisição', response.status);
    }

    return response.json();
}

// Uso
import { apiRequest } from './api.js';
const cursos = await apiRequest('/cursos');
```

**Impacto**: -150 linhas repetidas, +40 linhas no api.js, melhor tratamento de erros centralizado

---

### 3.4 SEM CACHE OU ESTRATÉGIA DE DADOS 🟡
**Severidade**: MÉDIA | **Impacto**: Performance + UX

#### Problema
- Toda página recarrega TODOS os dados (cursos, turmas, usuário) do zero
- Sem cache local, sem debounce, sem retry automático
- Cursos e turmas nunca mudam frequentemente, mas são buscados sempre

#### Proposta de Melhoria
**Criar `src/public/js/cache.js`:**
```javascript
// cache.js
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

class CacheManager {
    constructor() {
        this.cache = new Map();
    }

    set(key, value, duration = CACHE_DURATION) {
        this.cache.set(key, {
            value,
            expiry: Date.now() + duration
        });
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            return null;
        }
        return item.value;
    }

    clear() { this.cache.clear(); }
}

export const cacheManager = new CacheManager();

// Uso
const cursos = cacheManager.get('cursos') || await apiRequest('/cursos');
cacheManager.set('cursos', cursos);
```

**Impacto**: Reduz requisições HTTP, melhora tempo de carregamento

---

### 3.5 FALTA DE VALIDAÇÃO E FEEDBACK VISUAL 🟡
**Severidade**: MÉDIA | **Impacto**: UX

#### Problema
- Campos de formulário (cadastro, login) sem feedback real-time
- Sem indicador de loading em botões
- Sem confirmação antes de ações destrutivas
- Senhas não têm indicador de força visual

#### Proposta de Melhoria
**1. Validação em tempo real no cadastro:**
```javascript
// cadastro.js - adicionar listeners
document.getElementById('senha').addEventListener('input', (e) => {
    const forca = senhaEhForte(e.target.value);
    const indicator = document.querySelector('.password-strength');
    if (forca) {
        indicator.classList.add('strong');
        indicator.textContent = '✓ Senha forte';
    } else {
        indicator.classList.remove('strong');
        indicator.textContent = '✗ Senha fraca';
    }
});
```

**2. Desabilitar botão durante requisição:**
```javascript
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Carregando...';

    try {
        // ... requisição
        btn.textContent = 'Cadastrar';
    } finally {
        btn.disabled = false;
    }
});
```

**3. Confirmação antes de logout:**
```javascript
btnLogout.addEventListener('click', () => {
    if (confirm('Tem certeza que deseja sair?')) {
        clearToken();
        window.location.href = '/index.html';
    }
});
```

---

### 3.6 SEM TRATAMENTO DE ERROS DE REDE 🟡
**Severidade**: MÉDIA | **Impacto**: Confiabilidade

#### Problema
Sem retry ou retry automático:
```javascript
// Se a requisição falhar por timeout, usuário não pode tentar novamente
try {
    const response = await fetch('/api/turmas');
} catch (error) {
    // Apenas mostra mensagem estática
}
```

#### Proposta de Melhoria
**Criar função com retry exponencial:**
```javascript
// api.js
export async function fetchWithRetry(url, options = {}, maxRetries = 3) {
    let lastError;

    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fetch(url, options);
        } catch (error) {
            lastError = error;
            if (i < maxRetries - 1) {
                const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }

    throw lastError;
}
```

---

### 3.7 MODAIS E CONFIRMAÇÕES AUSENTES 🟡
**Severidade**: BAIXA | **Impacto**: UX

#### Problema
Ações importantes sem confirmação:
- Logout sem confirmação
- Cancelamento de matrícula sem confirmação
- Exclusão de curso sem confirmação

#### Proposta de Melhoria
**Criar componente modal reutilizável:**
```javascript
// components/Modal.js (novo arquivo)
export class Modal {
    static confirm(title, message) {
        return new Promise((resolve) => {
            const backdrop = document.createElement('div');
            backdrop.className = 'modal-backdrop';

            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = `
                <h2>${title}</h2>
                <p>${message}</p>
                <button class="btn-confirm">Confirmar</button>
                <button class="btn-cancel">Cancelar</button>
            `;

            backdrop.appendChild(modal);
            document.body.appendChild(backdrop);

            modal.querySelector('.btn-confirm').onclick = () => {
                cleanup();
                resolve(true);
            };
            modal.querySelector('.btn-cancel').onclick = () => {
                cleanup();
                resolve(false);
            };

            const cleanup = () => {
                backdrop.remove();
            };
        });
    }
}

// Uso
if (await Modal.confirm('Sair?', 'Tem certeza que deseja sair?')) {
    clearToken();
    window.location.href = '/index.html';
}
```

---

### 3.8 SEM TESTE DE FRONTEND 🟡
**Severidade**: MÉDIA | **Impacto**: Qualidade

#### Problema
Código JavaScript não tem testes:
```bash
npm run test # Testa backend, mas frontend é assumido como funcional
```

#### Proposta de Melhoria
**Adicionar testes com Vitest ou Jest (browser):**
```javascript
// src/public/__tests__/auth.test.js
import { getToken, setToken, clearToken } from '../js/auth.js';

describe('auth.js', () => {
    beforeEach(() => clearToken());

    test('setToken salva no localStorage', () => {
        setToken('abc123');
        expect(getToken()).toBe('abc123');
    });

    test('clearToken remove do localStorage', () => {
        setToken('abc123');
        clearToken();
        expect(getToken()).toBeNull();
    });
});
```

---

### 3.9 FALTA DE TIPAGEM/JSDOC 🟢
**Severidade**: BAIXA | **Impacto**: DX (Developer Experience)

#### Problema
Sem tipos TypeScript ou JSDoc:
```javascript
// Qual é o formato de `usuario`? Quais campos?
const usuario = await getCurrentUser();
```

#### Proposta de Melhoria
**Adicionar JSDoc:**
```javascript
/**
 * @typedef {Object} Usuario
 * @property {number} id_usuario
 * @property {string} nome_completo
 * @property {string} email
 * @property {'ALUNO'|'PROFESSOR'|'ADMIN'} tipo
 */

/**
 * Obtém o usuário logado
 * @returns {Promise<Usuario|null>}
 */
export async function getCurrentUser() { /* ... */ }
```

---

### 3.10 LAYOUT RESPONSIVO PODERIA MELHORAR 🟡
**Severidade**: BAIXA | **Impacto**: Mobile UX

#### Problema
- Grid com 2 colunas em desktop, mas sem breakpoint claro para mobile
- Header com flex-wrap, mas pode ficar desorganizado em mobile

#### Proposta de Melhoria
```css
/* style.css - adicionar */
@media (max-width: 768px) {
    .catalog-main {
        grid-template-columns: 1fr; /* 1 coluna em mobile */
    }

    .header-top {
        flex-direction: column;
        align-items: flex-start;
    }

    .main-nav {
        width: 100%;
    }
}
```

---

### 3.11 SEM SERVICE WORKER OU PWA 🟢
**Severidade**: BAIXA | **Impacto**: Offline Experience

#### Problema
Sem capacidade offline, sem caching de rede

#### Proposta de Melhoria (futura)
```javascript
// src/public/js/sw.js
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open('v1').then((cache) => {
            return cache.addAll(['/index.html', '/css/style.css', '/js/auth.js']);
        })
    );
});
```

---

### 3.12 SEM DARKMODE COM RESPALDO FALLBACK 🟢
**Severidade**: BAIXA | **Impacto**: Acessibilidade

#### Problema
Dark mode é padrão, sem toggle ou respaldo para preferências do sistema

#### Proposta de Melhoria
```javascript
// js/theme.js
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
if (prefersDark) {
    document.documentElement.classList.add('dark-mode');
}

// Botão de toggle
document.getElementById('theme-toggle').addEventListener('click', () => {
    document.documentElement.classList.toggle('dark-mode');
    localStorage.setItem('theme', document.documentElement.classList.contains('dark-mode') ? 'dark' : 'light');
});
```

---

## 4. PRIORIZAÇÃO DE MELHORIAS

### CRÍTICO - Implementar AGORA 🔴
1. **Remover XSS** (usar `textContent` ou sanitizar HTML)
2. **Centralizar fetch API** (crud api.js)
3. **Remover duplicação** (utils.js)

### IMPORTANTE - Próximas 2-3 semanas 🟠
4. **Adicionar validação real-time** (feedback visual)
5. **Testes de frontend** (vitest)
6. **Cache de dados** (cache.js)

### BÔNUS - Quando houver tempo 🟢
7. **Modal reutilizável** (confirmações)
8. **JSDoc/Tipos** (melhor DX)
9. **Responsividade mobile** (CSS breakpoints)
10. **PWA/Service Worker** (offline)

---

## 5. CHECKLIST DE IMPLEMENTAÇÃO

### Fase 1: Segurança & Qualidade (2-3 horas)
- [ ] Criar `js/utils.js` com funções compartilhadas
- [ ] Criar `js/api.js` com cliente HTTP centralizado
- [ ] Substituir `innerHTML` por `textContent` ou sanitizadores
- [ ] Testar todas as páginas após refatoração

### Fase 2: UX & Confiabilidade (3-4 horas)
- [ ] Adicionar cache.js
- [ ] Adicionar validação real-time em formulários
- [ ] Modal de confirmação
- [ ] Retry automático em falhas de rede

### Fase 3: Testes & Tipagem (2-3 horas)
- [ ] Configurar Vitest/Jest para frontend
- [ ] Escrever testes para auth.js, utils.js, api.js
- [ ] Adicionar JSDoc em todos os arquivos públicos

### Fase 4: Polish (1-2 horas)
- [ ] Media queries para mobile
- [ ] Toggle de tema
- [ ] Service Worker (opcional)

---

## 6. EXEMPLOS DE REFATORAÇÃO

### Antes (problemas)
```javascript
// script.js - XSS, repetição, sem erro handling
async function carregarCursos() {
    const lista = document.getElementById('lista-de-cursos');
    lista.innerHTML = '<li>Carregando...</li>';

    try {
        const response = await fetch('/api/cursos');
        if (!response.ok) throw new Error('Erro');
        const cursos = await response.json();

        lista.innerHTML = '';
        cursos.forEach(curso => {
            const item = document.createElement('li');
            item.innerHTML = `<span>${curso.nome}</span>`; // XSS!
            lista.appendChild(item);
        });
    } catch (error) {
        lista.innerHTML = '<li>Erro ao carregar</li>';
    }
}
```

### Depois (resolvido)
```javascript
// script.js - seguro, usa api.js
import { apiRequest, showLoading, showError } from './api.js';

async function carregarCursos() {
    const lista = document.getElementById('lista-de-cursos');
    showLoading(lista, 'Carregando cursos...');

    try {
        const cursos = await apiRequest('/cursos');
        renderizarCursos(cursos, lista);
    } catch (error) {
        showError(lista, error.message);
    }
}

function renderizarCursos(cursos, container) {
    container.innerHTML = '';
    cursos.forEach(curso => {
        const item = document.createElement('li');
        const title = document.createElement('span');
        title.textContent = curso.nome; // Seguro! Sem interpretação HTML
        item.appendChild(title);
        container.appendChild(item);
    });
}
```

---

## 7. CONCLUSÃO

O frontend está **bem estruturado arquiteturalmente**, mas precisa de:
1. **Refatoração** para remover duplicação (utils.js, api.js)
2. **Segurança** contra XSS (textContent ou sanitize)
3. **Resiliência** com retry e melhor error handling
4. **UX** com feedback visual e validação real-time
5. **Confiança** via testes e tipagem

Implementar as fases 1 e 2 vai transformar o frontend em **production-ready**. Fases 3 e 4 são "nice to have".

---

**Próximos passos recomendados:**
1. Revisar este documento com o time
2. Priorizar as melhorias acima
3. Criar issues/tasks no seu sistema de rastreamento
4. Começar pela Fase 1 (segurança)
