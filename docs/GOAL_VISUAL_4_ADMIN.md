# Goal Visual 4 — Painel administrativo

## Escopo e invariantes

Esta fase modernizou somente a interface administrativa em HTML, CSS e
JavaScript nativos. Foram preservados:

- endpoints, métodos HTTP, payloads e mensagens específicas dos CRUDs;
- sessão autoritativa e autorização de ADMIN;
- regras do último ADMIN, vínculos, exclusão e alteração de senha;
- CSP, proteção XSS e redaction;
- backend, bancos, schema, seeds, dependências, manifests e CI.

O repositório `motor_ia` não foi alterado. Não houve commit nem push nesta
fase.

## Linha de base

Antes das alterações:

- `npm test`: 30 suítes e 331 testes aprovados;
- `npm run test:integration`: 6 suítes e 84 testes aprovados, exclusivamente
  em `plataforma_cursos_test`;
- CRUD administrativo: criação, leitura, edição e exclusão controlada
  confirmadas pela integração;
- proteção do último ADMIN e bloqueios por vínculos confirmados;
- capturas realizadas em 1280 × 800, 900 × 800 e 390 × 844.

As evidências visuais anteriores e posteriores ficam fora do repositório, em:

`/mnt/disco/projetoSite/goal4-visual-baseline.vmAkYa`

## Diagnóstico do diálogo

O deslocamento para o canto superior esquerdo não foi reproduzido na branch
atual: já existia uma correção parcial baseada em `<dialog>` nativo,
`position: fixed`, `inset: 0` e `margin: auto`. O histórico mostrou que essa
proteção havia sido acrescentada depois da implementação original.

A causa histórica foi a combinação de diálogo criado dinamicamente com
posicionamento e cascata insuficientemente robustos. Ainda havia regras
administrativas duplicadas no CSS legado e faltavam garantias completas de
acessibilidade e estado.

Nesta fase, o posicionamento foi consolidado em regras escopadas para
`.admin-page`, com overlay da viewport, centralização, margem segura,
rolagem interna e comportamento consistente nos dois temas. Não foi criado
fallback customizado.

## Inventário de diálogos

São diálogos nativos `<dialog>`:

- criar e editar usuário;
- criar e editar curso;
- criar e editar turma;
- alterar senha;
- confirmar exclusão.

O menu de perfil é um disclosure e não um diálogo. O módulo compartilhado
`modal.js` não é usado pelo painel administrativo e permaneceu inalterado.

## Alterações de interface

- Diálogos com título e descrição associados, botão de fechar nomeado,
  foco inicial, contenção de foco, Escape, restauração de foco e bloqueio
  da rolagem do fundo.
- Formulários com labels explícitas, indicação de obrigatoriedade,
  mensagens próximas aos campos, erro geral anunciável, foco no primeiro
  campo inválido e valores preservados após falha.
- Estado `aria-busy` e bloqueio contra submissão duplicada.
- Confirmações de exclusão migradas de `window.confirm` para `<dialog>`
  nativo acessível, sem alterar regras ou endpoints.
- Abas com `tablist`, `tab`, `tabpanel`, `aria-selected`,
  `aria-controls`, foco itinerante, setas, Home e End.
- Busca e filtros com labels visíveis, botão de limpar e alvos adequados
  para toque.
- Tabelas com caption, cabeçalhos associados, região rotulada com rolagem
  horizontal, indicação de conteúdo rolável e ações com o nome do item.
- Estados distintos para carregamento, falha, coleção vazia e ausência de
  resultados após filtro.
- Uso de badges com texto, sem depender somente de cor.
- Hero administrativo mais compacto e legível.

## Validação visual e de interação

As páginas e o diálogo de usuário foram validados em:

- 1280 × 800, tema claro e escuro;
- 900 × 800, tema claro e escuro;
- 390 × 844, tema claro e escuro;
- equivalente a zoom de 200%, em viewport CSS de 640 × 400.

Resultados:

- deslocamento do centro do diálogo: 0 px nos eixos horizontal e vertical;
- nenhum overflow horizontal no documento;
- rolagem horizontal contida nas tabelas quando necessária;
- diálogo rolável internamente em telas baixas;
- foco contido nos sentidos direto e reverso;
- Escape fecha, restaura o foco e libera a rolagem;
- tabs responderam ao teclado e atualizaram painel e atributos ARIA;
- duas submissões rápidas produziram uma única chamada;
- conflito 409 preservou mensagem específica, valores e foco no erro.

O teste de conflito e duplicidade usou interceptação temporária de `fetch`
somente no navegador de auditoria. Nenhum mock, dado ou fallback foi
adicionado à aplicação.

## Validação automatizada final

- testes relacionados de frontend/admin/sessão: 7 suítes, 98 testes;
- `npm run test:security`: 6 suítes, 56 testes;
- `npm test`: 30 suítes, 334 testes;
- `npm run test:integration`: 6 suítes, 84 testes, exclusivamente em
  `plataforma_cursos_test`;
- cobertura global: 79,86% statements, 67,98% branches, 83,10% functions
  e 82,12% lines;
- sintaxe JavaScript e `git diff --check`: aprovados.

## Próxima fase

O próximo trabalho recomendado é o Goal Visual 5, após revisão manual destas
evidências. Ele não foi iniciado nesta execução.
