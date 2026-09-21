> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Dados Mock para Testes - Sala Virtual e Conteúdos

> Consolidação: a senha fixa de demonstração foi substituída por placeholder; use os seeds atuais com senha configurada no ambiente.

> Documento histórico. Para o banco e seed canônicos do Goal 2, use `docs/engineering/goals/GOAL2_BANCO_MATRICULA.md`. Não use este seed histórico para preparar desenvolvimento ou integração.
## Resumo da Implementação

**Data:** 19 de março de 2026

---

## 📊 Dados Mock Criados

### Execução do Seed
```bash
node scripts/seed_matriculas_mock.js
```

### Resultado
```
✅ 8 matrículas criadas
✅ 60 conteúdos criados (10 por turma × 6 turmas)
✅ Tabelas Conteudos e ProgressoAluno criadas
```

---

## 👥 Usuários de Teste

Todos os usuários têm a senha: **`<senha-definida-localmente>`**

### Alunos (5 usuários)
| Email | Senha | Status |
|-------|-------|--------|
| `joao@email.com` | <senha-definida-localmente> | ✅ Com matrículas |
| `maria@email.com` | <senha-definida-localmente> | ✅ Com matrículas |
| `lucas@email.com` | <senha-definida-localmente> | ✅ Com matrículas |
| `isabela@email.com` | <senha-definida-localmente> | ✅ Com matrículas |
| `gabriel@email.com` | <senha-definida-localmente> | ✅ Com matrículas |

### Professores (3 usuários)
| Email | Senha |
|-------|-------|
| `carlos.silva@plataforma.com` | <senha-definida-localmente> |
| `ana.costa@plataforma.com` | <senha-definida-localmente> |
| `roberto.martins@plataforma.com` | <senha-definida-localmente> |

### Admin (1 usuário)
| Email | Senha |
|-------|-------|
| `admin@teste.com` | <senha-definida-localmente> |

---

## 📚 Estrutura de Dados Mock

### Turmas Existentes (6 turmas)
Cada turma tem:
- 10 conteúdos (4 vídeos, 2 textos, 2 PDFs, 2 atividades)
- 1-3 alunos matriculados
- Progresso variado (0-100%)

### Conteúdos por Turma
```
📺 Vídeos (4):
   1. Boas-vindas e Apresentação do Curso (5:30)
   2. O Que é Plágio e Como Evitá-lo (12:45)
   3. Direitos Autorais na Prática (18:20)
   4. Como Citar Fontes Corretamente (10:15)

📄 Textos (2):
   1. Material de Apoio: Definições
   2. Guia de Boas Práticas

📕 PDFs (2):
   1. Apostila: Propriedade Intelectual
   2. Checklist: Verificação de Originalidade

✏️ Atividades (2):
   1. Exercício: Identificando Plágio
   2. Trabalho: Análise de Caso
```

### Matrículas Criadas (8 matrículas)
- Cada aluno está matriculado em 1-3 turmas aleatórias
- Progresso aleatório entre 0-100%
- Algumas matrículas com 100% de progresso têm nota final (APROVADO/REPROVADO)

---

## 🎯 Como Testar o Fluxo Completo

### 1. Fazer Login como Aluno

```
1. Acesse: http://localhost:3000/login.html
2. Email: joao@email.com
3. Senha: <senha-definida-localmente>
4. Click em "Entrar"
```

### 2. Acessar Sala Virtual

```
1. Após login, click em "Sala Virtual" na navbar
2. OU acesse direto: http://localhost:3000/sala-virtual.html
```

**O que você verá:**
- Cards das turmas matriculadas
- Progresso de cada turma
- Status (`ABERTA`, `FECHADA`, `ENCERRADA`, com rótulos amigáveis na interface)
- Botões: "Entrar na sala de aula", "Prova", "Exercícios"

### 3. Entrar na Sala de Aula

```
1. Click em "Entrar na sala de aula" em qualquer turma
```

**O que você verá:**
- Informações da turma (nome, status, período, carga horária)
- Barra de progresso visual
- Lista de conteúdos com filtros:
  - 🎥 Vídeos
  - 📄 Textos
  - 📕 PDFs
  - ✏️ Atividades
- Botões "Ir para prova" e "Ir para exercícios"

### 4. Assistir Vídeo

```
1. Click em qualquer conteúdo do tipo "🎥 Vídeo"
2. Player de vídeo será exibido
3. Click em "✓ Marcar como concluída"
4. Barra de progresso atualiza
```

### 5. Acessar Questionários

#### Prova:
```
1. Click em "Ir para prova"
2. OU acesse: http://localhost:3000/questionario.html?tipo=prova&id_turma=1&demo=1
```

#### Exercício:
```
1. Click em "Ir para exercícios"
2. OU acesse: http://localhost:3000/questionario.html?tipo=exercicio&id_turma=1&demo=1
```

**O que você verá:**
- 5 questões aleatórias do banco
- Dificuldade e pontos por questão
- Contador de respostas (0/5 respondidas)
- Botão "Finalizar" (desabilitado até responder todas)
- Resultado com acertos, percentual e tempo

---

## 🔗 URLs de Teste

### Página de Login
```
http://localhost:3000/login.html
```

### Sala Virtual (requer login)
```
http://localhost:3000/sala-virtual.html
```

### Sala de Aula (demo mode)
```
http://localhost:3000/sala-aula.html?id_turma=1&demo=1
http://localhost:3000/sala-aula.html?id_turma=2&demo=1
http://localhost:3000/sala-aula.html?id_turma=3&demo=1
```

### Questionário - Prova (demo mode)
```
http://localhost:3000/questionario.html?tipo=prova&id_turma=1&demo=1
```

### Questionário - Exercício (demo mode)
```
http://localhost:3000/questionario.html?tipo=exercicio&id_turma=1&demo=1
```

### Catálogo (público)
```
http://localhost:3000/index.html
```

---

## 📊 Progresso e Evolução

### Barra de Progresso Visual
- Localizada na sala de aula
- Atualiza automaticamente ao marcar conteúdos
- Gradiente roxo → ciano
- Exibe percentual e contagem (X de Y conteúdos)

### Cálculo do Progresso
```
Progresso = (conteúdos_concluidos / total_conteudos) × 100
```

### Status dos Conteúdos
| Status | Cor | Descrição |
|--------|-----|-----------|
| Não iniciado | Cinza | Conteúdo ainda não acessado |
| Em andamento | Amarelo | Conteúdo aberto mas não concluído |
| Concluído | Verde | Conteúdo marcado como concluído |

---

## 🐛 Correções Aplicadas

### Model de Matrícula
- ✅ Contrato canônico consolidado em `id_aluno` nas queries
- ✅ Funções corrigidas:
  - `buscarMatriculaPorAluno()`
  - `buscarSalaVirtualDoAluno()`

### Tabela Matriculas
- ✅ Campo correto: `id_aluno`
- ✅ Seed atualizado para usar campo correto

---

## 📋 Checklist de Validação

### Sala Virtual
- [ ] Login como aluno funciona
- [ ] Sala virtual exibe turmas matriculadas
- [ ] Progresso de cada turma é exibido
- [ ] Botão "Entrar na sala" funciona
- [ ] Botões "Prova" e "Exercícios" funcionam

### Sala de Aula
- [ ] Informações da turma são exibidas
- [ ] Barra de progresso visual funciona
- [ ] Lista de conteúdos é carregada
- [ ] Filtros de conteúdo funcionam
- [ ] Click em vídeo abre player
- [ ] Botão "Marcar como concluída" funciona
- [ ] Progresso atualiza após marcar conteúdo

### Questionários
- [ ] Prova carrega 5 questões aleatórias
- [ ] Exercício carrega 5 questões aleatórias
- [ ] Contador de respostas atualiza
- [ ] Botão finalizar habilita após responder todas
- [ ] Resultado exibe acertos e percentual
- [ ] Tempo decorrido é calculado
- [ ] Botão "Refazer" funciona

### Matrícula no Catálogo
- [ ] Botão "Matricular" aparece para alunos
- [ ] Modal de confirmação exibe
- [ ] Matrícula é criada no banco
- [ ] Botão muda para "✓ Matriculado"

---

## 🎯 Funcionalidades Disponíveis para Teste

| Funcionalidade | Status | URL |
|----------------|--------|-----|
| Login | ✅ Funcional | `/login.html` |
| Catálogo de Cursos | ✅ Funcional | `/index.html` |
| Catálogo de Turmas | ✅ Funcional | `/index.html` |
| Matrícula em Turmas | ✅ Funcional | `/index.html` (botão) |
| Sala Virtual | ✅ Funcional | `/sala-virtual.html` |
| Sala de Aula | ✅ Funcional | `/sala-aula.html?id_turma=X` |
| Player de Vídeo | ✅ Funcional | Embutido na sala |
| Conteúdos (lista) | ✅ Funcional | Embutido na sala |
| Barra de Progresso | ✅ Funcional | Embutido na sala |
| Questionário (Prova) | ✅ Funcional | `/questionario.html?tipo=prova` |
| Questionário (Exercício) | ✅ Funcional | `/questionario.html?tipo=exercicio` |
| Área do Professor | ✅ Funcional | `/professor.html` |
| Gerenciar Turma | ✅ Funcional | `/professor-turma.html?id_turma=X` |

---

## 🚀 Comandos Úteis

### Iniciar Servidor
```bash
npm start
```

### Rodar Seed de Dados Mock
```bash
node scripts/seed_matriculas_mock.js
```

### Rodar Seed Principal (se necessário)
```bash
node scripts/seed_dados.js
```

### Verificar Dados no Banco
```sql
-- Ver matrículas por aluno
SELECT u.nome_completo, t.nome_turma, m.progresso_percentual, m.nota_final, m.status_aprovacao
FROM Matriculas m
JOIN Usuarios u ON m.id_aluno = u.id_usuario
JOIN Turmas t ON m.id_turma = t.id_turma
WHERE u.tipo = 'ALUNO'
ORDER BY u.nome_completo;

-- Ver conteúdos por turma
SELECT t.nome_turma, c.titulo, c.tipo, c.ordem
FROM Conteudos c
JOIN Turmas t ON c.id_turma = t.id_turma
ORDER BY t.nome_turma, c.ordem;

-- Ver progresso por aluno
SELECT u.nome_completo, t.nome_turma, COUNT(*) as total_conteudos,
       SUM(CASE WHEN p.concluido THEN 1 ELSE 0 END) as concluidos
FROM ProgressoAluno p
JOIN Usuarios u ON p.id_usuario = u.id_usuario
JOIN Turmas t ON p.id_turma = t.id_turma
GROUP BY u.id_usuario, t.id_turma;
```

---

## 📝 Observações Importantes

1. **Demo Mode**: As URLs com `&demo=1` funcionam sem login para testes rápidos
2. **Progresso**: O progresso é calculado baseado nos conteúdos marcados como concluídos
3. **Vídeos**: Os vídeos usam URLs do YouTube em modo embed
4. **Questões Aleatórias**: Cada tentativa de questionário seleciona 5 questões aleatórias
5. **Matrículas**: Alunos já estão matriculados via seed, mas podem se matricular em novas turmas pelo catálogo

---

**Seed executado com sucesso em:** 19 de março de 2026
**Total de matrículas:** 8
**Total de conteúdos:** 60
**Alunos com acesso:** 5
