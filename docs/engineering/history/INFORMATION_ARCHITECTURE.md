> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Arquitetura de informação da área acadêmica

## Objetivo

O frontend acadêmico segue o fluxo **hub → área especializada → detalhe**. Cada URL representa uma intenção principal, funciona por acesso direto e revalida sessão e autorização sem depender da página anterior.

Nenhum endpoint, migration, regra acadêmica ou contrato de resposta foi criado ou alterado neste refactor.

## Aluno

```text
Sala Virtual
└── Curso/turma
    ├── Aulas
    │   └── Detalhe da aula e materiais
    ├── Avaliações
    │   └── Questionário existente
    ├── Meu progresso
    └── Certificado

Sala Virtual
└── Meus certificados (visão global)
```

| Responsabilidade | URL |
| --- | --- |
| Escolher turma e continuar | `/sala-virtual.html` |
| Hub do curso | `/sala-aula.html?id_turma=…` |
| Estrutura de aulas | `/sala-aulas.html?id_turma=…` |
| Materiais de uma aula | `/sala-aula-detalhe.html?id_turma=…&id_aula=…` |
| Exercícios e provas | `/sala-avaliacoes.html?id_turma=…` |
| Métricas acadêmicas distintas | `/sala-progresso.html?id_turma=…` |
| Certificado da turma ou lista global | `/meus-certificados.html[?id_turma=…]` |

A Sala Virtual não busca certificados, questionários ou materiais. O hub do curso busca somente a matrícula. Conteúdos, avaliações e certificados são carregados ao entrar na respectiva área.

## Professor e administrador

```text
Minhas turmas / Turmas do admin
└── Painel da turma
    ├── Alunos
    ├── Aulas
    │   └── Detalhe da aula e CRUD de conteúdo
    ├── Avaliações
    │   └── Detalhe, perguntas, alternativas e gabarito
    └── Certificados
```

| Responsabilidade | URL |
| --- | --- |
| Contexto e atalhos | `/professor-turma.html?id_turma=…` |
| Matrículas, progresso e nota | `/professor-turma-alunos.html?id_turma=…` |
| Lista resumida de aulas | `/professor-turma-aulas.html?id_turma=…` |
| Conteúdos de uma aula | `/professor-turma-aula.html?id_turma=…&id_aula=…` |
| Lista resumida de avaliações | `/professor-turma-avaliacoes.html?id_turma=…` |
| Estrutura da avaliação | `/professor-turma-avaliacao.html?id_turma=…&id_questionario=…` |
| Emissão e histórico | `/professor-turma-certificados.html?id_turma=…` |

Professor e administrador compartilham as mesmas páginas. `teacher-class-context.js` mantém a diferença de escopo: o professor precisa encontrar a turma em sua lista autorizada; o admin mantém o escopo global. Os endpoints especializados continuam sendo a autoridade em toda leitura e mutação.

## Componentes compartilhados

- `academic-area.js`: cabeçalho, links reais, breadcrumbs, navegação contextual, parâmetros positivos, mensagens HTTP e badges.
- `student-course-context.js`: revalidação da matrícula e contexto visual do curso.
- `teacher-class-context.js`: sessão professor/admin, escopo da turma e estado estrutural editável.
- Classes compartilhadas em `components.css`: `section-navigation`, `academic-breadcrumbs`, `hub-grid`, `hub-card`, `summary-list`, `summary-row`, `course-masthead` e `metric-list`.

## Deep-link e compatibilidade

- Toda página lê `id_turma` e, quando necessário, `id_aula` ou `id_questionario` da URL.
- Parâmetros ausentes ou inválidos retornam ao hub seguro correspondente.
- Breadcrumbs e links “voltar” têm destinos explícitos; não dependem de `history.back()`.
- `/sala-aula.html` e `/professor-turma.html` foram preservadas e passaram a ser hubs, evitando 404 para links antigos.
- `/questionario.html` e seus contratos existentes continuam responsáveis pela realização de exercícios e provas.

## Redução de carga e renderização

| Entrada | Antes | Depois |
| --- | --- | --- |
| Sala Virtual | Turmas e certificados completos, incluindo versões | Somente `/api/matriculas/minha-sala`; nenhum certificado, questionário ou material é solicitado |
| Hub do curso | Conteúdos e avaliações no mesmo contexto | Somente a matrícula necessária ao resumo; cada área busca seus dados ao ser aberta |
| Painel da turma | Alunos, conteúdos, avaliações, perguntas e alternativas | Somente o contexto autorizado da turma e quatro atalhos |
| Lista de avaliações | Estrutura completa expandida | Uma linha-resumo por avaliação; perguntas e alternativas permanecem no detalhe |

O endpoint atual de conteúdos retorna módulos e conteúdos no mesmo contrato. Por isso, a lista de aulas ainda recebe esse payload para calcular contagens, mas renderiza apenas um resumo por módulo. Criar um endpoint agregado apenas para reduzir esse payload contrariaria a preferência deste Goal por zero alterações de backend.

## Regras preservadas

- O progresso exibido usa o percentual oficial retornado pelo backend.
- A interface apenas explica o limiar de 80%; o backend decide se a prova está liberada.
- Aprovação, nota mínima, ciclos acadêmicos, proteção histórica e emissão de certificados não foram reinterpretados.
- `FECHADA` continua editável para o responsável conforme a autorização existente.
- `ENCERRADA` torna a estrutura acadêmica somente leitura.
- PDFs continuam em rotas autenticadas; o aluno usa o helper de transferência privada.

## Responsividade e acessibilidade

- A navegação contextual é uma faixa rolável no mobile sem alterar a URL ativa.
- Hubs usam duas colunas em telas largas e uma coluna até 640 px.
- A tabela de alunos vira cards no mobile, sem reduzir a tipografia.
- Links fazem navegação; botões executam ações. Estados usam `aria-live`, diálogos nativos preservam foco e headings permanecem hierárquicos.

## Validação e staging

Validação concluída em 19/09/2026 no staging existente:

- URL: `https://plataforma-cursos-demo-dk-20260901.chilecentral.cloudapp.azure.com`;
- árvore-fonte implantada com SHA-256 `dfa6f9a276ac4d177e024eead7be7f5bf1fed76d5f0d72c4d7254d10372cf3f3`;
- backup pré-deploy `backup-20260919T144805Z-663da16c-95f9-448d-bd3e-505bd75fc778`, validado como `GOOD`;
- migrations `NO-OP` na versão 013 e schema validado antes da troca do app;
- containers `app`, `db` e `caddy` saudáveis após a publicação;
- smoke autenticado e somente leitura: `INFORMATION_ARCHITECTURE_STAGING_SMOKE_OK`, 24 rotas/variações;
- papéis ALUNO, PROFESSOR e ADMIN, deep-link, reload, voltar do navegador, parâmetros inválidos, recurso inexistente, bloqueio de autoria para aluno e PDF privado verificados;
- viewports de 360, 768 e 1440 px sem overflow estrutural ou erro de página.

As capturas e o relatório estruturado ficam em `docs/screenshots/goal13-staging/`. O smoke pode ser repetido com `npm run staging:smoke:information-architecture`; as credenciais são recebidas por `stdin` e não são gravadas no relatório.
