> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Goal Visual 6 — Consolidação do frontend

## Escopo e referência

Execução limitada ao frontend HTML, CSS e JavaScript nativo, testes relacionados
e documentação. Branch validada:
`agent/checkpoint-goals-1-5-frontend-visual`.

O checkpoint inicial estava em
`0f2598e7cbd6816a0725c4e835ffabe516b3ea86`. O repositório `motor_ia`, backend,
APIs, autenticação, bancos, dependências e CI ficaram fora do escopo.

## Linha de base

- `npm run test:security`: 6 suítes e 56 testes aprovados;
- `npm test`: 31 suítes e 345 testes aprovados;
- cobertura: 79,86% de statements, 67,98% de branches, 83,10% de functions e
  82,12% de lines;
- CSS: 6.412 linhas em seis arquivos;
- media queries: 23;
- `!important`: 56 declarações efetivas;
- atributos `style` em HTML: zero;
- acessos programáticos a `.style`: 18;
- uma injeção dinâmica de `<style>`;
- 294 definições brutas de custom properties.

Foram registradas 66 capturas iniciais: 11 páginas, três viewports e dois
temas. A primeira fixture externa devolvia a sessão em formato incompatível e
registrou o redirecionamento anônimo em seis páginas protegidas. Essa limitação
do artefato — não da aplicação — foi detectada na revisão visual. A fixture foi
corrigida para o contrato `{ usuario }`; a validação final percorreu as onze
URLs com os papéis apropriados.

## Consolidação aplicada

### Tokens

- removidos aliases como `--bg`, `--white`, `--purple` e similares;
- consumidores migrados para cores e superfícies semânticas;
- centralizados raios, sombras, espaçamentos, larguras, duração e easing;
- documentados breakpoints conceituais de 640px, 900px e 1200px;
- incluído o token semântico da barra do verificador nos dois temas.

### Base, componentes e estados

- reset e elementos nativos reunidos em `base.css`;
- `[hidden]`, foco, scrollbar e redução de movimento possuem uma única origem;
- diálogos acadêmicos, administrativos e do verificador compartilham o mesmo
  mecanismo de bloqueio de rolagem;
- o modal reutilizável deixou de injetar CSS e passou a usar a camada de
  componentes e construção segura do DOM;
- ícones de curso passaram a usar variantes de classe;
- as duas barras de progresso usam somente a custom property segura
  `--progress-value`;
- helpers de estado deixaram de renderizar HTML escapado com `innerHTML`.

### Limpeza comprovada

Foram removidos após busca em HTML, JavaScript, testes e classes dinâmicas:

- blocos de validação e força de senha sem consumidores;
- a implementação antiga completa do verificador em `style.css`;
- um bloco de `.module-item` integralmente substituído;
- a implementação antiga de modal sem consumidores;
- blocos responsivos duplicados de 640px, 900px e 1024px;
- duplicações de animação que puderam ser incorporadas à regra principal;
- aliases de tema e a segunda definição de `[hidden]`.

Não foram removidas regras invisíveis de acessibilidade, estados de sessão,
classes dinâmicas ou estruturas ainda consumidas.

## Resultado do inventário

| Métrica | Antes | Depois |
| --- | ---: | ---: |
| arquivos CSS | 6 | 7 |
| linhas CSS | 6.412 | 5.929 |
| media queries | 23 | 18 |
| `!important` efetivos | 56 | 6 |
| atributos `style` em HTML | 0 | 0 |
| acessos `.style` no JavaScript | 18 | 2 |
| injeções dinâmicas de `<style>` | 1 | 0 |
| aliases legados | presentes | 0 |

Os dois acessos `.style` restantes somente atribuem o percentual real a
`--progress-value`. Não há `style.display`, `style.width`, `style.overflow`,
handler inline ou sink executável de `innerHTML`.

## Cascata final

Todas as páginas carregam:

`tokens > base > style > components > layouts > responsive > utilities`.

`style.css` permanece como compatibilidade porque ainda contém estruturas
consumidas. Mantê-lo antes das camadas modernas preserva a cascata aprovada; a
ordem recomendada com `style.css` ao fim causaria regressões. Essa exceção deve
ser reavaliada somente após migrar os consumidores restantes.

## Validação visual e interativa

A matriz final contém 66 capturas em:

- 1280 × 800;
- 900 × 800;
- 390 × 844;
- temas claro e escuro.

Resultado comum às onze páginas: URL correta, viewport correta, tema correto e
zero overflow horizontal. Uma rodada adicional de 22 capturas em 640 × 400
validou o equivalente a zoom de 200% e telas baixas, também sem overflow
horizontal.

| Página | Claro/escuro | Desktop/tablet/celular | Observação |
| --- | --- | --- | --- |
| `index.html` | aprovado | aprovado | hero, catálogo e navegação móvel preservados |
| `login.html` | aprovado | aprovado | formulário central e rolagem em tela baixa |
| `cadastro.html` | aprovado | aprovado | campos e ações sem corte |
| `verificar-email.html` | aprovado | aprovado | estados e formulário preservados |
| `sala-virtual.html` | aprovado | aprovado | cards, progresso e disclosure preservados |
| `sala-aula.html` | aprovado | aprovado | módulos, progresso e avaliação preservados |
| `questionario.html` | aprovado | aprovado | perguntas, opções e histórico preservados |
| `professor.html` | aprovado | aprovado | cards e tabela responsiva preservados |
| `professor-turma.html` | aprovado | aprovado | contexto, filtros e acompanhamento preservados |
| `admin.html` | aprovado | aprovado | tabs, tabela, filtros e diálogos preservados |
| `verificador.html` | aprovado | aprovado | workspace, tabs e diálogos preservados |

A auditoria de interação confirmou:

- disclosure móvel abre, fecha com Escape e restaura foco;
- tabs de admin e verificador respondem às setas e sincronizam ARIA;
- diálogos ficam centralizados, contêm foco e rolam internamente;
- Escape fecha, restaura o acionador e desbloqueia a página;
- o modal compartilhado permanece dentro de 640 × 400 e aceita rolagem interna.

## Gate automatizado

- `npm run test:security`: 6 suítes e 56 testes aprovados;
- `npm test`: 32 suítes e 363 testes aprovados;
- cobertura final: 79,86% de statements, 67,98% de branches, 83,10% de
  functions e 82,12% de lines;
- `npm run test:integration -- --silent`: 6 suítes e 84 testes aprovados,
  exclusivamente em `plataforma_cursos_test`;
- testes focados de fundação, páginas, diálogos e Goals Visuais 4–6: 112
  testes aprovados;
- sintaxe JavaScript, JSON, integridade do diff e escopo: aprovados.

Uma asserção de segurança ainda procurava a media query do catálogo em
`style.css`. Ela foi atualizada para verificar `responsive.css`, sua nova
responsabilidade. Em uma repetição imediata das integrações, o Goal 3 recebeu
401 durante o bootstrap; a suíte isolada passou em 21/21 e a repetição completa
posterior passou em 84/84. Nenhuma alteração funcional ou de banco foi feita
para contornar essa ocorrência transitória.

## Regressões encontradas e corrigidas

1. Ao centralizar aliases no primeiro passe, o fade claro do hero herdou uma
   superfície escura. Os aliases foram eliminados e o tema claro recebeu uma
   regra semântica escopada, sem `!important`.
2. Ao remover a implementação antiga do verificador, a barra de breadcrumb
   herdou a altura da navegação genérica. A altura e a superfície foram
   explicitadas no componente atual.
3. A fixture visual inicial usava o formato incorreto de sessão. O script
   externo foi corrigido; nenhum código da aplicação foi alterado por isso.

## Exceções e riscos residuais

- seis `!important` são necessários para `[hidden]` e movimento reduzido;
- duas atribuições de custom property representam percentuais dinâmicos;
- `style.css` ainda é necessário e sua migração total não pertence a este Goal;
- diferenças automáticas de pixels durante `fadeUp` variam conforme o instante
  da captura; a comparação estrutural e a inspeção das imagens finais não
  encontraram regressão relevante;
- a captura inicial autenticada foi limitada pela fixture descrita acima; a
  equivalência das áreas protegidas também foi sustentada pelos testes dos
  Goals Visuais 3–5 e pela matriz autenticada final.

## Próximo Goal

O Goal Visual 7 deve validar integralmente os Goals Visuais 1–6 e publicar o
estado aprovado, sem novo redesign. A migração gradual das estruturas ainda
consumidas em `style.css`, seguida de eventual reposicionamento ou remoção do
arquivo, exige uma tarefa futura específica e uma nova linha de base visual.
