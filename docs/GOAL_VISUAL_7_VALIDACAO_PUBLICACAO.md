# Goal Visual 7 — Validação final e publicação

## Escopo validado

A validação final abrangeu os Goals Visuais 1–6 no frontend HTML, CSS e
JavaScript nativo. Não houve novo redesign, instalação de dependências nem
alteração de backend, API, autenticação, banco, regras de negócio, CI ou
`motor_ia`.

A branch de trabalho é
`agent/checkpoint-goals-1-5-frontend-visual`, baseada em `origin/main`. O
checkpoint anterior à consolidação era
`0f2598e7cbd6816a0725c4e835ffabe516b3ea86`.

## Matriz visual final

As onze páginas foram exercitadas em 1280 × 800, 900 × 800 e 390 × 844, nos
temas claro e escuro. A rodada produziu 66 verificações com:

- URL e viewport corretas;
- tema solicitado aplicado;
- zero overflow horizontal do documento;
- navegação disponível;
- formulários, cards, tabelas, tabs e diálogos dentro da viewport.

Uma segunda rodada em 640 × 400, equivalente ao zoom de 200% e a uma tela de
baixa altura, produziu 22 verificações adicionais sem overflow horizontal. A
preferência de movimento reduzido foi validada nas onze páginas e nos dois
temas, sem animações ativas.

| Página | 1280 × 800 | 900 × 800 | 390 × 844 | 200% / tela baixa |
| --- | --- | --- | --- | --- |
| `index.html` | aprovada | aprovada | aprovada | aprovada |
| `login.html` | aprovada | aprovada | aprovada | aprovada |
| `cadastro.html` | aprovada | aprovada | aprovada | aprovada |
| `verificar-email.html` | aprovada | aprovada | aprovada | aprovada |
| `sala-virtual.html` | aprovada | aprovada | aprovada | aprovada |
| `sala-aula.html` | aprovada | aprovada | aprovada | aprovada |
| `questionario.html` | aprovada | aprovada | aprovada | aprovada |
| `professor.html` | aprovada | aprovada | aprovada | aprovada |
| `professor-turma.html` | aprovada | aprovada | aprovada | aprovada |
| `admin.html` | aprovada | aprovada | aprovada | aprovada |
| `verificador.html` | aprovada | aprovada | aprovada | aprovada |

Os artefatos temporários de navegador, perfis e capturas ficaram fora do
repositório e não fazem parte da publicação.

## Acessibilidade e interação

A validação por teclado confirmou:

- menu móvel aberto por teclado, fechado com Escape e com foco restaurado;
- tabs de administração e verificador com setas e estado ARIA sincronizado;
- diálogos com foco inicial, contenção de Tab e Shift+Tab, fechamento por
  Escape e restauração do acionador;
- diálogos centralizados, roláveis em tela baixa e com bloqueio de rolagem do
  documento;
- ausência de elementos ocultos na ordem de foco;
- foco visível, alvos de toque e hierarquia de títulos preservados.

Os testes automatizados também cobrem Enter, Espaço, Home e End nos componentes
interativos correspondentes.

## Perfis e fluxos funcionais preservados

Uma rodada controlada usou exclusivamente `plataforma_cursos_test`, com os
papéis autoritativos `ALUNO`, `PROFESSOR` e `ADMIN`.

### ALUNO

- Sala Virtual e Sala de Aula carregaram a matrícula, módulos e conteúdos;
- a conclusão atualizou o progresso para 100% e persistiu após nova consulta;
- o questionário canônico carregou uma pergunta e suas opções;
- a submissão foi calculada no backend, retornou 100% e apareceu no histórico;
- o logout removeu a sessão e redirecionou para a página pública.

### PROFESSOR

- as três turmas próprias foram listadas;
- a turma consultada retornou o aluno matriculado;
- nota inválida retornou `400`;
- nota válida foi atualizada para `8,5` e persistiu;
- autorização para recursos de outras pessoas permanece coberta pelas
  integrações.

A autoria de materiais e questionários pelo professor continua fora do escopo.

### ADMIN

- a listagem retornou os quatro usuários canônicos;
- o último ADMIN não pôde ser excluído (`409`);
- a autoexclusão foi bloqueada (`409`);
- usuários vinculados como professor ou aluno não puderam ser excluídos
  (`409`);
- um ALUNO recebeu `403` ao tentar acessar o recurso administrativo;
- criação, edição, filtros, cursos, turmas, senha e respostas `400`, `403`,
  `404`, `409` e `500` permanecem cobertos pelas suítes de integração e
  interface.

Nenhuma regra funcional foi alterada para produzir esses resultados.

## Verificador e `motor_ia`

O `motor_ia` foi executado sem qualquer alteração no repositório:

- `GET /health` retornou estado saudável;
- `POST /api/analisar` retornou o score real;
- entrada inválida retornou `422`;
- a plataforma enviou `texto_original` e `texto_suspeito`;
- o frontend exibiu exatamente o score `88,59` retornado pela plataforma, sem
  recálculo;
- houve uma única chamada durante o envio, com botão bloqueado no loading e
  liberado ao final;
- o tratamento de `422`, timeout, `500` e `503` permanece coberto por testes;
- textos foram inseridos no DOM por APIs seguras.

O repositório `motor_ia` permaneceu em `main`, limpo e idêntico a
`origin/main` no commit `dd7fb4bf58ecb6513a5ec8b4260b5c78aaff3acc`.

## Segurança e integridade

- zero scripts inline, handlers inline ou URLs `javascript:`;
- zero sinks executáveis de `innerHTML`, `outerHTML` ou
  `insertAdjacentHTML`;
- as únicas duas atribuições a `.style` definem a custom property segura
  `--progress-value` com percentuais calculados;
- CSP, proteção XSS, sessão autoritativa, papéis e redaction passaram nos
  testes;
- `.env` e `.env.test` reais permanecem locais e ignorados;
- somente `.env.example` e `.env.test.example` são rastreados;
- nenhum cache, log, cobertura, perfil de navegador ou screenshot foi
  preparado para publicação;
- sintaxe JavaScript, JSON e YAML, balanceamento CSS e `git diff --check`
  foram aprovados.

## Testes finais

| Comando | Resultado |
| --- | --- |
| `npm run test:security` | 6 suítes, 56 testes aprovados |
| `npm test` | 32 suítes, 363 testes aprovados |
| `npm run test:integration` | 6 suítes, 84 testes aprovados |
| `npm run test:all` | 38 suítes, 447 testes aprovados |
| `git diff --check` | aprovado |

Cobertura final:

- statements: 79,86%;
- branches: 67,98%;
- functions: 83,10%;
- lines: 82,12%.

Não houve testes ignorados. Os avisos não bloqueantes corresponderam a caminhos
negativos controlados, rollback/redaction e ao envio de e-mail desabilitado no
ambiente de teste.

Todas as integrações usaram exclusivamente:

```text
NODE_ENV=test
DB_NAME=plataforma_cursos_test
```

`site_cursos` e `plataforma_cursos_dev` não receberam setup, seed ou limpeza.

## Resultado do gate

Nenhuma regressão crítica ou funcional foi encontrada na validação final, por
isso o Goal Visual 7 não exigiu mudança corretiva adicional no código da
aplicação. O gate está verde para publicação em Draft Pull Request, sem merge
automático.

Limitações conhecidas:

- autoria de materiais e questionários pelo professor ainda não foi
  implementada;
- o provedor de e-mail não está configurado no ambiente automatizado;
- `style.css` continua como camada de compatibilidade enquanto ainda possui
  consumidores, conforme documentado no Goal Visual 6.
