# Goal 24.2 — Admin pagination and complete data access

STATUS: ADMIN_PAGINATION_READY

Data: 06/11/2026, America/Sao_Paulo. Escopo: F18-05/T18-05.
Baseline: main remota `c78e61076942a37053edbfb4e45760163fed8219`.
Worktree criada limpa em `worktrees/plataforma-cursos-goal24-2`, branch
`fix/goal24-2-admin-pagination`.

## Causa confirmada

`admin.js` consultava `/api/admin/usuarios?limit=100` e
`/api/turmas?limit=100` sem navegar às páginas seguintes. Busca e filtros eram
aplicados aos arrays dessa primeira resposta. Os formulários de turma e de
replicação extraíam os professores do mesmo array de usuários, sem uma consulta
por papel no conjunto completo. Os endpoints já retornavam paginação e total,
mas não implementavam os filtros usados pela interface.

Antes da correção da aplicação, uma fixture exclusivamente descartável com
mais de 100 registros reproduziu o defeito: a busca por
`Lab Paginação Professor 101` encontrou zero linhas, embora o registro existisse.
O teste falhou no assert que exigia uma linha. Trace, screenshot e logs dessa
baseline estão preservados. Não foi reaplicada uma correção já presente.

## Correção delimitada

Os endpoints existentes mantêm `{ items, page, limit, total }` e os limites
originais de paginação. Foram acrescentados filtros opcionais, combinados antes
de COUNT e LIMIT, com valores vinculados por parâmetros SQL:

| Endpoint | Filtros |
| --- | --- |
| GET `/api/admin/usuarios` e listagem administrativa equivalente de usuários | `q` por nome/e-mail; `tipo` ALUNO, PROFESSOR ou ADMIN |
| GET `/api/turmas` | `q` por nome da turma, curso ou professor; `status` ABERTA, FECHADA ou ENCERRADA |

`q` aceita texto de até 200 caracteres. Tipos, papéis e status inválidos retornam
400 antes da consulta. `%`, `_` e `!` são escapados como caracteres literais no
LIKE; os termos não são concatenados ao SQL. A ordenação estável existente,
incluindo desempate por ID, foi preservada. O total corresponde aos filtros.
Requisições sem filtros conservam o comportamento e o contrato anteriores.

A interface solicita 25 registros por página. Usuários e turmas têm navegação
anterior/próxima, página atual e total. Buscar, filtrar ou limpar filtros retorna
à página 1. Cada resposta substitui a lista, sem acumular registros duplicados.
Edição, criação e exclusão consultam novamente a página com os filtros atuais;
se a última página deixa de existir, a interface consulta a última página válida.
O controle de sequência impede que uma resposta atrasada de outro módulo
substitua o painel ativo.

O seletor nativo de professor recebe busca e paginação próprias, sempre usando
`tipo=PROFESSOR`. Isso vale para criar, editar e replicar turma. Uma seleção já
existente é preservada mesmo fora da página de opções consultada. Nenhum usuário
precisa baixar todas as páginas para localizar o professor 101. Cursos mantêm o
contrato existente e não fazem parte do defeito dos primeiros 100 registros.

Busca é submetida pelo botão Buscar ou Enter, evitando o GET duplicado que
ocorria com os eventos `search` e `submit` simultâneos. A evidência de rede do
teste de erro comprovou essa duplicação antes do ajuste. Loading, resultado vazio,
erro e tentativa novamente continuam distintos, incluindo o seletor de professor.

Os paginadores usam regiões de navegação nomeadas, botões nativos com estados
disabled, anúncio de página/total e foco após navegação. O CSS foi limitado à
classe nova `.admin-pagination`: neutraliza altura fixa/sticky e decoração
herdadas de `nav`, que causavam sobreposição no mobile, e mantém botões com
altura mínima de 44 px e quebra de linha. O restante do painel não foi redesenhado.

## Validação com banco descartável

O runner E2E informa o nome de seu próprio projeto Compose ao processo de teste.
A fixture recusa execução sem esse identificador, `NODE_ENV=test`, `E2E_RUN=1` e
o banco canônico de teste; é executada por stdin dentro do container descartável.
Não é incluída como seed operacional na imagem. Cleanup remove seus registros,
e o runner remove containers, volumes e rede ao final.

A fixture acrescenta 120 professores, um aluno descartável e 122 turmas aos dados
E2E existentes: **125 usuários, 125 turmas e 121 professores** inicialmente.
Todos os registros são sintéticos. APIs reais e MySQL 8.4 são usados para os
casos de dados, autorização e mutações. Apenas falhas HTTP, atraso e busca de
erro do seletor são injetados por interceptação de rede.

```sh
npm run test:e2e:all -- tests/e2e/admin-pagination.spec.js \
  --project=chromium --reporter=list,json
npm run lint
npm run build
```

O runner acrescenta `--retries=0 --forbid-only --fail-on-flaky-tests`. Nenhum
timeout ou retry foi aumentado. A execução final passou **4/4 testes** em cerca
de 11,2 segundos, zero skips, flaky ou retries:

| Evidência | Resultado |
| --- | --- |
| Usuário/professor 101 localizado e editado | PASS; lista atualizada, busca e papel combinados |
| Todas as páginas de professores na lista de usuários | 121 e-mails distintos, sem duplicações |
| Todas as páginas de turmas | 125 nomes distintos, incluindo turma 101 |
| Busca por turma e por professor, filtro ENCERRADA | PASS; 41 turmas sintéticas correspondentes ao filtro combinado |
| Professor 101 selecionável | PASS em criação e replicação; seleção atual preservada na edição |
| Criação, edição e exclusão | PASS; nova turma usa professor 101; excluir a única linha da página 6 retorna à página 5 |
| Exclusão de usuário | PASS; filtro retorna vazio e total geral atualizado |
| Estados e concorrência | PASS; 503, retry explícito, buscas vazias, loading e resposta atrasada após trocar de módulo |
| Autorização e validações | Sem sessão: 401; PROFESSOR na listagem ADMIN: 403; mutação sem CSRF: 403; usuário não professor na turma: 409 |
| Filtros inválidos e termos SQL/literais | PASS, incluindo `%` literal e texto semelhante a injeção |
| Teclado e controles | PASS; Enter na paginação, controles rotulados e limites disabled |
| Responsividade | PASS em 320, 390 e 1440 px; sem overflow global, controles contidos e screenshots preservados |

Jest direcionado: **7 suítes, 84 testes aprovados**, cobrindo filtros, controllers
de usuários/turmas, rotas ADMIN e regressões da interface/segurança. As variáveis
obrigatórias de banco foram declaradas com credenciais sintéticas de unit test;
não foi usado banco de produção. Lint, build da aplicação, sintaxe da fixture e
diff check: PASS. A stack E2E final `plataforma-cursos-e2e-56912` foi removida.

Evidências em `/mnt/disco/projetoSite/.tmp/goal24-2-admin-pagination/`: reprodução
da baseline, traces/screenshots/logs de desenvolvimento, JSON e log da execução
E2E final, screenshots finais, Jest direcionado, lint/build e verificação final
do commit, refs e worktrees. Credenciais e cookies sintéticos dos traces não
integram o commit. A primeira invocação Jest sem configuração de banco foi
recusada pelo guard existente; a execução configurada e a confirmação final
passaram. Falhas de fixtures/locators durante o desenvolvimento foram corrigidas
sem relaxar asserts ou validações da aplicação.

## Preservação e limites

Main e `goal22-rc.1` permanecem em `c78e61076942a37053edbfb4e45760163fed8219`.
O objeto anotado da tag continua `5b8ca5a3888b5373d23eb794697269434668035b`.
O Goal 24.1 permanece no commit `1ccabb9f5ee33abc2d2356b66516e67497e76983`, em seu
worktree e branch próprios. Nenhuma alteração pendente foi incorporada, resetada
ou descartada. Esta entrega é um commit isolado local, sem push.

Não foram alteradas regras acadêmicas, certificados, migrations, dependências,
autenticação ou validações de mutação. Não houve produção, deploy ou CI completa.
A pendência Firefox da main, CI `42225134622`, permanece fora deste escopo e não
foi investigada ou reexecutada.

A validação de navegador deste Goal é Chromium; ela não declara Firefox/WebKit
ou a CI global aprovados. A paginação por offset reflete os dados atuais a cada
consulta, sem snapshot entre páginas sob escritas simultâneas. Busca por trecho
pode exigir varredura em bases muito grandes; nenhuma migration ou mudança de
índices foi necessária para corrigir o acesso completo aos dados.

DEPLOY: NO.
