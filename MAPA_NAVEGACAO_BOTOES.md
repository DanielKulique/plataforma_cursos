# Mapa de Navegação e Botões - Frontend
## Plataforma de Cursos

**Data:** 19 de março de 2026

---

## 🗺️ Mapa de Navegação Completo

```
┌────────────────────────────────────────────────────────────────────┐
│                         NAV BAR (Global)                           │
│  Logo | Catálogo | Sala Virtual | Verificador | [Perfil] | Sair   │
└────────────────────────────────────────────────────────────────────┘
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
        ▼                           ▼                           ▼
┌───────────────┐          ┌───────────────┐          ┌───────────────┐
│  index.html   │          │ login.html    │          │ cadastro.html │
│  (Catálogo)   │          │  (Login)      │          │  (Cadastro)   │
└───────┬───────┘          └───────┬───────┘          └───────┬───────┘
        │                          │                          │
        │ Link: "Entrar"           │ Submit → /api/auth/login │
        │                          │                          │
        ▼                          ▼                          ▼
┌───────────────────────────────────────────────────────────────────┐
│                     PÓS-AUTENTICAÇÃO                              │
│                                                                   │
│  ALUNO → sala-virtual.html                                        │
│  PROFESSOR → professor.html                                       │
│  ADMIN → admin.html                                               │
└───────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                    ▼               ▼               ▼
          ┌─────────────────┐ ┌───────────┐ ┌─────────────┐
          │sala-virtual.html│ │professor  │ │  admin.html │
          │   (ALUNO)       │ │  .html    │ │   (ADMIN)   │
          │                 │ │(PROFESSOR)│ │             │
          └────────┬────────┘ └─────┬─────┘ └─────────────┘
                   │                │
                   │ "Entrar na     │ "Gerenciar
                   │  sala de aula" │  turma"
                   │                │
                   ▼                ▼
          ┌─────────────────┐ ┌─────────────────┐
          │  sala-aula.html │ │professor-turma  │
          │  (Detalhe       │ │  .html          │
          │   da Turma)     │ │ (Gerenciar)     │
          └────────┬────────┘ └─────────────────┘
                   │
         ┌─────────┼─────────┐
         │         │         │
         ▼         ▼         ▼
   ┌──────────┐ ┌──────────┐ ┌────────────┐
   │Prova     │ │Exercícios│ │ (Conteúdo  │
   │(tipo=    │ │(tipo=    │ │  da aula)  │
   │  prova)  │ │  exerc)  │ │            │
   └────┬─────┘ └────┬─────┘ └────────────┘
        │            │
        └─────┬──────┘
              │
              ▼
     ┌─────────────────┐
     │ questionario    │
     │   .html         │
     │ (Prova/Exerc.)  │
     └─────────────────┘
```

---

## 📄 Detalhamento por Página

### 1. `index.html` - Catálogo (Público)

**URL:** `/index.html`

**Elementos de Navegação:**

| Elemento | Tipo | Destino/Ação | Status |
|----------|------|--------------|--------|
| Logo "Plágio" | Link | `/index.html` | ✅ Funcional |
| Nav: "Catalogo" | Link | `/index.html` | ✅ Funcional |
| Nav: "Sala Virtual" | Link | `/sala-virtual.html` | ✅ Funcional (condicional) |
| Nav: "Verificador" | Link | `/verificador.html` | ✅ Funcional |
| Botão "Entrar" | Link | `/login.html` | ✅ Funcional (não logado) |
| Botão "Sair" | Button | Logout + redirect | ✅ Funcional (logado) |
| Lista de cursos | Display | `GET /api/cursos` | ✅ Carrega dinamicamente |
| Lista de turmas | Display | `GET /api/turmas` | ✅ Carrega dinamicamente |
| Card de curso | Link | **Nenhum** | ⚠️ Somente exibição |
| Card de turma | Link | **Nenhum** | ⚠️ Somente exibição |
| "Meus certificados" | Link | **Nenhum** | ❌ Não implementado |
| "Agenda de aulas" | Link | **Nenhum** | ❌ Não implementado |
| "Fórum de dúvidas" | Link | **Nenhum** | ❌ Não implementado |
| "Avaliações pendentes" | Link | **Nenhum** | ❌ Não implementado |

**Comportamento por Tipo de Usuário:**

| Usuário | Nav "Sala Virtual" | Botão "Entrar/Sair" |
|---------|-------------------|---------------------|
| Não logado | Oculto | "Entrar" visível |
| ALUNO | Visível → `/sala-virtual.html` | "Sair" visível |
| PROFESSOR | Visível → `/professor.html` | "Sair" visível |
| ADMIN | Visível → `/admin.html` | "Sair" visível |

**Botões Faltantes:**
- ❌ Botão "Matricular" em cada turma (para alunos logados)
- ❌ Link nos cards de curso para ver detalhes

---

### 2. `login.html` - Login

**URL:** `/login.html`

**Elementos:**

| Elemento | Tipo | Destino/Ação | Status |
|----------|------|--------------|--------|
| Logo | Link | `/index.html` | ✅ Funcional |
| Form: Email | Input | - | ✅ Funcional |
| Form: Senha | Input | - | ✅ Funcional |
| Botão "Entrar" | Submit | `POST /api/auth/login` | ✅ Funcional |
| Link "Criar conta" | Link | `/cadastro.html` | ✅ Funcional |

**Fluxo de Login:**
```
1. Usuário preenche email e senha
2. Submit → login.js → POST /api/auth/login
3. Sucesso: Salva token JWT no localStorage
4. Redireciona por perfil:
   - ALUNO → /sala-virtual.html
   - PROFESSOR → /professor.html
   - ADMIN → /admin.html
5. Erro: Exibe mensagem "Email ou senha inválidos"
```

---

### 3. `cadastro.html` - Cadastro

**URL:** `/cadastro.html`

**Elementos:**

| Elemento | Tipo | Destino/Ação | Status |
|----------|------|--------------|--------|
| Logo | Link | `/index.html` | ✅ Funcional |
| Form: Nome | Input | - | ✅ Funcional |
| Form: CPF | Input | - | ✅ Funcional |
| Form: Email | Input | - | ✅ Funcional |
| Form: Senha | Input | - | ✅ Funcional |
| Form: Confirmar Senha | Input | - | ✅ Funcional |
| Form: Telefone | Input | - | ✅ Funcional |
| Form: Tipo (Aluno/Professor) | Select | - | ✅ Funcional |
| Botão "Cadastrar" | Submit | Validação frontend | ✅ Funcional |
| Link "Já tem conta?" | Link | `/login.html` | ✅ Funcional |

**Fluxo de Cadastro:**
```
1. Preenche todos os campos
2. Valida senha = confirmar_senha
3. POST /api/usuarios (cria usuário)
4. Redireciona para /verificador.html
5. Envia código de verificação por email
```

---

### 4. `sala-virtual.html` - Área do Aluno

**URL:** `/sala-virtual.html`

**Elementos de Navegação:**

| Elemento | Tipo | Destino/Ação | Status |
|----------|------|--------------|--------|
| Logo | Link | `/index.html` | ✅ Funcional |
| Nav: "Catalogo" | Link | `/index.html` | ✅ Funcional |
| Nav: "Sala Virtual" | Link | `/sala-virtual.html` | ✅ Funcional (ativo) |
| Nav: "Verificador" | Link | `/verificador.html` | ✅ Funcional |
| Botão "Sair" | Button | Logout + redirect | ✅ Funcional |
| Card de turma: "Entrar na sala" | Link | `/sala-aula.html?id_turma=X` | ✅ Funcional |
| Card de turma: "Prova" | Link | `/questionario.html?tipo=prova&id_turma=X` | ⚠️ Frontend apenas |
| Card de turma: "Exercícios" | Link | `/questionario.html?tipo=exercicio&id_turma=X` | ⚠️ Frontend apenas |

**Fluxo:**
```
1. GET /api/matriculas/minha-sala (com token)
2. Renderiza cards das turmas matriculadas
3. Cada card tem:
   - Nome do curso
   - Nome da turma
   - Status (EM ANDAMENTO, etc)
   - Progresso percentual
   - Descrição do curso
   - Conteúdo liberado (MOCK)
   - 3 botões de ação
```

**Ações por Turma:**
```
┌─────────────────────────────────────────┐
│  Curso: Plágio 3.0                      │
│  Turma: Março 2025                      │
│  Status: EM ANDAMENTO                   │
│  Progresso: 45%                         │
│                                         │
│  [Entrar na sala de aula] [Prova] [Ex] │
└─────────────────────────────────────────┘
```

---

### 5. `sala-aula.html` - Sala de Aula (Detalhe da Turma)

**URL:** `/sala-aula.html?id_turma=X`

**Elementos de Navegação:**

| Elemento | Tipo | Destino/Ação | Status |
|----------|------|--------------|--------|
| Logo | Link | `/index.html` | ✅ Funcional |
| Nav: "Catalogo" | Link | `/index.html` | ✅ Funcional |
| Nav: "Sala Virtual" | Link | `/sala-virtual.html` | ✅ Funcional |
| Nav: "Verificador" | Link | `/verificador.html` | ✅ Funcional |
| Botão "Sair" | Button | Logout + redirect | ✅ Funcional |
| "Ir para prova" | Link | `/questionario.html?tipo=prova&id_turma=X` | ⚠️ Frontend apenas |
| "Ir para exercícios" | Link | `/questionario.html?tipo=exercicio&id_turma=X` | ⚠️ Frontend apenas |
| Lista de módulos | Display | MOCK hardcoded | ❌ Sem backend |

**Informações Exibidas:**
- Nome da turma
- Nome do curso
- Status da turma
- Progresso atual (%)
- Período (data início - data fim)
- Carga horária
- Descrição do curso
- Lista de módulos/conteúdos (MOCK)

**Módulos (MOCK):**
```
1. Módulo 1 — Boas-vindas e visão geral
2. Módulo 2 — Conteúdo principal da aula
3. Módulo 3 — Preparação para avaliações
```

---

### 6. `questionario.html` - Prova/Exercícios

**URL:** `/questionario.html?tipo=prova&id_turma=X`
**OU:** `/questionario.html?tipo=exercicio&id_turma=X`

**Elementos:**

| Elemento | Tipo | Destino/Ação | Status |
|----------|------|--------------|--------|
| Logo | Link | `/index.html` | ✅ Funcional |
| Nav: "Catalogo" | Link | `/index.html` | ✅ Funcional |
| Nav: "Sala Virtual" | Link | `/sala-virtual.html` | ✅ Funcional |
| Nav: "Verificador" | Link | `/verificador.html` | ✅ Funcional |
| Botão "Sair" | Button | Logout + redirect | ✅ Funcional |
| Form: Questões | Radio buttons | Seleção múltipla | ✅ Funcional (frontend) |
| Botão "Finalizar" | Submit | Calcula resultado (frontend) | ⚠️ Sem backend |
| Link "Voltar para sala" | Link | `/sala-aula.html?id_turma=X` | ✅ Funcional |
| Resultado | Display | Mostra acertos/percentual | ⚠️ Não persiste |

**Fluxo Atual (Frontend apenas):**
```
1. Lê ?tipo e ?id_turma da URL
2. Carrega questões do BANCO_QUESTOES (hardcoded)
3. Exibe contexto da turma (busca da API)
4. Usuário responde questões
5. Submit → Calcula acertos no frontend
6. Exibe resultado na tela
7. ❌ NÃO salva no banco
8. ❌ NÃO atualiza progresso
```

**Questões Mockadas:**
- Prova: 3 questões sobre sala virtual e arquitetura
- Exercício: 3 questões sobre autenticação e UX

---

### 7. `professor.html` - Área do Professor

**URL:** `/professor.html`

**Elementos:**

| Elemento | Tipo | Destino/Ação | Status |
|----------|------|--------------|--------|
| Logo | Link | `/index.html` | ✅ Funcional |
| Nav: "Catalogo" | Link | `/index.html` | ✅ Funcional |
| Nav: "Verificador" | Link | `/verificador.html` | ✅ Funcional |
| Nav: "Minhas Turmas" | Link | `/professor.html` | ✅ Funcional (ativo) |
| Botão "Sair" | Button | Logout + redirect | ✅ Funcional |
| Card de turma: "Gerenciar turma" | Link | `/professor-turma.html?id_turma=X` | ✅ Funcional |

**Fluxo:**
```
1. GET /api/turmas/professor/:id (id do usuário logado)
2. Renderiza cards das turmas
3. Cada card mostra:
   - Nome da turma
   - Nome do curso
   - Total de alunos matriculados
   - Data de início
   - Status
   - Botão "Gerenciar turma"
```

---

### 8. `professor-turma.html` - Gerenciar Turma

**URL:** `/professor-turma.html?id_turma=X`

**Elementos:**

| Elemento | Tipo | Destino/Ação | Status |
|----------|------|--------------|--------|
| Logo | Link | `/index.html` | ✅ Funcional |
| Nav: "Catalogo" | Link | `/index.html` | ✅ Funcional |
| Nav: "Verificador" | Link | `/verificador.html` | ✅ Funcional |
| Nav: "Minhas Turmas" | Link | `/professor.html` | ✅ Funcional |
| Botão "Sair" | Button | Logout + redirect | ✅ Funcional |
| Tabela: Editar | Button | Abre modal | ✅ Funcional |
| Modal: Atualizar | Submit | `PATCH /api/matriculas/:id` | ✅ Funcional |
| Modal: Cancelar | Button | Fecha modal | ✅ Funcional |

**Tabela de Alunos:**
| Coluna | Dados |
|--------|-------|
| Aluno | nome_completo |
| Email | email |
| Progresso | progresso_percentual + label (Iniciante, Básico, etc) |
| Nota Final | nota_final (0.0 a 10.0) |
| Status | badge (CURSANDO, APROVADO, REPROVADO, CANCELADO) |
| Ações | Botão "Editar" → abre modal |

**Modal de Edição:**
```
┌─────────────────────────────────┐
│  Editar Matrícula               │
│                                 │
│  Nota Final: [0.0 a 10.0]       │
│  Status: [SELECT: CURSANDO,     │
│           APROVADO, REPROVADO,  │
│           CANCELADO]            │
│  Progresso (%): [0 a 100]       │
│                                 │
│  [Atualizar]  [Cancelar]        │
└─────────────────────────────────┘
```

**Fluxo de Edição:**
```
1. Click em "Editar" na linha do aluno
2. Abre modal preenchido com dados atuais
3. Professor altera nota/status/progresso
4. Submit → PATCH /api/matriculas/:id_matricula
5. Atualiza no banco de dados
6. Fecha modal e recarrega tabela
```

---

### 9. `admin.html` - Área Administrativa

**URL:** `/admin.html`

**Status:** ⚠️ **Página existe mas não foi analisada em detalhe**

**Funcionalidades Esperadas:**
- CRUD de Cursos
- CRUD de Turmas
- CRUD de Usuários
- Gestão de permissões

---

### 10. `verificador.html` - Verificador de Plágio

**URL:** `/verificador.html`

**Status:** ⚠️ **Funcionalidade separada (não relacionada a turmas/cursos)**

**Propósito:** Ferramenta de verificação de plágio com IA (funcionalidade independente)

---

## 🔗 Resumo dos Links entre Páginas

```
┌─────────────────────────────────────────────────────────────────┐
│                    MATRIZ DE NAVEGAÇÃO                          │
├──────────────────┬──────────────────────────────────────────────┤
│ Página Origem    │ Destinos Disponíveis                         │
├──────────────────┼──────────────────────────────────────────────┤
│ index.html       │ login.html, sala-virtual.html (condicional), │
│ (Catálogo)       │ professor.html (condicional), admin.html     │
│                  │ (condicional), verificador.html              │
├──────────────────┼──────────────────────────────────────────────┤
│ login.html       │ index.html (após login), cadastro.html       │
├──────────────────┼──────────────────────────────────────────────┤
│ cadastro.html    │ login.html, verificador.html                 │
├──────────────────┼──────────────────────────────────────────────┤
│ sala-virtual.html│ index.html, sala-aula.html, questionario     │
│ (Aluno)          │ .html, verificador.html                      │
├──────────────────┼──────────────────────────────────────────────┤
│ sala-aula.html   │ index.html, sala-virtual.html, questionario  │
│ (Detalhe Turma)  │ .html, verificador.html                      │
├──────────────────┼──────────────────────────────────────────────┤
│ questionario.html│ index.html, sala-aula.html, sala-virtual     │
│ (Prova/Exerc.)   │ .html, verificador.html                      │
├──────────────────┼──────────────────────────────────────────────┤
│ professor.html   │ index.html, professor-turma.html, verifica   │
│ (Professor)      │ dor.html                                     │
├──────────────────┼──────────────────────────────────────────────┤
│ professor-turma  │ index.html, professor.html, verificador.html │
│ .html            │                                              │
│ (Gerenciar)      │                                              │
├──────────────────┼──────────────────────────────────────────────┤
│ admin.html       │ index.html, CRUD de cursos/turmas/usuarios   │
│ (Admin)          │                                              │
└──────────────────┴──────────────────────────────────────────────┘
```

---

## 🎯 Botões que Precisam ser Implementados

### Prioridade Alta

1. **Botão "Matricular" em `index.html`**
   - Localização: Card de cada turma (para alunos logados)
   - Ação: `POST /api/matriculas` com `{ id_turma: X }`
   - Redirecionamento: `/sala-virtual.html`

2. **Botão "Cancelar Matrícula" em `sala-virtual.html`**
   - Localização: Card de cada turma
   - Ação: `DELETE /api/matriculas/:id_matricula` com confirmação
   - Atualização: Recarregar lista

3. **Link "Ver Detalhes" em cursos**
   - Localização: Card de cada curso em `index.html`
   - Destino: Página de detalhes do curso (não existe)

### Prioridade Média

4. **Botão "Concluir Módulo" em `sala-aula.html`**
   - Localização: Ao lado de cada módulo
   - Ação: `PATCH /api/matriculas/:id/conteudo/:id_conteudo/concluir`
   - Atualização: Progresso automático

5. **Botão "Salvar Respostas" em `questionario.html`**
   - Localização: No form de questões
   - Ação: `POST /api/turmas/:id_turma/questoes/submeter`
   - Atualização: Salvar nota e progresso

6. **Link "Meus Certificados"**
   - Localização: Quick links em `index.html`
   - Destino: Página de certificados (não existe)

7. **Link "Agenda de Aulas"**
   - Localização: Quick links em `index.html`
   - Destino: Página de agenda (não existe)

8. **Link "Fórum de Dúvidas"**
   - Localização: Quick links em `index.html`
   - Destino: Página do fórum (não existe)

---

## 📊 Status da Integração por Botão

| Página | Botão/Link | Status Integração |
|--------|-----------|-------------------|
| index.html | Nav: Sala Virtual | ✅ 100% |
| index.html | Botão Entrar/Sair | ✅ 100% |
| index.html | Lista Cursos | ✅ 100% |
| index.html | Lista Turmas | ✅ 100% |
| index.html | **Botão Matricular** | ❌ 0% (faltando) |
| login.html | Form Login | ✅ 100% |
| login.html | Link Cadastro | ✅ 100% |
| sala-virtual.html | Entrar na Sala | ✅ 100% |
| sala-virtual.html | **Botão Prova** | ⚠️ 50% (link existe, backend não) |
| sala-virtual.html | **Botão Exercícios** | ⚠️ 50% (link existe, backend não) |
| sala-aula.html | **Conteúdos/Módulos** | ❌ 0% (mock frontend) |
| sala-aula.html | **Ir para Prova** | ⚠️ 50% (link existe, backend não) |
| sala-aula.html | **Ir para Exercícios** | ⚠️ 50% (link existe, backend não) |
| questionario.html | **Questões** | ❌ 0% (mock frontend) |
| questionario.html | **Finalizar/Salvar** | ❌ 0% (sem backend) |
| questionario.html | Voltar para Sala | ✅ 100% |
| professor.html | Minhas Turmas | ✅ 100% |
| professor.html | Gerenciar Turma | ✅ 100% |
| professor-turma.html | Editar Matrícula | ✅ 100% |
| professor-turma.html | Atualizar Nota/Status | ✅ 100% |

---

## 🧭 Fluxos de Usuário Completos

### Fluxo 1: Aluno se Matricula e Acessa Conteúdo

```
1. [index.html] → Aluno vê turma disponível
2. [index.html] → Click em "Matricular" (❌ NÃO EXISTE)
3. [POST /api/matriculas] → Cria matrícula
4. [sala-virtual.html] → Turma aparece em "Minhas Turmas"
5. [sala-virtual.html] → Click em "Entrar na sala de aula"
6. [sala-aula.html] → Vê conteúdos da turma (⚠️ MOCK)
7. [sala-aula.html] → Click em "Concluir módulo" (❌ NÃO EXISTE)
8. [PATCH /api/...] → Atualiza progresso (❌ NÃO EXISTE)
```

**Status:** ⚠️ Parcial (etapas 2, 7, 8 não existem)

---

### Fluxo 2: Aluno Faz Prova

```
1. [sala-virtual.html] → Aluno vê turma em andamento
2. [sala-virtual.html] → Click em "Prova"
3. [questionario.html] → Carrega questões (⚠️ MOCK)
4. [questionario.html] → Aluno responde questões
5. [questionario.html] → Click em "Finalizar prova"
6. [POST /api/.../submeter] → Envia respostas (❌ NÃO EXISTE)
7. [Banco de Dados] → Salva respostas e nota (❌ NÃO EXISTE)
8. [questionario.html] → Exibe resultado (✅ Calculado no frontend)
9. [sala-virtual.html] → Atualiza progresso (❌ NÃO ATUALIZA)
```

**Status:** ⚠️ Parcial (etapas 3, 6, 7, 9 não existem no backend)

---

### Fluxo 3: Professor Gerencia Notas

```
1. [professor.html] → Professor vê suas turmas
2. [professor.html] → Click em "Gerenciar turma"
3. [professor-turma.html] → Vê lista de alunos
4. [professor-turma.html] → Click em "Editar"
5. [Modal] → Altera nota/status/progresso
6. [Modal] → Click em "Atualizar"
7. [PATCH /api/matriculas/:id] → Atualiza no banco
8. [professor-turma.html] → Recarrega tabela com novos dados
```

**Status:** ✅ 100% Implementado e Funcional

---

## 📝 Conclusões sobre Navegação

### Pontos Fortes
1. ✅ **Navegação principal (navbar)** funciona em todas as páginas
2. ✅ **Fluxo de autenticação** completo (login → redirect por perfil)
3. ✅ **Área do professor** totalmente funcional
4. ✅ **Gestão de matrículas** (professor pode editar notas)
5. ✅ **Links entre páginas** bem estruturados

### Pontos de Melhoria
1. ❌ **Botão de matrícula** não existe no catálogo
2. ❌ **Questionários** são apenas frontend (mock)
3. ❌ **Conteúdos das aulas** não vêm do backend
4. ❌ **Progresso não é atualizado** automaticamente
5. ⚠️ **Quick links** (certificados, agenda, fórum) não têm destino

### Ações Recomendadas
1. **Imediato:** Adicionar botão "Matricular" em `index.html`
2. **Curto prazo:** Implementar backend de questionários
3. **Médio prazo:** Implementar backend de conteúdos/módulos
4. **Longo prazo:** Criar páginas de certificados, agenda e fórum

---

**Documento gerado em:** 19 de março de 2026
