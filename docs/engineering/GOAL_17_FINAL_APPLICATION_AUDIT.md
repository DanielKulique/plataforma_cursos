# Goal 17 — Final Application Audit

## Baseline

- branch de origem: `release/academic-final-rules-prod`
- commit de origem: `aacb054ac72735e5d1f0ecd4340ac3aa45a461f2`
- branch de auditoria: `audit/final-application-release-candidate`, em worktree separado; a árvore principal preexistente não foi alterada.
- produção observada: release `aacb054ac72735e5d1f0ecd4340ac3aa45a461f2` em `/opt/plataforma-cursos/current`.
- migrations: 001–015 em produção na baseline; 001–016 no candidato local.
- data da auditoria: 2026-10-01 (America/Sao_Paulo).

## Inventário

| Item | Total atual | Fonte |
|---|---:|---|
| Páginas HTML | 32 | `src/public/*.html` |
| Endpoints Express | 89 | 85 declarações em routers e 4 rotas diretas em `index.js` |
| Migrations | 16 | `mysql/migrations/001` a `016` |
| Arquivos de teste unitário Jest | 73 | `src/__tests__/*.test.js` |
| Arquivos de integração Jest | 21 | `src/__tests__/integration/*.test.js` |
| Specs Playwright E2E | 13 | `tests/e2e/*.spec.js` |

O inventário de rotas, papéis, páginas, fluxos, evidências e lacunas está em
[`FULL_APPLICATION_TEST_MATRIX.md`](../testing/FULL_APPLICATION_TEST_MATRIX.md).
Além desses itens, foram revisados controllers, services, models, middlewares,
scripts, jobs de backup, Docker/Compose, Caddy, documentação e workflow GitHub Actions.

## Achados

| ID | SEVERIDADE | ÁREA | PROBLEMA | CORREÇÃO | TESTE | STATUS |
|---|---|---|---|---|---|---|
| G17-01 | HIGH | Avaliações | A baseline implantada não inclui `ASSOCIACAO`, gabarito booleano e múltiplas corretas por conjunto exato, exigidos pelos tipos oficiais. | Trabalho preexistente foi revisado e incorporado isoladamente: migration 016, serviço, API, UI e testes. | Integração dirigida 40/40; E2E de três tipos 1/1; suíte completa local 763 unitários e 278 integração. | CORRIGIDO LOCALMENTE; implantação pendente |
| G17-02 | HIGH | CI | O novo runner de integração lia `.env.test` antes de detectar `CI=true`; o arquivo não é versionado e quebraria a CI. | Carregamento do arquivo limitado à execução local. | `CI=true node scripts/run_integration.js --listTests` com `.env.test` temporariamente ausente listou 21 suítes. | CORRIGIDO LOCALMENTE |
| G17-03 | MEDIUM | Matriz de testes | Gerador marcava rotas `COVERED` por lista fixa sem evidência, omitia quatro rotas diretas, tratava quatro rotas com middleware como não montadas e não justificava linhas `PARTIAL`. | Evidência explícita para rotas cobertas; leitura do último argumento dos mounts com middleware; lacuna por item parcial; inventário 89 rotas. | `npm run test:matrix`; revisão do arquivo gerado, inclusive `/api/analises` e `/api/plagio`. | CORRIGIDO LOCALMENTE |
| G17-04 | MEDIUM | Configuração/documentação | Exemplo de produção ativava e-mail/verificação, e o runbook descrevia cadastro 503 mesmo com verificação opcional. | Exemplo e documentação alinhados às flags reais `false/false`. | Leitura das flags de produção; E2E de cadastro e login na suíte de browser. | CORRIGIDO LOCALMENTE |
| G17-07 | MEDIUM | Lint/testes | Após Playwright, `test:stability` varria JavaScript gerado em `playwright-report/` e parava com erros externos ao código da aplicação. | Ignorar `playwright-report/**` e `test-results/**` no ESLint. | `npm run lint` passou com os artefatos E2E presentes; estabilidade repetida em andamento. | CORRIGIDO LOCALMENTE |
| G17-08 | MEDIUM | Teste de migrations | O teste de dois runners iniciava ambos em banco vazio; sob carga, o primeiro podia gastar mais de 30 s aplicando 001–016, fazendo o segundo expirar e contaminando os testes seguintes. | Preparar o schema canônico antes da disputa; os dois runners competem apenas pela migration pendente 017, que é o comportamento sob teste. | Suíte de migration dirigida 6/6; `test:stability` em andamento. | CORRIGIDO LOCALMENTE |
| G17-05 | DEFERRED | Dependências | `npm audit` identificou um alerta alto em `brace-expansion` usado por lint/testes e dois moderados em `ip-address` e `multer`. | Sem atualização automática; avaliar patches em ciclo próprio. `multer` usa `memoryStorage`, fora do caminho de escrita em disco do aviso. | `npm audit` e `npm audit --omit=dev`; inspeção da árvore de dependências e das rotas de upload. | DOCUMENTADO |
| G17-06 | BLOCKER | Gates da release | WebKit real, CI da revisão, restore drill após mudança de backup/schema e estado implantado ainda não estão comprovados. | Completar os gates antes de tag/READY. | Pendente. | ABERTO |

## BLOCKER

- G17-06 permanece aberto até haver execução real do WebKit, CI verde, drill compatível
  com o schema candidato, backup local/offsite validado e smoke da revisão implantada.
- Não criar tag RC nem declarar `READY` enquanto qualquer dessas evidências faltar.

## HIGH

- G17-01 e G17-02 estão corrigidos no worktree isolado; a revisão ainda não foi
  promovida à produção.

## MEDIUM

- G17-03, G17-04, G17-07 e G17-08 foram corrigidos. As lacunas de cobertura individual permanecem
  registradas como `PARTIAL` na matriz.

## LOW

- Nenhum achado cosmético exigiu alteração.

## DEFERRED

- G17-05: atualizar dependências apenas após verificar relevância e regressões.
- `KEEP_LEGACY`: `RESPOSTA_CURTA` permanece no schema e na leitura histórica por
  compatibilidade; os fluxos novos de autoria e resposta usam os três tipos oficiais.
- `KEEP_LEGACY`: chaves antigas de resposta HTTP, seletores de logout e verificações
  de curso legado no bootstrap ainda têm consumidores ou função de segurança.
- `DEFERRED`: detector/plágio permanece montado e isolado por
  `DETECTOR_ENABLED=false` em produção; não há motivo demonstrado para removê-lo agora.
- `DEFERRED`: scripts antigos de teste e implantação precisam de confirmação de uso
  antes de remoção. `legacyHeaders: false` é opção atual do limitador, não código morto.
- `REMOVE_NOW`: nenhum item foi comprovado sem uso e seguro para remoção nesta release.

## Regras acadêmicas

- **80%:** `realizados * 100 >= total * 80`; fronteira exata coberta por integração.
- **Simulado:** `EXERCICIO` opcional, excluído do gate e da aprovação.
- **single attempt:** uma tentativa finalizada por aluno/turma, inclusive após novo ciclo;
  mesmo `submission_id` reaproveita resultado e novo UUID recebe 409.
- **75%:** nota final `>=75` atualiza a matrícula para `APROVADO`.
- **100% content:** conclusão integral não é pré-requisito da aprovação ou certificado.
- **auto certificate:** emissão é iniciada automaticamente após a transação acadêmica;
  reconciliação e emissão são idempotentes. Código público, QR, SHA-256, snapshot,
  PDF privado, validação pública e estados ATIVO/REVOGADO permanecem no contrato.
- **tipos de questão:** múltipla escolha usa conjunto exato com uma ou mais corretas;
  V/F usa booleano; associação usa IDs e vínculos persistidos, sem depender da posição.

## Segurança

- **auth:** sessão JWT em cookie HttpOnly/SameSite=Lax, Secure em produção,
  expiração e invalidação por versão de sessão; logout limpa cookie.
- **roles:** checagem de papel e ownership no servidor; aluno, professor responsável e
  ADMIN exercitados em testes de integração. Professor alheio recebe negação.
- **CSRF:** operações mutáveis autenticadas por cookie exigem token comparado de modo constante.
- **IDOR:** acesso cruzado a turma, conteúdo, matrícula e certificado é negado nos testes críticos.
- **XSS:** DOM usa criação de nós/texto; o E2E confirmou que
  `<script>window.__AUDIT_XSS__=true</script>` aparece literalmente na tela do aluno,
  sem elemento `script` e sem execução.
- **CSP:** produção respondeu com `script-src 'self'`, `script-src-attr 'none'`,
  `object-src 'none'`, `frame-ancestors 'self'` e origens específicas de YouTube;
  HSTS, `nosniff` e política de referrer foram observados.
- **PDF:** materiais e certificados ficam em storage privado; download autenticado,
  MIME, limite, integridade, caminho, symlink e substituição inválida têm verificações.
- **secrets:** logger redige chaves sensíveis e dados pessoais; resposta 500 não devolve stack.

## Banco

- **migrations:** 001–016 aplicadas em MySQL 8.4 descartável totalmente vazio; segunda
  execução retornou `NO-OP (versão 016)` no E2E dirigido.
- **schema:** contrato de schema e checksums passaram nos testes dirigidos; a CI executa
  validação estrutural após migrations.
- **integridade:** FKs, índices, unicidade, rollback e cópia pedagógica foram exercitados
  em integração. Replicação não copia matrícula, progresso, respostas, tentativas, notas,
  certificados ou sessões.
- **concorrência:** submissões finais e emissão usam locks/transações e unicidade;
  os testes de integração acadêmica e certificados passaram.
- **isolamento:** integração local usa somente MySQL descartável em `127.0.0.1:33307`;
  configuração recusa fallback para `3306`.

## Frontend

- **responsive:** viewports 320, 360, 390, 412, 768 e 1440 px fazem parte do E2E;
  autoria dos três tipos passou em teste dirigido sem overflow global.
- **errors:** a suíte Playwright cobre 400, 401, 403, 404, 409, 422, 429, 500 e 503,
  sem detalhes internos na tela e sem perda do contexto principal.
- **cross-browser:** Chromium completo passou 23/23 e Firefox crítico passou 7/7;
  WebKit crítico aguarda resultado real desta revisão.
- **YouTube:** normalização para `youtube-nocookie.com/embed` cobre `watch?v=`,
  `youtu.be` e `shorts`; iframe e CSP foram revisados.

## Backup

- **local:** `backup_status.sh` retornou `RPO_OK`; `backup_manifest.js verify` retornou
  `GOOD` para `backup-20260930T061512Z-dac242e8-eecd-4346-a50e-2c34848b5bc6`.
- **offsite:** o drill baixou `backup-20261001T061512Z-ca74b1d4-332d-4296-a7e0-68097a6d6bd4`
  do offsite e confirmou SHA-256 do pacote e manifesto. O status local/remoto anterior
  estava dentro do RPO de 24 horas.
- **restore evidence:** em 01/10/2026, a revisão de produção `aacb054` restaurou o
  backup offsite em Compose isolado: `RESTORE_VERIFIED` (21 tabelas, 10 materiais,
  1 certificado), `RESTORE_SMOKE_OK mode=HEALTH_ONLY`, `RESTORE_DRILL_GOOD` em 53 s e
  `RESTORE_DRILL_TEMP_CLEANUP PASS`. Após implantar a migration 016, repetir o drill
  com um backup do novo schema.

## Testes

- **unit:** `npm run test:all`: 73 suítes, 763 testes aprovados.
- **integration:** `npm run test:all`: 21 suítes, 278 testes aprovados; testes dirigidos
  de autoria, prova, replicação e migrations: 40/40.
- **Chromium:** E2E dirigido de autoria dos três tipos: 1/1; conjunto completo 23/23.
- **Firefox:** 7/7 no smoke crítico.
- **WebKit:** tentativa local: 1 teste sem browser passou, 6 testes de browser não
  iniciaram porque falta `libavif16` no host. Não conta como validação; execução real
  do smoke na CI continua obrigatória.
- **stability:** pendente (`npm run test:stability` executa a suíte crítica duas vezes).
- **documental:** `docs/engineering/validate_current_docs.py` passou com 109 documentos,
  517 links locais e 87 operações HTTP; `git diff --check` passou.

## Produção

- **health:** `GET /healthz` respondeu 200 via HTTPS.
- **readiness:** `GET /readyz` respondeu 200 via HTTPS.
- **smoke:** `/`, `/login.html`, `/cadastro.html`, `/api/cursos`, `/css/style.css` e
  `/certificados/validar` responderam 200 em leitura pública. Nenhuma conta, matrícula,
  avaliação, certificado ou conteúdo foi criado/alterado em produção.
- **configuração:** `EMAIL_DELIVERY_ENABLED=false`,
  `PUBLIC_REGISTRATION_EMAIL_VERIFICATION_REQUIRED=false` e `DETECTOR_ENABLED=false`
  foram lidos na configuração ativa sem expor secrets.

## Release Candidate

- commit: `NONE` até todos os gates ficarem verdes.
- tag: `NONE` até todos os gates ficarem verdes. Nenhuma convenção nova foi criada.

## Limitações conhecidas

- A matriz é conservadora: contratos sem evidência integral continuam `PARTIAL`.
- Alertas de dependências descritos em G17-05 não foram atualizados automaticamente.
- Histórico do Goal 16 registra uma tentativa local de WebKit sem bibliotecas; só uma
  execução real bem-sucedida da revisão atual conta para este Goal.

## Resultado

`FINAL_APPLICATION_AUDIT_PARTIAL` enquanto G17-06 permanecer aberto.
