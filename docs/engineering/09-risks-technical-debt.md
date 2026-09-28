> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../index.md).

# Riscos, inconsistências, dívida e evolução

## Achados confirmados e recomendações

Gravidade é prioridade técnica qualitativa para este escopo, não CVSS nem estimativa estatística. “Risco” não significa incidente ocorrido. Linhas marcadas RESOLVIDO preservam a causa histórica e a evidência das correções dos Goals concluídos até 15/09/2026.

| ID / gravidade | Problema e evidência | Impacto | Recomendação futura |
| --- | --- | --- | --- |
| D-01 ALTA — RESOLVIDO | Causa histórica: cadastro não criava verificação; login aceitava ausência; envio público resetava verificado=0. Correção: criação transacional de estado, login fail-closed e locks no reenvio/confirmação (`usuarios.models`, `auth.models`) | O bypass e a desconfirmação foram fechados; falha de entrega preserva pendência recuperável | Manter os testes concorrentes no gate com MySQL e monitorar falhas de entrega. |
| D-02 ALTA — RESOLVIDO | Causa histórica: limits estavam em paths inexistentes. Correção: limitadores por IP e hash de identidade declarados diretamente em `/enviar-codigo-verificacao` e `/verificar-codigo-email` | Reduz abuso de envio/tentativas; resposta de reenvio não enumera conta | Em escala horizontal, adotar store compartilhado somente quando a topologia exigir; disponibilidade cadastral permanece risco separado. |
| D-03 ALTA — RESOLVIDO | Causa histórica: progresso arredondado era usado como decisão acadêmica. Regra final: conteúdo só libera o Teste Final em 80%; aprovação depende de tentativa final >=75 | Conteúdo incompleto pode ser aprovado corretamente; progresso continua informativo e parte do gate inicial | Manter regressões exatas de 79/80%, 74,99/75,00 e conteúdo incompleto. |
| D-04 MÉDIA — RESOLVIDO | PATCH acadêmico bloqueia qualquer saída de CANCELADO com 409; só o POST próprio em turma ABERTA rematricula | Professor/ADMIN não reativam sem reset/ciclo; concorrência incrementa uma vez | Goal 04, migration 010 e integração de ciclo. |
| D-05 MÉDIA — RESOLVIDO | Matrícula e tentativa possuem ciclo explícito; progresso/exercícios filtram ciclo. Regra final usa Teste Final por aluno+turma sem separar ciclos | Histórico permanece; uma tentativa final antiga continua sendo a única e seu resultado >=75 segue válido após rematrícula | Manter testes de matrícula, single-attempt, aprovação e certificado entre ciclos. |
| D-06 MÉDIA | Criar pergunta não verifica tentativas do questionário; edição/exclusão é bloqueada por histórico | Avaliação atual diverge da estrutura respondida no passado | Congelar/versionar instrumento ou bloquear adição após tentativa conforme regra definida. |
| D-07 MÉDIA | Atualizar turma permite mudar curso; questionários guardam id_curso próprio sem sincronização | FK válidas, mas curso semanticamente diferente entre turma/questionário e cópia | Impedir troca com estrutura dependente ou definir migração transacional coerente. |
| D-08 RESOLVIDO | Autorização de autoria atômica (Goal 06) | Responsável/estado e escrita protegidos pela mesma conexão/lock de turma | Inventário auditado, testes MySQL determinísticos e smoke de páginas abertas em staging. Contrato no relatório do Goal 06. |
| D-09 ALTA — RESOLVIDO | Goal 07: publicação durável antes de COMMIT, compensação observável e reconciliação dry-run/APPLY | Falhas deixam estado anterior íntegro ou resíduos classificados; COMMIT incerto preserva bytes | Sem ACID distribuído; restauração confiável de missing/corrupção e backup coordenado continuam no Goal 08. |
| D-10 ALTA — RESOLVIDO | Goal 08: backup diário systemd, conjunto DB+storage validado, retenção local/offsite e Azure Blob privado com completion marker | Perda da VM/volume possui ponto off-host comprovado por upload, novo download e restore isolado | Monitorar `RPO_AT_RISK`; mesma região não cobre desastre regional e crescimento exige repetir medição. |
| D-11 MÉDIA — RESOLVIDO | Goal 08: preflight/hash antes de alteração, dry-run padrão, APPLY/target explícitos e app parado no in-place | Snapshot é restaurado em DB limpo e storages substituídos; schema, contagens, hashes, reconciliador e health bloqueiam reabertura | Manter drills periódicos; falha após início destrutivo mantém maintenance e requer decisão operacional. |
| D-12 MÉDIA — RESOLVIDO | Goal 07: RETIDO/retido_em, retenção padrão 90 dias, collector explícito e purge auditável | Referências ativas, arquivos recentes e todos os PDFs de certificados são protegidos | Operador revisa dry-run e seleciona UUIDs; não há purge global/automático. |
| D-13 MÉDIA — RESOLVIDO | Aprovação final >=75 inicia emissão automática; serviço revalida APROVADO e resultado do Teste Final dentro da transação, sem requisito de conteúdo completo | Falha de PDF mantém aprovação e pode ser recuperada; constraints atuais evitam dois certificados ATIVOS | Manter retry idempotente, reconciliação e regra de backup GOOD antes de backfill em produção. |
| D-14 MÉDIA — RESOLVIDO | Reemissão ADMIN explícita cria nova versão imutável; emissão normal recusa histórico revogado | UNIQUE de coluna gerada garante no máximo um ATIVO; UNIQUE de versão e predecessor preserva a cadeia | Migration 009, testes MySQL e evidências do [Goal 03](goals/GOAL_03_CERTIFICATE_VERSIONING.md). |
| D-15 MÉDIA — RESOLVIDO | Causa histórica: `email.service` aguardava send sem inspecionar o contrato. Correção: valida `{data.id,error}`, converte erro/exceção/timeout em falha explícita e registra apenas metadados seguros | Cadastro distingue entrega confirmada de pendência; reset preserva resposta 202 anti-enumeração enquanto registra a falha | Homologar entrega real no staging quando houver credencial Resend; monitorar eventos do provedor fora deste Goal. |
| D-16 MÉDIA — RESOLVIDO | Causa histórica: login e health ADMIN podiam devolver `error.message`; controllers com status 5xx também eram inconsistentes | 5xx auditados usam mensagem segura; health público/admin expõe somente estados e logs mantêm detalhe redigido | Manter `http-response.js`, testes de login/health e proibir novos `error.message` públicos em 5xx. |
| D-17 MÉDIA — DEFERRED / OUT OF CURRENT SCOPE | Gateway legado do detector/plágio persiste texto e retorna resposta bruta | Detector permanece desabilitado e fora do escopo operacional atual da plataforma de cursos | Reabrir o achado antes de eventual ativação; não marcar resolvido. |
| D-18 MÉDIA — RESOLVIDO | Causa histórica: material passava apenas por extensão/MIME/%PDF-. Criação e substituição agora exigem parser `pdf-lib`, páginas, encerramento, rejeição de criptografia, timeout e concorrência limitada; upload público mantém limite/rate limit/hash e descarte | PDF malformado representativo não vira ATIVO; bytes aceitos, SHA-256 e storage privado são preservados | Detecção robusta de ações ativas e antivírus continuam como endurecimento futuro conforme threat model; parser pode reparar anomalias internas. |
| D-19 MÉDIA — RESOLVIDO | Causa histórica: `Promise.all` e um único catch acoplavam turmas e certificados | `Promise.allSettled`, estados separados e retry local preservam turmas quando certificados falham | Replicar o padrão somente onde dados acessórios forem comprovadamente independentes. |
| D-20 MÉDIA | Autoria de pergunta/opções existentes sem editor completo | Professor adiciona, mas não gerencia plenamente perguntas já criadas pela interface | Completar fluxo de leitura/edição com controles históricos. |
| D-21 MÉDIA — RESOLVIDO | Causa histórica: pool 10 com fila ilimitada e listagens crescentes completas. Correção: pool/fila/timeout explícitos, fila 50, saturação 503, métricas de aquisição, paginação direcionada e migration 013 guiada por EXPLAIN | Um host/um MySQL ainda limitam escala, mas não há fila infinita nem query crescente selecionada sem limite | Medir demanda real antes de alterar pool; manter paginação e índices junto das queries. |
| D-22 MÉDIA — RESOLVIDO PARA O PORTE ATUAL | Causa histórica: health misturava liveness/DB e não havia counters, disco ou RPO. Correção: healthz/readyz, health/metrics ADMIN, request-id, duração/5xx/slow, memória/pool/disco/backup e ops:check + timer | Métricas são in-memory e host único continua ponto de falha; não há APM/HA | Monitor externo deve executar ops:check; adotar stack centralizada somente se porte/SLA justificar. |
| D-23 MÉDIA — RESOLVIDO | Causa histórica: runner reaplicava todos os SQL sem ledger/checksum/lock. Correção: `schema_migrations`, SHA-256 imutável, descoberta sequencial, `GET_LOCK`, baseline explícito validado, gates CI/deploy e política forward-only; rollout staging comprovado | Histórico e drift são comprováveis; concorrência não duplica aplicação. DDL ainda pode falhar parcialmente e por isso não recebe promessa falsa de rollback | Manter migrations aplicadas imutáveis; corrigir forward ou restaurar backup validado. |
| D-24 BAIXA — PARCIAL | `error` é canônico nos erros migrados, com `mensagem`/`message` como alias; `api.js` aceita os três e trata 204/non-JSON/network | Contratos corrigidos são resilientes, mas arrays e envelopes históricos continuam por compatibilidade | Migrar apenas quando houver benefício funcional; não criar API v2 nem alterar sucessos estáveis em massa. |
| D-25 MÉDIA — RESOLVIDO | Causa histórica: `PORT` no Node e `3000` fixo em Caddy/healthchecks; `.env` sobrescrevia shell. Correção: `APP_PORT` ponta a ponta, loader processo > arquivo específico > `.env`, validator fail-closed e startup sanitizado | Mudança manual fora do Compose ainda deve fornecer configuração crítica completa | Manter `runtime-config.js`, exemplos e validação estática alinhados; não reintroduzir `PORT`. |
| D-26 BAIXA — RESOLVIDO | Causa histórica: mensagem resumia a exceção como ativar/inativar e omitia aula/ordem | Conflito agora enumera campos congelados e informa que disponibilidade, aula e ordem podem mudar | Manter texto coberto junto à regra RN-028. |
| D-27 MÉDIA — DEFERRED / OUT OF CURRENT SCOPE | Relação específica é `Usuarios` → `AnalisesContextuais`: `obterVinculos` não conta esse resumo, enquanto a FK aplica CASCADE. É entidade exclusiva do detector legado | Exclusão/alteração de papel pode tratar resumo contextual diferente do histórico legado se o detector for ativado | Reabrir antes de ativar o detector; nenhuma relação COURSE_PLATFORM integra este achado. |
| D-28 MÉDIA — RESOLVIDO | Causa histórica: validator verificava nomes de colunas, quatro ENUMs e poucos UNIQUEs. Correção: contrato versionado cobre 21 tabelas, 173 colunas, 74 índices, 35 FKs, 12 CHECKs e ações referenciais | Drift de tipo/null/default/ordem/PK/índice/FK/CHECK/engine/collation e tabela extra falha com JSON e diagnóstico humano | Atualizar contrato junto de toda migration futura e manter fixtures de drift. |

## Matriz de riscos

Probabilidade é julgamento condicionado à topologia/controles observados (baixa/média/alta); não deriva de frequência medida.

| Risco | Probabilidade | Impacto | Mitigação existente | Mitigação recomendada |
| --- | --- | --- | --- | --- |
| Perda de banco | Baixa/Média | Alto | Volume, dump transacional, offsite privado diário e restore ensaiado | DR regional/PITR continuam fora do baseline |
| Perda de PDFs | Baixa/Média | Alto | Volumes, SHA-256 por arquivo, offsite e restore verificado | Repetir drill conforme volume crescer |
| Indisponibilidade do host | Média | Alto | Restart e persistência | Monitoramento externo; recuperação em host alternativo |
| Segredo exposto por operador/arquivo | Média | Alto | .env excluído da imagem padrão, validação, logger | Gestão/rotação de segredos, mínimo privilégio e inspeção do bundle |
| Abuso de endpoint público | Média; limites locais por processo | Alto | Envio/confirmação por IP e identidade; Basic Auth no staging | Monitorar 429 e usar store compartilhado se houver múltiplas réplicas |
| Inconsistência storage/banco | Média | Alto | Publicação durável, transação SQL, compensação e reconciliação testada | Restore e backup coordenado (Goal 08) |
| Dependência de e-mail | Média | Alto no acesso | Flag/debug e logs | Entrega observável e tratamento de erro do provedor |
| Dependência de motor IA | Média quando ativo | Médio no produto completo | Flag, timeout, contratos | Homologar serviço/corpus separadamente; monitorar |
| Crescimento de disco/memória/consultas | Média com crescimento | Alto | Limites de arquivo, índices, paginação e métricas ADMIN/ops:check | Quotas/retention e testes de capacidade |
| Corridas acadêmicas | Média sob concorrência | Médio/alto | Locks/UNIQUE em operações centrais | Revalidar ownership/estado e testar mudança simultânea |
| Acesso indevido a dados | Média nos gaps; baixa em fluxos de ID testados | Alto | Sessão/CSRF/ownership/arquivos privados | Corrigir verificação, revisar logs/exposição e testes negativos adicionais |
| Aprovação antes da conclusão real | Baixa em turmas pequenas; cresce com muitos conteúdos | Alto acadêmico | Contagens exatas e nota; regressão 200/201 | Monitorar gates e preservar testes |
| Atualização de dependências/DDL | Média | Alto | Lockfile, suíte e backup pré-deploy | Scan de dependências, tags/digests controlados e ensaios de upgrade |
| PDF malicioso | Incerta, depende da origem dos uploads | Alto | Autoria restrita, MIME/bytes e limite | Avaliar inspeção de conteúdo conforme ameaça |

## Concorrência, erros e resiliência

| Operação | Proteção concreta | Limite |
| --- | --- | --- |
| Matrícula | Lock da turma e matrícula, UNIQUE aluno+turma, tratamento ER_DUP_ENTRY | Serializa inscrições na mesma turma; não há capacidade/vagas. |
| Progresso | Locks conteúdo/turma/matrícula, upsert único e monotônico | Ordem de locks difere de outros fluxos; sem retry geral de deadlock. |
| Submissão | Lock questionário/turma/matrícula, chave única e transação de respostas | Serializa concorrentes do questionário; nova chave aceita tentativa; mesma chave ignora diferença de payload. |
| Nota/cancelamento | Lock matrícula e busca de certificado ativo | Não impede todas as mudanças de estrutura/status concorrentes. |
| Emissão | Lock contexto, UNIQUE aluno+turma/código/storage e fallback de duplicata | Imagens/fontes são preparadas antes; renderização do snapshot e publicação mantêm transação; retry de código público até três vezes. |
| Upload | Body limitado antes do lock; publicação exclusiva, autorização transacional e compensação | Sem ACID distribuído; substituições serializadas retêm as versões anteriores. Resíduos reconciliáveis. |
| Replicação | Transação, locks estruturais, UNIQUE chave/destino e hash da solicitação | Cópia serial por linhas, custo cresce; não há limite de estrutura. |
| Último ADMIN | SELECT de admins FOR UPDATE antes de rebaixamento/exclusão | Pode haver deadlock em operações cruzadas; não existe retry universal. |
| Reset | Token bloqueado FOR UPDATE, consumo e alteração de senha transacionais | Solicitações concorrentes de novos tokens exigem avaliação específica; não afirmar unicidade “um token vivo por usuário” garantida por índice. |

HTTP: 400 entrada, 401 identidade, 403 escopo/CSRF/estado, 404 ausência, 409 conflito acadêmico, 413 limite, 422 formato/contrato, 429 frequência, 500 interno, 502/503/504 motor/indisponibilidade/timeout. 499 representa cancelamento em gateways; requisição já abortada pode não receber resposta. `error` é o campo canônico nos pontos migrados, com aliases legados; 500 não devolve mensagem interna. Duplicatas SQL de certos questionários/perguntas não são traduzidas uniformemente para 409 e podem chegar ao handler 500 genérico.

Frontend `api.js` repete apenas GET em falhas transientes, no máximo três tentativas padrão com backoff exponencial. Escritas não são repetidas automaticamente. Bytes privados ausentes retornam 503 controlado em downloads. Healthz não toca dependências; readyz consulta banco e acesso barato aos storages. Inicialização falha se ambiente/banco não estiver pronto; sinais de término fecham servidor/pool, sem evidência de deadline de shutdown próprio.

## Gaps funcionais e não funcionais

**Funcionais:** confirmação robusta de identidade; edição docente completa de perguntas; resposta curta/dissertativa; entrega de atividade; apresentação de análise indexada; histórico por novo ciclo de matrícula. Alguns são lacunas do fluxo atual, outros capacidades não implementadas sem requisito aprovado. Não chamar pagamento, chat ou videoconferência de defeitos: não há necessidade evidenciada no escopo.

**Não funcionais para próximo estágio:** corrigir abuso público e integridade acadêmica, ensaiar recuperação, monitorar disco/saúde/backup, reconciliar arquivos e padronizar erros. **Conforme crescimento:** carga/paginação, centralização de logs e limites compartilhados. **Somente com demanda institucional:** HA, CDN/object storage, banco gerenciado, antivírus dedicado e recuperação multirregião. Ausência desses últimos não torna automaticamente inadequado um projeto acadêmico pequeno.

## Escalabilidade sem benchmarks inventados

| Cenário | Onde a arquitetura se sustenta | Limites que pedem evidência/evolução |
| --- | --- | --- |
| Pequeno: dezenas, projeto acadêmico | Um host Compose simplifica operação; SQL e arquivos locais atendem desenho funcional | Ainda requer backup e controle de e-mail; medir latência/disco antes de declarar capacidade. |
| Médio: centenas/poucos milhares cadastrados | Monólito pode continuar útil; número cadastrado não equivale a concorrência | Navegação de páginas na UI, SQL de progresso, memória de PDF, transações longas e e-mail síncrono. Medir sessões simultâneas, tamanho de turma/arquivo e picos. |
| Maior: institucional | Domínios e banco relacional dão base para evolução | Compartilhar storage/limites entre réplicas, definir HA/DR, métricas e políticas de retenção; só separar serviços após identificar gargalos. |

Não há teste de carga que sustente throughput, número máximo de alunos, latência ou SLA. Escalar horizontalmente o Node sem tratar filesystem e rate limit local muda garantias; não é simplesmente duplicar containers.

## Pontos fortes comprovados

- Controle de papéis consulta o banco e testes negativos exercitam IDs de outros alunos/professores.
- Integração MySQL real, UNIQUE e transações em matrícula, tentativa, cópia e certificado, com testes de rollback e concorrência.
- Arquivos privados, nomes seguros e substituição imutável preservam cópias; Caddy não monta storage acadêmico.
- Certificado possui código aleatório, snapshot, bytes finais verificáveis e revogação sem apagar histórico.
- Guardas de banco descartável protegem legado e separam scripts de teste; CI repete a suíte completa.
- Runbooks e scripts incluem backup de banco e ambos os volumes, validação e smoke de staging.
- Frontend compartilha helpers de sessão/segurança, renderiza texto nas áreas críticas e organiza sala por aulas.

## Matriz de maturidade

A classificação vale para o escopo acadêmico demonstrado e considera limitações operacionais. Não é certificação de produção.

| Área | Estado | Justificativa |
| --- | --- | --- |
| Arquitetura | ADEQUADO | Monólito modular coerente; domínio/SQL e filesystem exigem cuidado. |
| Backend | ADEQUADO | Fluxos completos com autorização/transações; inconsistências concretas ainda existem. |
| Frontend | ADEQUADO | Multipágina funcional, helpers e degradação local na Sala Virtual; autoria e módulos extensos permanecem limites. |
| Banco | ADEQUADO | Modelo relacional e constraints; regras cruzadas/contrato de schema incompletos. |
| Segurança | PARCIAL | Verificação de e-mail e limites foram endurecidos; caminhos legados, códigos legíveis e outros riscos ainda impedem avaliação mais forte. |
| Testes | MADURO PARA O ESCOPO ATUAL | 64 suítes/648 casos principais e 16 suítes/253 integrações em 15/09, com mocks e MySQL 8.4.11; não cobre carga/browser integral. |
| Deploy | ADEQUADO | Compose, imagem não-root, CI e runbook de staging; produção atual não comprovada. |
| Backup | IMPLEMENTADO | Goal 08 comprovou scheduler, manifesto/hashes, retenção, offsite privado e restore isolado real; RPO 24h/RTO 4h formalizados. |
| Observabilidade | ADEQUADO AO PORTE ATUAL | Liveness/readiness, métricas ADMIN, request-id, 5xx/duração/slow, memória/pool/disco/RPO e check machine-readable; sem stack centralizada/HA. |
| Documentação | ADEQUADO | Baseline rastreável e runbooks; relatos históricos exigem data e atualização. |
| UX | PARCIAL | Boa organização por aula e falha local de certificados; autoria e outros carregamentos multipartes ainda não foram auditados integralmente. |
| Escalabilidade | PARCIAL | Sem medições de capacidade; host/volumes locais e pool limitam expansão. |

## Limite transacional do Goal 02

Aprovação bloqueia matrícula e turma; emissão já bloqueava esse contexto. A contagem é lida depois do bloqueio, sem leitura consistente prévia na transação. Criação normal e upload PDF bloqueiam a mesma turma; progresso também participa de transação com bloqueios. Teste MySQL confirma que emissão aguardando inclusão concorrente enxerga o novo conteúdo confirmado. São contagens SQL, sem carregar conteúdos para decidir elegibilidade.

Não foi padronizada a ordem de todos os locks/ownership de autoria (D-08, Goal 06); contenção/deadlocks continuam sujeitos ao rollback existente. Escritas SQL externas que ignorem o protocolo não constituem caminho de aplicação validado. A atomicidade geral SQL/filesystem (D-09) também não foi reformulada. Falha de elegibilidade ocorre antes desses efeitos.


Consolidação substitutiva do Goal 02: provas anteriores não são classificadas automaticamente como finais; turmas sem designação explícita não permitem nova aprovação/certificação. Nota manual não substitui prova. Prova final inativa deixa de satisfazer elegibilidade atual; certificados históricos continuam preservados (Goal 03). REPROVADO/CANCELADO manuais não são alterados pela automação. Gates de progresso/prova e gravação de aprovação compartilham a transação e locks de turma/matrícula, com teste concorrente. Ownership geral, ciclos legados de matrícula/histórico e política de documentos emitidos continuam fora deste Goal.

### Limites operacionais do Goal 03

D-14 resolvido pelo fluxo real de versões e integridade de único ATIVO no banco. D-10/D-11 (reconciliação geral/backup externo) não foram tratados. Falhas capturadas antes do COMMIT desfazem SQL e compensam somente arquivos novos. Crash abrupto ou confirmação de COMMIT perdida podem exigir verificação operacional: um arquivo potencialmente confirmado nunca é removido apenas por timeout. O runner de migration verifica todos os PDFs antes da alteração; execute `npm run db:migrate`, não apenas SQL manual, para incluir a auditoria do filesystem. Acesso SQL privilegiado segue capaz de alterar conteúdo histórico; não se implementou assinatura digital ou sistema geral de audit log.

### Limites do Goal 04

D-04 e D-05 estão resolvidos nos caminhos da aplicação. O modelo mantém uma linha de matrícula e um contador atual; não cria uma entidade completa para períodos letivos nem versiona `ConteudosProgresso`, pois a política aprovada é reiniciar esse estado. A migration consegue detectar atividade anterior à data atual e isolá-la, mas não reconstrói o número exato de múltiplas rematrículas legadas sem log histórico. REPROVADO e as demais transições acadêmicas permanecem conforme a política anterior; D-08 geral continua fora do escopo. Escrita SQL privilegiada ainda pode atribuir manualmente um ciclo incorreto a uma tentativa.


## Fechamento de D-08 — Goal 06

As ressalvas históricas de D-08 nas seções anteriores foram superadas pela autorização transacional e pelo alinhamento de locks. Módulos, conteúdos, PDF, avaliações, perguntas/opções, exclusões/reordenação, turma administrativa e PATCH de matrícula foram auditados. Não restou caminho conhecido de autoria autorizado somente por um check externo à transação. D-09 (filesystem/SQL), backup externo e observabilidade permanecem fora deste Goal. [Inventário e evidências](goals/GOAL_06_ATOMIC_ACADEMIC_AUTHORIZATION.md).

## Fechamento de D-09 e D-12 — Goal 07

As limitações históricas de ausência de reconciliação/lifecycle nas seções dos Goals anteriores foram superadas. Escrita de materiais e certificados, falhas injetadas, retenção, purge individual, proteção de referências e histórico e persistência em staging foram validados. Não se afirma atomicidade distribuída; missing e corrupção preservam evidência para restore no Goal 08. [Inventário, política e resultados](goals/GOAL_07_STORAGE_DATABASE_INTEGRITY.md).

## Backup e disaster recovery — Goal 08

D-10 e D-11 foram resolvidos no baseline atual. O backup suspende o único writer da aplicação e
coordena o reconciliador APPLY por advisory lock durante a captura; depois valida manifesto,
checksums, inventário e completion marker antes de atualizar latest-good. O offsite real usa Blob
privado com identidade gerenciada. O drill revalidado em 14/09/2026 (15/09 UTC) partiu do objeto baixado, restaurou banco
e arquivos em volumes isolados, preservou quatro certificados e sete materiais, autenticou no app e mediu 50 segundos.
A arquitetura é off-host na mesma região, não PITR, HA ou DR multirregional. [Relatório do Goal 08](goals/GOAL_08_BACKUP_RESTORE_DISASTER_RECOVERY.md).
