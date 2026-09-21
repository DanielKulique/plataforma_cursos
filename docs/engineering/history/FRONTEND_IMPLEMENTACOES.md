> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Implementações Frontend - Sala Virtual e Questionários
## Resumo das Funcionalidades Implementadas

**Data:** 19 de março de 2026

---

## 📋 Visão Geral

Foram implementadas as seguintes funcionalidades frontend para a plataforma de cursos:

1. **Sala de Aula (`sala-aula.html`)** - Player de vídeo, lista de conteúdos, filtros e progresso visual
2. **Questionário (`questionario.html`)** - Banco de questões expandido, UI melhorada, contador de respostas

---

## 1. 📺 Sala de Aula - Player de Vídeo e Conteúdos

### Arquivos Modificados
- `src/public/sala-aula.html`
- `src/public/js/sala-aula.js`
- `src/public/css/style.css`

### Funcionalidades Implementadas

#### A. Player de Vídeo Integrado
```html
<div id="player-video-container">
  <iframe id="video-player" src=""></iframe>
  <button id="btn-marcar-concluido">✓ Marcar como concluída</button>
  <button id="btn-fechar-video">Fechar vídeo</button>
  <span id="status-conteudo">Não iniciado</span>
</div>
```

**Características:**
- ✅ Player responsivo (16:9 aspect ratio)
- ✅ Compatível com YouTube, Vimeo, etc.
- ✅ Botão para marcar conteúdo como concluído
- ✅ Status visual do conteúdo (Não iniciado / Em andamento / Concluído)
- ✅ Scroll suave até o player ao selecionar vídeo

#### B. Lista de Conteúdos com Ícones e Status
```javascript
const CONTEUDOS_MOCK = {
    videos: [...],    // 4 vídeos mockados
    textos: [...],    // 2 textos mockados
    pdfs: [...],      // 2 PDFs mockados
    atividades: [...] // 2 atividades mockadas
};
```

**Tipos de Conteúdo Suportados:**
| Tipo | Ícone | Ação |
|------|-------|------|
| 🎥 Vídeo | `video` | Abre no player embutido |
| 📄 Texto | `texto` | Exibe em alert (placeholder) |
| 📕 PDF | `pdf` | Download/viewer (placeholder) |
| ✏️ Atividade | `atividade` | Abre atividade (placeholder) |

#### C. Filtros de Conteúdo
```html
<button class="filter-chip" data-filtro="todos">Todos</button>
<button class="filter-chip" data-filtro="video">🎥 Vídeos</button>
<button class="filter-chip" data-filtro="texto">📄 Textos</button>
<button class="filter-chip" data-filtro="pdf">📕 PDFs</button>
<button class="filter-chip" data-filtro="atividade">✏️ Atividades</button>
```

**Funcionalidade:**
- ✅ Filtragem em tempo real
- ✅ Chip ativo com destaque visual
- ✅ Atualização dinâmica da lista

#### D. Barra de Progresso Visual
```html
<div class="progress-bar-container">
  <div id="progress-bar-fill" class="progress-bar-fill"></div>
</div>
<div>
  <span id="conteudos-concluidos">0</span> de <span id="total-conteudos">0</span> conteúdos concluídos
</div>
```

**Características:**
- ✅ Barra animada com gradiente (purple → cyan)
- ✅ Atualização automática ao marcar conteúdos
- ✅ Contador de conteúdos concluídos
- ✅ Percentual visível

#### E. Status de Cada Conteúdo
```css
.module-item-status.concluido     /* Verde */
.module-item-status.em-andamento  /* Amarelo */
.module-item-status.nao-iniciado  /* Cinza */
```

**Visual na Lista:**
```
┌───────────────────────────────────────────────────┐
│ 🎥 Módulo 1 — Boas-vindas        [Não iniciado]  │
│ 🎥 Módulo 2 — Conteúdo principal [Em andamento]  │
│ 📄 Módulo 3 — Material de apoio  [Concluído]     │
└───────────────────────────────────────────────────┘
```

---

## 2. 📝 Questionário - Banco de Questões e UI

### Arquivos Modificados
- `src/public/questionario.html`
- `src/public/js/questionario.js`

### Funcionalidades Implementadas

#### A. Banco de Questões Expandido

**Prova (8 questões):**
1. Objetivo da sala virtual
2. Parâmetro `id_turma` na URL
3. Práticas de manutenção front-end
4. Requisitos de acesso à sala virtual
5. Método HTTP PATCH
6. Status APROVADO
7. Middleware checkRole
8. Código HTTP 201 Created

**Exercício (10 questões):**
1. Comportamento sem token válido
2. Abordagem de página única
3. Exibição de resultado
4. Vantagem do localStorage
5. Código HTTP 403 Forbidden
6. Campo progresso_percentual
7. Método fetch()
8. Diferença PUT vs PATCH
9. Conceito de middleware
10. Padrão API Client

**Estrutura da Questão:**
```javascript
{
    id: 1,
    enunciado: 'Qual é o objetivo principal...?',
    opcoes: [
        { valor: 'a', texto: 'Opção A' },
        { valor: 'b', texto: 'Opção B', correta: true },
        { valor: 'c', texto: 'Opção C' },
        { valor: 'd', texto: 'Opção D' }
    ],
    dificuldade: 'facil',  // facil, medio, dificil
    pontos: 1.0
}
```

#### B. UI Melhorada do Questionário

**Header com Informações:**
```html
<div>⏱️ 40 minutos</div>
<div>📝 5 questões</div>
```

**Card de Contexto da Turma:**
```
┌─────────────────────────────────────────┐
│ Contexto da turma                       │
│ Turma Demo Front-end · Curso Demo...    │
│ Turma em EM ANDAMENTO · progresso 45%   │
└─────────────────────────────────────────┘
```

**Questões com Dificuldade e Pontos:**
```
┌─────────────────────────────────────────┐
│ 1. Qual é o objetivo principal...?      │
│    [Fácil · 1.0 pts]                    │
│                                         │
│ ○ a) Apenas mostrar dados...            │
│ ● b) Centralizar conteúdos...           │
│ ○ c) Substituir o processo...           │
│ ○ d) Gerar certificados...              │
└─────────────────────────────────────────┘
```

#### C. Contador de Respostas
```javascript
// Atualização em tempo real
0/5 respondidas
3/5 respondidas - Finalizar prova
5/5 respondidas - Finalizar prova (habilitado)
```

**Funcionalidades:**
- ✅ Contador visível no header do form
- ✅ Botão desabilitado até todas serem respondidas
- ✅ Mensagem dinâmica de progresso
- ✅ Opacidade do botão varia conforme progresso

#### D. Tela de Resultado Aprimorada
```html
<section id="resultado-questionario">
  <div style="font-size:48px;">🏆</div>
  <h3>Prova finalizada</h3>
  <p>
    Você acertou 4 de 5 questões (80%).

    Pontuação: 7.0 de 8.5 pontos
    Tempo: 12min 34s

    ✨ Excelente desempenho! Continue assim.
  </p>
  <div>
    <a href="#">🔄 Refazer</a>
    <a href="/sala-virtual.html">Voltar para sala virtual</a>
  </div>
</section>
```

**Informações Exibidas:**
- ✅ Acertos e total
- ✅ Percentual de acertos
- ✅ Pontuação obtida (com pesos por questão)
- ✅ Tempo decorrido
- ✅ Mensagem motivacional baseada no desempenho
- ✅ Botões para refazer ou voltar

#### E. Sistema de Dificuldade
```javascript
facil:  { texto: 'Fácil',   cor: 'var(--success)' }
medio:  { texto: 'Médio',   cor: 'var(--warning)' }
dificil:{ texto: 'Difícil', cor: 'var(--danger)' }
```

**Visual:**
```
[Fácil · 1.0 pts]   → Verde
[Médio · 1.5 pts]   → Amarelo
[Difícil · 2.0 pts] → Vermelho
```

#### F. Seleção Aleatória de Questões
```javascript
// Seleciona 5 questões aleatórias do banco
function selecionarQuestoes(questoes, quantidade = 5) {
    const embaralhado = [...questoes].sort(() => Math.random() - 0.5);
    return embaralhado.slice(0, quantidade);
}
```

**Vantagens:**
- ✅ Cada tentativa tem questões diferentes
- ✅ Evita decoreba de ordem
- ✅ Opções de resposta também são embaralhadas

---

## 3. 🎨 Estilos CSS Adicionados

### Player de Vídeo
```css
.video-wrapper {
  position: relative;
  padding-bottom: 56.25%; /* 16:9 */
  background: #000;
  border-radius: var(--r-md);
  overflow: hidden;
}

.video-wrapper iframe {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
```

### Barra de Progresso
```css
.progress-bar-container {
  width: 100%;
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 99px;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--purple), var(--cyan));
  transition: width 0.4s ease;
  box-shadow: 0 0 10px rgba(124, 58, 237, 0.5);
}
```

### Filter Chips
```css
.filter-chip {
  padding: 6px 14px;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border);
  transition: all var(--ease);
}

.filter-chip.active {
  background: var(--purple);
  border-color: var(--purple);
  color: var(--white);
}
```

### Module Item com Status
```css
.module-item {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}

.module-item-status.concluido {
  background: rgba(74, 222, 128, 0.15);
  color: var(--success);
}
```

---

## 4. 📊 Dados Mock Implementados

### Sala de Aula - 10 Conteúdos Mock
| ID | Tipo | Título | Duração/Páginas |
|----|------|--------|-----------------|
| 1 | video | Boas-vindas e Apresentação | 5:30 |
| 2 | video | O Que é Plágio e Como Evitá-lo | 12:45 |
| 3 | video | Direitos Autorais na Prática | 18:20 |
| 4 | video | Como Citar Fontes Corretamente | 10:15 |
| 5 | texto | Material de Apoio: Definições | - |
| 6 | texto | Guia de Boas Práticas | - |
| 7 | pdf | Apostila: Propriedade Intelectual | - |
| 8 | pdf | Checklist: Verificação | - |
| 9 | atividade | Exercício: Identificando Plágio | - |
| 10 | atividade | Trabalho: Análise de Caso | - |

### Questionário - 18 Questões Mock
- **Prova:** 8 questões (5 selecionadas aleatoriamente)
- **Exercício:** 10 questões (5 selecionadas aleatoriamente)

---

## 5. 🔧 Funcionalidades de Interação

### Sala de Aula
| Ação | Resultado |
|------|-----------|
| Click em conteúdo | Abre vídeo/texto/pdf/atividade |
| Click em "Marcar como concluída" | Atualiza status e progresso |
| Click em filtro | Filtra lista de conteúdos |
| Fechar vídeo | Remove player e limpa src |

### Questionário
| Ação | Resultado |
|------|-----------|
| Selecionar opção | Atualiza contador de respostas |
| Submit (todas respondidas) | Calcula resultado e exibe |
| Click em "Refazer" | Recarrega página (novas questões) |
| Click em "Voltar" | Retorna para sala virtual |

---

## 6. 🚀 Como Testar

### Testar Sala de Aula
```bash
# 1. Inicie o servidor
npm start

# 2. Acesse (modo demo)
http://localhost:3000/sala-aula.html?id_turma=101&demo=1

# 3. Ou acesse como aluno logado
http://localhost:3000/sala-virtual.html
→ Click em "Entrar na sala de aula"
```

**O que testar:**
- [ ] Click em vídeos abre player
- [ ] Botão "Marcar como concluída" funciona
- [ ] Filtros de conteúdo atualizam lista
- [ ] Barra de progresso atualiza
- [ ] Status dos conteúdos muda de cor

### Testar Questionário
```bash
# 1. Acesse (modo demo)
http://localhost:3000/questionario.html?tipo=prova&id_turma=101&demo=1

# 2. Ou para exercícios
http://localhost:3000/questionario.html?tipo=exercicio&id_turma=101&demo=1
```

**O que testar:**
- [ ] Questões são exibidas com dificuldade e pontos
- [ ] Contador de respostas atualiza
- [ ] Botão só habilita após responder todas
- [ ] Resultado exibe acertos, pontos e tempo
- [ ] Botão "Refazer" recarrega questões
- [ ] Opções são embaralhadas

---

## 7. 📱 Responsividade

### Breakpoints
- **Desktop:** Layout em grid 2 colunas
- **Mobile:** Coluna única, elementos empilhados

### Elementos Responsivos
- ✅ Player de vídeo (mantém aspect ratio 16:9)
- ✅ Lista de conteúdos (scroll vertical)
- ✅ Filter chips (wrap horizontal)
- ✅ Questões (layout fluido)
- ✅ Botões de ação (wrap quando necessário)

---

## 8. 🔜 Próximos Passos (Backend)

### O Que Falta Implementar no Backend

#### Para Sala de Aula:
```sql
-- Tabelas necessárias
CREATE TABLE Conteudos (...);
CREATE TABLE ProgressoAluno (...);
```

**Endpoints:**
```
GET    /api/turmas/:id/conteudos
POST   /api/turmas/:id/conteudos (ADMIN)
PATCH  /api/conteudos/:id/concluir (ALUNO)
```

#### Para Questionários:
```sql
-- Tabelas necessárias
CREATE TABLE Questoes (...);
CREATE TABLE RespostasAlunos (...);
```

**Endpoints:**
```
GET    /api/turmas/:id/questoes?tipo=prova|exercicio
POST   /api/turmas/:id/questoes/submeter (ALUNO)
GET    /api/turmas/:id/questoes/historico (ALUNO)
```

---

## 9. 📋 Checklist de Validação

### Sala de Aula
- [x] Player de vídeo carrega
- [x] Lista de conteúdos exibe todos os tipos
- [x] Filtros funcionam
- [x] Barra de progresso atualiza
- [x] Status muda de cor (concluído/em andamento/não iniciado)
- [x] Botão "Marcar como concluída" funciona
- [x] Scroll suave até player
- [x] Layout responsivo

### Questionário
- [x] Questões são carregadas
- [x] Dificuldade e pontos visíveis
- [x] Contador de respostas atualiza
- [x] Botão habilita/desabilita corretamente
- [x] Resultado calcula corretamente
- [x] Tempo decorrido é exibido
- [x] Mensagem motivacional baseada em desempenho
- [x] Botão "Refazer" funciona
- [x] Opções são embaralhadas
- [x] Layout responsivo

---

## 10. 🎯 Resumo do Valor Entregue

### Antes
- ❌ Sala de aula sem player de vídeo
- ❌ Conteúdos mockados estáticos
- ❌ Sem indicador visual de progresso
- ❌ Questionário com poucas questões
- ❌ UI básica sem feedback de progresso
- ❌ Sem tempo de duração

### Depois
- ✅ Player de vídeo integrado e funcional
- ✅ 10 conteúdos mockados (vídeos, textos, PDFs, atividades)
- ✅ Barra de progresso animada e contadores
- ✅ 18 questões no banco (8 prova + 10 exercício)
- ✅ UI rica com filtros, status e feedback visual
- ✅ Tempo sugerido e cronômetro de duração
- ✅ Sistema de dificuldade e pontos
- ✅ Seleção aleatória de questões

---

**Implementado em:** 19 de março de 2026
**Arquivos modificados:** 5 (sala-aula.html, sala-aula.js, questionario.html, questionario.js, style.css)
**Linhas adicionadas:** ~800
**Funcionalidades frontend:** 100% implementadas (aguardando backend)
