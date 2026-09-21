# Referência da API

A API HTTP usa prefixo `/api`, JSON e sessão por cookie. IDs são inteiros positivos;
a API valida campos e vínculos, não apenas o perfil. Veja [autenticação](authentication.md)
e [regras acadêmicas](../product/business-rules.md).

## Convenções

Mutações autenticadas por cookie exigem `X-CSRF-Token`. PDFs usam multipart no upload
e resposta binária no download; não os envie como JSON. Rotas privadas de arquivos
revalidam autorização. Listagens paginadas de usuários, turmas, matrículas por turma,
histórico e resultados aceitam `page`/`limit`, padrão 50, máximo 100.

Falhas usuais: 400 entrada inválida, 401 sessão ausente/expirada, 403 permissão/CSRF,
404 recurso inexistente, 409 conflito acadêmico ou de versão, 413 tamanho excedido,
422 PDF inválido, 429 limite e 503 dependência indisponível. Respostas legadas não usam
um envelope único: há `mensagem`, `code` ou `codigo` conforme o endpoint.
`X-Request-ID` permite correlação operacional. Não dependa de mensagens SQL ou detalhes internos.

## Payloads principais

| Operação | Entrada principal |
| --- | --- |
| Login | `{ "email": "aluno@example.invalid", "senha": "<senha>" }` |
| Matrícula/rematrícula | `{ "id_turma": 1 }`; aluno vem da sessão |
| Progresso | `{ "status": "CONCLUIDO" }` ou INICIADO |
| Submissão | `{ "submission_id": "<UUID>", "respostas": [{ "id_pergunta": 1, "id_opcao": 2 }] }` |
| Revogar/reemitir | `{ "motivo": "<justificativa de 3 a 500 caracteres>" }` |
| Criar PDF de conteúdo | Multipart `arquivo`, `titulo`, `ordem`; metadados opcionais permitidos na rota |
| Comparar certificado público | Multipart com somente `arquivo`, sem hash fornecido pelo cliente |
| Replicar turma | Header `Idempotency-Key` (16–64 caracteres seguros), nome, professor, datas e estado de destino |

Envie exatamente uma opção válida por pergunta na submissão; não envie nota ou gabarito.
Repetir o mesmo UUID no mesmo ciclo recupera a tentativa existente. A leitura
`questionarios/disponivel` aceita `tipo` e `id_questionario`; perguntas da final só são
entregues após a liberação. Metadados não equivalem a autorização para responder.

## Saúde pública

| Método | Endpoint | Significado |
| --- | --- | --- |
| GET | `/healthz` | Processo vivo, corpo mínimo |
| GET | `/readyz` | DB e storages prontos; 503 se falhar |

## Inventário atual

As tabelas abaixo enumeram os registros de rotas desta revisão. Cada grupo aponta para
seu arquivo de validações e handlers; autorização detalhada pode estar no controller/serviço.
Não há especificação OpenAPI no repositório. O validador documental confere este inventário
contra os registros estáticos, sem inicializar a aplicação.

## Diagnóstico administrativo

Exige ADMIN; não confundir com healthz/readyz públicos.

Fonte: [health.routes.js](../../src/api/routes/health.routes.js).

| Método | Endpoint |
| --- | --- |
| GET | `/api/health` |

## Cursos

Leitura pública; criação, alteração e exclusão exigem ADMIN.

Fonte: [cursos.routes.js](../../src/api/routes/cursos.routes.js).

| Método | Endpoint |
| --- | --- |
| GET | `/api/cursos` |
| GET | `/api/cursos/:id` |
| DELETE | `/api/cursos/:id` |
| POST | `/api/cursos` |
| PUT | `/api/cursos/:id` |

## Turmas

Catálogo público. Consulta por professor respeita próprio responsável/ADMIN. Escritas e replicação exigem ADMIN.

Fonte: [turmas.routes.js](../../src/api/routes/turmas.routes.js).

| Método | Endpoint |
| --- | --- |
| GET | `/api/turmas` |
| GET | `/api/turmas/:id/replicacao-resumo` |
| POST | `/api/turmas/:id/replicar` |
| GET | `/api/turmas/:id` |
| GET | `/api/turmas/professor/:id` |
| POST | `/api/turmas` |
| PATCH | `/api/turmas/:id` |
| DELETE | `/api/turmas/:id` |

## Matrículas

Automatrícula e minha-sala são de ALUNO. Leitura respeita titular/responsável/ADMIN; PATCH exige responsável/ADMIN; cancelamento: titular/ADMIN.

Fonte: [matricula.routes.js](../../src/api/routes/matricula.routes.js).

| Método | Endpoint |
| --- | --- |
| POST | `/api/matriculas` |
| GET | `/api/matriculas/aluno/:id` |
| GET | `/api/matriculas/minha-sala` |
| GET | `/api/matriculas/turma/:id_turma` |
| GET | `/api/matriculas/:id` |
| PATCH | `/api/matriculas/:id` |
| DELETE | `/api/matriculas/:id` |

## Usuários

POST de cadastro e disponibilidade é público. GET/PATCH por ID: próprio usuário ou ADMIN; senha: próprio usuário. Listagem/exclusão: ADMIN.

Fonte: [usuarios.routes.js](../../src/api/routes/usuarios.routes.js).

| Método | Endpoint |
| --- | --- |
| POST | `/api/usuarios` |
| POST | `/api/usuarios/verificar-disponibilidade` |
| PATCH | `/api/usuarios/:id` |
| PATCH | `/api/usuarios/:id/senha` |
| GET | `/api/usuarios/:id` |
| GET | `/api/usuarios` |
| DELETE | `/api/usuarios/:id` |

## Administração

Todas as operações exigem ADMIN.

Fonte: [admin.routes.js](../../src/api/routes/admin.routes.js).

| Método | Endpoint |
| --- | --- |
| GET | `/api/admin/metrics` |
| POST | `/api/admin/usuarios` |
| GET | `/api/admin/usuarios` |
| GET | `/api/admin/usuarios/:id` |
| PATCH | `/api/admin/usuarios/:id` |
| DELETE | `/api/admin/usuarios/:id` |

## Autenticação

Login, confirmação e recuperação são públicos; logout, sessão e CSRF exigem autenticação.

Fonte: [auth.routes.js](../../src/api/routes/auth.routes.js).

| Método | Endpoint |
| --- | --- |
| POST | `/api/auth/login` |
| POST | `/api/auth/logout` |
| GET | `/api/auth/csrf` |
| POST | `/api/auth/recuperar-senha` |
| POST | `/api/auth/redefinir-senha` |
| POST | `/api/auth/enviar-codigo-verificacao` |
| POST | `/api/auth/verificar-codigo-email` |
| GET | `/api/auth/me` |

## Capacidades

Exige autenticação; informa disponibilidade das integrações.

Fonte: [capabilities.routes.js](../../src/api/routes/capabilities.routes.js).

| Método | Endpoint |
| --- | --- |
| GET | `/api/capabilities` |

## Certificados privados

Emissão: responsável/ADMIN para matrícula elegível. PDF/histórico: titular, responsável ou ADMIN. Revogar/reemitir: somente ADMIN. /meus lista documentos do próprio aluno.

Fonte: [certificados.routes.js](../../src/api/routes/certificados.routes.js).

| Método | Endpoint |
| --- | --- |
| POST | `/api/certificados/matriculas/:id_matricula/emitir` |
| GET | `/api/certificados/meus` |
| GET | `/api/certificados/:id_certificado/pdf` |
| POST | `/api/certificados/:id_certificado/revogar` |
| GET | `/api/certificados/:id_certificado/historico` |
| POST | `/api/certificados/:id_certificado/reemitir` |

## Validação pública de certificados

Sem sessão, com rate limit. Consulta por código e comparação de PDF; nunca fornece URL pública de download.

Fonte: [public-certificados.routes.js](../../src/api/routes/public-certificados.routes.js).

| Método | Endpoint |
| --- | --- |
| POST | `/api/public/certificados/validar-arquivo` |
| GET | `/api/public/certificados/:codigo` |

## Similaridade legada opcional

Exige detector habilitado e perfil ALUNO.

Fonte: [plagio.routes.js](../../src/api/routes/plagio.routes.js).

| Método | Endpoint |
| --- | --- |
| POST | `/api/plagio/analisar` |

## Análise contextual opcional

Exige detector habilitado e autenticação; aplica validação e limites próprios.

Fonte: [analises-contextuais.routes.js](../../src/api/routes/analises-contextuais.routes.js).

| Método | Endpoint |
| --- | --- |
| POST | `/api/analises/contextual` |
| POST | `/api/analises/contextual/segmento` |
| POST | `/api/analises/contextual/documento` |

## Similaridade indexada e corpus opcionais

Exige detector habilitado. Análise exige sessão; status/reload do corpus exigem ADMIN.

Fonte: [indexed-analysis.routes.js](../../src/api/routes/indexed-analysis.routes.js).

| Método | Endpoint |
| --- | --- |
| POST | `/api/analises/similaridade` |
| GET | `/api/admin/corpus/index/status` |
| POST | `/api/admin/corpus/index/reload` |

## Avaliações

Autoria: responsável/ADMIN com turma não encerrada. Perguntas respondíveis, submissão e histórico próprio: ALUNO. Resultados da turma: responsável/ADMIN. Final sujeita ao gate de 80%.

Fonte: [questoes.routes.js](../../src/api/routes/questoes.routes.js).

| Método | Endpoint |
| --- | --- |
| POST | `/api/turmas/:id_turma/questionarios` |
| PATCH | `/api/questionarios/:id_questionario` |
| DELETE | `/api/questionarios/:id_questionario` |
| POST | `/api/questionarios/:id_questionario/perguntas` |
| POST | `/api/perguntas/:id_pergunta/opcoes` |
| PATCH | `/api/opcoes/:id_opcao` |
| DELETE | `/api/opcoes/:id_opcao` |
| GET | `/api/turmas/:id_turma/questionarios` |
| GET | `/api/turmas/:id_turma/questionarios/disponivel` |
| PATCH | `/api/perguntas/:id_pergunta` |
| DELETE | `/api/perguntas/:id_pergunta` |
| POST | `/api/questionarios/:id_questionario/submissoes` |
| GET | `/api/questionarios/historico` |
| GET | `/api/turmas/:id_turma/questionarios/resultados` |

## Aulas, conteúdos e progresso

Leitura acadêmica exige vínculo. Autoria: professor responsável/ADMIN, turma não encerrada. Progresso individual: ALUNO matriculado. PDF exige autenticação inclusive no download.

Fonte: [conteudos.routes.js](../../src/api/routes/conteudos.routes.js).

| Método | Endpoint |
| --- | --- |
| GET | `/api/turmas/:id_turma/conteudos` |
| POST | `/api/turmas/:id_turma/modulos` |
| PATCH | `/api/modulos/:id_modulo` |
| DELETE | `/api/modulos/:id_modulo` |
| POST | `/api/turmas/:id_turma/conteudos` |
| POST | `/api/turmas/:id_turma/conteudos/pdf` |
| GET | `/api/conteudos/:id_conteudo/material` |
| PATCH | `/api/conteudos/:id_conteudo` |
| PUT | `/api/conteudos/:id_conteudo/pdf` |
| DELETE | `/api/conteudos/:id_conteudo` |
| PUT | `/api/conteudos/:id_conteudo/progresso` |
| GET | `/api/turmas/:id_turma/progresso` |
