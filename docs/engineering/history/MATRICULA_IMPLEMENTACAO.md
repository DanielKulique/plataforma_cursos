> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Implementação - Matrícula em Turmas
## Funcionalidade de Matrícula no Catálogo

**Data:** 19 de março de 2026

---

## 📋 Visão Geral

Foi implementada a funcionalidade de matrícula em turmas diretamente na página de catálogo (`index.html`). Agora os alunos logados podem se matricular em turmas com inscrições abertas com um único clique.

---

## ✨ Funcionalidades Implementadas

### 1. **Botão de Matrícula nos Cards de Turma**

**Comportamento baseado no estado do usuário:**

| Estado do Usuário | Botão Exibido | Ação |
|-------------------|---------------|------|
| **Não logado** | Nenhum botão | Click na turma → Redireciona para login |
| **Aluno logado (não matriculado)** | `📝 Matricular` (roxo) | Abre modal de confirmação |
| **Aluno logado (já matriculado)** | `✓ Matriculado` (cinza) | Desabilitado, apenas informativo |
| **Qualquer usuário (turma fechada)** | `🔒 Fechado` (cinza) | Desabilitado, turma sem inscrições |

---

### 2. **Fluxo de Matrícula**

```
1. Aluno logado vê lista de turmas em index.html
2. Identifica turma com código interno `ABERTA` e rótulo “Inscrições abertas”
3. Click em "📝 Matricular"
4. Modal de confirmação é exibido:
   ┌─────────────────────────────────────┐
   │  ✓ Confirmar Matrícula              │
   │                                     │
   │  Deseja se matricular na turma      │
   │  "Turma Demo 2025"?                 │
   │                                     │
   │  [Cancelar] [Sim, quero me matricular!] │
   └─────────────────────────────────────┘
5. Confirma → API é chamada (POST /api/matriculas)
6. Sucesso → Botão muda para "✓ Matriculado"
7. Feedback visual é exibido (alert verde)
```

---

### 3. **Validações Implementadas**

#### Validações no Frontend:
- ✅ Verifica se usuário está logado
- ✅ Verifica se usuário é do tipo ALUNO
- ✅ Verifica se turma já está matriculada (evita duplicidade)
- ✅ Verifica status da turma (somente `ABERTA` permite matrícula)
- ✅ Confirmação via modal antes de enviar

#### Validações no Backend (já existentes):
- ✅ Token JWT válido
- ✅ Usuário é ALUNO
- ✅ Turma existe
- ✅ Matrícula não duplicada (unique constraint)

---

## 🔧 Arquivos Modificados

### 1. `src/public/js/script.js`

**Adições:**
```javascript
// Estado global
let usuarioLogado = null;
let matriculasAtivas = [];

// Funções de matrícula
async function carregarMatriculasDoAluno()
async function matricularEmTurma(idTurma, nomeTurma)
function isMatriculado(idTurma)

// Atualização na renderização
function renderizarTurmas(turmas) // +botões
```

**Mudanças:**
- Import de `getToken` e `post` da API
- Import de `confirmSuccess` do modal
- Armazenamento do usuário logado
- Carregamento das matrículas ativas
- Botões condicionais na renderização de turmas

---

### 2. `src/public/js/modal.js`

**Adição:**
```javascript
export function confirmSuccess(title, message, confirmText = 'Confirmar')
```

**Propósito:** Modal de confirmação com ícone de sucesso (verde) para ações positivas como matrícula.

---

### 3. `src/public/css/style.css`

**Adições:**
```css
.btn-sm { /* Botões pequenos para matrícula */ }
.btn-sm.btn-primary { /* Botão de ação (matricular) */ }
.btn-sm.btn-ghost { /* Botão inativo (matriculado/fechado) */ }
```

---

## 🎨 UI/UX

### Estados dos Botões

#### Botão "Matricular" (Ação Primária)
```
┌─────────────────────────────────┐
│ Turma: Plágio 3.0 - Turma 01    │
│ 📚 Curso X · 👤 Prof. Y         │
│                          [✦ Inscricoes] │
│                          [📝 Matricular]│
└─────────────────────────────────┘
```

#### Botão "Matriculado" (Inativo)
```
┌─────────────────────────────────┐
│ Turma: Plágio 3.0 - Turma 01    │
│ 📚 Curso X · 👤 Prof. Y         │
│                          [✦ Inscricoes] │
│                          [✓ Matriculado]│
└─────────────────────────────────┘
```

#### Botão "Fechado" (Inativo)
```
┌─────────────────────────────────┐
│ Turma: Plágio 3.0 - Turma 02    │
│ 📚 Curso X · 👤 Prof. Y         │
│                          [● Em Andamento] │
│                          [🔒 Fechado]     │
└─────────────────────────────────┘
```

---

## 🔗 Integração com API

### Endpoint Utilizado

**Criar Matrícula:**
```http
POST /api/matriculas
Authorization: Bearer <token>
Content-Type: application/json

{
    "id_turma": 123
}
```

**Resposta de Sucesso (201):**
```json
{
    "message": "Matrícula realizada com sucesso!",
    "matricula": {
        "id_matricula": 456,
        "id_aluno": 789,
        "id_turma": 123,
        "status_aprovacao": "CURSANDO",
        "progresso_percentual": 0
    }
}
```

**Resposta de Erro (409 - Duplicada):**
```json
{
    "message": "Você já está matriculado nesta turma!"
}
```

---

## 📊 Fluxo de Dados

```
┌─────────────┐
│   ALUNO     │
│   Logado    │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────┐
│  index.html                 │
│  - Carrega turmas da API    │
│  - Renderiza com botões     │
└──────┬──────────────────────┘
       │
       │ Click "Matricular"
       ▼
┌─────────────────────────────┐
│  Modal de Confirmação       │
│  - confirmSuccess()         │
└──────┬──────────────────────┘
       │
       │ Confirmado
       ▼
┌─────────────────────────────┐
│  POST /api/matriculas       │
│  - id_turma: 123            │
└──────┬──────────────────────┘
       │
       │ Sucesso (201)
       ▼
┌─────────────────────────────┐
│  Atualiza UI                │
│  - Botão → "✓ Matriculado"  │
│  - Alert de sucesso         │
│  - Recarrega lista          │
└─────────────────────────────┘
```

---

## 🧪 Como Testar

### Pré-requisitos
1. Servidor rodando (`npm start`)
2. Banco de dados configurado
3. Pelo menos uma turma com status `ABERTA`
4. Usuário do tipo ALUNO criado

### Passo a Passo

#### 1. Acessar Catálogo
```
http://localhost:3000/index.html
```

#### 2. Fazer Login como Aluno
- Email: aluno.disponivel@example.test
- Senha: a senha mock informada em `CANONICAL_SEED_PASSWORD`

#### 3. Verificar Turmas Disponíveis
- Turmas `ABERTA` / “Inscrições abertas” → botão “📝 Matricular” visível
- Turmas `FECHADA` ou `ENCERRADA` → botão “🔒 Fechado”
- Turmas já matriculadas → Botão "✓ Matriculado"

#### 4. Realizar Matrícula
1. Click em "📝 Matricular"
2. Confirmar no modal
3. Aguardar feedback
4. Verificar botão mudou para "✓ Matriculado"

#### 5. Verificar no Backend
```sql
SELECT * FROM Matriculas WHERE id_aluno = <seu_id>;
```

---

## 🐛 Tratamento de Erros

### Erros Tratados

| Erro | Mensagem Exibida | Ação |
|------|------------------|------|
| Usuário não logado | Redireciona para login | Login |
| Matrícula duplicada | "Você já está matriculado nesta turma." | Nenhum |
| Turma não existe | "Turma não encontrada." | Nenhum |
| Turma não aberta | "Esta turma não está aberta para matrículas." | Nenhum |
| Erro de rede | "Erro de conexão. Verifique sua internet" | Tentar novamente |
| Token expirado | Redireciona para login | Login |

---

## 🔒 Segurança

### Validações de Segurança

1. **Autenticação:** Apenas usuários logados podem se matricular
2. **Autorização:** Apenas usuários do tipo ALUNO podem se matricular
3. **Token JWT:** Enviado em todas as requisições
4. **Validação Backend:** Middlewares checkAuth e checkRole
5. **Constraint de Banco:** Unique constraint evita duplicatas

---

## 📈 Melhorias Futuras

### Funcionalidades Adicionais Sugeridas

1. **Lista de Espera:** Quando turma estiver cheia
2. **Cancelamento de Matrícula:** Botão para cancelar diretamente do catálogo
3. **Notificações:** Avisar quando novas turmas abrirem
4. **Histórico:** Mostrar turmas já cursadas
5. **Pré-requisitos:** Validar se aluno tem pré-requisitos da turma
6. **Vagas Limitadas:** Mostrar número de vagas restantes

---

## 📋 Checklist de Validação

- [x] Botão aparece apenas para alunos logados
- [x] Botão "Matricular" habilitado apenas para turmas abertas
- [x] Modal de confirmação exibe nome da turma
- [x] API é chamada corretamente
- [x] Feedback visual de sucesso/erro é exibido
- [x] Botão atualiza para "✓ Matriculado" após sucesso
- [x] Matrículas duplicadas são tratadas
- [x] Usuário não logado é redirecionado para login
- [x] CSS dos botões está responsivo
- [x] Funciona em mobile e desktop

---

## 🎯 Resumo do Valor Entregue

### Antes
- ❌ Sem botão de matrícula no catálogo
- ❌ Alunos não conseguiam se inscrever em turmas
- ❌ Necessário acesso administrativo para criar matrículas

### Depois
- ✅ Botão de matrícula visível e acessível
- ✅ Fluxo completo de auto-matrícula
- ✅ Confirmação via modal
- ✅ Feedback visual imediato
- ✅ Tratamento de erros robusto
- ✅ Validação de duplicidade
- ✅ UI responsiva e intuitiva

---

**Implementado em:** 19 de março de 2026
**Arquivos modificados:** 3 (script.js, modal.js, style.css)
**Linhas adicionadas:** ~150
**Funcionalidade:** 100% implementada e integrada com backend
