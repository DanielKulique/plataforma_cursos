# Integração da análise de similaridade indexada

## Contrato e responsabilidades

A plataforma expõe um gateway autenticado; ela não abre FAISS, não gera embeddings, não consulta tabelas do corpus e não executa REG-01 a REG-07. O browser nunca recebe `MOTOR_IA_INTERNAL_API_TOKEN`.

Rotas:

| Rota | Papéis | Limite separado |
| --- | --- | --- |
| `POST /api/analises/similaridade` | ALUNO, PROFESSOR, ADMIN | análise |
| `GET /api/admin/corpus/index/status` | ADMIN | status |
| `POST /api/admin/corpus/index/reload` | ADMIN | reload restritivo |

A análise aceita somente `text`, `top_k`, exclusão por UUID/hash, seções permitidas, política de referências/quotes e limite por segmento. URL, path, SQL, snapshot e model path são rejeitados como campos livres. O gateway valida tipo, tamanho, UUID, hash, enum e limites antes do encaminhamento; o Python valida novamente.

## Chamada interna

`src/api/services/indexed-analysis.service.js` reutiliza `fetch`, aplica timeout total e cancelamento no evento `aborted`, limita a resposta e envia:

```http
X-Internal-Service-Token: <segredo somente no servidor>
X-Request-ID: <id operacional>
Content-Type: application/json
```

Configure:

```dotenv
MOTOR_IA_API_URL=http://127.0.0.1:8000
MOTOR_IA_INTERNAL_API_TOKEN=<segredo exclusivo>
RETRIEVAL_API_TIMEOUT_MS=20000
RETRIEVAL_MAX_RESPONSE_BYTES=1048576
RETRIEVAL_MAX_QUERY_CHARACTERS=50000
RETRIEVAL_TOP_K_MAX=50
```

O cliente valida o contrato de resposta e rejeita texto integral do corpus, embedding, vetor, path e stack trace. O token nunca é enviado ao navegador, incluído em URL ou logado.

## Erros e privacidade

O gateway preserva `400`, `401`, `403`, `409`, `413`, `422`, `429` e `503` do motor com mensagem pública; resposta incompatível vira `502`, timeout `504` e desconexão `499` quando aplicável. Não há `200` vazio para falha de infraestrutura.

Logs contêm request ID, usuário/papel, rota/operação, duração, status, tamanho do texto e contagens. Corpo, excerto, título, DOI, URL, token e texto submetido não são registrados. A plataforma não persiste o texto nem o resultado integral desta rota.

O retorno apresenta candidatos e evidências para revisão. Não deve ser interpretado como decisão de plágio, percentual copiado ou prova de originalidade. Cosseno bruto não é porcentagem.

## Testes e operação

```bash
npx jest --runInBand --coverage=false --runTestsByPath \
  src/__tests__/indexed-analysis.service.test.js \
  src/__tests__/indexed-analysis.routes.test.js
npm test
```

Os testes cobrem autenticação, matriz de papéis, contrato, token/header, request ID, validação, rate limits separados, códigos do Python, resposta excessiva e sanitização. O CI Node não executa Python, migration do corpus ou modelo.

O reload administrativo é manual, idempotente e apenas solicita ao Python que carregue um snapshot já publicado. Ele não constrói nem modifica o índice.
