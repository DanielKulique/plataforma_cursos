# Goal Visual 5 — Verificador de similaridade

## Escopo e invariantes

Esta fase modernizou somente a interface do verificador em HTML, CSS e
JavaScript nativos. Foram preservados:

- cálculo, modelo e algoritmo do `motor_ia`;
- endpoint, método, payload e timeout da integração;
- sessão, autenticação e armazenamento do token;
- CSP, proteção XSS, redaction e validação de URLs;
- backend, banco, schema, seeds, dependências, manifests e CI.

O repositório `motor_ia` não foi alterado. Não houve commit nem push.

## Linha de base

Antes da alteração:

- `npm test`: 30 suítes e 334 testes aprovados;
- `npm run test:security`: 6 suítes e 56 testes aprovados;
- capturas realizadas em 1280 × 800, 900 × 800 e 390 × 844, nos
  temas claro e escuro.

As capturas anteriores e posteriores estão fora do Git:

`/mnt/disco/projetoSite/goal5-visual-baseline.jJLOxq`

## Problemas encontrados

- ausência de `h1` e introdução da página;
- baixa separação visual entre entrada e resultado;
- controles de formatação e exportação sem ação real;
- upload simulado que injetava texto fictício;
- score convertido para “originalidade”, limitado e arredondado no frontend;
- métricas de plágio direto, paráfrase e detecções sem suporte na resposta real;
- falha no SVG de score no Firefox;
- tabs sem foco itinerante, setas, Home ou End;
- painéis inativos sem `hidden`;
- erros apresentados principalmente em toasts efêmeros;
- overlay customizado sem contenção ou restauração de foco;
- densidade alta e leitura difícil em celular.

## Contrato registrado

Fluxo do navegador:

- `POST /api/plagio/analisar`;
- `Content-Type: application/json`;
- `Authorization: Bearer ...`;
- payload: `texto_original` e `texto_suspeito`.

Fluxo da plataforma para o motor:

- `POST http://127.0.0.1:8000/api/analisar`;
- mesmo payload;
- timeout padrão de 10.000 ms;
- resposta do motor: `status` e `score_similaridade`.

Nenhum desses contratos foi alterado.

## Teste com o motor real

O motor foi iniciado com o modelo
`paraphrase-multilingual-MiniLM-L12-v2`. O cache global configurado na
máquina não tinha permissão de escrita, portanto foi usado um cache externo
aos repositórios:

`/mnt/disco/projetoSite/goal5-hf-cache.KHOEY9`

Para os textos fictícios da documentação, a resposta direta foi:

- HTTP 200;
- `status`: `sucesso`;
- `score_similaridade`: `91.28`.

O smoke pelo proxy da plataforma, autenticado como ALUNO e usando somente
`plataforma_cursos_test`, retornou o mesmo score `91.28` e o mesmo status.
Esse smoke criou apenas o registro normal da análise no banco de teste
descartável. `plataforma_cursos_dev` e `site_cursos` não foram usados.

No navegador, o componente preservou `data-raw-score="91.28"` e apresentou
`91,28%`, apenas com formatação decimal `pt-BR`. Não houve complemento para
originalidade, clamp ou arredondamento adicional.

## Alterações de interface

- Um único `h1`, introdução curta e hierarquia em duas etapas.
- Formulário e resultado em cards distintos.
- Labels, ajuda, contadores, erros próximos aos campos e foco no primeiro
  campo inválido.
- Estado `aria-busy`, botão ocupado e bloqueio de submissão duplicada.
- Resultado com score real, status real, HTTP observado e aviso de que
  similaridade não confirma plágio.
- Textos comparados e fontes exibidos somente quando realmente disponíveis.
- Faixas visuais preexistentes de 60% e 80% preservadas apenas para
  classificação textual; elas não alteram o score nem o motor.
- Tabs com papéis ARIA, foco itinerante, setas, Home, End e painéis ocultos.
- Diálogos nativos para atalhos e confirmação de limpeza.
- Upload e exportação aparentes removidos porque não possuíam implementação
  real.
- Estados distintos para espera, loading, sucesso, validação, timeout,
  erro interno, indisponibilidade e resultado vazio.

## Validação visual e de interação

Validado em:

- 1280 × 800, claro e escuro;
- 900 × 800, claro e escuro;
- 390 × 844, claro e escuro;
- equivalente a zoom de 200%, em viewport CSS de 640 × 400.

Resultados:

- um único `h1`;
- nenhum overflow horizontal do documento;
- campos e cards empilhados quando necessário;
- tabs com apenas o item ativo no ciclo de Tab;
- setas e End atualizaram foco, seleção e painel;
- duas submissões rápidas produziram uma única chamada;
- estados 422, timeout, 500 e 503 mantiveram mensagens distintas;
- diálogos centralizados com deslocamento de 0 px nos dois eixos;
- foco contido nos dois sentidos;
- Escape fechou, restaurou foco e liberou a rolagem;
- diálogo rolável internamente no equivalente a zoom de 200%.

Uma divergência de classe entre HTML e CSS foi encontrada durante a
validação (`verifier-dialog` versus `verificador-dialog`) e corrigida antes
do gate.

## Validação automatizada final

- testes focados do Goal Visual 5, fundação e segurança: 3 suítes,
  54 testes;
- `npm run test:security`: 6 suítes, 56 testes;
- `npm test`: 31 suítes, 345 testes;
- cobertura global: 79,86% statements, 67,98% branches, 83,10% functions
  e 82,12% lines;
- sintaxe JavaScript e `git diff --check`: aprovados.

## Próxima fase

O próximo trabalho recomendado é o Goal Visual 6. Ele não foi iniciado nesta
execução.
