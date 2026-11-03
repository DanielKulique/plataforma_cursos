# Goal 20 — HTTP parser security hardening

Data: 03/11/2026, America/Sao_Paulo.

**STATUS: HTTP_PARSER_SECURITY_READY**, limitado à mitigação local de F18-04.

## Base e escopo

- Base: `dcccc29394a92574739c5b4351f240fe5d6e127e`, entrega limpa do Goal 19.
- Branch: `hotfix/http-parser-security-goal20`.
- Worktree: `/mnt/disco/projetoSite/worktrees/plataforma-cursos-goal20`, criada limpa.
- Goal 19 e árvore original preservados: HEAD, status completo e SHA-256 de todos os
  arquivos rastreados/novos não ignorados comparados antes/depois (734 e 725 arquivos).
- Única alteração de runtime: opções do `express.json` em `index.js`.
  Sem mudanças em dependências/lock, regras acadêmicas, certificados, frontend ou banco.

O achado foi consultado em `docs/engineering/PROJECT_REVIEW_AND_NEXT_STEPS.md` da
árvore original, preservada; esse relatório local não foi incorporado à nova branch.

## Causa e aplicabilidade

Instalação reproduzível com `npm ci --ignore-scripts --no-audit --no-fund` confirmou:
`express@5.2.1` → `body-parser@2.3.0` → `raw-body@3.0.2`.
`package.json` permite Express `^5.1.0`; a versão efetiva vem do lockfile.
Não existe dependência direta de body-parser; esse mount é o único parser JSON do runtime.

O JSON global era montado com `{ limit: '256kb' }`, antes de autenticação e rotas,
herdando `inflate: true`. A versão instalada e esse caminho são afetados pelo
[GHSA-27r3-jxmh-p828 / CVE-2026-111181](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828).
O advisory indica versões afetadas `>=2.0.0 <2.4.0` e `<1.20.9`, patches 2.4.0/1.20.9
e a alternativa oficial `inflate: false`.

A falha envolve bytes posteriores a um frame comprimido: o stream de descompressão
pode receber um erro após o leitor remover seu listener, causando exceção não capturada.
O limite de tamanho do JSON e a autenticação posterior não eliminam esse caminho.
A inspeção do `body-parser/lib/read.js` instalado confirmou a criação de stream zlib
quando a inflação está habilitada. Não foi executada reprodução de crash sem mitigação;
a aplicabilidade anterior é estabelecida pela versão, configuração e código.

## Correção escolhida

```js
app.use(express.json({ limit: '256kb', inflate: false }));
```

Busca nos clientes, scripts e contrato de API não encontrou envio de JSON comprimido.
O `encode zstd gzip` do Caddy comprime respostas; não constitui requisito para aceitar
corpos de requisição comprimidos. A recusa oficial evita criar qualquer descompressor
nesse parser e retorna HTTP 415 pelo tratamento JSON de erros já existente.

Foram mantidos JSON UTF-8 estrito, ordem dos middlewares, limite de 262.144 bytes,
autenticação JWT/cookie e validação CSRF. Não foi necessário atualizar nenhuma dependência.
O contrato agora recusa JSON com `Content-Encoding` diferente de `identity`.

## Teste em processo descartável

`src/__tests__/http-parser.security.test.js` inicia um processo Node separado que carrega
o `index.js` real e escuta em `127.0.0.1`, porta aleatória. Todos os destinos HTTP são
fixados nesse loopback; o teste não recebe URL externa.

A fixture não lê `.env`, usa apenas variáveis sintéticas e substitui o módulo de banco
por métodos que lançam erro caso chamados. Somente o modelo de autenticação é substituído
por usuário/credenciais fictícios; parser, controllers/rotas de autenticação, JWT,
cookies, middleware de autenticação, CSRF e error handler são reais. Não há chamada
de inicialização do servidor de produção, MySQL, storage ou provedor de e-mail.

Os 12 testes verificam:

- Login com JSON UTF-8 comum e `Content-Encoding: identity`, cookie HttpOnly e token CSRF.
- JSON quebrado e valores `null`/`42` recusados com 400 em JSON, sem stack na resposta.
- Aceitação no limite exato de 256 KiB e recusa com 413 ao acrescentar um byte.
- gzip, deflate e Brotli válidos e malformados recusados com 415.
- Frame completo de cada formato seguido por bytes tardios, em transferência chunked
  com atraso de 50 ms, recusado com 415 em rota inexistente e sem autenticação.
- Após cada caso de erro, espera de 100 ms, processo ainda vivo e novo login com 200.
- Ausência/token inválido mantém 401; cookie sem CSRF ou com CSRF incorreto mantém 403;
  cookie com CSRF correto permite logout 204. O próximo login continua funcionando.

O filho não instala handlers que absorvam exceções não capturadas; rejeições não
tratadas usam modo estrito. Há deadlines de startup/HTTP e shutdown com kill de
fallback. A primeira versão do cliente de teste fechava a conexão ao receber o 415
precoce; o harness foi corrigido para manter a conexão aberta até terminar o envio
dos bytes tardios. A correção de runtime permaneceu a mesma.

## Evidências e reprodução

| Validação final | Resultado |
| --- | --- |
| Node 24.20.0 / npm 11.19.0, parser + auth controller + middleware + HTTP errors | 4 suítes, **41/41 PASS** |
| Node 20.20.2, linha usada no Dockerfile, parser em container descartável | **12/12 PASS** |
| `npm run lint` | PASS |
| `npm run build` (isolamento estático e assets de produção) | PASS |
| `git diff --check` | PASS |
| Goal 19 e árvore original: HEAD/status/hashes | Idênticos aos snapshots anteriores |
| `npm audit --omit=dev --package-lock-only --json` | Exit 1 esperado: pacote ainda sinalizado; mitigação de configuração não remove alerta |

O ensaio Node 20 usou a imagem local `node:20-bookworm-slim`, `--pull=never`,
`--network none`, filesystem read-only, `/tmp` descartável e somente a worktree montada
read-only. O HTTP ocorreu exclusivamente no loopback interno. Não publicou portas,
não criou volumes permanentes e o container foi removido automaticamente.

Comandos do teste isolado e regressões relacionadas, sem necessidade de `.env` real:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npx --no-install jest --runInBand --runTestsByPath src/__tests__/http-parser.security.test.js --detectOpenHandles
env NODE_ENV=test APP_ENV=test DB_HOST=127.0.0.1 DB_PORT=33307 DB_USER=unused DB_PASSWORD=unused DB_NAME=plataforma_cursos_test DB_ENVIRONMENT_IDENTITY=plataforma_cursos_test JWT_SECRET=parser-fixture-only-secret-with-at-least-32-characters npx --no-install jest --runInBand --runTestsByPath src/__tests__/http-parser.security.test.js src/__tests__/http-response.test.js src/__tests__/auth.controller.test.js src/__tests__/middlewares.test.js --detectOpenHandles
npm run lint
npm run build
git diff --check
```

Resultados estruturados, hashes de fontes e comando Node 20:
[goal20-http-parser-security.json](evidence/goal20-http-parser-security.json).
O teste é descoberto automaticamente pela suíte Jest existente.

SHA imutável da entrega:

```bash
git log -1 --format=%H -- docs/engineering/GOAL_20_HTTP_PARSER_SECURITY.md
```

## Riscos restantes

- `body-parser@2.3.0` permanece no lockfile e no alerta npm. F18-04 fica mitigado pela
  configuração explícita; reativar inflação ou adicionar outro parser com defaults
  reabre o caminho. Manutenção futura pode adotar patch compatível, com regressões.
- Consumidor externo não documentado que envie JSON comprimido receberá 415 e deverá
  usar JSON sem compressão. A inspeção local não comprova comportamento de terceiros.
- Não foram avaliados outros advisories nem outros achados do Goal 18; não se declara
  ausência geral de DoS. Limites de conexão/infraestrutura continuam fora deste escopo.
- Não houve deploy, payload contra produção, acesso a dados reais, push ou CI remota.
  O estado da imagem implantada não foi verificado; a mitigação só vale para a revisão
  que contém esta alteração. A árvore original e o Goal 19 não receberam merge.
