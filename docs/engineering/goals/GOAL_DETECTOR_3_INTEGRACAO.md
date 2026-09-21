> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Goal Detector 3 — integração contextual

> **SUPERADO PARCIALMENTE PELO ROADMAP INCREMENTAL COM FONTES**
>
> O contrato 1.0 abaixo foi preservado por compatibilidade. As rotas 2.0, o modo incremental,
> cancelamento, timeouts distintos e a política atual estão em
> `ROADMAP_DETECTOR_INCREMENTAL_FONTES.md`.

## Contratos

O navegador usa exclusivamente `POST /api/analises/contextual` na plataforma Node. Essa rota
autenticada encaminha, no servidor, o payload para `POST /api/v1/detectar` do FastAPI. A rota
legada `POST /api/plagio/analisar` permanece destinada à similaridade simples.

O request contextual aceita `documento`, `fonte_comparada`, `metadados_fonte` opcional e
`parametros` opcionais. Documento e fonte são limitados a 100.000 e 50.000 caracteres,
respectivamente; são permitidos até 20 autores e limiares entre 0 e 1.

A resposta pública é `{ success, id_analise, request_id, data }`. `data` preserva o contrato
FastAPI 1.0: `status_analise`, `resumo`, `parametros_aplicados`, `segmentos`, `alertas`,
`citacoes`, `referencias` e `associacoes`. Scores permanecem entre 0 e 1 e não representam
percentual de plágio.

## Configuração e falhas

- `DETECTOR_API_URL=http://127.0.0.1:8000`
- `DETECTOR_API_TIMEOUT_MS=15000`
- `DETECTOR_RATE_LIMIT_MAX=10`
- `DETECTOR_RATE_LIMIT_WINDOW_MS=60000`

Timeout retorna 504; indisponibilidade, 503; conteúdo excessivo, 413; rejeição de validação,
422; resposta externa incompatível ou falha inesperada, 502. A URL vem somente do ambiente do
servidor e aceita apenas HTTP/HTTPS sem credenciais, evitando que o payload controle destinos.

## Autorização, privacidade e persistência

ALUNO, PROFESSOR e ADMIN podem usar a rota. O middleware de autenticação consulta novamente o
usuário e o papel atual no banco; nenhum `id_usuario` do payload é aceito. O rate limit em memória
é por usuário autenticado e deverá ser substituído por solução distribuída se houver múltiplas
instâncias.

Após a resposta externa ser validada, somente identificador do usuário, resumo, versão de contrato,
duração observada pela plataforma e parâmetros numéricos são persistidos em
`AnalisesContextuais`. Documento, fonte, segmentos, citações, referências, resposta bruta, tokens
e embeddings não são persistidos. A chamada externa ocorre antes da escrita curta no MySQL.

Logs contêm apenas identificadores, papel, contagens, tamanhos, duração e erro classificado. O
navegador não acessa o FastAPI diretamente. O detector depende de fonte comparada fornecida pelo
usuário, não pesquisa fontes automaticamente e seus alertas exigem revisão humana.

## Testes

```bash
npm run test:security
npm test
npm run test:integration
npm run test:all
```

As integrações automatizadas usam exclusivamente `plataforma_cursos_test` e simulam o FastAPI.
O Goal Detector 4 implementará a interface completa.

Para acrescentar a tabela ao banco de desenvolvimento existente, execute explicitamente:

```bash
npm run db:dev:migrate:detector
```

O comando é idempotente, aceita somente `plataforma_cursos_dev` e não limpa tabelas.
