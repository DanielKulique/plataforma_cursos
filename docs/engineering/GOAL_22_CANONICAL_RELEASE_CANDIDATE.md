# Goal 22 — Canonical baseline, full CI & release candidate

**STATUS: CANONICAL_RELEASE_CANDIDATE_READY somente com a tag anotada
`goal22-rc.1` apontando para este commit e os dois jobs controlados aprovados;
sem essa comprovação, PARTIAL.**

## Finalização controlada

A baseline preservada é `80f1224a7ec7521cc9cdd47f58efe64d9a037ae7`.
O diagnóstico anterior e seus limites estão registrados abaixo, sem reabrir a auditoria.
A autorização de finalização limita esta rodada a um teste remoto direcionado e,
somente após sua aprovação, uma única suíte completa no mesmo SHA.

| Campo | Registro definitivo |
| --- | --- |
| FINAL_SHA | Commit resolvido por `git rev-parse 'refs/tags/goal22-rc.1^{commit}'`; SHA integral na anotação da tag |
| TARGETED_WEBKIT_CI | Job `webkit-responsive`, um teste, 13 telas × 6 larguras, zero retries/skips/flaky |
| FULL_CI | Job `testes`, dependente da aprovação do direcionado, uma execução completa |
| CHROMIUM / FIREFOX / WEBKIT | 32 casos por browser, zero falhas/skips/flaky/retries exigidos no job completo |
| RC_TAG | `goal22-rc.1`, criada somente após ambos os jobs e seus artefatos serem conferidos |
| REMAINING_FAILURE | Nenhuma somente se os gates acima passarem; qualquer falha encerra a rodada como PARTIAL |
| DEPLOY | NO |

O commit isolado contém o ajuste local já validado, sua documentação e o suporte
mínimo de CI/evidências. O teste conserva as 78 combinações e os três asserts de
layout, substitui a espera genérica por papel exato, aguarda os dados e carrega
cada tela uma vez antes das seis medidas por resize. O timeout de 120 s permanece;
não há retries. O trace passou de `off` para `retain-on-failure` e screenshots de
falha permanecem ativos.

O job direcionado usa o runner e o Compose E2E existentes, com MySQL/storage
próprios, credenciais sintéticas e cleanup. Seu JSON exige exatamente um teste
aprovado, 13 telas únicas, distribuição 7 aluno / 5 professor / 1 admin e as seis
larguras originais em cada tela. Falha nesse job impede o job completo. O runner
coleta os logs de app/db do próprio projeto antes de limpar uma execução que falhou;
stdout, JSON, trace e screenshots ficam no artefato `goal22-targeted-webkit-<SHA>`.
A CI completa mantém o artefato `playwright-e2e-<SHA>`.

A dependência usa [`jobs.<job_id>.needs`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idneeds).
Fora desta branch, a suíte completa anterior continua disponível. O push da tag
`goal22-rc.*` é excluído do trigger para não iniciar uma segunda CI completa.
Não há reexecução automática nem nova rodada de correções após falha controlada.
A anotação da tag registra o SHA integral, URL do workflow e resultados finais;
isso permite incluir o relatório no próprio commit testado sem SHA autorreferente.

## Baseline e commits incluídos

| Entrega | Commit imutável |
| --- | --- |
| GOAL_19_COMMIT — isolamento do restore | `dcccc29394a92574739c5b4351f240fe5d6e127e` |
| GOAL_20_COMMIT — parser HTTP | `d6bb5f34642c45285980baccce12e8a6ec6265aa` |
| GOAL_21_COMMIT — associação | `8d78b1ba8ccde3962091bb6f73cb348d75257cf1` |

A branch `release/goal22-canonical-rc` foi criada em worktree limpa a partir do
Goal 21. Os três commits já eram ancestrais; nenhum foi duplicado ou reaplicado.
Worktree: `/mnt/disco/projetoSite/worktrees/plataforma-cursos-goal22`.

RC_COMMIT: SHA resolvido pela tag `goal22-rc.1^{commit}`, após os gates de finalização.
RC_TAG: `goal22-rc.1` somente após CI verde; até lá, **NONE**.
Não havia convenção RC anterior; existia apenas a tag anotada de arquivo
`ic-research-final-2026-08-22`.

## Diagnóstico anterior limitado da CI 42133617667

- **Fato confirmado:** no SHA preservado, Chromium e Firefox passaram 32/32;
  WebKit passou 31/32 e falhou em `responsive-roles.spec.js`, na chamada
  `page.goto('/admin.html')`, com “WebKit encountered an internal error”. O job
  terminou com falha e o build da imagem foi ignorado.
- **Artefatos examinados:** JSON do WebKit, log do job `127616111388`, snapshot
  `error-context.md` e os três screenshots preservados. A captura do administrador
  mostra o papel ADMIN renderizado e o painel com “Load failed”. As outras duas
  capturas mostram as telas anteriores de aluno e professor.
- **Limite da prova:** o teste configurava `trace: 'off'`; não há trace/HAR nem
  logs da aplicação/rede que identifiquem a requisição interrompida ou um status
  HTTP do erro. O runner removeu os containers sem coletar seus logs. Não se pode
  concluir se o erro interno é defeito do motor WebKit, concorrência do teste ou
  falha da aplicação. Recargas consecutivas do teste são a hipótese principal,
  não uma causa raiz comprovada. Nenhum defeito de backend, autenticação ou CSS
  foi comprovado nesta investigação.
- **Único ajuste funcional local, já existente:** `responsive-roles.spec.js`
  abre cada tela em página independente, aguarda papel/dados e mede as mesmas
  seis larguras por resize. Conserva as 78 combinações e todos os limites de
  overflow/recorte, sem aumentar timeout/retries. Placeholders de erro de diálogos
  fechados não contam como erro visível da tela ativa.
- **Validação aproveitada:** a execução local iniciada antes da limitação terminou
  com 32/32 WebKit. O caso afetado passou em **10.009 ms**, retry **0**, com os
  13 passos de tela e seis medidas por passo aprovados. Isso valida o ajuste
  localmente; não prova a causa da falha remota nem torna verde a CI preservada.
- **Encerramento daquela etapa:** nenhum novo teste, workflow, commit, push ou tag
  foi iniciado durante o diagnóstico limitado. A pendência é obter evidência causal de
  navegação/rede no ambiente remoto, em trabalho posterior explicitamente autorizado.

SHA, histórico, diffs e ancestralidade foram conferidos. Não houve reset, stash,
merge da árvore original ou merge automático na main. A árvore original mantém
HEAD `b94717963cc29f6fa9cfaf2c170ee3a61ad97a98`, 98 entradas de status e 725 arquivos
rastreados/novos não ignorados. O SHA-256 agregado confere com a evidência do Goal 21:
`b3f4e4a56d10c7bd2d6af363fb6a1573933fbacc632f3c557535c0d4405615f0`.

## Mudanças necessárias neste Goal

- O workflow anterior executava somente smoke nos browsers. O modo `test:e2e:all`
  agora coleta o mesmo inventário completo em Chromium, Firefox e WebKit, sem
  restrição por tags, com zero retries, proibição de `.only` e falha para flaky.
  Cada browser usa um projeto MySQL/storage E2E novo e descartável.
- Resultados JSON ficam em `ci-results/`, fora da área que o próximo browser limpa.
  A CI preserva esses resultados em sucesso ou falha. Esse diretório é ignorado
  pelo Git e pelo contexto Docker.
- Regressões de subprocessos verificam CI sem `.env.test`, saída não zero em erro,
  readiness assíncrono, execução do runner e cleanup em sucesso/falha. A coleta
  Playwright remove `JEST_WORKER_ID` herdado do processo Jest.
- A execução remota `41726257330`, SHA `c3898201bbfd8f09585d1d3caf7b45fb60c2d35a`,
  passou as suítes da aplicação e falhou no restore: o runner UID 1001 não podia
  transferir a árvore privada para o app UID 1000. O ensaio Docker agora roda com
  `sudo env` e uma lista explícita de variáveis sintéticas. O runtime e os guards
  não foram relaxados; nenhum volume/dado de produção entra no teste.

O WebKit revelou três falhas no run `42092574510`: uma navegação do teste concorria
com o redirecionamento de sessão e dois casos tinham overflow em 320 px. O teste
agora aguarda o commit e o destino final da navegação, mantendo os asserts. O CSS
preserva o layout nativo do fieldset, limita o legend à coluna e conserva o espaço
entre enunciado e opções. Não houve mudança de conteúdo, respostas ou regra de acesso.

O run `42096906611` comprovou outra corrida do mesmo tipo: o helper do teste de
erros da API retornava após o POST de login, antes da navegação autenticada. Os
helpers com essa sequência agora aguardam o destino carregado. A navegação que
provoca 401 aguarda o commit, mantendo a verificação do redirecionamento esperado.
Não foram adicionados retries, sleeps arbitrários nem timeouts maiores.

A execução `42098677483` revelou que a fixture de 401 era incoerente: certificados
retornavam sessão expirada, mas `/api/auth/me` ainda autenticava e o login voltava
à Sala Virtual. A fixture agora expira ambas as respostas após o erro e verifica
a presença do formulário de login. Helpers também aguardam o papel renderizado
na página de destino, além da URL; um reload redundante do smoke foi removido.

O run `42100218394` passou Chromium e Firefox completos, mas falhou em dois casos
WebKit: saída da Sala Virtual ainda com a consulta de turmas em andamento e
navegações consecutivas na matriz de acesso. O helper aguarda a turma renderizada;
cada célula da matriz abre uma página nova no mesmo contexto autenticado e mantém
os asserts de papel e destino. Steps nomeados identificam o status HTTP e a célula
em eventual falha. Esses resultados anteriores não contam como CI completa.

Uma rodada local Firefox no SHA `2dc420f` expôs o orçamento agregado de 30 s
do antigo teste que executava nove status HTTP em sequência (23 passaram, um
timeout). Agora cada status é um teste independente, com cleanup automático e o
mesmo limite por caso. Nenhuma asserção foi retirada. O inventário completo passa
de 24 para 32 testes por browser; não são oito fluxos novos nem perda de cobertura.
A CI `42130457972` foi cancelada por substituição do candidato.

A primeira execução completa aprovada foi `42131044745`, no SHA `e54f1e9`.
A CI `42133617667` do commit seguinte (somente documentação) expôs outro erro de navegação
no teste responsivo WebKit: 31 passaram, um falhou e zero casos foram ignorados.
A falha foi em `page.goto('/admin.html')`,
com “WebKit encountered an internal error”; o build da imagem foi ignorado. Esse
run **não é aprovação**. O teste recarregava a página após login e a cada largura.
Agora cada tela abre uma vez em página independente, aguarda papel e dados prontos
e mede as mesmas seis larguras por resize. Permanecem as 78 combinações de tela e
viewport, com os mesmos limites de overflow/recorte; também se rejeitam estados de
erro de carregamento. Não há retries nem aumento de timeout.

Parser, associação, helpers de restore, JavaScript de produto, dependências/lock,
schema, migrations, correção, aprovação e certificados mantêm os bytes da entrega
do Goal 21. A única mudança visual é a correção comprovada do fieldset no WebKit.

## Validação e evidências

CI histórica: **FAIL** na baseline preservada, antes da finalização controlada. A execução
[42133617667](https://github.com/DanielKulique/plataforma_cursos/actions/runs/42133617667)
falhou no WebKit; não houve reexecução durante o diagnóstico limitado.

O run histórico
[42131044745](https://github.com/DanielKulique/plataforma_cursos/actions/runs/42131044745)
aprovou completamente `e54f1e962450e9547769b6dffc9893c32ab0c29f`, mas não substitui
a validação do HEAD preservado nem do ajuste local. **A tabela abaixo e os hashes
da evidência sanitizada pertencem somente àquela aprovação histórica.**

[Evidência sanitizada](evidence/goal22-canonical-validation.json) registra resultados,
SHA-256 dos oito JSONs brutos, hash do log, schema e preservação da árvore original.
Os JSONs completos permanecem no artefato `playwright-e2e-<SHA>` de cada run.
Conferiram-se contagens positivas, todos os asserts aprovados, zero pendências,
skips, flakies e retries, identidade dos inventários e SHA do metadata dos browsers.

| Grupo | Suítes/arquivos | Aprovados | Falhas | Skips |
| --- | ---: | ---: | ---: | ---: |
| UNIT | 76 | 784 | 0 | 0 |
| INTEGRATION completa | 21 | 282 | 0 | 0 |
| Segurança — comando próprio | 8 | 95 | 0 | 0 |
| Migrations — unitário próprio | 2 | 13 | 0 | 0 |
| Migrations — integração própria | 1 | 6 | 0 | 0 |
| E2E_CHROMIUM | 13 arquivos | 32 | 0 | 0 |
| E2E_FIREFOX | 13 arquivos | 32 | 0 | 0 |
| E2E_WEBKIT | 13 arquivos | 32 | 0 | 0 |
| Restore — configuração | 1 módulo | 14 | 0 | 0 |
| Restore — Docker real | 1 módulo | 5 | 0 | 0 |

Segurança e migrations são subconjuntos/reexecuções das suítes totais, não testes
únicos adicionais. Os 32 casos são o mesmo inventário em três browsers reais,
com cenários de aluno, professor, administrador e visitante. Lint, sintaxe,
isolamento, build de assets e build da imagem também passaram.
Uma execução cancelada, falha, filtrada, com etapas ignoradas ou de outro SHA não
é aprovação. As falhas anteriores estão registradas acima e não entram nessa tabela.

RESTORE_ISOLATION: **PASS**, 14 + 5 testes, sete cenários: sucesso, falha MySQL,
SIGINT, SIGTERM e rejeições global/external/bind. Cleanup próprio e mesma sentinela
antes/depois: `eb11a817d7aaa53edc99a23e37466ed12da06806c5882b2d0896a226796dea8d`.
O campo de data do fixture herdado é fixo; os timestamps reais são os do run e dos
projetos descartáveis registrados na evidência.
HTTP_PARSER: **PASS**, 12 casos em processo descartável dentro de UNIT; JSON normal,
400/413/415, `inflate: false`, 256 KiB, sobrevivência, requisição seguinte, auth e CSRF.
ASSOCIATION_SECURITY: **PASS**, enumeração e payload completo em UNIT; autoria,
correção por vínculos, compatibilidade histórica, rascunho, UUID e replicação na
integração/E2E, sem modificar esses comportamentos.

ACADEMIC_RULES: **PASS**. Regressões existentes cobrem gate exato de 80%, simulado opcional,
tentativa única do Teste Final, UUID idempotente, fronteiras 74,99/75, certificado
automático e aprovação com 18/22 ou 20/22 conteúdos, sem requisito de 100%.
Certificados usam os estados reais `ATIVO`/`REVOGADO` (ACTIVE/REVOKED no pedido).

MIGRATIONS: **PASS**. Somente MySQL Docker 8.4 descartável, endpoint de integração
`127.0.0.1:33307`, sem inicializar serviço MySQL nativo. As regressões exercitam
001–016, reaplicação NO-OP, checksums, constraints, índices e concorrência entre
runners. O schema esperado verifica 25 tabelas, 188 colunas, 91 índices e 112 constraints.

O checkout da CI instala por `npm ci` e recebe configuração efêmera pelo processo.
Não existe dependência de `.env.test` ignorado no ramo CI do runner. Testes Jest
e Playwright falham se não encontrarem casos; a entrega também verifica contagens
positivas, zero skips/falhas/flakies nos JSONs e todos os jobs concluídos no SHA exato.

## Reprodução e alcance dos checks

O comando canônico está em [.github/workflows/ci.yml](../../.github/workflows/ci.yml).
Em checkout limpo, `npm ci` precede estes comandos obrigatórios, com o MySQL 8.4
novo em `127.0.0.1:33307` e variáveis efêmeras no processo:

```sh
npm run db:isolation:verify
npm run test:migrations:unit
npm run db:migrate
npm run db:migrate:status
npm run db:schema:validate -- --json
npm run db:identity:verify
npm run db:test:seed
npm run lint
npm test -- --json --outputFile=ci-results/unit.json
npm run test:integration -- --json --outputFile=ci-results/integration.json
npm run test:security -- --json --outputFile=ci-results/security.json
npm run test:migrations:integration -- --json --outputFile=ci-results/migrations.json
npm run build
```

Criar `ci-results/` antes dos comandos JSON. A configuração CI usa
`CI=true`, `NODE_ENV=test`, `DB_NAME=plataforma_cursos_test` e identidade do mesmo
nome. Credenciais de CI são injetadas em runtime e mascaradas; nenhum valor real
faz parte do relatório. O runner de integração valida identidade e endpoint antes
das operações. O fixture de restore usa somente credenciais e PDFs sintéticos.

Após instalar os três browsers com `npx playwright install --with-deps chromium
firefox webkit`, executar separadamente `npm run test:e2e:all -- --project=chromium`,
`--project=firefox-critical` e `--project=webkit-critical`. Cada invocação cria e
remove seu próprio projeto Compose; não se reutiliza o banco entre browsers.
O build de imagem `docker build --tag plataforma-cursos:ci .` também é gate.
Build de imagem não publica, inicia ou implanta a aplicação.

Os checks de comportamento são rastreáveis a:

| Invariante | Evidência de comportamento |
| --- | --- |
| Parser e recuperação | `http-parser.security.test.js`, 12 casos em processo descartável, incluindo gzip/deflate/br válidos, inválidos e bytes tardios, 400/413/415 e requisição seguinte |
| Associação sem inferência | `association-answer.security.test.js`, 6 casos que enumeram permutações e comparam a distribuição do JSON completo para gabaritos distintos |
| Associação persistida | `question-authoring-types.integration.test.js`, 11 casos, incluindo 2/3/5 pares, UUID, retry, vínculos adulterados e replicação; E2E salva/reabre rascunhos |
| Regras acadêmicas | `academic-exam.integration.test.js`, 24 casos, incluindo 74,99/75/75,01, 18/22, simulado opcional, emissão automática e envios concorrentes |
| Certificados | `certificados.integration.test.js`, 30 casos, incluindo ATIVO/REVOGADO, histórico, idempotência, arquivos privados e constraints |
| Transações e autorização | `atomic-academic-authorization.integration.test.js`, 38 casos; auth/CSRF na integração e nos browsers |
| Migrations | `migration-contract.integration.test.js`, 6 casos; banco vazio, schema, constraints, falha, NO-OP e runners concorrentes |
| CI e falhas reais | `ci-release-harness.test.js`, 5 casos; processo filho sem `.env.test`, inventário dos browsers, falha com exit não zero e cleanup |

Essas referências não substituem as contagens completas: os arquivos acima são
subconjuntos das suítes totais. A validação não executou carga maliciosa em produção,
backfill real, reconciliador real ou restore de dados reais.

## Riscos e critério de fechamento

P0_REMAINING: **0** para esta RC.
P1_REMAINING: **0 somente após os dois jobs da rodada controlada aprovados e tag
conferida**; até lá, F18-03/CI continua como um gate pendente. A correção do runner
sem `.env.test` permanece incorporada.

F18-01 a F18-04 e os P2/deferred foram comparados com a auditoria original preservada:
[estado canônico dos achados](PROJECT_REVIEW_AND_NEXT_STEPS.md). Os P2 não foram tratados como
melhorias independentes neste Goal. Não se declara segurança geral a partir desses hotfixes.

KNOWN_LIMITATIONS: o WebKit local usa libavif/libgav1/libyuv extraídas em pasta
ignorada e uma cópia isolada do browser, sem instalar bibliotecas no sistema ou
modificar o cache compartilhado;
a prova de release exige os três browsers na CI. A falha remota atual não tem
causa raiz comprovada; o resultado local isolado não permite declarar READY.
A finalização exige a validação controlada remota descrita no início. O pacote
body-parser continua sinalizado por versão, com mitigação `inflate: false`.
O `npm audit --omit=dev --json` coletado em 05/11/2026 registra cinco pacotes
com alertas (dois moderados, dois altos e um crítico): body-parser, proxy-addr,
multer, ip-address e qs. Severidade do registro não é classificação automática
de alcance no app: trust proxy é numérico e o upload usa memória/filtro síncrono,
como registrado em F18-13. Esses alertas não foram removidos nem convertidos em
prova de segurança geral. Revisão pedagógica, proteção contra abuso, observabilidade
externa e portabilidade offsite permanecem em tarefas posteriores. Sem inspeção ou
mudança da imagem/dados de produção.

NEXT_RECOMMENDED_GOAL: planejamento e ensaio isolado da migração de infraestrutura,
com critérios de corte, backup, restauração e rollback.

**DEPLOY: NO.** Sem deploy, publicação de imagem, merge na main ou operação em
dados/volumes de produção. A tag RC somente é publicada após os gates desta rodada;
a falha histórica da baseline não é reclassificada como aprovação.
