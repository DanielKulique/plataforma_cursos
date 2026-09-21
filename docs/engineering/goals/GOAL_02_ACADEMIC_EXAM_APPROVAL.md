> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Goal 02 consolidado — progresso, prova final e aprovação

**ACADEMIC_PROGRESS_EXAM_APPROVAL_READY**. Implementação de 08/09/2026, staging validado em 09/09/2026. Substitui a política manual do Goal 02 inicial.

## Regras anteriores e novas

Antes: conclusão exata já corrigida para conteúdos, aprovação manual com nota 0–10, provas sem meta de progresso, certificado sem revalidar prova. Agora são três métricas distintas, centralizadas em `src/api/services/academic-progress.service.js`:

| Métrica | Fonte/regra | Uso |
| --- | --- | --- |
| Trilha de liberação | Conteudos + EXERCICIO ativo; `realizados * 100 >= total * 80` e total >0 | Abrir/responder PROVA FINAL |
| Conclusão de conteúdos | total_conteudos >0 e conteudos_concluidos === total_conteudos | Aprovação/certificado |
| Conquista da prova | EXISTS tentativa da prova final ativa, do aluno/turma, finalizada_em não nulo e percentual >=75 | Aprovação/certificado |

Todos os tipos de Conteudos contam (VIDEO, TEXTO, PDF, LINK, ATIVIDADE). Exercício ativo vale uma unidade se houver qualquer tentativa finalizada, qualquer nota; retries não multiplicam unidades. Provas, inativos, outras turmas/alunos não entram na trilha. Não há bloqueio sequencial de aulas ou mínimo para EXERCICIO. Ativo é o critério atual de publicação/aplicabilidade; autoria deve publicar exercícios respondíveis.

## Identificação estrutural da final

Migration 008 acrescenta `Questionarios.prova_final`, nullable: 1=final, NULL=comum. CHECK permite final somente em PROVA; UNIQUE(id_turma, prova_final) garante uma final por turma, inclusive inativa, sem restringir avaliações comuns NULL. API usa booleanos; false é convertido para NULL. A designação é copiada na replicação, sem histórico.

Não há inferência por título, ID, data, módulo ou ordem. Dados existentes continuam comuns até designação explícita de prova sem histórico ou criação de nova final. Reclassificação de prova com tentativas é bloqueada. Uma final com histórico pode ser inativada/reativada; substituição/versionamento não foi implementado.

## Gates, precisão e tentativas

GET respondível usa transação e bloqueio; consulta requisitos antes de carregar perguntas/opções. Abaixo de 80%, retorna 409 PROVA_FINAL_BLOQUEADA. Metadados expõem contagens/progresso e estado bloqueado sem gabarito. Nova submissão repete a validação sob locks de turma/matrícula, sem confiar no cliente ou na abertura anterior.

A pontuação vem das respostas corrigidas no servidor. Pontos persistidos DECIMAL(...,2) são somados em centésimos inteiros para calcular a razão. Percentual da prova final é truncado para duas casas ao persistir, evitando que valor real abaixo de 75 seja arredondado para 75. EXERCICIO e prova intermediária mantêm arredondamento anterior para duas casas. Não há conversão para nota_final.

Tentativas continuam ilimitadas. A mesma submission_id reutiliza a tentativa concluída sem gerar outra ou reaplicar o gate de abertura. Qualquer conquista >=75 permanece válida após tentativa posterior pior. Resultado <75 mantém CURSANDO quando ainda não aprovado, sem reprovação automática. Histórico permanece completo.

## Aprovação, nota e certificado

Após progresso e submissão final, `avaliarAprovacao` aplica UPDATE condicional CURSANDO→APROVADO quando conteúdos estão completos e a prova foi atendida. Cobre conteúdos antes da prova e prova antes dos últimos conteúdos. Operação é idempotente e transacional, sem certificado automático. CANCELADO/REPROVADO manuais não são sobrescritos.

`nota_final` permanece manual e nullable, 0–10; não bloqueia APROVADO, não recebe percentual/10. PATCH professor/ADMIN revalida conteúdos + prova; nota manual não contorna esses gates. REPROVADO preserva regra manual anterior de nota e conclusão, sem automação.

Nova emissão exige status APROVADO, conteúdos completos e prova final ativa >=75, revalidados na transação antes de PDF/temporário/arquivo/INSERT. Falhas são 409 CONTEUDOS_PENDENTES ou PROVA_FINAL_PENDENTE. Conteúdo adicionado mantém status legado, mas bloqueia nova emissão. Inativar a final remove elegibilidade atual. Turma ENCERRADA continua permitindo certificado elegível, mas não novas provas/progresso.

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

Fronteiras: 0/0 bloqueado; 7/10 bloqueado; 8/10 liberado; 3/4 bloqueado; 4/5 liberado; 80/101 bloqueado; 81/101 liberado. Conteúdos 200/201 permanecem incompletos mesmo com 100% visual/prova atendida. 74,99 falha; 75,00 e 75,01 atendem. Exercício/intermediária >=75 não aprova. Testes reais validam ausência de PDF/linha nas falhas e convergência da última conclusão com submissão concorrente.

## Staging e baseline

Smoke A–F implementado em `scripts/smoke_academic_completion_staging.js`: 8 conteúdos + 2 exercícios; 7/10 bloqueado, 8/10 liberado, 74,99 CURSANDO com retry, 75 com pendência CURSANDO, último conteúdo APROVADO sem nota manual, certificado elegível. Inclui outro aluno, múltiplas tentativas de exercício, alteração estrutural posterior, ausência de arquivo/linha quando bloqueado e certificado em ENCERRADA. Cenário temporário removido em finally.

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
