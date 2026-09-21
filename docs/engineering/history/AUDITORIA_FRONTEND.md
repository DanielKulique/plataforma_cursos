> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Auditoria do frontend

## Goal Visual 1 — Fundação visual

### Linha de base

Data da verificação: 23 de julho de 2026.

- Stack confirmada: 11 páginas HTML, CSS e módulos JavaScript nativos.
- CSS inicial: todas as páginas carregavam somente fontes e
  `/css/style.css`.
- `style.css`: 2.292 linhas antes deste Goal, com tokens antigos, componentes,
  layouts, responsividade e temas no mesmo arquivo.
- Worktree: já continha numerosas alterações rastreadas e arquivos novos antes
  desta execução. Nenhum reset, checkout ou sobrescrita ampla foi usado.
- Frontend relacionado: 6 suítes, 58 testes aprovados.
- Segurança: 6 suítes, 56 testes aprovados.
- Suíte unitária completa: 27 suítes, 263 testes aprovados.

### Problemas de contraste confirmados

| Combinação anterior | Resultado aproximado | Situação |
| --- | ---: | --- |
| branco sobre hero claro `#f0f4ff` | 1,10:1 | falha |
| `#9ca3af` sobre branco | 2,54:1 | falha |
| `#64748b` sobre `#07090f` | 4,18:1 | falha para texto normal |

Também foram confirmadas bordas de formulário com baixa percepção, foco
fragmentado e ausência de `prefers-reduced-motion`.

### Evidência do diálogo administrativo

O cenário relatado foi exercitado com uma sessão ADMIN real e o botão
**Novo usuário**, sem criar ou alterar registros.

| Viewport | Retângulo do diálogo | Desvio do centro |
| --- | --- | --- |
| 1280 × 800 | `x=360`, `y=95`, `560 × 611` | `0px`, `0px` |
| 900 × 800 | `x=170`, `y=95`, `560 × 611` | `0px`, `0px` |
| 390 × 844 | `x=19`, `y=125`, `352 × 595` | `0px`, `0px` |

Estilos computados nas três larguras: `position: fixed`, `inset: 0`,
`margin: auto`, `display: block` e `overflow-y: auto`. O foco inicial foi para
`nome_completo`.

O desalinhamento no canto superior esquerdo **não foi reproduzido no Firefox
headless deste ambiente**. Isso não encerra nem aprova o problema relatado. Ele
permanece aberto para reprodução no navegador afetado e correção exclusiva no
Goal Visual 4. Nenhuma regra do diálogo foi modificada neste Goal.

### Mudanças limitadas à fundação

- criação de `tokens.css` e `base.css`;
- ordem explícita de folhas nas 11 páginas;
- aliases de compatibilidade no topo e nos temas de `style.css`;
- contraste do hero durante preferência clara e antes da inicialização do tema;
- contraste de botões primários pequenos e campos básicos;
- foco visível e movimento reduzido;
- testes automatizados da fundação.

### Regras legadas preservadas

Cards, tabelas, menus, tabs, diálogos, hero estrutural, navegação, áreas de
papel e verificador continuam em `style.css`. Não foi criado `legacy.css` e
nenhuma seção foi removida em massa.

### Conflitos temporários de cascata

1. Componentes em `style.css` ainda podem redefinir tipografia e espaçamento
   depois de `base.css`.
2. Classes `.light-mode` e `.dark-mode` continuam fornecendo aliases legados,
   mas os valores vêm de `tokens.css`.
3. O bloco de movimento reduzido usa `!important` de forma localizada para
   vencer animações legadas posteriores.
4. Regras antigas de hero ainda contêm `!important`; somente seus valores de
   contraste foram corrigidos. A remoção estrutural pertence a um Goal futuro.

### Regressão encontrada e corrigida

A preferência clara do sistema usava `:root:not(.dark-mode)`, mas o JavaScript
existente aplica `.light-mode` e `.dark-mode` em `<body>`. Em um sistema
configurado como claro, regras claras de navegação e superfícies podiam vencer
mesmo quando o usuário selecionava o tema escuro.

Os seletores de compatibilidade passaram a usar `body:not(.dark-mode)`. Nenhuma
alteração em `theme.js` foi necessária. Um teste impede a reintrodução do
seletor incompatível.

### Validação final

- Testes relacionados: 6 suítes, 78 testes aprovados.
- `npm run test:security`: 6 suítes, 56 testes aprovados.
- Suíte unitária completa: 28 suítes, 295 testes aprovados.
- `git diff --check`: aprovado.
- Sintaxe do novo teste e do JavaScript de tema: aprovada.
- CSS: os três arquivos foram carregados e interpretados no Firefox headless.
- CSP e proteção XSS: aprovadas.

As 11 páginas foram inspecionadas em cada combinação abaixo:

| Viewport | Tema claro | Tema escuro |
| --- | --- | --- |
| 1280 × 800 | sem overflow, foco 3px e tokens claros | sem overflow, foco 3px e tokens escuros |
| 900 × 800 | sem overflow, foco 3px e tokens claros | sem overflow, foco 3px e tokens escuros |
| 390 × 844 | sem overflow, foco 3px e tokens claros | sem overflow, foco 3px e tokens escuros |

A simulação de 200% de zoom, equivalente a viewport CSS de 640 × 400 com
densidade 2, não apresentou overflow horizontal nas 11 páginas em nenhum tema.

Com `ui.prefersReducedMotion=1`, o navegador confirmou:

- `matchMedia('(prefers-reduced-motion: reduce)').matches === true`;
- animações e transições computadas em `0.00001s`;
- `scroll-behavior: auto`.

### Limites preservados

Não houve alteração em JavaScript, backend, API, autenticação, JWT, banco,
schema, seeds, matrícula, questionários, CRUDs, detector de plágio, CI,
dependências, `package.json` ou `package-lock.json`.

## Goal Visual 2 — Navegação pública e autenticação

### Linha de base

Antes da implementação, o gate do Goal Visual 1 permanecia aprovado:

- testes relacionados: 6 suítes, 86 testes aprovados;
- segurança: 6 suítes, 56 testes aprovados;
- suíte unitária completa: 28 suítes, 295 testes aprovados;
- `tokens.css` e `base.css` carregados nas 11 páginas;
- temas claro e escuro funcionais;
- 24 capturas de referência das quatro páginas desta fase, em 1280 × 800,
  900 × 800 e 390 × 844, nos dois temas.

O worktree já estava alterado antes da fase. Nenhum reset, checkout ou
sobrescrita ampla foi executado.

### Problemas confirmados

| Página | Diagnóstico confirmado |
| --- | --- |
| Inicial | navegação desaparecia abaixo de 900px; hero e catálogo tinham densidade e alvos inconsistentes no celular; estado do tema não era anunciado |
| Login | ausência de estado ocupado e proteção contra envio duplicado; erro sem papel semântico consistente; composição pouco adaptada a telas baixas |
| Cadastro | formulário longo e feedback fragmentado; erro não identificava o campo; estilo inline no bloco pós-cadastro |
| Verificação | estados de envio, erro e sucesso não compartilhavam o padrão das demais páginas; envio duplicado era possível |

### Solução aplicada

- navegação pública por disclosure, usando uma única lista de destinos;
- menu fechado inicialmente, operável por clique, Enter e Espaço;
- fechamento por link, clique externo e Escape, com restauração de foco no
  último caso;
- controles privados ocultos no HTML e revelados somente após sessão
  autoritativa;
- hierarquia e densidade responsivas do hero, cards, filtros e CTAs;
- um único `h1`, `main` identificável e link para pular ao conteúdo em cada
  página;
- controle de tema com nome de ação e `aria-pressed`;
- formulários com `aria-busy`, botão ocupado e prevenção de envio duplicado;
- erros com `role="alert"` e sucesso ou informação com `role="status"`;
- erro de validação associado ao campo por `aria-invalid` e foco;
- remoção dos estilos inline das quatro páginas, com substituição em CSS
  escopado.

Endpoints, payloads, armazenamento do JWT, redirecionamentos por papel,
validações e regra de cadastro público como `ALUNO` foram preservados.

### Evidência manual controlada

No Firefox headless, a matriz das quatro páginas totalizou 24 cenários e não
apresentou overflow horizontal:

| Viewport | Tema claro | Tema escuro |
| --- | --- | --- |
| 1280 × 800 | 4 páginas aprovadas | 4 páginas aprovadas |
| 900 × 800 | 4 páginas aprovadas | 4 páginas aprovadas |
| 390 × 844 | 4 páginas aprovadas | 4 páginas aprovadas |

Também foram confirmados:

- menu móvel com Enter, Espaço, Escape, clique externo e restauração de foco;
- foco real por Tab com `outline` sólido de 3px;
- visitante sem controles privados;
- sessão ALUNO, avatar, destino da área e logout corretos;
- login inválido e login válido com estados acessíveis;
- cadastro inválido sem chamada à API e cadastro controlado com os três
  endpoints existentes e sem campo `tipo` no payload;
- verificação inválida e sucesso controlado, sem exposição de código;
- oito cenários equivalentes a zoom de 200% em 640 × 400, sem overflow;
- movimento reduzido ativo, animações em `0.00001s` e rolagem sem suavização.

As respostas de sucesso dos formulários foram controladas no navegador para
evitar escrita no banco. A única consulta ao banco de desenvolvimento foi
somente leitura para validar uma sessão ALUNO real. `site_cursos` não foi
acessado nem alterado.

### Validação final

- testes relacionados de frontend, sessão e autenticação: 7 suítes e 103 testes
  aprovados;
- `npm run test:security`: 6 suítes e 56 testes aprovados;
- suíte unitária completa: 29 suítes e 312 testes aprovados;
- sintaxe dos sete módulos JavaScript da fase e do novo teste: aprovada;
- `git diff --check`: aprovado;
- varredura dos arquivos da fase: sem estilo ou handler inline, whitespace
  residual, `innerHTML`, `outerHTML`, `insertAdjacentHTML` ou `eval`.

Os logs de erro exibidos pela suíte completa pertencem a cenários negativos
esperados e as respectivas asserções foram aprovadas.

### Isolamento e pendências

Os novos estilos são carregados somente nas quatro páginas desta fase. A
alteração compartilhada de tema apenas acrescenta nome e estado acessíveis, e
`session-ui.js` ignora elementos inexistentes. Isso preserva visualmente as
sete páginas fora do Goal Visual 2.

Continuam pendentes para o Goal Visual 3, sem atividade iniciada nesta fase:

- área do aluno;
- sala de aula;
- questionário;
- área e turma do professor.

Administração, diálogo administrativo, verificador, autoria de conteúdo e
qualquer correção funcional do questionário também permanecem fora do escopo.

## Goal Visual 3 — Áreas de aluno e professor

### Linha de base

Antes das alterações, os gates dos Goals Visuais 1 e 2 continuavam aprovados:

- 8 suítes relacionadas e 129 testes aprovados;
- segurança: 6 suítes e 56 testes aprovados;
- suíte unitária anterior: 29 suítes e 312 testes aprovados;
- `tokens.css`, `base.css` e a extensão incremental funcionando;
- temas claro e escuro funcionais;
- 30 capturas de referência, correspondentes a cinco páginas, três larguras e
  dois temas.

O worktree já continha alterações anteriores em frontend e em arquivos fora
desta fase. Nenhum reset, checkout ou sobrescrita ampla foi executado.

As contas reais usadas na auditoria pertencem a `plataforma_cursos_dev`. A
descoberta das contas, turmas e questionário usou somente `SELECT`; as páginas
protegidas validaram sessões reais por `/api/auth/me`. `site_cursos` não foi
consultado nem alterado.

### Problemas confirmados

| Página | Diagnóstico |
| --- | --- |
| Sala Virtual | navegação desaparecia no celular; card tinha hierarquia e ações densas; status e progresso dependiam de composição pouco consistente |
| Sala de Aula | contexto, metadados, filtros e módulos disputavam atenção; filtros não expunham seleção semanticamente; datas apareciam sem padrão |
| Questionário | perguntas e opções tinham área reduzida; loading, resultado e histórico não compartilhavam semântica; envio ocupado era pouco perceptível |
| Professor | cards altos e densos no celular; curso, período, alunos e status não possuíam hierarquia comum |
| Turma do professor | tabela rolava sem pista clara; documento precisava de proteção explícita contra overflow; modal abria no canto, sem foco inicial ou contenção |

Nenhuma falha funcional foi reproduzida nos GETs desta rodada. O aluno real
visualizou um questionário ativo com uma pergunta, três opções e duas tentativas
no histórico. Os endpoints de aluno e professor responderam com dados reais.

### Solução aplicada

- cabeçalho autenticado e navegação móvel compartilhada nas cinco páginas;
- uma única trilha visual para hero, progresso, módulos e acompanhamento;
- cards, status, metadados, loading, vazio, erro, informação e sucesso
  padronizados;
- filtros como botões nativos com `aria-pressed`;
- módulos como lista e ações como botões; navegação permanece em links;
- datas civis formatadas em português sem deslocamento de fuso;
- questionário com `fieldset`, `legend`, radios associados, seleção textual,
  contador, estado ocupado, resultado e histórico responsivos;
- tabela semântica preservada em região rolável, com caption, cabeçalhos,
  acesso por teclado, sombra e pista de rolagem;
- modal substituído por `<dialog>` nativo com backdrop, centralização, foco
  inicial, contenção, Escape, retorno de foco, bloqueio do fundo, validação
  anunciada e proteção contra envio duplicado.

Nenhuma autoria de conteúdo ou questionário foi criada. As seções do professor
permanecem de consulta e não exibem gabarito ou respostas corretas.

### Evidência manual controlada

O Firefox executou 30 cenários com dados reais:

| Página | 1280 × 800 | 900 × 800 | 390 × 844 |
| --- | --- | --- | --- |
| Sala Virtual | claro e escuro, aprovado | claro e escuro, aprovado | claro e escuro, aprovado |
| Sala de Aula | claro e escuro, aprovado | claro e escuro, aprovado | claro e escuro, aprovado |
| Questionário | claro e escuro, aprovado | claro e escuro, aprovado | claro e escuro, aprovado |
| Professor | claro e escuro, aprovado | claro e escuro, aprovado | claro e escuro, aprovado |
| Turma do professor | claro e escuro, aprovado | claro e escuro, aprovado | claro e escuro, aprovado |

Nos 30 cenários houve:

- zero overflow horizontal do documento;
- zero desvio de tema, sessão, ordem de CSS ou landmarks;
- um único `h1` e `main` por página;
- uma turma do aluno, quatro turmas do professor e dois alunos na turma
  auditada;
- questionário e histórico reais disponíveis;
- navegação móvel e menu do perfil abrindo, fechando com Escape e restaurando
  foco;
- logout removendo o token e retornando à página inicial como visitante;
- filtro nativo com altura de 44px, foco e uma única opção pressionada;
- opção do questionário associada ao radio, indicador textual selecionado e
  ausência de campo de gabarito.

Em 390 × 844, a tabela mediu 298px, seu conteúdo 898px e o documento permaneceu
sem overflow. A pista de rolagem ficou visível. Em uma viewport CSS efetiva de
640 × 400, equivalente ao layout em zoom de 200% sobre 1280 × 800, a tabela
continuou rolando internamente, o botão de edição permaneceu acessível e o
diálogo ficou integralmente dentro da viewport.

O diálogo em 390 × 844 mediu `352 × 566`, em `x=19`, `y=139`, com desvio de
centro de `0px`. O foco inicial foi para a nota; Tab e Shift+Tab circularam;
Escape fechou, liberou a rolagem e devolveu o foco ao botão da matrícula. A nota
11 gerou `role="alert"`, `aria-invalid="true"` e manteve o foco no campo.

O cenário de atualização válida interceptou somente o PATCH no navegador:
duas submissões imediatas produziram uma única requisição controlada, com o
endpoint e payload existentes; depois, os GETs reais recarregaram a interface e
o foco voltou à matrícula. Isso validou o comportamento visual sem escrever no
banco. Progresso, respostas e notas reais também não foram modificados.

O login por formulário não foi repetido porque o ambiente local não expõe a
senha canônica em configuração. O contrato de login permaneceu aprovado pelos
testes do Goal Visual 2; esta fase validou as páginas com contas reais e sessão
autoritativa.

### Regressões encontradas e corrigidas

1. O teste da fundação ainda esperava apenas três folhas nas cinco páginas; foi
   atualizado para reconhecer a migração incremental.
2. Um teste XSS esperava a assinatura antiga do listener de edição; passou a
   verificar a mesma construção segura com o botão acionador explícito.
3. `AAAA-MM-DD` era interpretado como UTC e podia mostrar o dia anterior no
   Brasil; a formatação agora preserva a data civil.
4. A primeira compactação móvel dividiu rótulo e valor dentro de meia coluna e
   causou quebras verticais. A regra final mantém rótulo sobre valor e reserva
   largura total para a única linha de turma do card do aluno.
5. A primeira coleta assíncrona do roteiro do navegador serializou Promises
   vazias. O roteiro de auditoria foi corrigido e repetido; não era uma falha do
   produto.

### Testes e validação final

- testes relacionados de frontend, sessão, aluno, professor, questionário,
  diálogo e segurança: 10 suítes e 151 testes aprovados;
- `npm run test:security`: 6 suítes e 56 testes aprovados;
- suíte unitária completa: 30 suítes e 331 testes aprovados;
- cobertura global: 79,86% de statements, 67,98% de branches, 83,10% de
  functions e 82,12% de lines;
- sete módulos JavaScript da fase aprovados por `node --check`;
- CSP bloqueante, redaction, allowlist de URLs, sessão autoritativa e proteção
  XSS aprovadas;
- nenhum script ou handler inline, `innerHTML` dinâmico, fallback mock,
  dependência ou framework introduzido.

Os logs de erro da suíte completa pertencem a cenários negativos esperados e
as respectivas asserções foram aprovadas.

### Limitações e próximos Goals

- autoria de materiais e de questionários continua ausente por decisão de
  escopo funcional;
- administração, seus diálogos e o verificador não foram modernizados;
- regras legadas de `style.css` coexistem com a camada `.academic-page` até a
  consolidação;
- persistência de uma nota válida não foi exercitada no banco de
  desenvolvimento, em respeito à proibição de alteração de banco.

Nenhuma API, autenticação, autorização, regra acadêmica, persistência, banco,
schema, seed, dependência, `package.json` ou `package-lock.json` foi alterado.
Nenhum commit, push, merge, checkout, reset ou reescrita de histórico foi
realizado. O Goal Visual 4 não foi iniciado.
