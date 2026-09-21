> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Goal 09 — resiliência entre frontend e API

**Status:** `FRONTEND_API_RESILIENCE_READY`

**Validação:** 15/09/2026 (16/09 UTC no staging)

**Escopo:** D-16, D-19, D-24 e D-26, sem alterar as regras acadêmicas, o lifecycle de storage, certificados ou backup/restore dos Goals 01–08.

## Resultado

Erro de certificado agora degrada somente a seção de certificados; turmas e progresso continuam disponíveis. Respostas internas inesperadas deixaram de devolver detalhes técnicos nos pontos auditados, health público/administrativo possui contrato mínimo seguro, o cliente HTTP tolera 204, corpo não JSON e falha de rede, e a mensagem de avaliação com histórico descreve a regra vigente.

| Achado | Estado final | Evidência principal |
| --- | --- | --- |
| D-16 — exposição de erro técnico | RESOLVIDO | `http-response.js`, auth, health, controllers de análise/admin, handler global e testes de contrato |
| D-19 — certificado derrubava Sala Virtual | RESOLVIDO | carregamento paralelo com `Promise.allSettled`, estados e retry locais, `sala-virtual.resilience.test.js` |
| D-24 — envelopes inconsistentes | PARCIAL | `error` canônico nos pontos migrados; aliases `mensagem`/`message` e sucessos históricos preservados |
| D-26 — mensagem imprecisa de histórico | RESOLVIDO | mensagem de `QUESTIONARIO_COM_HISTORICO` e regressões acadêmicas de frontend/integração |

## 1. Causa e correção de D-16

A causa era o uso direto de `error.message` em respostas 5xx e no health, além de tratamentos diferentes entre controllers. Isso podia transformar mensagens de banco, filesystem ou serviços externos em conteúdo público.

O helper pequeno `src/utils/http-response.js` separa erro de domínio de erro interno:

- status abaixo de 500 preserva mensagem segura e `code` quando existente;
- 500–599 usa mensagem fixa e não inclui `code` técnico;
- `error` é o campo canônico;
- um alias legado pode ser mantido durante a migração.

Foram auditados/corrigidos login e demais fluxos de autenticação, handler global, health público e ADMIN, cursos, turmas, usuários/admin, plágio, análise contextual e análise indexada. Erros continuam registrados pelo logger sanitizado com request id/contexto; nenhum secret foi acrescentado aos logs.

## 2. Contrato de health

| Endpoint | Autorização | Sucesso | Degradação |
| --- | --- | --- | --- |
| `GET /healthz` | público | `200 {"status":"ok"}` | `503 {"status":"degraded"}` |
| `GET /api/health` | ADMIN | `200` com `components.database: "ok"` | `503` com `components.database: "unavailable"` |

Nenhum contrato contém stack, SQL, hostname, usuário, path ou string de conexão. O health ADMIN continua atrás da autorização existente.

## 3. D-19 e os estados da Sala Virtual

Antes, um único `Promise.all`/catch acoplava turmas e certificados. A rejeição da consulta secundária impedia a renderização da área acadêmica principal.

Agora as duas consultas permanecem paralelas, mas são observadas com `Promise.allSettled` e handlers próprios:

- **turmas:** componente crítico com loading, success, empty e error próprios;
- **certificados:** componente secundário com loading, success, empty e error próprios;
- falha de certificados mantém as turmas renderizadas e oferece `Tentar novamente` somente nessa seção;
- falha de turmas permanece visível e não é mascarada pela disponibilidade de certificados;
- 401 preserva o redirecionamento da sessão existente;
- a mensagem persistente de certificados usa a região `aria-live` da página.

## 4. HTTP, PDF privado e 503

`src/public/js/api.js` passou a:

- aceitar JSON válido e 204/205 sem corpo;
- converter sucesso com corpo inválido em erro controlado;
- usar fallback seguro para erro não JSON;
- nunca exibir o payload técnico de respostas 5xx;
- converter falha de rede em `Não foi possível conectar ao servidor.`;
- reconhecer `error`, `mensagem` e `message` durante a compatibilidade.

`src/public/js/private-pdf.js` centraliza a abertura/download autenticado de materiais e certificados. O frontend diferencia 404 de 503: ausência real é informada como inexistência; inconsistência ou indisponibilidade do storage é temporária. Sala Virtual e Sala de Aula usam o helper sem tornar os PDFs públicos.

Não foi criada API v2, framework de retry, Axios, catálogo extenso de códigos ou novo envelope global de sucesso. Arrays diretos, `message`, `mensagem`, `success/data` e respostas de sucesso específicas permanecem legados compatíveis; essa é a razão para D-24 continuar PARCIAL.

## 5. D-26 e mensagens acadêmicas

A resposta segura para uma avaliação com histórico passou a ser:

> Avaliação com histórico não permite alterar enunciado, tipo, perguntas, alternativas ou gabarito; somente disponibilidade, aula e ordem podem ser ajustadas.

As regressões também confirmam que a prova final libera após 80% da trilha, exige conquista de pelo menos 75%, uma tentativa abaixo disso não significa `REPROVADO`, e exercício não recebe mensagem de mínimo de 75%. Nenhuma regra ou dado histórico dos Goals 02, 04 e 05 foi alterado.

## 6. Testes adicionados e regressões

- `http-response.test.js`: domínio 409 específico e supressão de SQL/host/path em 5xx;
- `api.frontend.test.js`: 200, 204, erro de domínio, 500, não JSON e rede;
- `health.controller.test.js`: contratos público e ADMIN sem detalhes;
- `sala-virtual.resilience.test.js`: independência entre turmas e certificados;
- `private-pdf.frontend.test.js`: 401/403/404/503, rede, MIME e transferência;
- `certificates.frontend.test.js`: integração com PDF privado;
- `questionario.frontend.test.js`: 80%, 75%, ausência de reprovação indevida e freeze correto;
- integração completa: regressões de matrícula, ciclos, avaliações, autorização, certificados, storage e demais domínios.

## 7. Gates locais

| Gate | Resultado final |
| --- | --- |
| testes direcionados | 10 suítes, 75 testes; após dois ajustes de integração, 2 suítes/6 testes direcionados |
| `npm run lint` | passou |
| `npm test` | 64 suítes, 648 testes; statements 61,86%, branches 55,78%, functions 63,34%, lines 65,09% |
| `npm run test:integration` | 16 suítes, 253 testes em MySQL 8.4.11 descartável; passou |
| `npm run build` | isolamento do banco e artefatos de produção validados |
| `npm audit --audit-level=high` | 0 vulnerabilidades |
| `npm audit --omit=dev --audit-level=high` | 0 vulnerabilidades |
| `git diff --check` | passou na árvore final |
| documentação | `validate_docs.py` passou após atualização do manifesto |

O Docker local não era acessível pelo usuário da sessão. A primeira tentativa de integração recebeu `ECONNREFUSED`; MySQL 8.0 local também foi recusado corretamente pelo guardrail. A execução válida usou o binário oficial MySQL 8.4.11 em `/tmp`, servidor interno na porta 3306 e proxy somente em `127.0.0.1:33307`, com o banco descartável canônico `plataforma_cursos_test`. Nenhum banco de desenvolvimento, legado ou staging foi usado nos testes locais.

`test:stability` e restore drill não foram executados, conforme o escopo. O Goal 09 não alterou backup, restore ou lifecycle interno de storage.

## 8. Staging existente

O ambiente existente foi atualizado por bundle, sem reprovisionamento. Antes do deploy, os guardrails exigiram registrar a identidade explícita do banco já existente; o utilitário canônico criou apenas o marcador `environment_identity`, verificou MySQL 8.4.11 e o alvo `plataforma_cursos_staging`. O deploy aplicou 12 migrations, validou 20 tabelas, gerou backup pré-deploy íntegro e recriou somente app/Caddy conforme o fluxo padrão. Nenhum restore foi executado.

Smoke direcionado em 16/09 UTC:

- `/healthz` retornou somente `{"status":"ok"}`;
- login ADMIN e ALUNO funcionou;
- `/api/health` retornou apenas database `ok`;
- Sala Virtual retornou 5 turmas e 3 certificados;
- consulta sem sessão retornou 401 seguro e PDF inexistente retornou 404;
- PDF privado ativo retornou 200, `application/pdf` e assinatura `%PDF-` (119.868 bytes);
- HTML/JS implantados contêm a região local, `Promise.allSettled`, parse resiliente e mensagem de 503;
- hashes de `api.js`, `sala-virtual.js`, `private-pdf.js` e `health.controller.js` coincidiram entre local e staging;
- app, Caddy e MySQL terminaram saudáveis.

O smoke geral histórico parou antes do escopo deste Goal porque assume que a primeira matrícula acumulada possui exatamente o conjunto atual de cinco conteúdos demo. O smoke direcionado não depende dessa ordem. Falhas parciais de certificados, 5xx injetado, storage 503 e avaliação congelada permanecem comprovados pelos testes automatizados, sem introduzir falha destrutiva no staging.

## 9. Limitações restantes

- D-24 é parcial: envelopes históricos de sucesso e aliases antigos continuam em uso;
- não houve teste em browser real, leitor de tela ou matriz de navegadores neste Goal;
- não foi provocado missing/corrupção de arquivo no staging; os contratos 503 foram cobertos de forma automatizada e o asset implantado foi conferido;
- o health verifica banco, não substitui monitoramento de storage, e-mail, motor externo ou backup;
- outras páginas multipartes devem adotar isolamento somente quando a independência funcional estiver demonstrada.

**FRONTEND_API_RESILIENCE_READY**
