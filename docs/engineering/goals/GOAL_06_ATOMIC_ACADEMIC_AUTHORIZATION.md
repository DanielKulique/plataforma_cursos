> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Goal 06 — autorização acadêmica atômica

## Auditoria do código recebido

Havia checks de ownership/estado nos controllers de conteúdos e questões, seguidos por escrita em outra conexão. Criar módulo/conteúdo/questionário já bloqueava a turma, mas não recebia a identidade para revalidar o responsável. Atualizar módulo escrevia diretamente pelo pool. Edições/exclusões de recursos utilizavam joins com ordem de lock dependente do otimizador. Criar pergunta não bloqueava a avaliação nem verificava histórico; perguntas/opções verificavam respostas locais, sem congelar a avaliação inteira. Upload de PDF já revalidava autorização; substituição precisava alinhar a ordem. PATCH de matrícula também dependia de autorização antecipada no middleware.

A implementação encontrada não continha todas as garantias atribuídas ao Goal 05 no enunciado: faltavam o bloqueio de nova pergunta após primeira tentativa e a restrição de troca de curso com estrutura. Essas lacunas foram corrigidas como pré-requisitos. Mantida a regra existente que permite alterar disponibilidade, ordem e aula de questionários com histórico; tipo, prova final, título, perguntas e gabarito permanecem congelados. Não houve redesign de papéis, schema novo ou migration.

## Inventário e contrato

| Operação/API (prefixo `/api`) | Model e proteção |
| --- | --- |
| POST `/turmas/:id/modulos`; PATCH/DELETE `/modulos/:id` | `conteudos.models`: criar/atualizar/remover módulo; turma atual + recurso |
| POST `/turmas/:id/conteudos`; PATCH/DELETE `/conteudos/:id` | `conteudos.models`: criar/atualizar/remover; turma + conteúdo; vínculo do módulo e histórico na mesma conexão |
| POST PDF da turma; PUT PDF do conteúdo | `criarPdfComArquivo`/`substituirPdfComArquivo`; mesma primitiva de autoria; preparação do arquivo antes da transação |
| POST `/turmas/:id/questionarios`; PATCH/DELETE `/questionarios/:id` | `questoes.models`: turma + questionário; histórico corrente e vínculo da aula |
| POST `/questionarios/:id/perguntas`; PATCH/DELETE `/perguntas/:id` | turma → questionário → pergunta → histórico da avaliação |
| POST `/perguntas/:id/opcoes`; PATCH/DELETE `/opcoes/:id` | turma → questionário → pergunta → opção → histórico; gabarito/mínimo de opções preservados |
| Prova final | mesmos endpoints de questionário e mesma proteção; exclusividade e thresholds existentes preservados |
| Reordenação e mudança de aula | campos `ordem`/`id_modulo` dos PATCHs acima; não existe endpoint de reorder em lote; UNIQUE mantém conflito 409 sem ordens intermediárias |
| PATCH `/turmas/:id` | lock explícito de Turmas antes de trocar professor/status/curso; reabertura administrativa preservada |
| DELETE `/turmas/:id` | lock da turma antes dos vínculos e exclusão |
| POST `/turmas/:id/replicar` | serviço existente bloqueia turma de origem antes da cópia; destino novo sem concorrentes; autorização ADMIN preservada |
| Progresso e submissão | turma antes de conteúdo/questionário e matrícula; regras 80%, 75%, ciclo e aprovação mantidas |
| PATCH `/matriculas/:id` | turma antes da matrícula e revalidação do responsável atual; regras de avaliação/cancelamento existentes mantidas |
| Emissão/reemissão | turma antes da matrícula e certificado; somente aquisição de locks ajustada; autorização/eligibilidade/versionamento existentes preservados |

`academic-access.service.js` concentra `lockTurmaParaMutacao`, `iniciarMutacaoRecurso`, descoberta e bloqueio de recursos. ADMIN possui escopo global, mas a primitiva de autoria rejeita ENCERRADA com 409. Professor antigo recebe 403; ausência de identidade, 401; recursos inexistentes, 404. O erro HTTP não contém SQL.

Para IDs de recursos, a descoberta usa a conexão antes de BEGIN e não autoriza nada. Depois de BEGIN, a turma é bloqueada e ownership/status são obtidos do banco. Cada vínculo da cadeia descoberta é relido com `FOR UPDATE` e condição de pertencimento; desaparecimento/troca de vínculo produz 404. Isso evita criar um snapshot REPEATABLE READ antes de aguardar o lock. A mesma precaução se aplica à descoberta de turma por matrícula na emissão de certificados.

Ordem canônica: **Turmas → recurso da turma → descendentes → histórico/dependências → escrita → commit**. Para avaliações: questionário → pergunta → opção. A validação do módulo de destino pode ocorrer depois do recurso editado, mas sempre sob o lock exclusivo da mesma turma; não há movimentação entre turmas. Referências curso/professor em alterações administrativas são verificadas depois da turma; exclusão de curso não adquire lock exclusivo de turma para apenas rejeitar vínculo, evitando inversão curso/turma. Matrícula/certificado não podem bloquear matrícula e depois disputar turma com autoria. Cancelamento e revogação não adquirem turma após seu recurso e preservam os fluxos existentes.

Depois do lock, toda leitura decisória e escrita usa a conexão recebida, nunca `pool.query`. Não há mutex Node, lock global, `LOCK TABLES`, retry indiscriminado, sleep de produção ou alteração global de isolamento. Leituras GET de questionário mantêm snapshot coerente sem locks exclusivos. O isolamento observado no MySQL local descartável foi REPEATABLE READ (MySQL 8.0.46).

## Concorrência e interface

Quem bloqueia Turmas primeiro define a ordem serial: autoria termina antes da troca/encerramento, ou a alteração administrativa vence e o professor recebe 403/409 antes de escrever. O professor novo opera após commit; reabertura permite novas operações. Checks antecipados dos controllers servem para recusa rápida e economia de upload; nunca substituem a decisão transacional.

A página do professor invalida seu contexto ao receber 403 ou `TURMA_ENCERRADA` em escrita, retira ações e recarrega dados. Falha no refresh não restaura permissão antiga. O formulário mantém o texto para consulta e bloqueia novo envio quando não há autoria; o estado de edição também verifica o responsável atual. Não há polling preventivo ou cache de autorização para writes.

## Evidência e limites

`academic-access.test.js` testa a conexão, papéis/estados e pertencimento. `atomic-academic-authorization.integration.test.js` cobre 18 operações de autoria, ambos os ordenamentos de professor e encerramento com cinco repetições, exclusões concorrentes, primeira tentativa/nova pergunta, curso/primeira estrutura, vínculos e paralelismo entre turmas, além de interação com matrícula/certificado. A coordenação pausa exclusivamente conexões de teste depois do lock real e confirma espera em `performance_schema.data_lock_waits`; não depende de delays.

As regressões incluem autoria/PDF, exame, ciclos, certificado e replicação. Logs desta execução ficam em `.deployments/atomic-academic-authorization/`. O smoke funcional reproduz páginas abertas de A/B, encerramento e reabertura em desktop e mobile por `scripts/smoke_atomic_authorization_staging.js`, com recursos descartáveis e limpeza. As credenciais entram por stdin e não são registradas.

**ATOMIC_ACADEMIC_AUTHORIZATION_READY — 2026-09-11. D-08 RESOLVIDO nos caminhos de aplicação auditados.**

| Gate | Resultado observado |
| --- | --- |
| `npm run lint` | passou; mudanças finais do smoke verificadas também por ESLint direcionado |
| `npm test` | 56 suítes, 582 testes passaram; statements 63,28%, branches 58,61%, funções 62,31%, linhas 66,27% |
| `npm run test:integration` | execução integral única: 230/231 passaram; única falha era o código HTTP de histórico de pergunta. Contrato anterior restaurado, com reexecução das duas suítes afetadas: 66/66 passaram, incluindo um teste novo. Cobertura final combinada: 232 casos em 15 suítes |
| MySQL concorrente | 38 testes direcionados passaram; cinco repetições das corridas principais; sem deadlock ou timeout nos cenários finais |
| `npm run build` | passou |
| `npm audit` / `npm audit --omit=dev` | zero vulnerabilidades em ambas |
| `git diff --check` | passou |
| Staging | deploy sem reprovisionamento; serviços saudáveis; MySQL 8.4.11 / REPEATABLE READ; smoke A→B, encerramento e reabertura passou em desktop e mobile |

`test:stability` não foi necessário: os testes concorrentes finais foram determinísticos. Um teste legado de migration excedeu o tempo numa execução inicial e deixou schema parcial; a base descartável foi recriada, a suíte de ciclos passou isoladamente e também na integração completa. Isso não foi tratado como evidência de deadlock de autoria.

Bundle da aplicação publicado: SHA-256 `a999366d0eb7220719a82779e21cfa4be0aa02e415b16253788f599d19b5b19d`. Backup pré-deploy: `/opt/plataforma-cursos/backups/plataforma_cursos_staging-backup-20260911T023033Z.sha256`. Documentação e script de smoke receberam atualização complementar após a validação; não alteram o runtime publicado.

O smoke final usou Playwright 1.55.0 / Firefox 141, compatíveis entre si. A instalação de Chromium disponível retornava texto vazio até em HTML mínimo; suas capturas não foram usadas como evidência visual. No Firefox foram confirmados texto visível, botão desabilitado, preservação do formulário e somente três conteúdos autorizados no estado final de cada turma. Contas/turmas/cursos fictícios foram limpos.

Evidência visual: [perda de ownership no desktop](../../screenshots/goal06-atomic-authorization/desktop-ownership.png) e [encerramento no mobile](../../screenshots/goal06-atomic-authorization/mobile-encerrada.png). Logs detalhados permanecem no diretório de execução indicado acima.

Fora deste Goal: atomicidade geral filesystem/MySQL (D-09/Goal 07), backup externo, observabilidade geral e escritas SQL privilegiadas que ignorem as invariantes da aplicação. Emissão de PDF mantém sua janela transacional preexistente; não foi redesenhada neste Goal.


## Conferência final e ambiente local

Os 12 arquivos de runtime afetados foram comparados por SHA-256 entre workspace e container publicado, sem divergências (`runtime-verification.json` no diretório de execução). A limpeza adicional removeu um curso e um professor descartáveis de uma tentativa inicial do smoke; a consulta final confirmou zero turmas de smoke.

O MySQL do sistema local recusava conexão; os testes utilizaram instância descartável na porta 33106, sem alterar o banco legado. Após reinício do host/sessão, o backup temporário de `.env` em `/tmp` não estava disponível. A conexão temporária foi retirada e os quatro parâmetros de conexão locais foram restabelecidos a partir do `.env.test` já existente. Os demais parâmetros de `.env` foram preservados; nenhum segredo foi registrado nos artefatos. Essa restauração usa a configuração local existente e não afirma recuperar byte a byte o arquivo original.
