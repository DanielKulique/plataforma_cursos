# Estado canônico dos achados do Goal 18

Atualização do Goal 22 em 05/11/2026, America/Sao_Paulo.

Esta é a revisão dos achados para a linha canônica iniciada em
`8d78b1ba8ccde3962091bb6f73cb348d75257cf1`. A auditoria original foi consultada,
não mesclada: permanece intacta na árvore original, com alterações não commitadas.
SHA-256 do relatório original: `d295940ea85a93c765fa7cab44973a8efa4d0bb121f1ae646633751bc3cbd441`.
O estado da árvore original e o estado do código desta RC são distintos.

## Bloqueadores P0/P1

| Achado | Prioridade original | Remediação na linha canônica | Evidência exigida para a RC |
| --- | --- | --- | --- |
| F18-01 | P0 | Goal 19 `dcccc29394a92574739c5b4351f240fe5d6e127e`: valida configuração resolvida antes de operações, recusa recursos preexistentes e limpa somente ownership próprio | 14 testes de configuração + 5 ensaios Docker reais com sete cenários, sentinelas fictícias e cleanup |
| F18-02 | P1 | Goal 21 `8d78b1ba8ccde3962091bb6f73cb348d75257cf1`: conserva todas as permutações de Fisher-Yates, inclusive a identidade; UUIDs independentes e DTO sem vínculos/ordens dos itens | Enumeração determinística, distribuição do payload completo, integração de autoria/correção/replicação e E2E de rascunhos/UUIDs |
| F18-03 | P1 | A base já contém o ramo CI que não lê `.env.test` e o readiness referenciado/catch do runner E2E; Goal 22 acrescenta execução completa dos três browsers sem retry e regressões de subprocessos | Checkout limpo sem `.env.test`, contagens positivas, falhas com exit não zero, cleanup e CI remota no SHA exato |
| F18-04 | P1 | Goal 20 `d6bb5f34642c45285980baccce12e8a6ec6265aa`: `express.json({ limit: '256kb', inflate: false })` | Processo descartável, 415 para compressão, limites exatos, recuperação após erro, autenticação e CSRF |

Esses quatro achados são os únicos P0/P1 da auditoria original. As correções de
F18-01, F18-02 e F18-04 estão incorporadas e têm as provas históricas registradas no
[relatório do Goal 22](GOAL_22_CANONICAL_RELEASE_CANDIDATE.md). F18-03 inclui o gate
final de CI. A finalização controlada exige primeiro o job WebKit direcionado e
então uma única suíte completa no mesmo SHA; qualquer falha encerra a rodada.

Para a RC **selada** pela tag anotada `goal22-rc.1`, com ambos os jobs e os artefatos
conferidos, os quatro achados estão fechados: P0_REMAINING: **0** e P1_REMAINING:
**0**. Sem essa comprovação, F18-03 continua pendente e o estado é PARTIAL.
O SHA e o run definitivos estão na anotação da tag; o run histórico `42131044745`
não substitui esse gate. A falha posterior `42133617667` permanece documentada.

A investigação anterior não comprovou causa raiz do erro interno WebKit. O ajuste
local elimina recargas redundantes do teste sem alterar as 78 combinações ou os
asserts de layout, e adiciona evidência de falha. Não há correção de backend,
autenticação, regras acadêmicas, certificados ou CSS nesta finalização.
O alerta npm de body-parser continua por versão, com mitigação configurada;
não se declara a aplicação livre de outras vulnerabilidades.

## P2 e tarefas posteriores

Esses achados não foram tratados como melhorias independentes neste Goal. Os
ajustes de CI e os defeitos comprovados pelos gates da RC estão descritos no
relatório do Goal 22; não equivalem ao fechamento integral de todos os P2. O estado
histórico da auditoria não é prova do estado de produção atual.

| Achado | Próxima tarefa |
| --- | --- |
| F18-05 | Corrigir paginação completa dos seletores administrativos acima de 100 registros |
| F18-06 | Atualizar smokes e guias operacionais que ainda descrevem regras acadêmicas antigas |
| F18-07 | Substituir inferências de cobertura por evidências de comportamento na matriz de testes |
| F18-08 | A baseline atual já inclui o reconciliador no Dockerfile; confirmar distribuição/uso operacional da imagem em trabalho próprio, sem executar backfill aqui |
| F18-09 | Manter acompanhamento da navegação Firefox; falhas ou flakies reais devem ser investigados, nunca ocultados com retries. Os resultados desta RC ficam registrados separadamente |
| F18-10 | Preparar autenticação/transporte offsite portável para a infraestrutura futura |
| F18-11 | Definir alertas externos e medir capacidade/recursos com evidência |
| F18-12 | Avaliar proteção contra abuso/enumeração nos endpoints públicos de cadastro/disponibilidade |
| F18-13 | Fazer manutenção direcionada de dependências com análise de alcance, sem `audit fix --force` |
| F18-14 | Concluir homologação pedagógica e fontes do plano de conteúdo sem ativação automática |

F18-D1 (motor real) e F18-D2 (resposta discursiva) permanecem diferidos e desabilitados
no escopo operacional correspondente. Não foram ligados nem reimplementados.

A RC não autoriza migração, deploy, restore de produção ou merge automático na main.
A próxima etapa recomendada, após os gates desta RC, é planejar e ensaiar a migração
de infraestrutura em laboratório isolado, com critérios de corte e rollback.
