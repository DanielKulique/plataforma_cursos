> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Goal Visual 8 — Landing Page Institucional

## Escopo

Implementação limitada a uma nova página pública, estilos, JavaScript e asset
exclusivos, testes relacionados e esta documentação. A landing está disponível
em `/landing.html` e não substitui `index.html`.

Não foram alterados backend, APIs, autenticação, bancos, páginas internas,
dependências, manifests, CI ou o repositório `motor_ia`.

## Auditoria da referência

O arquivo `/mnt/data/preview.html` possuía:

- 1.041 linhas e 386.208 bytes;
- dois blocos `<style>` com 450 e 58 linhas;
- 93 seletores no primeiro bloco e 13 no segundo;
- tokens genéricos como `--bg`, `--paper` e `--accent`;
- sobreposição de regras de `body`, hero, cards, navegação e raízes;
- um script inline para construir tronco, casca, raízes, solo e galhos;
- dois links com `href="#"`;
- duas ocorrências de `!important`;
- Google Fonts carregadas externamente;
- uma imagem PNG Base64 de 669 × 247, com aproximadamente 260 KB;
- menu móvel sem `aria-expanded`, `aria-controls`, Escape ou restauração de foco.

A referência já utilizava `requestAnimationFrame` no scroll e
`IntersectionObserver` para os galhos e cards. Esses mecanismos foram
preservados e simplificados.

## Estrutura criada

```text
src/public/
├── landing.html
├── assets/landing/
│   └── logo-plagio.webp
├── css/landing/
│   ├── landing.css
│   └── landing-responsive.css
└── js/
    └── landing.js
```

Testes:

```text
src/__tests__/goal8.landing.test.js
src/__tests__/visual.foundation.test.js
```

## Identidade preservada

- papel envelhecido e textura sutil;
- verde-pinho, casca, âmbar e subsolo;
- tipografia editorial com serifas;
- araucária com tronco cônico, casca, galhos em candelabro e copas;
- raízes e camadas orgânicas do solo;
- crescimento do tronco ligado ao progresso da página;
- cards alternados ao longo da árvore;
- narrativa da raiz à autoria;
- hero e CTA institucional.

Todas as classes e custom properties usam o prefixo `landing-`. A página carrega
somente suas duas folhas CSS e seu JavaScript; nenhuma folha da plataforma
carrega regras da landing.

## Adaptações e remoções

- os dois blocos CSS foram consolidados em duas folhas por responsabilidade;
- seletores genéricos e tokens sem prefixo foram eliminados;
- não existe `<style>`, script inline, handler inline ou `href="#"`;
- não existe `!important` nas folhas da landing;
- não existe API visual direta de `.style` no JavaScript;
- os galhos usam `pathLength="1"`, evitando calcular e atribuir comprimento por
  estilo;
- os dados SVG são constantes locais e inseridos com `createElementNS` e
  `setAttribute`;
- os cards permanecem legíveis sem depender de animação ou JavaScript;
- a primeira inspeção visual encontrou cor incorreta no CTA por competição de
  especificidade; a regra base foi corrigida com `:where(a)`.

## Imagem e fontes

O PNG Base64 foi externalizado e convertido para WebP:

| Métrica | Referência | Landing |
| --- | ---: | ---: |
| dimensões | 669 × 247 | 479 × 177 |
| tamanho | ~260.097 bytes | 10.764 bytes |
| redução | — | ~95,9% |

O HTML contém largura e altura para evitar mudança de layout e texto
alternativo equivalente à marca.

As Google Fonts da referência não foram mantidas. A landing usa:

```css
Georgia, "Times New Roman", serif;
Arial, Helvetica, sans-serif;
```

Assim, não foi necessário alterar a CSP, baixar fontes sem licença explícita ou
adicionar nova conexão externa.

## Links e decisão de rota

Links internos:

- `/index.html`: plataforma e catálogo;
- `/login.html`: login;
- `/cadastro.html`: criação de conta;
- âncoras reais para início, projeto, conteúdo e instituição.

O site oficial já estava definido na referência:

`https://falandodeplagio.wixsite.com/eplagio`

Links oficiais, cartilha, FAQ, equipe, Instagram e YouTube abrem em nova aba
com `target="_blank"` e `rel="noopener noreferrer"`. Nenhum placeholder foi
necessário.

`index.html` foi preservado porque resolve sessão autoritativa, catálogo,
turmas, matrícula e navegação por papel. Transformar a landing em `/` agora
mudaria essas responsabilidades e exigiria uma tarefa específica de roteamento
e continuidade da sessão.

## Acessibilidade

- um único `h1` e sete títulos de segundo nível;
- skip link e landmark principal;
- árvore e raízes decorativas ocultadas de leitores de tela;
- logo com texto alternativo e dimensões;
- foco visível de 3 px;
- contrastes de texto entre 6,09:1 e 11,36:1 nas combinações principais;
- menu móvel com `aria-expanded`, `aria-controls`, rótulo sincronizado,
  fechamento por Escape e restauração de foco;
- menu retirado da ordem de foco quando fechado;
- alvos interativos com pelo menos 44 px;
- animações não carregam informação exclusiva;
- movimento reduzido validado no Firefox: transições de 0,01 ms, sway e cue
  desativados, galhos e árvore totalmente visíveis.

## Responsividade e validação visual

Landing aprovada em:

- 1280 × 800;
- 900 × 800;
- 390 × 844;
- 640 × 400, equivalente ao zoom de 200% e tela baixa.

Resultados:

- zero overflow horizontal;
- imagem e duas folhas CSS carregadas;
- seis galhos, onze raízes e sete linhas de casca construídos;
- cards sem sobreposição e alternância preservada;
- árvore não bloqueia a leitura no celular;
- menu cabe na viewport e possui rolagem interna quando necessário;
- CTA, hero e seção subterrânea legíveis.

As onze páginas internas foram recapturadas em três viewports, temas claro e
escuro: 66 capturas, zero overflow, zero tema incorreto e zero viewport
incorreto. Cinquenta e cinco capturas foram idênticas pixel a pixel à linha de
base do Goal Visual 7. As onze diferenças restantes foram limitadas ao instante
das animações preexistentes e não revelaram alteração estrutural ou visual.

## Desempenho

O conjunto novo possui aproximadamente 66,8 KB sem compressão HTTP:

- HTML: 16.834 bytes;
- CSS principal: 18.207 bytes;
- CSS responsivo: 5.502 bytes;
- JavaScript: 15.485 bytes;
- imagem: 10.764 bytes.

O SVG é construído uma vez. Há:

- um único listener passivo de scroll;
- uma atualização agrupada por `requestAnimationFrame`;
- um `IntersectionObserver` para os seis cards;
- nenhuma consulta de rede, API privada ou cálculo pesado contínuo;
- nenhuma fonte, biblioteca, CDN ou dependência adicional.

## Testes finais

- `npm run test:security`: 6 suítes e 56 testes aprovados em 1,46 s;
- `npm test`: 33 suítes e 374 testes aprovados em 6,21 s;
- testes específicos do Goal 8: 11 aprovados;
- cobertura preservada: 79,86% statements, 67,98% branches, 83,10% functions
  e 82,12% lines;
- sintaxe JavaScript, balanceamento CSS, CSP e `git diff --check`: aprovados.

Os avisos do teste completo correspondem a caminhos negativos controlados já
existentes. Não houve falha nova.

## Estado de entrega

- landing implementada e validada separadamente;
- `index.html` não foi substituído ou redirecionado;
- páginas internas, backend, APIs e regras de negócio não foram alterados;
- `motor_ia` permaneceu inalterado;
- nenhum commit, push ou merge foi realizado.
