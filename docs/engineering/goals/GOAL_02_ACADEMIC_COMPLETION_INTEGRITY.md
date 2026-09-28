> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

> **Regras deste registro foram supersedidas pela regra acadêmica final.** Consulte
> [`docs/product/business-rules.md`](../../product/business-rules.md): conclusão exata é somente
> informativa; 80% dos conteúdos libera o Teste Final, >=75 aprova e o certificado é automático.

# Goal 02 — Integridade da conclusão acadêmica

**ACADEMIC_COMPLETION_INTEGRITY_READY** — 08/09/2026. Implementação restrita a D-03/D-13, gates locais concluídos e staging validado.

## Causas e correção

- D-03 e D-13 registram a motivação histórica para medir conclusão sem arredondamento e revalidar certificados.
- Na política então vigente, conclusão exata bloqueava aprovação e emissão. Essa exigência foi revogada: `conteudo_concluido` e o percentual permanecem informativos; só o resultado >=75 do Teste Final aprova e habilita certificado.
- O gate atual de 80% usa `total_conteudos > 0` e comparação inteira exata entre conteúdos concluídos e total. Exercícios, incluindo Simulado, são opcionais e não entram no denominador.
- PATCH APROVADO e certificado não exigem conclusão integral. A decisão de REPROVADO continua manual conforme o contrato existente.
- `conteudos.models.js` reutiliza consulta/normalização; listagens derivam contagens. Cache percentual SQL permanece apenas visual. O rótulo do professor usa a conclusão explícita.
- `certificate.service.js` revalida APROVADO e Teste Final >=75 dentro da transação. Conteúdo incompleto ou adicionado depois não bloqueia emissão.
- Emissão é automática após a prova aprovada e idempotente; falha de PDF não desfaz tentativa/aprovação. Documento ATIVO e versionamento existentes são preservados.

## Seleção e concorrência

Todos os registros de Conteudos entram: VIDEO, TEXTO, PDF, LINK, ATIVIDADE. Módulos/aulas não alteram a seleção. Questionarios EXERCICIO/PROVA ficam fora; progresso é filtrado pelo aluno e pela turma.

A contagem usa agregação SQL. Aprovação bloqueia matrícula/turma e depois consulta progresso. Emissão já bloqueia ambas no contexto e consulta progresso após verificar ausência de certificado. Criação normal/PDF e progresso compartilham bloqueio da turma. A integração cobre emissão concorrente com inclusão de conteúdo antes da liberação desse bloqueio.

Ownership e ordem global de locks (D-08/Goal 06), ciclos de matrícula (D-04/D-05) e atomicidade geral SQL/filesystem permanecem fora do escopo. Política de mudanças após certificado já emitido, correção/reemissão/versionamento ficam para Goal 03. Por isso D-13 é PARCIAL na baseline, embora o gate de nova emissão esteja corrigido.

## Evidências de validação

- Direcionados progresso/matrícula: 4 suítes, 60 testes aprovados.
- Direcionados certificados: 5 suítes, 41 testes aprovados.
- MySQL direcionado: 3 suítes, 61 testes aprovados (matrículas, certificados, gestão de conteúdo).
- A conexão MySQL local padrão estava indisponível. Foi usado MySQL 8.0.46 isolado em 127.0.0.1:33307, apenas `plataforma_cursos_test`, com cópia idêntica dos fontes e conexão local separada em `/tmp/goal02-validation`.
- `npm run lint`: aprovado.
- `npm test`: 55 suítes, 531 testes aprovados, incluindo regressão de rótulo e cobertura oficial.

- `npm run test:integration`: 12 suítes/158 testes; primeira passagem teve 157 aprovados e uma fixture legada sem confirmação de e-mail. Corrigida apenas a fixture do professor sem turmas; repetida somente `goal3-fluxos.integration.test.js`: 28/28 aprovados. As outras 11 suítes já estavam aprovadas.
- `npm run build` e `git diff --check`: aprovados. Lint da fixture alterada também aprovado.
- `npm audit` e `npm audit --omit=dev`: executados uma vez cada; zero vulnerabilidades.
- `test:stability` não executado. Nenhum cálculo de avaliação, autenticação, template, QR, SHA-256, replicação ou schema foi alterado.

## Operação staging

O script `scripts/smoke_academic_completion_staging.js` cria curso/turma descartáveis para os usuários demo existentes; valida via HTTPS, sessão e CSRF os casos A–D. Confere ausência de registro/arquivo quando bloqueado, emissão com turma ENCERRADA, download, hash e validação pública. O finally remove exclusivamente o cenário e o PDF criado por ele.

Deploy concluído em 08/09/2026 às 12:36:30 UTC no staging Azure existente, sem reprovisionamento e com `SKIP_STAGING_DEMO_SEED=1`. Serviços saudáveis; schema de 19 tabelas validado, sem nova migration deste Goal.

- Bundle SHA-256: `d9c4cec8a3161549529bd13d8d74da9b838ea6e1907d6b8a2593af2c484eb3c2`.
- Árvore-fonte implantada: `da2ae76fdf1ad6ebbb1683768a87a0791dbb430ae384a43a2dd734ee2b3035d7`.
- Backup anterior: `/opt/plataforma-cursos/backups/plataforma_cursos_staging-backup-20260908T123610Z.sha256` (SQL, materiais e certificados). Código anterior preservado na VM em `/tmp/goal02-before-code.tgz`.
- Smoke HTTPS às 12:37:39 UTC: A, B, C e D aprovados; A também verificou ADMIN. C confirmou ausência de registro e qualquer arquivo adicional. D incluiu ENCERRADA, download, SHA-256 e validação pública.
- Limpeza confirmada: zero cursos residuais do smoke. Reconciliação final `CERTIFICATE_STORAGE_OK certificados=2`; os dois documentos anteriores foram preservados. Health HTTP 200.
- A primeira tentativa parou no login ADMIN 403, antes de criar cenário. A conta fictícia `admin.demo@example.test` não tinha EmailVerificacoes. Foi adicionado somente seu estado confirmado de demonstração; nenhum código de autenticação mudou. Nova tentativa passou integralmente.

Execução reproduzível na VM:

```bash
cat .staging-credentials | docker compose --env-file .env.staging \
  -f compose.yaml -f compose.staging.yaml exec -T app \
  node scripts/smoke_academic_completion_staging.js
```

Logs locais estão em `.deployments/academic-completion-integrity/` (ignorado pelo Git). Este documento recebeu o resultado operacional depois da geração do bundle; os fontes de runtime não mudaram depois do deploy.

## Baseline e limites de entrega

Atualizados `01-requirements.md`, `02-business-rules.md`, `08-testing-quality.md`, `09-risks-technical-debt.md`, `10-traceability.md` e `EXECUTIVE_SUMMARY.md`, além desta evidência. `04-data-model.md` não exigiu alteração: nenhuma tabela/coluna mudou.

D-03 está RESOLVIDO. D-13 está PARCIAL somente pela política futura sobre documentos já emitidos; os critérios deste Goal para novas emissões estão atendidos. Goals 03/06 continuam responsáveis por reemissão/versionamento e revisão abrangente de ownership/locks. As alterações pré-existentes do worktree foram preservadas; não foi criado commit.
