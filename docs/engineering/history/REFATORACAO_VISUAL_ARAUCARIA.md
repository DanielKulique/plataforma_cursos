> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Refatoração visual Araucária — entrega para staging

Data: 28 de agosto de 2026.

## Diagnóstico do legado

A plataforma já possuía uma infraestrutura madura: cascata modular, tokens
semânticos, temas claro/escuro, componentes compartilhados, layouts por família,
breakpoints, dialogs nativos, tabs, estados globais, foco visível, movimento
reduzido e suporte a cores forçadas. Essa estrutura foi preservada.

O principal débito visual estava concentrado em `tokens.css` e `style.css`:
paleta roxa/rosa, fundos azulados quase pretos, glows, gradientes promocionais,
orbs animados e dois grandes blocos duplicados de overrides para o tema claro.
O emoji de cérebro também era repetido como marca em todas as áreas.

## Direção implementada

- Fraunces para títulos editoriais, Work Sans para interface e JetBrains Mono
  somente para dados técnicos.
- Tema claro construído com papel, casca, verde-pinho, pinhão e tinta quente.
- Tema escuro concebido como subsolo: carvão marrom, superfícies profundas,
  creme, pinho dessaturado e âmbar contido.
- Marca compacta derivada do asset oficial `logo-plagio.webp`, sem emoji como
  assinatura visual.
- Landing preservada como narrativa expressiva da araucária, agora com a mesma
  tipografia e preferência de tema da plataforma.
- Catálogo editorial, autenticação calma, áreas acadêmicas focadas em leitura,
  admin denso e verificador tratado como editor/mesa acadêmica em papel.

## Tokens finais principais

| Semântica | Claro | Escuro |
| --- | --- | --- |
| Fundo | `#f1ead9` | `#17120e` |
| Superfície | `#fbf7ec` | `#211a14` |
| Superfície elevada | `#fffaf0` | `#2a2119` |
| Texto | `#2b2118` | `#f5eddd` |
| Ação | `#1f3a2b` | `#6f936f` |
| Hover da ação | `#35573f` | `#82a782` |
| Acento | `#9a592a` | `#d19158` |
| Foco | `#8c4e1e` | `#e0bd8e` |

As cores de sucesso, alerta, erro e informação continuam semanticamente
independentes. Sombras, foco, superfícies e estados derivados usam tokens e
`color-mix()`.

## Consolidação e contratos

- Removidos aproximadamente 280 linhas de overrides duplicados de tema em
  `style.css`.
- Removidos orbs, shimmer, glows e animações de entrada que ocultavam conteúdo
  funcional durante a carga.
- IDs, classes programáticas, atributos `data-*`, `hidden`, ARIA, roles, tabs,
  dialogs e ordem dos scripts foram preservados.
- Nenhum endpoint, payload, regra de autenticação/autorização, sessão, CSRF,
  banco, migration ou comportamento do detector foi alterado.
- As únicas alterações de markup são carregamento tipográfico, assinatura de
  marca com o asset existente e controle de tema da landing.

## Responsividade e acessibilidade

A estrutura existente continua atendendo 320, 360, 390, 640, 768, 900, 1024,
1280 e 1440 px. Permanecem preservados skip links, alvos mínimos de 44 px,
labels, regiões anunciáveis, navegação por teclado, foco de 3 px,
`prefers-reduced-motion`, `forced-colors`, dialogs responsivos e tabelas em
regiões roláveis.

## Verificação

As suítes visuais relacionadas foram atualizadas para a nova identidade e
validam contraste WCAG, tipografia, cascata, componentes, páginas acadêmicas,
admin, verificador, consolidação e landing.

O gate final `npm run test:stability` executou todo o pipeline duas vezes, com o
mesmo resultado em ambas as passagens:

- lint aprovado;
- 42 suítes e 434 testes unitários aprovados;
- 8 suítes e 102 testes de integração aprovados;
- build e validação dos artefatos de produção aprovados.

Também foram inspecionadas renderizações Firefox em 390 e 1440 px, nos temas
claro e escuro, incluindo landing, catálogo, login, admin, questionário e
verificador. Não foram observados overflow horizontal, conteúdo oculto na carga
ou regressões visuais nos fluxos avaliados. A validação manual com sessão real
continua recomendada no smoke test de staging para os fluxos autenticados.
