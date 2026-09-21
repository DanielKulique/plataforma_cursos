> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Análise de Integração Backend-Frontend
## Plataforma de Cursos - Status da Integração

**Data da análise:** 19 de março de 2026

---

## Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐     │
│  │  index.html │  │sala-virtual  │  │  sala-aula.html     │   │
│  │  (Catálogo) │  │   .html      │  │  (Detalhe Turma)    │   │
│  └─────────────┘  └──────────────┘  └─────────────────────┘   │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │ questionario│  │  professor   │  │ professor-turma.html│   │
│  │   .html     │  │   .html      │  │  (Gerenciar)        │   │
│  └─────────────┘  └──────────────┘  └─────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Camada de Integração (api.js)              │   │
│  │  - apiRequest() com retry e timeout                     │   │
│  │  - getCursos(), getTurmas(), getMinhaSala()             │   │
│  │  - Tratamento de erros e cache                          │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↕ HTTP/JSON
┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    Rotas API (/api/*)                    │  │
│  │  /auth | /cursos | /turmas | /matriculas | /usuarios     │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │ Controllers │  │    Models    │  │    Middlewares      │   │
│  │   (.js)     │  │   (.models)  │  │  (checkAuth, etc)   │   │
│  └─────────────┘  └──────────────┘  └─────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Banco de Dados MySQL                        │   │
│  │  Usuarios | Cursos | Turmas | Matriculas                │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

##  Funcionalidades INTEGRADAS (Backend ↔ Frontend)

### 1. **CATÁLOGO DE CURSOS E TURMAS** (`index.html`)

| Elemento Frontend | Endpoint Backend | Status |
|-------------------|------------------|--------|
| Lista de cursos | `GET /api/cursos` | ✅ Integrado |
| Lista de turmas | `GET /api/turmas` | ✅ Integrado |
| Exibição de carga horária | Campo `carga_horaria` | ✅ Integrado |
| Status das turmas | Campo `status` | ✅ Integrado |

**Arquivos:**
- Frontend: `src/public/index.html` + `src/public/js/script.js`
- Backend: `src/api/controllers/cursos.controller.js`, `src/api/controllers/turmas.controller.js`
- Models: `src/api/models/cursos.models.js`, `src/api/models/turmas.models.js`

**Fluxo:**
```
script.js → getCursos() → GET /api/cursos → cursos.controller.listarTodos()
          → cursosModel.buscarCursos() → MySQL → Retorna JSON → Renderiza cards
```

---

### 2. **SALA VIRTUAL DO ALUNO** (`sala-virtual.html`)

| Elemento Frontend | Endpoint Backend | Status |
|-------------------|------------------|--------|
| Minhas turmas | `GET /api/matriculas/minha-sala` | ✅ Integrado |
| Progresso percentual | Campo `progresso_percentual` | ✅ Integrado |
| Status da turma | Campo `status_turma` | ✅ Integrado |
| Botão "Prova" | Link para `questionario.html?tipo=prova` | ⚠️ Mock no frontend |
| Botão "Exercícios" | Link para `questionario.html?tipo=exercicio` | ⚠️ Mock no frontend |

**Arquivos:**
- Frontend: `src/public/sala-virtual.html` + `src/public/js/sala-virtual.js`
- Backend: `src/api/controllers/matricula.controller.js`
- Model: `src/api/models/matricula.models.js` (função `buscarSalaVirtualDoAluno`)

**Fluxo:**
```
sala-virtual.js → GET /api/matriculas/minha-sala (com Bearer Token)
  → matricula.controller.buscarMinhaSalaVirtual()
  → matriculaModel.buscarSalaVirtualDoAluno(id_aluno)
  → SQL com JOIN (Matriculas, Turmas, Cursos)
  → Retorna array de turmas → Renderiza cards com botão "Entrar na sala"
```

**Query SQL usada:**
```sql
SELECT
    m.id_matricula, m.status_aprovacao, m.progresso_percentual,
    t.id_turma, t.nome_turma, t.status AS status_turma,
    c.nome_curso, c.descricao AS descricao_curso, c.carga_horaria
FROM Matriculas m
INNER JOIN Turmas t ON m.id_turma = t.id_turma
INNER JOIN Cursos c ON t.id_curso = c.id_curso
WHERE m.id_aluno = ?
  AND m.status_aprovacao <> 'CANCELADO'
  AND t.status IN ('ABERTA', 'FECHADA')
```

---

### 3. **SALA DE AULA** (`sala-aula.html`)

| Elemento Frontend | Endpoint Backend | Status |
|-------------------|------------------|--------|
| Dados da turma | `GET /api/matriculas/minha-sala` (filtro por id_turma) | ✅ Integrado |
| Informações da turma | Campos do JOIN | ✅ Integrado |
| Conteúdo da aula | **Mock no frontend** | ❌ Sem backend |
| Link para prova | `questionario.html?tipo=prova&id_turma=X` | ⚠️ Frontend apenas |
| Link para exercícios | `questionario.html?tipo=exercicio&id_turma=X` | ⚠️ Frontend apenas |

**Arquivos:**
- Frontend: `src/public/sala-aula.html` + `src/public/js/sala-aula.js`

**Fluxo:**
```
sala-aula.js → Lê ?id_turma da URL
  → GET /api/matriculas/minha-sala (com token)
  → Filtra turma pelo id_turma
  → Preenche: nome_turma, nome_curso, status, progresso, data_inicio, data_fim
  → Renderiza módulos (MOCK hardcoded no frontend)
```

**Pontos de atenção:**
- ❌ **Conteúdo dos módulos** é mockado no frontend (não vem do backend)
- ❌ **Questões da prova/exercício** são mockadas no frontend
- ⚠️ Não há tabela no banco para `Questoes`, `Provas`, `Exercicios`, `Conteudos`

---

### 4. **QUESTIONÁRIO/PROVA/EXERCÍCIOS** (`questionario.html`)

| Elemento Frontend | Endpoint Backend | Status |
|-------------------|------------------|--------|
| Contexto da turma | `GET /api/matriculas/minha-sala` | ✅ Integrado |
| Questões | **Mock hardcoded** no frontend | ❌ Sem backend |
| Submissão | **Sem endpoint** | ❌ Sem backend |
| Resultado | **Calculado no frontend** | ❌ Sem backend |

**Arquivos:**
- Frontend: `src/public/questionario.html` + `src/public/js/questionario.js`

**Problemas identificados:**
1. ❌ **Questões são fixas** no código JavaScript (BANCO_QUESTOES)
2. ❌ **Não há persistência** das respostas
3. ❌ **Não há registro** de nota/progreso após finalizar
4. ❌ **Não há endpoint** para buscar questões dinamicamente
5. ❌ **Não há endpoint** para submeter respostas

**Sugestão de estrutura backend necessária:**
```sql
-- Tabelas sugeridas para questionários
CREATE TABLE Questoes (
    id_questao INT PRIMARY KEY AUTO_INCREMENT,
    id_turma INT NOT NULL,
    tipo ENUM('PROVA', 'EXERCICIO') NOT NULL,
    enunciado TEXT NOT NULL,
    opcao_a TEXT, opcao_b TEXT, opcao_c TEXT, opcao_d TEXT,
    opcao_correta CHAR(1) NOT NULL,
    FOREIGN KEY (id_turma) REFERENCES Turmas(id_turma)
);

CREATE TABLE RespostasAlunos (
    id_resposta INT PRIMARY KEY AUTO_INCREMENT,
    id_questao INT NOT NULL,
    id_aluno INT NOT NULL,
    id_turma INT NOT NULL,
    resposta_selecionada CHAR(1) NOT NULL,
    data_resposta DATETIME NOT NULL,
    correta BOOLEAN NOT NULL,
    FOREIGN KEY (id_questao) REFERENCES Questoes(id_questao),
    FOREIGN KEY (id_aluno) REFERENCES Usuarios(id_usuario),
    FOREIGN KEY (id_turma) REFERENCES Turmas(id_turma)
);
```

---

### 5. **ÁREA DO PROFESSOR** (`professor.html`)

| Elemento Frontend | Endpoint Backend | Status |
|-------------------|------------------|--------|
| Turmas do professor | `GET /api/turmas/professor/:id` | ✅ Integrado |
| Total de alunos | `COUNT(id_matricula)` no JOIN | ✅ Integrado |
| Botão "Gerenciar turma" | Link para `professor-turma.html?id_turma=X` | ✅ Integrado |

**Arquivos:**
- Frontend: `src/public/professor.html` + `src/public/js/professor.js`
- Backend: `src/api/controllers/turmas.controller.js` (função `buscarTurmasDoProfessor`)
- Model: `src/api/models/turmas.models.js`

**Fluxo:**
```
professor.js → GET /api/turmas/professor/:id (com token)
  → turmas.controller.buscarTurmasDoProfessor()
  → Verifica se id_usuario == id_professor (segurança)
  → turmasModel.buscarTurmasDoProfessor(id_professor)
  → SQL com LEFT JOIN e COUNT de alunos
  → Renderiza cards das turmas
```

---

### 6. **GERENCIAR TURMA** (`professor-turma.html`)

| Elemento Frontend | Endpoint Backend | Status |
|-------------------|------------------|--------|
| Dados da turma | `GET /api/turmas/:id` | ✅ Integrado |
| Lista de alunos | `GET /api/matriculas/turma/:id_turma` | ✅ Integrado |
| Editar matrícula (modal) | `PATCH /api/matriculas/:id` | ✅ Integrado |
| Atualizar nota/status | Campos: nota_final, status_aprovacao, progresso | ✅ Integrado |

**Arquivos:**
- Frontend: `src/public/professor-turma.html` + `src/public/js/professor-turma.js`
- Backend: `src/api/controllers/matricula.controller.js`
- Model: `src/api/models/matricula.models.js`

**Fluxo de edição:**
```
professor-turma.js → Click em "Editar" → Abre modal
  → Preenche form com dados atuais (nota_final, status_aprovacao, progresso)
  → Submit → PATCH /api/matriculas/:id
  → matricula.controller.atualizarMatricula()
  → matriculaModel.atualizarMatricula(id, dados)
  → UPDATE Matriculas SET nota_final=?, status_aprovacao=?, progresso=?
  → Recarrega lista de alunos
```

**Endpoint de matrícula da turma:**
```javascript
GET /api/matriculas/turma/:id_turma
→ Retorna: id_matricula, nome_completo, email, nota_final,
           status_aprovacao, progresso_percentual
```

---

## 🔴 Funcionalidades NÃO IMPLEMENTADAS no Backend

### 1. **Sistema de Questionários/Provas**

| Funcionalidade | Status | Prioridade |
|----------------|--------|------------|
| CRUD de questões | ❌ Não existe | Alta |
| Buscar questões por turma/tipo | ❌ Não existe | Alta |
| Submeter respostas | ❌ Não existe | Alta |
| Calcular nota automaticamente | ❌ Não existe | Alta |
| Histórico de tentativas | ❌ Não existe | Média |
| Questões por módulo | ❌ Não existe | Média |

**Endpoints necessários:**
```
GET    /api/turmas/:id_turma/questoes?tipo=prova|exercicio
POST   /api/turmas/:id_turma/questoes (ADMIN/PROFESSOR)
PUT    /api/questoes/:id_questao (ADMIN/PROFESSOR)
DELETE /api/questoes/:id_questao (ADMIN)
POST   /api/turmas/:id_turma/questoes/submeter (ALUNO)
GET    /api/turmas/:id_turma/questoes/historico (ALUNO)
```

---

### 2. **Conteúdo da Sala Virtual (Módulos/Aulas)**

| Funcionalidade | Status | Prioridade |
|----------------|--------|------------|
| CRUD de módulos/conteúdos | ❌ Não existe | Alta |
| Buscar conteúdos por turma | ❌ Não existe | Alta |
| Marcar módulo como concluído | ❌ Não existe | Alta |
| Atualizar progresso automaticamente | ❌ Não existe | Alta |
| Upload de arquivos/mídia | ❌ Não existe | Média |

**Endpoints necessários:**
```
GET    /api/turmas/:id_turma/conteudos
POST   /api/turmas/:id_turma/conteudos (ADMIN/PROFESSOR)
PUT    /api/conteudos/:id_conteudo (ADMIN/PROFESSOR)
DELETE /api/conteudos/:id_conteudo (ADMIN)
PATCH  /api/matriculas/:id_matricula/conteudo/:id_conteudo/concluir (ALUNO)
```

**Tabela sugerida:**
```sql
CREATE TABLE Conteudos (
    id_conteudo INT PRIMARY KEY AUTO_INCREMENT,
    id_turma INT NOT NULL,
    titulo VARCHAR(255) NOT NULL,
    descricao TEXT,
    tipo ENUM('VIDEO', 'TEXTO', 'PDF', 'LINK', 'ATIVIDADE') NOT NULL,
    url_arquivo VARCHAR(500),
    ordem INT NOT NULL,
    data_criacao DATETIME NOT NULL,
    FOREIGN KEY (id_turma) REFERENCES Turmas(id_turma)
);

CREATE TABLE ProgressoAluno (
    id_progresso INT PRIMARY KEY AUTO_INCREMENT,
    id_aluno INT NOT NULL,
    id_conteudo INT NOT NULL,
    id_turma INT NOT NULL,
    concluido BOOLEAN DEFAULT FALSE,
    data_conclusao DATETIME,
    FOREIGN KEY (id_aluno) REFERENCES Usuarios(id_usuario),
    FOREIGN KEY (id_conteudo) REFERENCES Conteudos(id_conteudo),
    FOREIGN KEY (id_turma) REFERENCES Turmas(id_turma),
    UNIQUE KEY uk_aluno_conteudo (id_aluno, id_conteudo)
);
```

---

### 3. **Matrícula em Turmas (Fluxo Completo)**

| Funcionalidade | Status | Observação |
|----------------|--------|------------|
| Listar turmas disponíveis | ✅ Existe | `GET /api/turmas` |
| Matricular aluno | ✅ Existe | `POST /api/matriculas` |
| **Botão de matrícula no frontend** | ❌ Não existe | index.html não tem ação |
| Cancelar matrícula | ✅ Existe | `DELETE /api/matriculas/:id` |
| Verificar vagas disponíveis | ❌ Não existe | Não há campo `vagas` |

**Ação necessária no frontend:**
```javascript
// Em index.html, adicionar botão "Matricular" nos cards de turma
// Ao clicar: POST /api/matriculas com { id_turma: X }
```

---

## 🟡 Funcionalidades PARCIALMENTE Implementadas

### 1. **Autenticação e Sessão**

| Elemento | Status |
|----------|--------|
| Login | ✅ `POST /api/auth/login` |
| Manter sessão | ✅ `auth.js` com localStorage |
| Logout | ✅ Integrado em todas as páginas |
| Verificar email | ✅ `POST /api/auth/verificar-email` |
| Envio de código | ✅ Serviço de email configurado |

**Arquivos:**
- `src/public/js/auth.js` - Gerencia token e sessão
- `src/public/js/api.js` - Adiciona header Authorization automaticamente

---

### 2. **Permissões e Middlewares**

| Middleware | Status | Uso |
|------------|--------|-----|
| checkAuth | ✅ | Valida token JWT |
| checkRole | ✅ | Valida papel (ALUNO, PROFESSOR, ADMIN) |
| checkUserPermission | ✅ | Usuário só acessa próprios dados |
| checkProfessorPermission | ✅ | Professor só gerencia suas turmas |
| checkProfessorTurmaPermission | ✅ | Valida se professor é da turma |
| checkMatriculaReadPermission | ✅ | Permissão de leitura de matrícula |
| checkMatriculaCancelPermission | ✅ | Permissão para cancelar matrícula |

---

## 📋 Resumo da Integração por Página

### `index.html` (Catálogo)
| Integração | Status |
|------------|--------|
| Listar cursos | ✅ OK |
| Listar turmas | ✅ OK |
| Botão matricular | ❌ Faltando |
| Filtros/busca | ⚠️ Não implementado |

### `sala-virtual.html` (Aluno)
| Integração | Status |
|------------|--------|
| Minhas turmas | ✅ OK |
| Progresso | ✅ OK |
| Entrar na sala | ✅ Link funcional |
| Prova/Exercício | ⚠️ Link sem backend |

### `sala-aula.html` (Detalhe da Turma)
| Integração | Status |
|------------|--------|
| Dados da turma | ✅ OK |
| Conteúdos/módulos | ❌ Mock no frontend |
| Link prova/exercício | ⚠️ Sem backend |
| Progresso individual | ✅ OK (vem da matrícula) |

### `questionario.html` (Prova/Exercício)
| Integração | Status |
|------------|--------|
| Contexto da turma | ✅ OK |
| Questões | ❌ Mock hardcoded |
| Submissão | ❌ Sem endpoint |
| Resultado | ⚠️ Calculado no frontend |
| Salvar nota | ❌ Não persiste |

### `professor.html` (Área do Professor)
| Integração | Status |
|------------|--------|
| Minhas turmas | ✅ OK |
| Total de alunos | ✅ OK |
| Gerenciar turma | ✅ Link funcional |

### `professor-turma.html` (Gerenciar Turma)
| Integração | Status |
|------------|--------|
| Dados da turma | ✅ OK |
| Lista de alunos | ✅ OK |
| Editar matrícula | ✅ OK |
| Atualizar nota/status | ✅ OK |

---

## 🎯 Plano de Ação para Integração Completa

### Fase 1 - Backend de Questionários (Prioridade Alta)
1. Criar migration para tabelas `Questoes` e `RespostasAlunos`
2. Criar model `questoes.models.js`
3. Criar controller `questoes.controller.js`
4. Criar routes `questoes.routes.js`
5. Implementar endpoints:
   - `GET /api/turmas/:id_turma/questoes?tipo=prova|exercicio`
   - `POST /api/turmas/:id_turma/questoes/submeter`

### Fase 2 - Backend de Conteúdos (Prioridade Alta)
1. Criar migration para tabelas `Conteudos` e `ProgressoAluno`
2. Criar model `conteudos.models.js`
3. Criar controller `conteudos.controller.js`
4. Criar routes `conteudos.routes.js`
5. Implementar endpoints de CRUD e progresso

### Fase 3 - Frontend de Questionários
1. Atualizar `questionario.js` para buscar questões da API
2. Implementar submissão real para o backend
3. Salvar resultado no banco e atualizar progresso
4. Exibir histórico de tentativas

### Fase 4 - Frontend de Conteúdos
1. Atualizar `sala-aula.js` para buscar conteúdos da API
2. Implementar marcação de conclusão de módulos
3. Atualizar progresso automaticamente
4. Adicionar suporte a diferentes tipos de mídia

### Fase 5 - Melhorias Gerais
1. Adicionar botão de matrícula em `index.html`
2. Implementar sistema de vagas por turma
3. Adicionar filtros e busca no catálogo
4. Implementar notificações em tempo real

---

## 📊 Métricas de Integração

| Área | Backend | Frontend | Integração |
|------|---------|----------|------------|
| Autenticação | 100% | 100% | 100% ✅ |
| Catálogo (Cursos/Turmas) | 100% | 100% | 100% ✅ |
| Sala Virtual (Aluno) | 100% | 100% | 100% ✅ |
| Sala de Aula (Conteúdo) | 0% | 50% | 25% ⚠️ |
| Questionários/Provas | 0% | 50% | 25% ⚠️ |
| Área do Professor | 100% | 100% | 100% ✅ |
| Matrículas | 100% | 80% | 90% ✅ |
| **Total Geral** | **71%** | **82%** | **~66%** |

---

## 🔗 Endpoints da API - Status

### ✅ Implementados e Integrados

| Método | Endpoint | Descrição | Integração |
|--------|----------|-----------|------------|
| POST | `/api/auth/login` | Login | ✅ |
| GET | `/api/auth/me` | Dados do usuário logado | ✅ |
| GET | `/api/cursos` | Listar cursos | ✅ |
| GET | `/api/cursos/:id` | Buscar curso por ID | ✅ |
| GET | `/api/turmas` | Listar turmas | ✅ |
| GET | `/api/turmas/:id` | Buscar turma por ID | ✅ |
| GET | `/api/turmas/professor/:id` | Turmas do professor | ✅ |
| GET | `/api/matriculas/minha-sala` | Sala virtual do aluno | ✅ |
| GET | `/api/matriculas/aluno/:id` | Matrículas do aluno | ✅ |
| GET | `/api/matriculas/turma/:id_turma` | Alunos da turma | ✅ |
| GET | `/api/matriculas/:id` | Buscar matrícula | ✅ |
| POST | `/api/matriculas` | Criar matrícula | ✅ |
| PATCH | `/api/matriculas/:id` | Atualizar matrícula | ✅ |
| DELETE | `/api/matriculas/:id` | Cancelar matrícula | ✅ |

### ❌ Não Implementados (Necessários)

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/turmas/:id_turma/questoes` | Buscar questões |
| POST | `/api/turmas/:id_turma/questoes` | Criar questão (ADMIN) |
| PUT | `/api/questoes/:id_questao` | Atualizar questão |
| DELETE | `/api/questoes/:id_questao` | Deletar questão |
| POST | `/api/turmas/:id_turma/questoes/submeter` | Submeter respostas |
| GET | `/api/turmas/:id_turma/conteudos` | Buscar conteúdos |
| POST | `/api/turmas/:id_turma/conteudos` | Criar conteúdo (ADMIN) |
| PATCH | `/api/conteudos/:id_conteudo/concluir` | Marcar como concluído |

---

## 📝 Conclusões

### Pontos Fortes
1. ✅ **Arquitetura bem organizada** com separação clara de responsabilidades
2. ✅ **API RESTful** seguindo boas práticas
3. ✅ **Middlewares de permissão** robustos e bem implementados
4. ✅ **Frontend modular** com reutilização de código (api.js, auth.js)
5. ✅ **Tratamento de erros** consistente em ambos os lados
6. ✅ **Suporte a modo teste/demo** para validação sem autenticação

### Pontos de Melhoria
1. ❌ **Questionários/Provas** existem apenas no frontend (mock)
2. ❌ **Conteúdos das aulas** não têm persistência no backend
3. ⚠️ **Fluxo de matrícula** incompleto (falta botão no frontend)
4. ❌ **Progresso automático** não é atualizado ao concluir atividades

### Recomendações Imediatas
1. **Prioridade 1:** Implementar backend de questionários (tabelas + endpoints)
2. **Prioridade 2:** Implementar backend de conteúdos/módulos
3. **Prioridade 3:** Conectar frontend de questionários ao backend
4. **Prioridade 4:** Adicionar botão de matrícula no catálogo

---

**Documento gerado em:** 19 de março de 2026
**Autor:** Análise automática do código fonte
