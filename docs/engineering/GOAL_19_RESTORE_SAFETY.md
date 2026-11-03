# Goal 19 — Restore safety & canonical baseline

Data: 03/11/2026, America/Sao_Paulo.

**STATUS: RESTORE_ISOLATION_READY**, para o hotfix e os testes locais descritos aqui.
Não declara release, migração de infraestrutura ou recuperação de produção prontas.

## BASELINE_COMMIT

`1d4111ebc6933f491da68ba990a114ee89aa8709`, candidato limpo do Goal 17.
Branch de entrega: `hotfix/restore-isolation-goal19`.
Worktree: `/mnt/disco/projetoSite/worktrees/plataforma-cursos-goal19`.

A árvore original em `/mnt/disco/projetoSite/plataforma_cursos` permaneceu na branch
`agent/checkpoint-goals-1-5-frontend-visual`, HEAD `b94717963cc29f6fa9cfaf2c170ee3a61ad97a98`,
com 67 arquivos rastreados modificados e 31 novos preexistentes, incluindo os documentos
do Goal 18. Foram conferidos 725 hashes de arquivos e o status Git completo antes/depois:
nenhum arquivo preexistente foi sobrescrito. Não houve reset, stash ou merge.

Os worktrees de backup, release acadêmica e Goal 17 foram inventariados. Foi escolhido
o candidato porque fornece uma base limpa/reproduzível que já contém o override de drill,
as correções de permissões de backup e o contrato de migrations 016. O commit do hotfix
é apenas o delta operacional sobre essa base, sem incorporar novamente trabalho local sujo.

## CAUSE

F18-01/T18-01: nomes explícitos em `compose.production.yaml` são globais. Trocar apenas
o project name não impede reutilizar volumes permanentes. A árvore original herdava
o override de produção e instalava cleanup destrutivo antes de validar isolamento.

O candidato `1d4111e` já selecionava um override de drill separado, verificava prefixos
de volumes e não executava `down -v` após recusa inicial. Essa proteção ainda permitia
aliases com prefixo compatível, volumes external/driver_opts, binds herdados, reutilização
de recursos preexistentes e cleanup sem conferir ownership individual. A chamada direta
de `restore_database.sh --mode isolated` também começava a verificar o backup usando
Compose antes de validar o projeto isolado.

O hotfix valida a configuração inteira resolvida, fixa um snapshot privado para todos
os processos e remove recursos somente após conferir labels/IDs da execução.

## FILES_CHANGED

| Arquivo | Alteração |
| --- | --- |
| `.github/workflows/ci.yml` | Gate de configuração e ensaios Docker com fixtures/sentinelas, sem retry |
| `compose.restore-drill.yaml` | Remove binds herdados e Caddy; rede interna; somente volumes descartáveis |
| `scripts/lib/restore-isolation.py` | Guard da configuração, recursos preexistentes, ownership, paths de backup e cleanup exato |
| `scripts/lib/restore-isolation.sh` | Compartilha snapshot e controla grupo do subprocesso para sinais/stdio |
| `scripts/restore_drill.sh` | Projeto aleatório, workspace privado, validação antes de build/up e cleanup com guard |
| `scripts/restore_database.sh` | Isolated exige snapshot validado antes do verificador; DB/identidade vêm do modelo congelado |
| `scripts/backup_offsite.sh` | No contexto isolated, usa o mesmo snapshot e permite somente download privado validado |
| `src/__tests__/backup-infrastructure.test.js` | Remove dois checks antigos substituídos por regressões de comportamento/configuração |
| `tests/operations/test_restore_isolation.py` | 14 testes de configuração, rejeição preventiva, ownership, paths, sinais e stdio |
| `tests/operations/test_restore_isolation_docker.py` | 5 testes Docker opt-in, cobrindo 7 cenários com restore real e sentinelas fictícias |
| `docs/operations/backup-and-restore.md` | Runbook de isolamento, interrupção, cleanup e regressões locais |
| `docs/engineering/evidence/goal19-restore-isolation.json` | Evidência sanitizada, hashes de fontes, resultados e projetos descartáveis |
| `docs/engineering/GOAL_19_RESTORE_SAFETY.md` | Este relatório |

`compose.production.yaml`, código acadêmico, migrations e dependências não foram alterados.

## PRODUCTION_VOLUME_ISOLATION

- Project name inclui timestamp e token aleatório de 64 bits, gerado a cada execução.
- Volumes exigem nome exato `<projeto>_<chave>`; prefixo compatível não é suficiente.
- External, drivers/opções que apontem para outro storage e mounts anônimos são recusados.
- Todo bind de serviço é rejeitado, inclusive read-only. O override remove os binds do
  schema/init, backup-status e Caddy antes da validação. A única montagem adicional
  permitida é o backup baixado, read-only, dentro do workspace privado da própria execução.
- Não há portas publicadas, Caddy ou rede compartilhada; app usa somente `DB_HOST=db`.
  Host networking, configs/secrets de arquivo e opções de acesso ao host são recusados.
- Nenhum recurso existente é adotado, mesmo com nome aparentemente válido.
- O guard verifica contexto Docker default/local; os testes não usaram Docker remoto,
  MySQL nativo ou volumes/dados reais de produção.

O mesmo JSON resolvido e validado é usado por drill, downloader e restore. Não há segunda
renderização dos arquivos de origem durante operações. Snapshot é arquivo regular `0600`
do usuário da execução em pasta nova `0700`. A serialização Compose preserva dólares literais
em credenciais/comandos; há regressão específica para esse comportamento.

## UNSAFE_CONFIG_REJECTION

O gate ocorre antes de build, verificador em container, download offsite, up, restore
ou exclusão de recursos Docker. Criar a pasta temporária privada e consultar configuração/
diagnósticos locais são as únicas ações anteriores ao gate.

Foram recusados em testes: alias global, alias com prefixo parecido, external com nome
aparentemente correto, bind read-write/read-only, local driver com bind em driver_opts,
rede externa/host, DB fora do serviço local, portas públicas, configs de arquivo, namespace
preexistente e source de backup fora da área privada ou via symlink.

Um wrapper de Docker que permite apenas `config`/leitura de contexto comprovou que
a recusa do drill não chama build/up/run/down/rm. Também houve recusa real com um
volume permanente **fictício** existente e bind com conteúdo fictício. Nenhum volume
real de produção foi usado nem como alvo de um caso de falha.

`restore_database.sh --mode isolated` sem snapshot próprio falha antes de iniciar
o verificador; conter `restore` no project name não serve mais como autorização.

## CLEANUP

Recursos possuem `io.plataforma.restore.run` e o project label. Todos os owners são
inspecionados antes da primeira remoção. O cleanup usa IDs exatos de containers e
imagem app e nomes exatos dos volumes/rede validados. Não usa `down -v`, `prune` ou
`--remove-orphans`. A imagem compartilhada MySQL permanece disponível.

Sucesso e falha removem também workspace, snapshot, cópia baixada, credenciais de
smoke temporárias e relatórios temporários. SIGINT/SIGTERM encerram primeiro o grupo
do comando ativo e depois fazem cleanup. Logs do controlador não são redirecionados
para arquivos temporários do subprocesso; uma regressão impede truncamento dos logs.

| Cenário Docker | Exit esperado/observado | Cleanup | Recursos alheios |
| --- | ---: | --- | --- |
| Restore completo + health | 0 | PASS | Sentinela intacta |
| Falha controlada na fase MySQL | 88 | PASS | Sentinela intacta |
| SIGINT no controlador com recursos já criados | 130 | PASS | Sentinela intacta |
| SIGTERM no controlador com recursos já criados | 143 | PASS | Sentinela intacta |
| Nome global de volume fictício | Não zero | Recusa antes de mutação | Sentinela intacta |
| Volume external fictício | Não zero | Recusa antes de mutação | Sentinela intacta |
| Bind persistente fictício | Não zero | Recusa antes de mutação | Conteúdo intacto |

O teste de ownership também comprova que uma divergência impede remover até mesmo
um container próprio já localizado. Se Docker/ownership falha, a execução retorna erro
e retém o workspace privado para diagnóstico/cleanup guardado pelo procedimento do runbook.

## SENTINEL_INTEGRITY

SHA-256 da sentinela no volume alheio fictício, antes e após **todos os sete cenários**:

```text
eb11a817d7aaa53edc99a23e37466ed12da06806c5882b2d0896a226796dea8d
```

O volume foi criado exclusivamente pelo teste com nome `goal19-fictional-permanent-*`.
Também foi comparado o conteúdo do bind fictício. Os recursos do laboratório e a
sentinela foram removidos ao terminar os testes; nenhum recurso de outro projeto foi removido.
Os nomes completos/projetos e os hashes por cenário estão na evidência JSON.

## TESTS

| Verificação final | Resultado |
| --- | --- |
| Python/configuração resolvida e guard | **14/14 PASS** |
| Docker real — restore, falha, sinais e fontes inseguras | **5/5 PASS**, sete cenários, 85,901 s |
| Jest de backup, infraestrutura e permissões | **3 suítes, 24/24 PASS** |
| `npm run lint` | PASS |
| `bash -n` nos três scripts e helper shell | PASS |
| Sintaxe Python — helper e testes | PASS |
| `git diff --check` | PASS |
| Validador documental | PASS; resultado final registrado na evidência |
| Preservação da árvore original | 725 hashes e status completo idênticos |

Total: **43 testes aprovados**, sem repetir a suíte acadêmica.

O ensaio Docker criou schema via migrations existentes 001–016 em MySQL 8.4.11
descartável, com dados sintéticos, um PDF de material e um PDF de certificado. Fez dump,
manifesto/checksums/COMPLETE, pacote e novo download simulado por arquivos locais.
O restore de sucesso executou validação estrutural, contagens, bytes/hashes, permissões,
reconciliação e readiness/health. Não foi um mock do restore ou do MySQL.

Apenas o transporte Azure CLI foi substituído: nenhuma conexão com Azure/offsite real,
produção ou MySQL do host foi feita. Container MySQL usa 3306 somente internamente,
sem porta publicada e sem fallback para localhost:3306. O smoke foi HEALTH_ONLY;
login real de produção não faz parte desta validação de isolamento.

Versões locais: Docker 29.1.3, Compose 2.40.3, Node 24.20.0; imagem do app na linha
Node 20. ShellCheck não está instalado e não é apresentado como executado. Sintaxe
shell foi validada com Bash. O gate CI foi incluído, mas não houve push/run remota.

Comandos reproduzíveis estão no [runbook](../operations/backup-and-restore.md).
Resultados estruturados: [goal19-restore-isolation.json](evidence/goal19-restore-isolation.json).

## COMMIT

Este relatório integra o commit isolado do hotfix na branch indicada. Seu SHA imutável
pode ser obtido sem depender da posição futura de HEAD:

```bash
git log -1 --format=%H -- docs/engineering/GOAL_19_RESTORE_SAFETY.md
```

O SHA concreto de entrega também acompanha a resposta final do Goal. O commit não
foi publicado/deployado automaticamente.

## REMAINING_RISKS

- SIGKILL, queda do host ou daemon indisponível podem impedir cleanup imediato. O
  workspace retido permite repetir a limpeza com os mesmos checks; não usar prune/down global.
- O guard protege contra configuração/reutilização/cleanup acidentais. Não é sandbox
  contra administrador com acesso ao socket Docker, edição do código revisado ou mutação
  concorrente deliberada do snapshot pelo próprio dono. As fontes/overrides são revisados.
- A árvore original suja foi preservada e não recebeu merge. Operação futura deve usar
  a revisão de hotfix; executar os scripts antigos continua fora desta garantia.
- Não houve deploy, restore de produção, backfill ou migração. CI remota e ambiente
  de produção não foram revalidados neste Goal.
- Demais P1 do Goal 18, portabilidade offsite e prontidão geral de release permanecem
  fora do escopo. `RESTORE_ISOLATION_READY` se limita ao isolamento comprovado aqui.
