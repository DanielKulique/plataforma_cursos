# Goal 25 — correções funcionais e validação de fechamento

Data: 2026-11-09. Baseline: `d481cafe343c6de13c8d3eec8bf2d667356bbb00`.
Branch: `fix/goal25-final-application`, derivada de `release/goal24-operational-stabilization`.

Este relatório fecha a validação local dos cinco fixes. A classificação final de release
depende da única execução completa de GitHub Actions no commit que contém este relatório:
todos os gates obrigatórios devem estar verdes nesse mesmo SHA. O resultado remoto e seus
artefatos são a evidência definitiva; este documento não antecipa aprovação de uma CI futura.

## Preservação e escopo

Foram inspecionadas 13 worktrees, branches locais/remotas, `main` e a tag anotada `goal22-rc.1`.
Não havia correções posteriores à baseline na branch remota de referência. Uma única worktree
limpa foi criada para este Goal. As demais worktrees, inclusive arquivos locais alterados,
foram preservadas por comparação de HEAD, status e SHA-256 dos arquivos.

`plataforma-cursos-manual` não foi reiniciado nem recebeu seeds. IDs, mounts, horários de
inicialização e contadores de restart dos dois containers foram preservados. Todos os testes
de escrita usaram projetos Compose descartáveis, MySQL 8.4 e dados sintéticos. Não houve
MySQL nativo, produção, deploy, merge de main, mudança de tag, migration ou dependência do projeto.

## Fixes e causa comprovada

| Fix | Causa | Correção | Evidência |
|---|---|---|---|
| 01 — professores | A busca server-side substituía apenas as opções do select acima da pesquisa. | Resultados imediatamente abaixo da busca, com botões nativos, nome/e-mail/ID, seleção direta e sincronização de `id_professor`. O select existente e sua seleção preservada permanecem disponíveis. | `admin-pagination.spec.js`: 121 professores, registro 101, criação/edição/replicação, seleção por Enter, paginação, erro/vazio e 320/390/1440 px. |
| 02 — PDF | A aula do professor oferecia somente editar/excluir. O formulário também enviava `tipo` no multipart, rejeitado pelo allowlist do endpoint de PDF. | Visualizar/Baixar no conteúdo e no formulário de edição, nome do arquivo atual e atualização após substituição. Multipart omite somente o campo proibido; backend preservado. | Trace local mostrou POST 400 com “Campos não permitidos: tipo”. E2E passou upload, nova aba blob, download com bytes exatos, edição e substituição; integração confirma autorização e armazenamento privado. |
| 03 — reprovação | `avaliarAprovacao()` só implementava promoção para APROVADO; o PATCH de REPROVADO exigia 100% dos conteúdos. A tela de progresso buscava `melhor_nota`, ausente nessa API. | Situação automática derivada da tentativa finalizada: <75 REPROVADO, >=75 APROVADO. Percentual final separado de progresso e da nota manual opcional. PATCH contraditório retorna 409. Listagem com filtros, totais e paginação server-side; Sala Virtual/progresso/resultado mostram situação e tentativa indisponível. | Integrações: 80% + 50/74,99/75; UUID repetido/novo; certificados; filtros antes de LIMIT/OFFSET; 28 alunos em duas páginas; rematrícula após reprovação e resultado persistente após restart de app/db em E2E. |
| 04 — mensagens | Textos técnicos, erros crus e confirmações sem término; “Questionário pronto” permanecia e o aviso acadêmico ignorava resultado já finalizado. | Linguagem de usuário, erros filtrados, loading encerrado, confirmações transitórias e avisos derivados do estado atual. | Unitários com relógio simulado; E2E de erro público/privado e estados ADMIN. Inventário abaixo. |
| 05 — URL/acesso | Parâmetros inválidos lançavam erro sem limpar título/contexto do loading e sem corrigir links. | Validação estrita antes do fetch; id opcional preservado; erro claro, formulário oculto/inativo, loading encerrado e volta à Sala Virtual. | Dez entradas inválidas em unitários; E2E de URL ausente/negativa/inexistente/tipo inválido/questionário alheio e id opcional; matriz efetiva de APIs e navegação. |

Commits temáticos prévios ao selo documental: `b977c1e` (situação/reconciliação/API/testes) e
`768f8bb` (seleção ADMIN e PDF privado). O commit final agrega as telas acadêmicas, mensagens,
rotas, seus testes e este relatório. Consulte `git log` para o SHA completo da entrega.

## Regras e integridade

O gate continua em 80% dos conteúdos; Simulado e exercícios não entram nesse denominador.
O limite continua em 75%, com 74,99 reprovando. Uma tentativa finalizada por aluno/turma é
preservada: mesmo UUID reutiliza resultado; outro UUID não cria segunda tentativa, inclusive
após rematrícula. O ciclo de conteúdos/exercícios reinicia sem apagar o resultado final.

O percentual final vem de `Q_Tentativas`, incluindo ciclos anteriores, e não pode ser
substituído por progresso ou nota digitada. `nota_final` mantém seu contrato legado opcional
de 0–10, sem conversão automática; a nova apresentação usa `prova_final_percentual`.
O estado CANCELADO é preservado. Não se emite certificado para prova reprovada.
Certificados ativos/revogados, metadados e bytes existentes não são alterados pelo reconciliador.

### Reconciliação de históricos

O script também é incluído na imagem Docker. A operação padrão é somente leitura:

```bash
node scripts/reconcile_academic_results.js --dry-run
```

O relatório lista matrícula/aluno/turma, tentativa, percentual, situação anterior/correta e
existência de certificado. Não infere resultados de provas não designadas como finais.
Não modifica tentativas, respostas, progresso, ciclos, notas manuais ou certificados.

APPLY é recusado fora do banco canônico de teste e exige autorização explícita de laboratório:

```bash
node scripts/reconcile_academic_results.js --apply --allow-lab-apply
```

A aplicação usa identidade verificada, locks de turma/matrícula, transação e revalidação.
Nos casos sintéticos 50,00 e 74,99, o dry-run identificou CURSANDO → REPROVADO; no caso 75,00,
CURSANDO → APROVADO. O dry-run manteve snapshots idênticos; o primeiro APPLY corrigiu uma
matrícula por cenário e o segundo corrigiu zero. Matrículas CANCELADO ficaram fora.
Certificados ativos e revogados foram comparados antes/depois, inclusive os PDFs.

Não houve reconciliação em produção nem na demonstração manual. Históricos reais com
certificado existente precisam de revisão operacional antes de qualquer intervenção; o novo
script nunca emite, revoga ou reemite certificados. Recuperação de certificados conserva seu
comando separado e suas regras existentes.

## Inventário das mensagens corrigidas

| Superfície/arquivo | Antes | Depois/comportamento |
|---|---|---|
| `sala-progresso.js` | “A prova final será liberada após atingir 80% da trilha, conforme validação do backend.” | “Você poderá realizar a prova final quando concluir pelo menos 80% dos conteúdos do curso.” Após a final, mostra nota, situação e ausência de nova tentativa. |
| `sala-progresso.html` | Percentual “oficial informado pelo backend”. | “Acompanhe os conteúdos que você já concluiu.” |
| `questionario.js` | “As respostas serão corrigidas e persistidas pelo servidor.” | “Suas respostas serão corrigidas e o resultado ficará salvo.” |
| `questionario.html` | “Desempenho persistido”. | “Histórico de resultados”. |
| Questionário pronto/erro/finalizado | Confirmação pronta permanente; título “Carregando” e placeholders após erro; lista escondida ainda busy após resultado histórico. | Pronto sem alerta redundante; estado indisponível com recuperação; loading encerrado também ao reabrir resultado. |
| `admin.js` | HTTP no título/fallback; feedback permanente. | Erro compreensível com “Tentar novamente”; sucesso desaparece em 8 s; nova operação cancela timer anterior. |
| `academic-ui.js` | Sucesso indefinido e erro cru. | Sucesso transitório por 8 s; erros normalizados; `role=status/alert`, aria-live e atomic preservados. Informações acadêmicas relevantes continuam visíveis. |
| `academic-area.js` e `api.js` | Exceção de rede/mensagem técnica eventual. | Orientação para conferir conexão/tentar novamente; mensagens com HTTP/JSON/backend/stack/detalhes internos são substituídas. |
| Login/cadastro/recuperação/redefinição | `error.message` podia mostrar TypeError/Failed to fetch ou texto técnico da resposta. | Texto técnico substituído por orientação de conexão; loading termina; roles de feedback preservados. |
| Sala Virtual/lista de alunos | Situação ausente da sala; coluna “Nota” ambígua. | Situação e percentual do Teste Final separados do progresso; lista distingue “Não finalizado”; edição não contradiz resultado final. |

Logs internos e contratos de erro da API não foram reescritos por motivos de linguagem.

## Validação local

| Gate | Resultado e alcance |
|---|---|
| Unitários | 177/177 em 11 suítes diretamente afetadas; mais 45/45 em 4 suítes adjacentes de PDF, arquitetura, Sala Virtual e sessão. |
| Integração | 44/44 em 4 suítes: acadêmica, matriz de acesso, ciclo de matrícula e PDF. Mais 5/5 históricos/reconciliação, incluindo um novo cenário de rematrícula reprovada. Os números não são somados como se não houvesse sobreposição. |
| Chromium | Paginação ADMIN 4/4; novos fluxos funcionais e matriz de páginas aprovados. Relatório JSON guarda a execução final das 12 células de teste do arquivo Goal25. |
| Firefox | 16/16: paginação ADMIN e Goal25, sem skip/flaky/retry. |
| WebKit | 16/16 nos mesmos arquivos, sem skip/flaky/retry. |
| Responsividade | Asserts e screenshots em 320/390/1440 px, controles nativos/teclado, tabela desktop e cartões mobile com nota/situação distintas. |
| Persistência | Reload de resultado e restart do app e MySQL descartáveis preservam 50%/REPROVADO e tentativa indisponível. |
| Estático | Lint, build, validação documental e diff check aprovados antes do selo. |

Comandos principais (sempre na worktree isolada; `.env.test` local aponta ao Docker descartável):

```bash
npm run test:integration -- --runTestsByPath src/__tests__/integration/academic-exam.integration.test.js src/__tests__/integration/goal25-access.integration.test.js src/__tests__/integration/enrollment-lifecycle.integration.test.js src/__tests__/integration/pdf-upload.integration.test.js
npm run test:e2e:all -- tests/e2e/goal25-final-fixes.spec.js tests/e2e/admin-pagination.spec.js --project=chromium
npm run test:e2e:all -- tests/e2e/goal25-final-fixes.spec.js tests/e2e/admin-pagination.spec.js --project=firefox-critical
npm run test:e2e:all -- tests/e2e/goal25-final-fixes.spec.js tests/e2e/admin-pagination.spec.js --project=webkit-critical
npm run lint
npm run build
python3 docs/engineering/validate_current_docs.py
git diff --check
```

O fixture de upload usa limite de 1 MB, configurado no ambiente de teste. Não se alterou o
limite real da aplicação para satisfazer esse teste. O primeiro launch local de WebKit falhou
antes de navegar por ausência de libavif16. Três pacotes de runtime (libavif16 e dependências
libgav1/libyuv), com SHA-256 verificado contra metadados APT, foram extraídos somente em
diretório temporário e usados com LD_PRELOAD na validação local. Nenhum pacote do sistema
ou dependência do repositório foi instalado/atualizado. O runner continua com o instalador
Playwright existente e seus limites de 10/5/4 minutos.

O visualizador de PDF headless pode iniciar download em vez de renderizar o plugin nativo.
O teste observa a nova aba e seu destino blob real; quando há download nativo, compara os
bytes. O botão Baixar PDF é validado separadamente pelo nome e pelos bytes, antes/depois
da substituição. Não há mock do endpoint de PDF nem token em URL.

O detector visual foi executado uma vez em modo degradado (parsers opcionais ausentes).
Apontamentos de estilo pertenciam à identidade existente e não foram tratados como defeitos
funcionais. A inspeção das capturas mobile/desktop e os asserts de overflow foram usados
para verificar as mudanças; não se declara uma auditoria geral de contraste ou redesign.

## Evidências e CI definitiva

Logs, JSONs Playwright, snapshots de preservação, traces/screenshots de falhas de desenvolvimento,
captures aprovadas e manifestos estão em `.tmp/goal25/`, fora do Git e com acesso local restrito.
As falhas locais foram investigadas antes de uma nova execução direcionada; nenhum timeout
ou retry de teste foi aumentado. O teste histórico `responsive-roles.spec.js` e suas 78
combinações não foram alterados.

Após revisão e árvore limpa, a branch será publicada uma vez, acionando uma única CI completa.
O SHA final é o commit associado a esse push/run, verificável em `git rev-parse HEAD` e no
[GitHub Actions da branch](https://github.com/DanielKulique/plataforma_cursos/actions?query=branch%3Afix%2Fgoal25-final-application).
O fechamento remoto será preservado em `.tmp/goal25/ci-run-final.json`, `final-verification.json`
e no artefato `playwright-e2e-<SHA>`. READY exige acadêmicos, segurança, Chromium, Firefox,
WebKit, restore e build verdes no mesmo SHA; qualquer falha encerra esta rodada como PARTIAL,
sem rerun, merge ou novo ciclo de alterações.

A instabilidade histórica de navegação Firefox permanece risco conhecido; não foi investigada
nem mascarada neste Goal. Reconciliação real permanece operação futura separada e não foi
aplicada. MAIN_MERGED: NO. PRODUCTION_MODIFIED: NO. DEPLOY: NO.
