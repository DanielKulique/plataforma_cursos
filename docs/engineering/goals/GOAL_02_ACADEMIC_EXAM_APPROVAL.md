> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Goal 02 consolidado — registro histórico do contrato acadêmico anterior

> **Supersedido pela regra acadêmica final.** Este arquivo preserva evidências da implementação
> de setembro de 2026. A regra vigente está em [`docs/product/business-rules.md`](../../product/business-rules.md):
> 80% dos conteúdos libera o Teste Final; há uma tentativa; nota >=75 aprova sem exigir 100% dos
> conteúdos; certificado é automático. Não use as condições históricas abaixo como contrato atual.

**ACADEMIC_PROGRESS_EXAM_APPROVAL_READY**. Implementação de 08/09/2026, staging validado em 09/09/2026. Substitui a política manual do Goal 02 inicial.

## Regras anteriores e novas

Antes: conclusão exata já corrigida para conteúdos, aprovação manual com nota 0–10, provas sem meta de progresso, certificado sem revalidar prova. Agora são três métricas distintas, centralizadas em `src/api/services/academic-progress.service.js`:

| Métrica | Fonte/regra | Uso |
| --- | --- | --- |
| Trilha de liberação histórica | Conteudos + EXERCICIO ativo | Substituída: somente conteúdos contam; exercícios são opcionais |
| Conclusão de conteúdos histórica | total_conteudos >0 e conteudos_concluidos === total_conteudos | Não é requisito de aprovação/certificado |
| Conquista do Teste Final atual | tentativa finalizada do aluno/turma >=75, uma por aluno/turma | Aprovação e certificado automático |

Todos os tipos de Conteudos contam (VIDEO, TEXTO, PDF, LINK, ATIVIDADE). Exercício ativo vale uma unidade se houver qualquer tentativa finalizada, qualquer nota; retries não multiplicam unidades. Provas, inativos, outras turmas/alunos não entram na trilha. Não há bloqueio sequencial de aulas ou mínimo para EXERCICIO. Ativo é o critério atual de publicação/aplicabilidade; autoria deve publicar exercícios respondíveis.

## Identificação estrutural da final

Migration 008 acrescenta `Questionarios.prova_final`, nullable: 1=final, NULL=comum. CHECK permite final somente em PROVA; UNIQUE(id_turma, prova_final) garante uma final por turma, inclusive inativa, sem restringir avaliações comuns NULL. API usa booleanos; false é convertido para NULL. A designação é copiada na replicação, sem histórico.

Não há inferência por título, ID, data, módulo ou ordem. Dados existentes continuam comuns até designação explícita de prova sem histórico ou criação de nova final. Reclassificação de prova com tentativas é bloqueada. Uma final com histórico pode ser inativada/reativada; substituição/versionamento não foi implementado.

## Gates, precisão e tentativas

GET respondível usa transação e bloqueio; consulta requisitos antes de carregar perguntas/opções. Abaixo de 80%, retorna 409 PROVA_FINAL_BLOQUEADA. Metadados expõem contagens/progresso e estado bloqueado sem gabarito. Nova submissão repete a validação sob locks de turma/matrícula, sem confiar no cliente ou na abertura anterior.

A pontuação vem das respostas corrigidas no servidor. Pontos persistidos DECIMAL(...,2) são somados em centésimos inteiros para calcular a razão. Percentual da prova final é truncado para duas casas ao persistir, evitando que valor real abaixo de 75 seja arredondado para 75. EXERCICIO e prova intermediária mantêm arredondamento anterior para duas casas. Não há conversão para nota_final.

Na implementação histórica, tentativas eram ilimitadas. Regra vigente: uma tentativa finalizada no Teste Final por aluno/turma, retry técnico pelo mesmo submission_id reutiliza o resultado e novo ID recebe 409. Resultado <75 consome a tentativa, permanece registrado e não gera certificado. Exercícios continuam com tentativas livres.

## Aprovação, nota e certificado

Regra vigente: `avaliarAprovacao` aplica CURSANDO→APROVADO quando existe Teste Final finalizado >=75; não consulta conclusão total dos conteúdos. A tentativa e aprovação persistem antes da emissão automática do certificado. CANCELADO/REPROVADO manuais mantêm o contrato existente.

`nota_final` permanece manual e nullable, 0–10; não bloqueia APROVADO, não recebe percentual/10. PATCH professor/ADMIN revalida somente a prova final >=75; conteúdo incompleto e nota ausente não bloqueiam. REPROVADO preserva regra manual anterior de nota e conclusão, sem automação.

Nova emissão exige status APROVADO e Teste Final >=75, revalidados na transação. Conteúdos incompletos e conteúdos adicionados depois não bloqueiam o certificado. Emissão normal é automática e idempotente; falha no PDF não desfaz resultado acadêmico e pode ser recuperada sem repetir a prova.

Certificados existentes mantêm reutilização, download, hash/QR, validação e revogação atuais. Nenhuma revogação automática, reemissão ou versionamento.

## Verificação local

- Direcionados: 6 suítes, 85 testes aprovados (progresso, matrícula, questões, certificados, frontend/rotas).
- Integração direcionada: 5 suítes, 91 testes aprovados, incluindo concorrência e replicação.
- `npm run lint`: aprovado; arquivos ajustados depois passaram também por lint direcionado.
- `npm test`: 55 suítes, 542 testes aprovados, cobertura oficial atendida.
- `npm run test:integration`: 13 suítes, 177 testes aprovados.
- Ajuste final para preservar arredondamento das avaliações não finais: repetidos somente modelos afetados (17 testes) e integração acadêmica (19 testes), todos aprovados.
- Interface: 27 testes afetados aprovados; navegador Firefox em 1440×1000 e 412×915, com API simulada, confirmou final bloqueada sem link abaixo de 80 e link disponível a partir de 80; sem erro JS/overflow. Capturas em `.deployments/academic-exam/`. O aviso de liberação permanece legível mesmo com ação desabilitada.
- Migration 008 aplicada ao schema anterior e reaplicada; upgrade, unicidade e idempotência confirmados em MySQL 8.0.46 local isolado, apenas plataforma_cursos_test. Não se usaram bancos de desenvolvimento/legado.
- `npm run build` e validação dos assets finais: aprovados. `git diff --check`: aprovado.
- `npm audit` e `npm audit --omit=dev`: uma execução cada, zero vulnerabilidades. Não foi executado test:stability.

Fronteiras atuais cobertas na suíte final: 0/0 bloqueado; 79/100 bloqueado; 80/100 liberado; 0/1 bloqueado. Conteúdo 20/22 + 100% e 18/22 + 75% aprova; 74,99 não aprova e 75,00 aprova. Duas submissões concorrentes finalizam somente uma tentativa. Exercício permanece com tentativas livres.

## Staging e baseline

O smoke A–F citado abaixo registra o baseline histórico, que incluía exercícios no denominador e permitia repetir a prova. Ele não valida o contrato atual e não é evidência de aceitação da regra final. A cobertura vigente está em `src/__tests__/integration/academic-exam.integration.test.js` e `tests/e2e/`.

Atualizados requirements, business rules, data model, API/authorization, testing, risks, traceability e executive summary. Relatório anterior marcado como histórico substituído. D-03 RESOLVIDO; D-13 PARCIAL exclusivamente pela política sobre documentos já emitidos reservada ao Goal 03.

Limites mantidos: reemissão/versionamento/estrutura após certificado (Goal 03); ownership/ordem global de locks e ciclos legados de matrícula/histórico (Goals posteriores); atomicidade SQL/filesystem, backups e storage fora deste Goal. Provas legadas não são promovidas automaticamente a finais. Sem commit, preservando alterações pré-existentes do worktree.


## Evidência operacional final — 09/09/2026

Deploy registrado em 08/09/2026 às 21:42:19 UTC, no Azure staging existente, sem reprovisionamento. Backup prévio: `/opt/plataforma-cursos/backups/plataforma_cursos_staging-backup-20260908T214158Z.sha256`. Bundle SHA-256: `5d5e94739f7135d036b175d732b4d6aa0f089b161c43fb4ed5c31e0d6ebe093f`.

Hash da árvore-fonte em staging e calculado novamente localmente: `f3976be6ed3261c7850dea984245031f477bb5c65580589e928715e63ce564dc`. Código implantado corresponde aos fontes validados. Somente documentação foi atualizada após essa entrega.

Smoke HTTPS iniciado em 09/09/2026 às 11:46:23 UTC:

- A: 7/10 bloqueou leitura/submissão; repetição de exercícios e outro aluno não interferiram.
- B: 8/10 liberou prova final.
- C: 74,99 manteve CURSANDO, sem reprovação e com retry.
- D: 75 satisfez prova, mas conteúdos pendentes mantiveram CURSANDO.
- E: último conteúdo aprovou automaticamente, sem nota/clique docente.
- F: certificado revalidou mudança estrutural; nenhuma linha/arquivo na pendência; após conclusão, emissão em ENCERRADA, download, SHA-256 e validação pública passaram.
- Cleanup confirmado: zero cursos residuais do smoke; `CERTIFICATE_STORAGE_OK certificados=2` preservou os documentos anteriores; `/healthz` retornou 200.

A sessão local foi reiniciada durante a espera pelo deploy; o handle e logs temporários locais deixaram de existir. A conclusão do deploy foi confirmada pelo histórico e serviços remotos, seguida do smoke real acima. As suítes verdes não foram repetidas sem alteração de código.
