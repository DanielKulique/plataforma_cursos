> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Goal 04 — Integridade do ciclo de matrícula

**ENROLLMENT_LIFECYCLE_INTEGRITY_READY** — implementação, gates e staging concluídos em 10/09/2026. D-04 e D-05 **RESOLVIDOS**.

## Entrega objetiva

1. **Causa do D-04:** o PATCH acadêmico aceitava `status_aprovacao` para uma matrícula CANCELADA sem obrigar o fluxo de rematrícula. Assim, professor ou ADMIN podiam restaurar CURSANDO, APROVADO ou REPROVADO sem validar turma ABERTA, reiniciar o estado acadêmico ou abrir um novo ciclo.
2. **Causa do D-05:** tentativas não identificavam o ciclo da matrícula, e as consultas de trilha e requisitos tratavam qualquer tentativa finalizada do aluno como atividade atual. Apagar `ConteudosProgresso` reiniciava conteúdos, mas exercícios e prova antigos ainda podiam satisfazer 80%, nota mínima e aprovação.
3. **Máquina de estados final:** CURSANDO pode ser cancelado conforme os gates existentes; CANCELADO é terminal no ciclo vigente. Sua única saída é `POST /api/matriculas`, pelo próprio aluno, para CURSANDO em novo ciclo e somente quando a turma está ABERTA. O PATCH recusa qualquer saída de CANCELADO com 409 e código `REMATRICULA_OBRIGATORIA`.
4. **Definição de ciclo acadêmico:** a identidade lógica aluno+turma continua em uma única matrícula. `Matriculas.ciclo_atual` identifica o ciclo vigente, começa em 1 e cresce monotonicamente; cada tentativa grava a cópia imutável em `Q_Tentativas.ciclo_matricula`.
5. **Schema e migration:** `010_enrollment_cycles.sql` adiciona os dois inteiros positivos, checks, índice de consulta do ciclo atual e chave idempotente `usuario+questionario+ciclo+chave`. `schema.sql` e o contrato canônico foram atualizados. A migration é incremental e reaplicável; o teste a executa duas vezes e valida constraints e índices.
6. **Backfill:** o preflight aborta antes do DDL se houver tentativa sem matrícula lógica. O caso normal recebe ciclo 1. Quando há tentativa anterior a `data_matricula`, evidência de data reiniciada ou legado ambíguo, a matrícula vigente recebe ciclo 2; tentativas anteriores ficam no 1 e tentativas iguais/posteriores à data vigente ficam no 2. Timestamp é usado somente nessa conversão; novas gravações usam o ciclo explícito sob lock.
7. **Rematrícula:** o POST bloqueia turma e matrícula, exige ABERTA, reutiliza a linha, incrementa o ciclo uma vez, redefine status para CURSANDO, nota para NULL, progresso agregado para zero e a data da matrícula. FECHADA e ENCERRADA recusam a operação.
8. **Progresso:** `ConteudosProgresso` da matrícula é removido na rematrícula, mantendo a política existente de novo início. Conteúdo concluído depois disso volta a contar normalmente; progresso de outra matrícula ou aluno continua isolado pelas chaves existentes.
9. **Exercícios:** somente tentativa finalizada com `ciclo_matricula = ciclo_atual` marca o exercício como realizado. Tentativas e respostas anteriores não são apagadas, e múltiplas tentativas atuais do mesmo exercício contam uma única unidade na trilha.
10. **Meta de 80%:** o serviço acadêmico central continua calculando a razão entre conteúdos concluídos e exercícios realizados sobre a trilha elegível, com o mesmo limiar de 80%. A parte de exercícios agora filtra exclusivamente o ciclo vigente; depois da rematrícula, a prova volta a ficar bloqueada até o novo ciclo atingir a meta.
11. **PROVA FINAL >=75%:** somente uma tentativa finalizada da prova final ativa, no ciclo vigente e com percentual pelo menos 75, satisfaz o requisito. Uma prova aprovada no ciclo anterior permanece no histórico e não libera nem satisfaz a prova do novo ciclo.
12. **Aprovação automática:** a mesma fonte central exige conteúdos atuais completos e prova atual aprovada. O ciclo anterior não muda o novo vínculo para APROVADO; a avaliação permanece idempotente e não cria reprovação automática.
13. **Histórico preservado:** os endpoints de histórico do aluno e resultados da turma continuam retornando todos os ciclos e agora incluem `ciclo_matricula`. A chave de idempotência é isolada por ciclo, portanto a mesma `submission_id` em um novo ciclo cria uma nova tentativa sem reutilizar a antiga.
14. **Certificados:** a proteção de certificado ATIVO no cancelamento foi preservada. A rematrícula não revoga, reemite, altera PDF, código, SHA ou storage de certificado histórico; emissão futura continua usando a elegibilidade acadêmica vigente, agora isolada pelo ciclo.
15. **Concorrência:** a transação usa ordem de lock turma→matrícula e UPDATE condicionado a CANCELADO. Duas rematrículas simultâneas terminam em 200+409, com uma única linha aluno+turma e um único incremento. Os testes confirmaram 1→2 e depois 2→3, sem salto para ciclo 4.
16. **Testes adicionados:** contratos unitários cobrem o bloqueio do PATCH, incremento e filtros; a integração MySQL cobre ciclos 1→2→3, concorrência, reset, mesma chave entre ciclos, histórico/respostas, exercícios, 80%, prova, aprovação, turmas FECHADA/ENCERRADA e migration com órfão, backfill e dupla aplicação. O smoke de staging reproduz o fluxo principal com dados descartáveis.
17. **Gates executados:** `npm run lint`; `npm test` com 55 suítes e 571 testes; `npm run test:integration` com 14 suítes e 194 testes; `npm run build`; ambos os `npm audit` com zero vulnerabilidades; e `git diff --check`, todos aprovados. `test:stability` não foi executado, conforme solicitado.
18. **Smoke de staging:** no Azure existente, o ciclo 1 alcançou 80% e registrou exercício/prova; PATCH de professor e ADMIN falhou; duas rematrículas concorrentes produziram 200+409; o ciclo 2 iniciou sem progresso, exercício, prova ou aprovação herdados; a tentativa antiga ficou visível e a mesma chave criou atividade nova no ciclo 2. O cenário foi removido ao final e os totais voltaram a 8 matrículas, 16 tentativas e zero órfãos.
19. **Baseline atualizada:** requisitos, regras, arquitetura, dados, API/autorização, qualidade, riscos, rastreabilidade e resumo executivo documentam a regra. D-04 e D-05 estão marcados como RESOLVIDOS somente após integração e smoke demonstrarem isolamento real.
20. **Limitações remanescentes:** o backfill não consegue reconstruir o número exato de várias rematrículas antigas sem um log histórico; por segurança, agrega atividade anterior no ciclo histórico. `ConteudosProgresso` representa apenas o ciclo atual e não oferece histórico detalhado. REPROVADO mantém a política anterior, e escrita SQL privilegiada ainda pode atribuir manualmente um ciclo incorreto. Essas limitações não permitem que tentativas antigas contaminem os caminhos atuais da aplicação.

## Gates locais

Os testes de matrícula, progresso, questionários, Goal 02 e certificados foram executados primeiro e ficaram verdes. Em seguida, os gates completos foram executados uma única vez em MySQL 8.0.46 descartável.

| Gate | Resultado |
|---|---|
| Integração específica do ciclo | 1 suíte, 4 cenários completos aprovados |
| Integração de matrículas | 25 testes aprovados |
| Integração acadêmica Goal 02 | 19 testes aprovados |
| Integração de questionários | 28 testes aprovados |
| Integração de certificados | 29 testes aprovados |
| `npm run lint` | Aprovado |
| `npm test` | 55 suítes, 571 testes aprovados |
| `npm run test:integration` | 14 suítes, 194 testes aprovados |
| `npm run build` | Artefatos de produção validados |
| `npm audit` | 0 vulnerabilidades |
| `npm audit --omit=dev` | 0 vulnerabilidades |
| `git diff --check` | Aprovado |

Logs locais em `.deployments/enrollment-lifecycle/`. A instância MySQL foi criada apenas para esta validação e não recebeu dados de outro ambiente.

## Staging Azure

O ambiente existente foi atualizado por bundle, sem reprovisionamento. Antes do deploy, app/db/Caddy estavam saudáveis e quatro arquivos de certificado estavam íntegros. O deploy criou backup do banco, materiais e certificados com manifesto em `20260910T132204Z`, aplicou as dez migrations reaplicáveis e validou o contrato de 19 tabelas no MySQL 8.4.

| Verificação | Resultado |
|---|---|
| Saúde após deploy | app, db e Caddy saudáveis; `/healthz` 200 |
| Migration/schema | 010 aplicada; 19 tabelas validadas |
| Isolamento D-04 | PATCH CANCELADO→estado acadêmico recusado para professor e ADMIN |
| Concorrência | rematrículas simultâneas 200+409; ciclo final 2 |
| Isolamento D-05 | conteúdo, exercício, 80%, prova e aprovação reiniciados no ciclo 2 |
| Histórico | duas tentativas do ciclo 1 preservadas e uma nova tentativa no ciclo 2 |
| Limpeza | 8 matrículas, 16 tentativas e zero tentativas sem matrícula lógica, iguais ao baseline |
| Certificados | `CERTIFICATE_STORAGE_OK certificados=4`; versionamento Goal 03 revalidado com quatro registros preservados |

- Bundle: `feb740a6c4727ea8062e5900562593d85ca50c5c24afce0b43ad9ce42ac13f20`.
- Árvore-fonte local e implantada: `1b63832b784a6c942638cb251283795538a64a5079d2333da3613a03da8d19b2`.
- Evidências: `.deployments/enrollment-lifecycle/goal04-staging-predeploy.log`, `goal04-staging-deploy.log`, `goal04-staging-smoke.log` e `goal04-staging-postdeploy.log`.

## Aceite

Os 16 critérios de aceite foram demonstrados por testes e staging. Em particular, nenhum caminho de estado atual consulta tentativa histórica sem exigir igualdade entre `Q_Tentativas.ciclo_matricula` e `Matriculas.ciclo_atual`; portanto, tentativa anterior não marca exercício, não atinge 80%, não satisfaz PROVA FINAL e não provoca aprovação no novo ciclo.

**ENROLLMENT_LIFECYCLE_INTEGRITY_READY**. D-04 e D-05 **RESOLVIDOS**.
