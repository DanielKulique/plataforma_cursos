# Backlog Executável do Front-end

Este backlog foi organizado para execução incremental com a API atual do projeto.

## Estado atual do front
- Página pública básica com listagem de cursos.
- Sessão básica já consultando `/api/auth/me`.

---

## Épico 1 — Login
### Tarefas
- [ ] Criar tela de login (`/login`) com email e senha.
- [ ] Integrar `POST /api/auth/login`.
- [ ] Salvar token JWT no `localStorage`.
- [ ] Exibir mensagens de erro (401).
- [ ] Redirecionar por perfil (ALUNO, PROFESSOR, ADMIN).

### Endpoints
- `POST /api/auth/login`

### Critérios de aceite
- Login válido autentica e redireciona.
- Login inválido exibe erro amigável.

---

## Épico 2 — Sessão e Navegação Base
### Tarefas
- [ ] Criar módulo `auth.js` com `getToken`, `setToken`, `logout`, `getCurrentUser`.
- [ ] Criar guardas de autenticação e perfil.
- [ ] Navbar dinâmica com estado logado/deslogado.
- [ ] Implementar logout limpando token e redirecionando.

### Endpoints
- `GET /api/auth/me`

### Critérios de aceite
- Sessão persiste ao recarregar página.
- Rotas protegidas bloqueiam acesso sem token.

---

## Épico 3 — Catálogo (Público)
### Tarefas
- [ ] Tela de cursos com cards.
- [ ] Tela de turmas por curso.
- [ ] Estados de loading, erro e vazio.
- [ ] Ação “Matricular” para ALUNO autenticado.

### Endpoints
- `GET /api/cursos`
- `GET /api/cursos/:id`
- `GET /api/turmas`
- `GET /api/turmas/:id`

### Critérios de aceite
- Visitante navega no catálogo sem login.
- Aluno logado vê CTA de matrícula.

---

## Épico 4 — Área do Aluno
### Tarefas
- [ ] Dashboard “Minhas matrículas”.
- [ ] Listar matrículas do aluno logado.
- [ ] Ver detalhe de matrícula.
- [ ] Cancelar matrícula com confirmação.

### Endpoints
- `GET /api/auth/me`
- `GET /api/matriculas/aluno/:id`
- `GET /api/matriculas/:id`
- `POST /api/matriculas`
- `DELETE /api/matriculas/:id`

### Critérios de aceite
- Aluno acessa somente seus dados.
- Erro 403 exibido corretamente quando sem permissão.

---

## Épico 5 — Área do Professor
### Tarefas
- [ ] Tela de turmas ministradas.
- [ ] Tela de alunos matriculados por turma.
- [ ] Atualização de nota/progresso/status da matrícula.
- [ ] Mensagens de sucesso/erro nas atualizações.

### Endpoints
- `GET /api/turmas`
- `GET /api/matriculas/turma/:id_turma`
- `PATCH /api/matriculas/:id`

### Critérios de aceite
- Professor só gerencia turmas/matrículas permitidas.
- Erros 403 são tratados na UI.

---

## Épico 6 — Área Admin
### Tarefas
- [ ] CRUD de cursos.
- [ ] CRUD de turmas.
- [ ] Gestão de usuários (listar, editar, excluir).
- [ ] Guardas de rota para ADMIN.

### Endpoints
- Cursos: `GET/POST/PUT/DELETE /api/cursos`
- Turmas: `GET/POST/PATCH/DELETE /api/turmas`
- Usuários: `GET /api/usuarios`, `PATCH /api/usuarios/:id`, `DELETE /api/usuarios/:id`

### Critérios de aceite
- Apenas ADMIN acessa operações administrativas.
- Fluxos CRUD com confirmação e tratamento de erro.

---

## Planejamento por Sprint

### Sprint 1
- Login + Sessão + Navbar + Logout
- Catálogo básico (cursos e turmas)

### Sprint 2
- Área do Aluno completa
- Matrícula e cancelamento

### Sprint 3
- Área do Professor (turmas + atualização de matrícula)

### Sprint 4
- Área Admin (CRUD)
- Polimento de UX (loading, feedback, estados vazios)

---

## Definição de pronto mínima para iniciar o front (já atendida)
- Auth com login e `/auth/me` disponível.
- Endpoints centrais de cursos, turmas e matrículas disponíveis.
- Regras básicas de permissão implementadas no back-end.

✅ Recomendação: iniciar imediatamente pela Sprint 1.
