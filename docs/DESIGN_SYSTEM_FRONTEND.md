# Design system do frontend

## Goal Visual 1 — Fundação

Esta fundação atende ao frontend acadêmico existente em HTML, CSS e JavaScript
puro. Ela não altera navegação, componentes funcionais, APIs, autenticação ou
regras de negócio.

### Intenção

- **Pessoas:** visitantes, alunos, professores e administradores que precisam
  localizar informações acadêmicas e executar tarefas sem esforço visual.
- **Resultado esperado:** leitura clara, controles reconhecíveis e feedback
  perceptível em ambientes de estudo e trabalho.
- **Sensação:** acadêmica moderna, calma e confiável; não deve parecer um
  template promocional ou uma ferramenta técnica genérica.
- **Assinatura preservada:** roxo como ação e rosa como acento, com Sora para a
  interface, DM Serif Display nos destaques editoriais existentes e JetBrains
  Mono somente para código, atalhos, identificadores e métricas.

### Direção visual

| Decisão | Escolha | Motivo |
| --- | --- | --- |
| Paleta | neutros levemente violetas, roxo e rosa | mantém a identidade e associa o ambiente a criação e autoria |
| Profundidade | superfícies próximas, bordas e sombras sutis | separa conteúdo acadêmico sem efeitos chamativos |
| Tipografia | famílias atuais | preserva identidade e evita nova dependência |
| Espaçamento | base de 4px | cria ritmo consistente e permite densidades pública e administrativa |
| Movimento | 120–240ms | fornece resposta rápida e respeita redução de movimento |

## Arquitetura

A ordem atual é explícita em todas as páginas:

1. folha de fontes;
2. `/css/tokens.css`;
3. `/css/base.css`;
4. `/css/style.css`.

`style.css` continua responsável pelos componentes e layouts existentes. Seus
aliases antigos (`--bg`, `--white`, `--purple` e similares) apontam para os
tokens semânticos. Isso permite migração gradual sem criar `legacy.css`, cadeia
de `@import` ou refatoração em massa.

Conflito temporário de cascata: regras específicas de `style.css` continuam
prevalecendo sobre regras fundamentais de `base.css`. Esse comportamento é
deliberado até os Goals de cada área. Foco, contraste e movimento reduzido não
podem ser anulados por essas regras.

## Tokens

### Cores

| Semântica | Claro | Escuro |
| --- | --- | --- |
| Fundo | `#f8f9fc` | `#090b10` |
| Superfície | `#ffffff` | `#11141b` |
| Superfície elevada | `#ffffff` | `#181c26` |
| Texto | `#1a1a2e` | `#f4f4f5` |
| Texto secundário | `#4b5563` | `#cbd5e1` |
| Texto terciário | `#5f6878` | `#a7b0c0` |
| Texto discreto | `#6b7280` | `#9ca3af` |
| Ação | `#6d28d9` | `#7c3aed` |
| Hover da ação | `#5b21b6` | `#6d28d9` |
| Acento rosa | `#be185d` | `#f9a8d4` |
| Foco | `#6d28d9` | `#c4b5fd` |

Sucesso, alerta, erro e informação possuem valores próprios em cada tema. O
rosa não substitui estados semânticos e só pode aparecer como texto quando
atingir contraste mínimo.

O hero permanece uma superfície violeta escura nos dois temas. Isso elimina o
texto branco sobre o fundo claro observado antes da inicialização do tema.

### Tipografia

- Escala: 12, 14, 16, 18, 24, 32 e 48px.
- Corpo: Sora, peso 400 e `line-height` 1.6.
- Títulos: Sora, peso 600 e espaçamento negativo moderado nos maiores.
- Destaques editoriais existentes: DM Serif Display.
- Dados técnicos: JetBrains Mono.

### Espaçamento e forma

- Espaçamento: 4, 8, 12, 16, 24, 32, 48 e 64px.
- Raios: 6, 10, 14px e circular.
- Larguras: 1200px para conteúdo, 720px para leitura e 480px para formulários.
- Sombras: elevação baixa, média e alta, sem sombras pesadas no tema escuro.

## Acessibilidade fundamental

- Texto normal: contraste mínimo de 4,5:1.
- Texto grande e indicadores: mínimo de 3:1.
- Controles de formulário: borda mínima de 3:1 contra a superfície.
- Foco: `outline` de 3px com offset de 3px em links, botões, campos e elementos
  interativos existentes.
- `prefers-reduced-motion: reduce`: animações e transições não essenciais são
  reduzidas para 0,01ms, mantendo a mudança final de estado.
- `forced-colors`: o foco usa a cor de destaque do sistema.

Os `!important` no bloco de movimento reduzido são uma exceção documentada:
eles precisam vencer animações legadas declaradas depois de `base.css`, sem
reescrever componentes fora deste Goal.

## Recomendações da skill `ui-ux-design-pro`

### Adotadas

- tokens primitivos e semânticos;
- base espacial de 4px;
- contraste WCAG AA;
- superfícies escuras progressivamente mais claras;
- foco visível global;
- transições curtas e movimento reduzido;
- sombras sutis e uma única cor principal de ação.

### Adaptadas

- OKLCH foi traduzido para hexadecimal para compatibilidade e verificação
  determinística com o projeto atual;
- a preferência da skill por tema claro não substituiu a preferência já salva
  pelo usuário;
- nomes genéricos foram mantidos apenas nos tokens semânticos públicos, com a
  identidade expressa pela paleta violeta e pela tipografia existente.

### Rejeitadas neste Goal

- React, JSX, TSX, Tailwind, TypeScript, Vite e Bun;
- CLI, geradores, dependências e controles customizados;
- navegação, cards, tabelas, diálogos, tabs e padrões promocionais;
- gradientes, glassmorphism e animações adicionais;
- criação de `.interface-design/system.md`, pois não pertence aos arquivos
  autorizados.

## Goal Visual 2 — Navegação pública e autenticação

As quatro páginas migradas nesta fase carregam, depois de `style.css`:

1. `/css/components.css`;
2. `/css/layouts.css`;
3. `/css/responsive.css`.

Na conclusão do Goal Visual 2, essa extensão era deliberadamente local a
`index.html`, `login.html`, `cadastro.html` e `verificar-email.html`. As áreas
autenticadas ou especializadas ainda permaneciam na arquitetura do Goal Visual
1, evitando antecipar a migração de aluno, professor, administração e
verificador.

### Componentes da fase

- cabeçalho público e navegação responsiva por disclosure;
- hero, boas-vindas, catálogo e filtros de curso;
- cards de autenticação e grupos de campos;
- botões e alvos de toque com altura mínima de 44px;
- mensagens compartilhadas de informação, erro e sucesso;
- estado ocupado de formulário;
- estados de loading, vazio e conteúdo indisponível;
- link para pular ao conteúdo e foco visível.

### Comportamento responsivo

- até 900px, a mesma lista de navegação do desktop passa a ser controlada por
  um botão disclosure;
- até 640px, catálogo, formulários e cards usam uma coluna;
- em telas com até 680px de altura, os cards de autenticação começam no topo e
  usam a rolagem normal do documento;
- nenhum menu em tela cheia ou bloqueio de rolagem foi introduzido.

### Recomendações da skill nesta fase

**Adotadas:** hierarquia curta, largura de leitura limitada, alvos de toque de
44px, feedback próximo à ação, divulgação progressiva e foco perceptível.

**Adaptadas:** o padrão conceitual de disclosure foi implementado com botão
nativo, `aria-expanded`, `aria-controls` e JavaScript modular; os estados
visuais usam as mensagens e contratos já existentes em vez de componentes de
biblioteca.

**Rejeitadas:** menu de tela cheia, controles customizados, efeitos de vidro,
gradientes promocionais adicionais, animações decorativas, React, Tailwind,
snippets de framework e qualquer gerador. A identidade violeta/rosa e as fontes
do projeto prevaleceram.

### Conflitos temporários

`style.css` permanece responsável pelas estruturas legadas. Os três arquivos
da fase usam os escopos `.public-home` e `.auth-page` para vencer somente as
regras necessárias, sem `!important`. A consolidação ou remoção dessas regras
fica para o Goal Visual 6, depois da migração de todas as áreas.

## Goal Visual 3 — Áreas de aluno e professor

As páginas `sala-virtual.html`, `sala-aula.html`, `questionario.html`,
`professor.html` e `professor-turma.html` passaram a carregar a mesma extensão
incremental do Goal Visual 2:

1. `/css/components.css`;
2. `/css/layouts.css`;
3. `/css/responsive.css`.

Administração e verificador continuam na arquitetura anterior. A nova camada é
isolada pelo escopo `.academic-page`, com variantes de papel para aluno e
professor, e não redefine componentes administrativos.

### Direção da experiência autenticada

- **Aluno:** retoma uma trilha de estudo, identifica a turma e avança por
  módulos, avaliações e histórico.
- **Professor:** localiza a turma sob sua responsabilidade e acompanha alunos,
  progresso, notas e o material já publicado.
- **Linguagem de domínio:** trilha, módulo, sala de aula, avaliação e
  acompanhamento, sem métricas promocionais ou ações fictícias.
- **Assinatura visual:** uma trilha acadêmica de três pontos conecta hero,
  progresso, módulos e acompanhamento, usando o violeta e o rosa existentes.

### Componentes compartilhados

- cabeçalho autenticado com disclosure responsivo e menu de perfil existente;
- hero acadêmico, contexto de papel e painéis de conteúdo;
- cards de turma com status textual, metadados, progresso e ações;
- badges semânticos com forma, texto e símbolo, sem depender apenas de cor;
- estados de loading, vazio, erro, informação e sucesso;
- filtros com botões nativos e `aria-pressed`;
- módulos e conteúdos com ações nativas e estado textual;
- perguntas em `fieldset`, opções associadas e indicador textual de seleção;
- resultado e histórico persistido;
- tabela semântica dentro de região rolável e com pista visual;
- diálogo nativo de edição de matrícula, com foco contido e rolagem interna.

Os módulos `academic-ui.js` e `academic-dialog.js` concentram somente
apresentação: mensagens anunciáveis, `aria-busy`, datas, movimento reduzido e
ciclo de foco do diálogo. Eles não contêm endpoints, regras de autorização,
armazenamento do JWT ou cálculo acadêmico.

### Responsividade

- até 900px, a navegação autenticada usa o disclosure já aprovado;
- até 640px, painéis, ações, perguntas e resumos se reorganizam sem overflow;
- cards do professor usam metadados em duas colunas no celular, com rótulo
  sobre valor; o card do aluno mantém a única linha de turma em largura total;
- até 360px, metadados retornam a uma coluna;
- a tabela preserva semântica e rola somente no contêiner;
- o diálogo limita sua altura a `100dvh`, centraliza com `margin: auto` e usa
  rolagem vertical interna em telas baixas;
- alvos de ação e filtros têm pelo menos 44px.

### Recomendações da skill nesta fase

**Adotadas:** hierarquia orientada à tarefa, densidade moderada, escala de 4px,
superfícies calmas, bordas e sombras sutis, feedback próximo à ação, tabelas
semânticas, foco perceptível e redução de movimento.

**Adaptadas:** padrões conceituais de shadcn/ui foram traduzidos para HTML/CSS
nativo; o comportamento de diálogo inspirado no Radix foi implementado com
`<dialog>`, eventos nativos e JavaScript modular; a trilha visual substitui
dashboards genéricos; datas são formatadas apenas na apresentação e datas civis
`AAAA-MM-DD` são interpretadas no fuso local para não mudar o dia.

**Rejeitadas:** React, JSX, TSX, Tailwind, TypeScript, Vite, Bun, bibliotecas,
geradores, componentes copiados, glassmorphism, sombras pesadas, animações
decorativas, dashboards de métricas e autoria ainda inexistente.

### Conflitos temporários

`style.css` ainda contém as estruturas antigas das áreas autenticadas. Os
seletores `.academic-page` nos três arquivos incrementais vencem apenas as
regras necessárias, sem novos `!important`. A classe `.academic-dialog` é
exclusiva desta fase e não coincide com os diálogos administrativos. A remoção
das regras legadas fica para a consolidação, depois das fases das áreas ainda
não migradas.
