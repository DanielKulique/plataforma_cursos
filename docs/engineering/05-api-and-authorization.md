> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../index.md).

# API e autorização

## Convenções de contrato

Inventário de **84 endpoints de API, GET /healthz e GET /readyz (86 operações)**, extraído das declarações atuais de rotas e conferido com controllers/models. Não inclui o middleware genérico 404, arquivos estáticos nem o bloqueio `/assets/materiais`. HTML `/certificados/validar` e `/certificados/validar/:codigo` serve a mesma página pública; os demais `.html` são `express.static`.

- **Sessão:** cookie JWT ou Bearer válido; usuário e papel atual consultados no banco. Ausência/token inválido → 401; banco indisponível na checagem → 500.
- **Gestor:** ADMIN ou PROFESSOR atualmente atribuído à turma; não equivale a todos os professores.
- **Leitor acadêmico:** Gestor, ou ALUNO com matrícula não CANCELADO e turma não ENCERRADA.
- **Turma editável:** ABERTA ou FECHADA. ADMIN também está sujeito a esse gate.
- Cookie em POST/PUT/PATCH/DELETE protegido exige `X-CSRF-Token`, senão 403. Rotas públicas não passam por checkAuth.
- Validação de entrada normalmente retorna 400, mas validadores de detector usam 422/413. Erro inesperado chega a 500. Limitações e exceções estão na coluna de erros e em segurança.
- Não há envelope JSON único: `message`, `mensagem`, `errors`, `erros`, objetos e arrays coexistem. Identificadores decimais do mysql2 nem sempre são normalizados igualmente em todos os domínios.
- Não foram encontrados OpenAPI nem versionamento geral da API. Paths são relativos à mesma origem, sem prefixo de versão público.

**Conteudo:** titulo,tipo,ordem obrigatórios; descricao,id_modulo,url,corpo,duracao_minutos opcionais. **Campos PDF:** titulo,ordem (obrigatórios na criação), descricao,id_modulo,corpo,duracao_minutos; upload recebe `arquivo`, não `url` nem `id_arquivo_material` do cliente. **Questionario:** titulo,descricao,tipo,ativo,id_modulo,ordem conforme operação. **Opções:** texto_opcao,ordem,correta; criação de pergunta aceita array com ≥2 e uma correta.

Evidência por domínio abaixo: arquivo de rota com linhas, controller homônimo (matricula/questoes/conteudos etc.) e models/services citados nos RF. Autorização foi confirmada além da interface.

## admin

Fonte: [`admin.routes.js`](../../src/api/routes/admin.routes.js).

| Método e path | AUTH / ROLE / condição | Entrada | Saída | Principais erros | Responsabilidade (handler) |
| --- | --- | --- | --- | --- | --- |
| `POST /api/admin/usuarios` | ADMIN | nome_completo, cpf, email, senha, tipo; telefone opcional | 201 usuário sem senha | 400; 409 duplicidade | `criarUsuarioAdmin` |
| `GET /api/admin/usuarios` | ADMIN | — | 200 array de usuários | 500 | `buscarTodosUsuarios` |
| `GET /api/admin/usuarios/:id` | ADMIN | id | 200 usuário | 404 | `buscarUsuarioPorId` |
| `PATCH /api/admin/usuarios/:id` | ADMIN | id; nome_completo/cpf/email/telefone/tipo | 200 mensagem + usuário | 400; 404; 409 vínculos/último ADMIN | `atualizarUsuarioAdmin` |
| `DELETE /api/admin/usuarios/:id` | ADMIN | id | 204 | 404; 409 vínculos/autoexclusão/último ADMIN | `deletarUsuario` |

## analises-contextuais

Fonte: [`analises-contextuais.routes.js`](../../src/api/routes/analises-contextuais.routes.js).

| Método e path | AUTH / ROLE / condição | Entrada | Saída | Principais erros | Responsabilidade (handler) |
| --- | --- | --- | --- | --- | --- |
| `POST /api/analises/contextual` | Sessão + detector ativo | documento,fonte_comparada; metadados_fonte,parametros opcionais | 200 success,id_analise,request_id,data | 413; 422; 429; 502/503/504 | `analisar` |
| `POST /api/analises/contextual/segmento` | Sessão + detector ativo | sessao_id,segmento_id,versao,texto_segmento,modo_fontes; contexto e fonte conforme modo | 200 success,request_id,data | 413; 422; 429; 499 cancelamento; 502/503/504 | `analisarSegmento` |
| `POST /api/analises/contextual/documento` | Sessão + detector ativo | documento,modo_fontes; fonte_manual/limite_candidatos/parametros conforme modo | 200 success,id_analise,request_id,data | 413; 422; 429; 499; 502/503/504 | `analisarDocumento` |

## auth

Fonte: [`auth.routes.js`](../../src/api/routes/auth.routes.js).

| Método e path | AUTH / ROLE / condição | Entrada | Saída | Principais erros | Responsabilidade (handler) |
| --- | --- | --- | --- | --- | --- |
| `POST /api/auth/login` | Público | email, senha | 200 usuário, csrf_token e Set-Cookie | 401 credenciais; 403 e-mail pendente; 429 | `login` |
| `POST /api/auth/logout` | Sessão | CSRF se cookie | 204; limpa cookie/invalida versão | 500 falha ao invalidar | `logout` |
| `GET /api/auth/csrf` | Sessão | — | 200 csrf_token | 401 sem csrf no token | `csrf` |
| `POST /api/auth/recuperar-senha` | Público | email | 202 mensagem indistinguível | 400 formato; 429 | `recuperarSenha` |
| `POST /api/auth/redefinir-senha` | Público | token, nova_senha | 200 mensagem; limpa cookie | 400 token/senha; 429 | `redefinirSenha` |
| `POST /api/auth/enviar-codigo-verificacao` | Público; limites por IP e hash do e-mail normalizado | email | 202 mensagem genérica; sem e-mail/código/estado da conta | 400 formato; 429 excesso; 500 infraestrutura interna | `enviarCodigoVerificacao` |
| `POST /api/auth/verificar-codigo-email` | Público; limites por IP e hash do e-mail normalizado | email, codigo de 6 dígitos | 200 mensagem | 400 incorreto/expirado/ausente; 429 excesso; 500 infraestrutura | `verificarCodigoEmail` |
| `GET /api/auth/me` | Sessão | — | 200 usuario e mensagem | 401 sessão inválida | `me` |

## capabilities

Fonte: [`capabilities.routes.js`](../../src/api/routes/capabilities.routes.js).

| Método e path | AUTH / ROLE / condição | Entrada | Saída | Principais erros | Responsabilidade (handler) |
| --- | --- | --- | --- | --- | --- |
| `GET /api/capabilities` | Sessão | — | 200 features.detector.enabled/experimental | 401 | `listar` |

## certificados

Fonte: [`certificados.routes.js`](../../src/api/routes/certificados.routes.js).

| Método e path | AUTH / ROLE / condição | Entrada | Saída | Principais erros | Responsabilidade (handler) |
| --- | --- | --- | --- | --- | --- |
| `POST /api/certificados/matriculas/:id_matricula/emitir` | Gestor | id_matricula | 201 v1 ou 200 ATIVO reutilizado | 403; 404; 409 inelegível/histórico revogado; 503 colisões | `emitir` |
| `POST /api/certificados/:id_certificado/reemitir` | ADMIN | ID da última versão; JSON somente motivo (3–500) | 201 nova versão | 400 motivo/campos; 401; 403; 404; 409 inelegível/versão substituída/conflito; 503 colisões | `reemitir` |
| `GET /api/certificados/:id_certificado/historico` | Aluno dono, professor responsável ou ADMIN | id_certificado | Todas as versões, ordem decrescente, metadados de auditoria | 401; 403 ownership; 404 | `historico` |
| `GET /api/certificados/meus` | ALUNO | — | 200 total, certificados | 403 papel | `meus` |
| `GET /api/certificados/:id_certificado/pdf` | Aluno dono, professor responsável ou ADMIN | id_certificado; query download=0 ou 1 | 200 PDF inline ou attachment | 403; 404 registro; 503 bytes indisponíveis; 422 referência | `pdf` |
| `POST /api/certificados/:id_certificado/revogar` | ADMIN | id_certificado; motivo | 200 certificado, mensagem | 400 motivo; 403; 404 | `revogar` |

## conteudos

Fonte: [`conteudos.routes.js`](../../src/api/routes/conteudos.routes.js).

| Método e path | AUTH / ROLE / condição | Entrada | Saída | Principais erros | Responsabilidade (handler) |
| --- | --- | --- | --- | --- | --- |
| `GET /api/turmas/:id_turma/conteudos` | Leitor acadêmico | id_turma | 200 modulos com conteúdos e array conteudos; PDF tem URL privada | 403; 404 turma | `listar` |
| `POST /api/turmas/:id_turma/modulos` | Gestor, turma editável | id_turma; titulo, ordem; descricao opcional | 201 modulo | 409 ordem/ENCERRADA | `criarModulo` |
| `PATCH /api/modulos/:id_modulo` | Gestor, turma editável | id_modulo; titulo/descricao/ordem | 200 mensagem | 404; 409 ordem/ENCERRADA | `atualizarModulo` |
| `DELETE /api/modulos/:id_modulo` | Gestor, turma editável | id_modulo | 200 mensagem | 404; 409 conteúdo/avaliação/ENCERRADA | `removerModulo` |
| `POST /api/turmas/:id_turma/conteudos` | Gestor, turma editável | id_turma; Conteudo | 201 conteudo | 409 ordem/aula; 422 referência PDF/VIDEO | `criar` |
| `POST /api/turmas/:id_turma/conteudos/pdf` | Gestor, turma editável | id_turma; multipart arquivo + titulo, ordem; demais campos PDF | 201 conteudo e URL protegida | 400 multipart; 413 tamanho; 422 tipo/estrutura/criptografia; 409; 503 parser ocupado | `criarPdf` |
| `GET /api/conteudos/:id_conteudo/material` | Leitor acadêmico | id_conteudo | 200 bytes PDF inline; private,no-store | 403; 404 conteúdo/legado; 503 bytes privados indisponíveis; 409 tipo; 422 referência | `material` |
| `PATCH /api/conteudos/:id_conteudo` | Gestor, turma editável | id_conteudo; campos parciais Conteudo | 200 mensagem | 404; 409; 422 | `atualizar` |
| `PUT /api/conteudos/:id_conteudo/pdf` | Gestor, turma editável | id_conteudo; multipart arquivo + campos PDF opcionais | 200 conteudo, mensagem | 400; 413; 422 tipo/estrutura/criptografia; 409; 503 parser ocupado | `substituirPdf` |
| `DELETE /api/conteudos/:id_conteudo` | Gestor, turma editável | id_conteudo | 200 mensagem | 404; 409 histórico/ENCERRADA | `remover` |
| `PUT /api/conteudos/:id_conteudo/progresso` | ALUNO matriculado; turma não ENCERRADA | id_conteudo; status INICIADO ou CONCLUIDO | 200 id_conteudo,status,progresso_percentual,datas | 403; 404 | `progresso` |
| `GET /api/turmas/:id_turma/progresso` | Gestor | id_turma | 200 alunos/progresso | 403; 404 | `turma` |

## cursos

Fonte: [`cursos.routes.js`](../../src/api/routes/cursos.routes.js).

| Método e path | AUTH / ROLE / condição | Entrada | Saída | Principais erros | Responsabilidade (handler) |
| --- | --- | --- | --- | --- | --- |
| `GET /api/cursos` | Público | — | 200 array de cursos | 500 | `listarTodos` |
| `GET /api/cursos/:id` | Público | id | 200 curso | 400; 404 | `listarCursoPorId` |
| `DELETE /api/cursos/:id` | ADMIN | id | 204 | 404; 409 curso com turmas | `deletarCurso` |
| `POST /api/cursos` | ADMIN | nome_curso, carga_horaria; descricao opcional | 201 curso | 400; 409 nome | `criarCurso` |
| `PUT /api/cursos/:id` | ADMIN | id; nome_curso, carga_horaria; descricao opcional | 200 curso | 400; 404; 409 | `atualizarCurso` |

## health

Fonte: [`health.routes.js`](../../src/api/routes/health.routes.js).

| Método e path | AUTH / ROLE / condição | Entrada | Saída | Principais erros | Responsabilidade (handler) |
| --- | --- | --- | --- | --- | --- |
| `GET /api/health` | ADMIN | — | 200 status,components.database | 503 status degraded, componente indisponível | `status` sem detalhes internos |

## indexed-analysis

Fonte: [`indexed-analysis.routes.js`](../../src/api/routes/indexed-analysis.routes.js).

| Método e path | AUTH / ROLE / condição | Entrada | Saída | Principais erros | Responsabilidade (handler) |
| --- | --- | --- | --- | --- | --- |
| `POST /api/analises/similaridade` | Sessão + detector ativo | text; top_k,exclude_document_id/hash,allowed_section_types,include_references/quotes,maximum_candidates_per_query_segment opcionais | 200 success,request_id,data candidatos/métricas | 413; 422; 429; 499; 502/503/504 e erros mapeados do motor | `analisar` |
| `GET /api/admin/corpus/index/status` | ADMIN + detector ativo | — | 200 success,request_id,data estado do índice | 429; 502/503/504 | `status` |
| `POST /api/admin/corpus/index/reload` | ADMIN + detector ativo | — | 200 success,request_id,data changed/current | 429; 502/503/504 | `reload` |

## matricula

Fonte: [`matricula.routes.js`](../../src/api/routes/matricula.routes.js).

| Método e path | AUTH / ROLE / condição | Entrada | Saída | Principais erros | Responsabilidade (handler) |
| --- | --- | --- | --- | --- | --- |
| `POST /api/matriculas` | ALUNO | id_turma; aluno vem da sessão | 201 nova no ciclo 1 ou 200 rematrícula com ciclo incrementado | 403 turma não ABERTA; 404; 409 duplicada/concorrente | `criarMatricula` |
| `GET /api/matriculas/aluno/:id` | Próprio ID ou ADMIN | id aluno | 200 array de matrículas com progresso derivado | 403 escopo | `buscarMatriculasDoAluno` |
| `GET /api/matriculas/minha-sala` | ALUNO | — | 200 total, turmas não canceladas/não encerradas | 500 | `buscarMinhaSalaVirtual` |
| `GET /api/matriculas/turma/:id_turma` | Gestor | id_turma | 200 matriculas e dados de alunos/certificados | 403; 404 turma | `buscarMatriculasDaTurma` |
| `GET /api/matriculas/:id` | Aluno dono, professor responsável ou ADMIN | id matrícula | 200 matrícula e progresso derivado | 403; 404 | `buscarMatriculaPorId` |
| `PATCH /api/matriculas/:id` | Gestor | id; nota_final e/ou status_aprovacao | 200 message | 400; 409 pendências/nota/certificado; CANCELADO exige rematrícula | `atualizarMatricula` |
| `DELETE /api/matriculas/:id` | Aluno dono ou ADMIN | id | 200 message; cancelamento lógico | 403; 404; 409 certificado ativo | `cancelarMatricula` |

## plagio

Fonte: [`plagio.routes.js`](../../src/api/routes/plagio.routes.js).

| Método e path | AUTH / ROLE / condição | Entrada | Saída | Principais erros | Responsabilidade (handler) |
| --- | --- | --- | --- | --- | --- |
| `POST /api/plagio/analisar` | ALUNO + detector ativo | texto_original,texto_suspeito 10–20000 caracteres | 200 id_registro, resultado score/fontes/bruto | 400; 502/503 motor | `verificarTexto` |

## public-certificados

Fonte: [`public-certificados.routes.js`](../../src/api/routes/public-certificados.routes.js).

| Método e path | AUTH / ROLE / condição | Entrada | Saída | Principais erros | Responsabilidade (handler) |
| --- | --- | --- | --- | --- | --- |
| `POST /api/public/certificados/validar-arquivo` | Público | multipart um arquivo, sem campos extras | 200 resultado e certificado público se reconhecido | 400; 413; 422; 429 | `validarArquivo` |
| `GET /api/public/certificados/:codigo` | Público | codigo | 200 resultado e certificado público se encontrado | 400 comprimento; 429; formato desconhecido dá NAO_ENCONTRADO | `validarCodigo` |

## questoes

Fonte: [`questoes.routes.js`](../../src/api/routes/questoes.routes.js).

| Método e path | AUTH / ROLE / condição | Entrada | Saída | Principais erros | Responsabilidade (handler) |
| --- | --- | --- | --- | --- | --- |
| `POST /api/turmas/:id_turma/questionarios` | Gestor, turma editável | id_turma; titulo,tipo; descricao/ativo/id_modulo/ordem opcionais | 201 questionario | 400; 404; 409 aula/ENCERRADA | `criarQuestionario` |
| `PATCH /api/questionarios/:id_questionario` | Gestor, turma editável | id_questionario; campos parciais Questionario | 200 mensagem | 404; 409 histórico/aula/ENCERRADA | `atualizarQuestionario` |
| `DELETE /api/questionarios/:id_questionario` | Gestor, turma editável | id_questionario | 200 mensagem | 404; 409 histórico | `removerQuestionario` |
| `POST /api/questionarios/:id_questionario/perguntas` | Gestor, turma editável | id_questionario; texto_pergunta,ordem,opcoes; tipo_pergunta/pontos opcionais | 201 id_pergunta | 400 opções/gabarito; 404; 409 ENCERRADA | `criarPergunta` |
| `POST /api/perguntas/:id_pergunta/opcoes` | Gestor, turma editável | id_pergunta; texto_opcao,ordem,correta | 201 opcao | 404; 409 histórico/ordem | `criarOpcao` |
| `PATCH /api/opcoes/:id_opcao` | Gestor, turma editável | id_opcao; texto_opcao/ordem/correta | 200 mensagem | 404; 409 histórico/gabarito | `atualizarOpcao` |
| `DELETE /api/opcoes/:id_opcao` | Gestor, turma editável | id_opcao | 200 mensagem | 404; 409 histórico/mínimo/gabarito | `removerOpcao` |
| `GET /api/turmas/:id_turma/questionarios` | Aluno matriculado ou Gestor | id_turma | 200 questionarios; aluno recebe ativos e concluido por tentativa | 403; 404; não bloqueia aluno em ENCERRADA | `listarMetadados` |
| `GET /api/turmas/:id_turma/questionarios/disponivel` | ALUNO matriculado, turma não ENCERRADA | id_turma; query tipo e id_questionario opcionais | 200 questionario com perguntas/opções sem gabarito | 403; 404 inexistente/inativo; 409 tipo legado | `listar` |
| `PATCH /api/perguntas/:id_pergunta` | Gestor, turma editável | id_pergunta; texto_pergunta/tipo_pergunta/ordem/pontos | 200 mensagem | 404; 409 histórico | `atualizarPergunta` |
| `DELETE /api/perguntas/:id_pergunta` | Gestor, turma editável | id_pergunta | 200 mensagem | 404; 409 histórico | `removerPergunta` |
| `POST /api/questionarios/:id_questionario/submissoes` | ALUNO matriculado, turma não ENCERRADA | id_questionario; submission_id UUID, respostas [{id_pergunta,id_opcao}] | 200 resultado com acertos/pontuação/percentual/reutilizada | 400 integridade; 403; 404 inativo; 409 sem perguntas/tipo | `submeter` |
| `GET /api/questionarios/historico` | ALUNO | query id_questionario opcional | 200 tentativas próprias de todos os ciclos, com `ciclo_matricula` | 400 query | `historico` |
| `GET /api/turmas/:id_turma/questionarios/resultados` | Gestor | id_turma | 200 resultados históricos da turma, com ciclo | 403; 404 | `resultados` |

## turmas

Fonte: [`turmas.routes.js`](../../src/api/routes/turmas.routes.js).

| Método e path | AUTH / ROLE / condição | Entrada | Saída | Principais erros | Responsabilidade (handler) |
| --- | --- | --- | --- | --- | --- |
| `GET /api/turmas` | Público | — | 200 array de turmas enriquecidas com curso/professor | 500 | `buscarTodasTurmas` |
| `GET /api/turmas/:id/replicacao-resumo` | ADMIN | id origem | 200 turma, resumo de contagens | 404 origem | `buscarResumoReplicacao` |
| `POST /api/turmas/:id/replicar` | ADMIN | id origem; Idempotency-Key; nome_turma, id_professor, data_inicio, status; data_fim opcional | 201 nova ou 200 reutilizada; turma/resumo/reutilizada | 400; 404; 409 chave divergente/nome/estrutura | `replicarTurma` |
| `GET /api/turmas/:id` | Público | id | 200 turma enriquecida | 400; 404 | `buscarTurmaPorId` |
| `GET /api/turmas/professor/:id` | PROFESSOR com ID próprio; ADMIN não aceito | id professor | 200 turmas | 403 outro ID/papel | `buscarTurmasDoProfessor` |
| `POST /api/turmas` | ADMIN | nome_turma, id_curso, id_professor, data_inicio; data_fim/status opcionais | 201 turma | 400 datas; 404 referência; 409 duplicidade/papel | `criarTurma` |
| `PATCH /api/turmas/:id` | ADMIN | id; subconjunto de nome_turma/id_curso/id_professor/data_inicio/data_fim/status | 200 mensagem + turma | 400; 404; 409 | `atualizarTurma` |
| `DELETE /api/turmas/:id` | ADMIN | id | 204 | 404; 409 matrículas/vínculos | `deletarTurma` |

## usuarios

Fonte: [`usuarios.routes.js`](../../src/api/routes/usuarios.routes.js).

| Método e path | AUTH / ROLE / condição | Entrada | Saída | Principais erros | Responsabilidade (handler) |
| --- | --- | --- | --- | --- | --- |
| `POST /api/usuarios` | Público | nome_completo, cpf, email, senha; telefone opcional; tipo só ALUNO | 201 usuário sem senha | 400; 409 duplicidade | `criarUsuario` |
| `POST /api/usuarios/verificar-disponibilidade` | Público | email, cpf | 200 email_disponivel, cpf_disponivel | 400 | `verificarDisponibilidadeCadastro` |
| `PATCH /api/usuarios/:id` | Próprio usuário ou ADMIN | id; nome_completo/cpf/email/telefone | 200 mensagem + usuário | 400 campos; 404; 409 | `atualizarUsuario` |
| `PATCH /api/usuarios/:id/senha` | Próprio usuário, inclusive ADMIN | id; senha_atual, nova_senha | 200 mensagem; limpa cookie | 403 outro usuário/senha; 409 repetida | `alterarSenha` |
| `GET /api/usuarios/:id` | Próprio usuário ou ADMIN | id | 200 usuário incluindo CPF, sem hash | 404 | `buscarUsuarioPorId` |
| `GET /api/usuarios` | ADMIN | page,limit | 200 items,page,limit,total; itens incluem CPF | 400; 500 | `buscarTodosUsuarios` |
| `DELETE /api/usuarios/:id` | ADMIN | id | 204 | 404; 409 vínculos/autoexclusão/último ADMIN | `deletarUsuario` |

## Saúde pública e fronteira de staging

| Método e path | AUTH | Input | Output | Erros | Responsabilidade |
| --- | --- | --- | --- | --- | --- |
| GET /healthz | Público | Nenhum | 200 `{status:"ok"}` | — enquanto HTTP vive | Liveness, sem dependências |
| GET /readyz | Público | Nenhum | 200 `{status:"ok"}` | 503 `{status:"degraded"}` | SELECT 1 + acesso barato aos storages |
| GET /api/admin/metrics | ADMIN | Nenhum | processo,HTTP,database/pool,storage,disk,backup | 401;403;500 seguro | Diagnóstico operacional sem secrets/PII |

No staging, Basic Auth do Caddy cobre inclusive cadastro e validação “pública”; `/healthz` e `/readyz` estão excluídos e retornam apenas estado mínimo. Público na matriz significa sem sessão da aplicação, não bypass da borda de staging. O HTML de área privada pode ser servido sem login, mas dados acadêmicos estão atrás das APIs e a UI redireciona por sessão/papel.

## Matriz de autorização

✓ = permitido pelo papel; ✕ = negado; condicionado = depende de identidade/estado/dados. Toda operação continua sujeita a validação, sessão e integridade.

| Ação | Anônimo | Aluno | Professor | Admin |
| --- | --- | --- | --- | --- |
| Catálogo e metadados de turmas | ✓ | ✓ | ✓ | ✓ |
| Cadastro público ALUNO | ✓ | ✓ | ✓ | ✓ |
| Criar professor/admin | ✕ | ✕ | ✕ | ✓ |
| Consultar/editar perfil | ✕ | próprio | próprio | ✓ |
| Alterar senha autenticada | ✕ | própria + senha atual | própria + senha atual | própria + senha atual |
| Listar todos usuários / excluir | ✕ | ✕ | ✕ | condicionado a vínculos |
| CRUD cursos/turmas | ✕ | ✕ | ✕ | condicionado a vínculos/datas |
| Listar /turmas/professor/:id | ✕ | ✕ | próprio ID | ✕ |
| Autoinscrição | ✕ | turma ABERTA | ✕ | ✕ |
| Minha sala virtual | ✕ | ✓ | ✕ | ✕ |
| Consultar matrícula específica | ✕ | própria | turma própria | ✓ |
| Cancelar matrícula | ✕ | própria, sem certificado ativo | ✕ | sem certificado ativo |
| Conteúdos e PDF material | ✕ | matrícula ativa; turma não encerrada | turma própria | ✓ |
| Enviar/substituir PDF de material | ✕ | ✕ | turma própria editável | turma editável |
| Criar/editar módulo/conteúdo | ✕ | ✕ | turma própria editável | turma editável |
| Excluir estrutura | ✕ | ✕ | turma própria, editável e sem vínculos impeditivos | editável e sem vínculos impeditivos |
| Registrar progresso | ✕ | próprio, matrícula ativa, turma não encerrada | ✕ | ✕ |
| Acompanhar progresso/resultados | ✕ | ✕ | turma própria | ✓ |
| Lançar nota/situação | ✕ | ✕ | turma própria e gates acadêmicos | gates acadêmicos |
| Criar/editar questionário/pergunta/opção | ✕ | ✕ | turma própria editável/histórico | editável/histórico |
| Metadados de avaliações | ✕ | matrícula não cancelada; inclui encerrada | turma própria | ✓ |
| Abrir questionário respondível | ✕ | ativo, matrícula, não encerrada | ✕ | ✕ |
| Submeter tentativa | ✕ | próprio, questionário disponível | ✕ | ✕ |
| Histórico individual de tentativas | ✕ | próprio | ✕ | ✕ |
| Resumir/replicar turma | ✕ | ✕ | ✕ | ✓ |
| Emitir certificado | ✕ | ✕ | turma própria + APROVADO | APROVADO |
| Meus certificados | ✕ | próprios | ✕ | ✕ |
| Download certificado | ✕ | próprio | turma própria | ✓ |
| Revogar certificado | ✕ | ✕ | ✕ | ✓ |
| Validar código/arquivo de certificado | ✓ | ✓ | ✓ | ✓ |
| Comparação de dois textos legada | ✕ | flag ativa | ✕ | ✕ |
| Detector contextual/incremental/indexado | ✕ | flag ativa | flag ativa | flag ativa |
| Status/reload índice | ✕ | ✕ | ✕ | flag ativa |
| Saúde detalhada | ✕ | ✕ | ✕ | ✓ |
| Backup/restore | ✕ | ✕ | ✕ | ✕ via API; operador usa shell |

**Evidências:** checkRole/checkUserPermission/checkProfessorPermission; academic-access.service; autorizarLeitura em conteudos.controller; listar/listarMetadados/submeter em questoes; autorizarEmissao/obterDownload/revogar em certificate.service. Detalhes dos bloqueios de negócio: [RN](02-business-rules.md).

## Rotas órfãs e contratos parciais

- Editar/excluir pergunta e manter opções têm backend, mas não foi encontrada UX completa na página professor-turma: há criação de pergunta com duas opções e gerenciamento de metadados de questionário.
- Similaridade indexada e status/reload do corpus têm rotas e testes; busca dos consumidores no frontend atual não encontrou chamadas correspondentes. Não declarar recurso indisponível no backend por ausência de botão.
- A rota respondível é ALUNO; não há endpoint de leitura docente de questionário completo com perguntas/gabarito para alimentar editor existente. Isso limita onboarding da autoria.
- Helpers de cadastro/envio de e-mail em `api.js` passam por authenticatedFetch, que exige obter CSRF para mutações; páginas públicas usam fetch direto. Esses helpers não devem ser tomados como comprovação de fluxo público funcional se usados isoladamente. O transporte central agora tolera 204, JSON inválido/ausente e falha de rede sem propagar mensagens técnicas.
- `RESPOSTA_CURTA` e `Q_Respostas.resposta_texto` não têm fluxo atual integrado. RETIDO passou a ter lifecycle e collector explícito no Goal 07. Páginas institucionais são estáticas, sem CMS no backend.
- Paginação é aplicada a usuários, turmas, matrículas por turma, histórico de tentativas e resultados (`page`, `limit`, default 50, máximo 100). Cursos, estrutura de uma turma e histórico de versões de um certificado permanecem integrais por cardinalidade/necessidade da UI.


## Goal 02 consolidado — contratos acadêmicos

- POST/PATCH de questionário aceita `prova_final` booleano; false persiste NULL, true persiste 1. Apenas PROVA; única por turma (409 PROVA_FINAL_DUPLICADA); histórico impede reclassificação. Ownership professor/ADMIN permanece.
- GET metadados de questionários para aluno inclui `prova_final`, `bloqueada`, `requisitos` (contagens, progresso_para_prova visual, prova_liberada, prova_final_aprovada, elegivel_aprovacao, status_aprovacao). Final só aparece com concluido verdadeiro se há prova >=75. Não retorna perguntas/gabarito.
- GET respondível de PROVA FINAL abaixo de 80% retorna 409 PROVA_FINAL_BLOQUEADA antes de perguntas/opções. Nova submissão revalida a mesma regra na transação; idempotência de tentativa já existente preservada.
- PUT progresso e POST submissão final avaliam aprovação automática; respostas trazem requisitos. Submissão inclui prova_final/requisito_prova_atendido e percentual calculado pelo servidor, não enviado pelo cliente.
- PATCH APROVADO requer conteúdos exatos e prova final >=75, com 409 CONTEUDOS_PENDENTES/PROVA_FINAL_PENDENTE; não exige nota_final. REPROVADO continua manual com nota/conclusão.
- Nova emissão requer APROVADO + conclusão + prova final ativa >=75. Falha retorna 409 antes de PDF/arquivo/INSERT. ENCERRADA permite emissão e continua recusando novas provas/progresso. Documentos existentes são reutilizados sem revogação automática.

### Contrato de reemissão e histórico (Goal 03)

Body exclusivo: `{"motivo":"Correção do nome do participante"}`. Identidade, versão, status, aluno/turma, hash e storage são definidos pelo servidor. POST usa autenticação e CSRF existentes; ADMIN é conferido também no serviço. A versão-alvo deve ser a última: reenvio depois de sucesso retorna 409, inclusive com outro motivo. Consulte o histórico para reconciliar resposta perdida; não envie automaticamente a solicitação ao ID sucessor. Não há contrato de Idempotency-Key para esta operação.

Respostas privadas incluem versão, predecessor e quem/quando/motivo de emissão, revogação e reemissão. Não serializam snapshot_json/CPF/storage/hash. Respostas públicas incluem versão e continuam identificando o documento exato pelo código ou hash; não revelam o código sucessor nem motivos internos. Download e histórico autorizam aluno dono, professor atual da turma ou ADMIN, inclusive para REVOGADO.


## Atualização — Goal 06

POST/PATCH/DELETE de módulos, conteúdos, questionários, perguntas e opções, além de upload/substituição de PDF, revalidam ownership/status na transação de escrita. O controller passa `req.user`; prechecks não autorizam a persistência. Mantidos 401/403/404/409 e códigos históricos. PATCH de matrícula revalida o professor atual. A UI remove autoria e atualiza contexto após rejeição 403/encerramento.

Contrato, inventário e evidências: [GOAL_06_ATOMIC_ACADEMIC_AUTHORIZATION.md](goals/GOAL_06_ATOMIC_ACADEMIC_AUTHORIZATION.md).

## Storage e reconciliação — Goal 07

Downloads privados autenticados de material/certificado com bytes indisponíveis respondem 503 ARQUIVO_INDISPONIVEL, sem ENOENT ou path interno. Autenticidade pública por SHA continua independente da disponibilidade da cópia local. Nenhuma rota de collector foi exposta. [Contrato, inventário e evidências](goals/GOAL_07_STORAGE_DATABASE_INTEGRITY.md).

## Contrato mínimo de erro — Goal 09

- Erro de domínio/autorização/conflito preserva status 4xx, mensagem específica segura e `code` quando já existente.
- Erro inesperado usa 500 com `error: "Erro interno do servidor."`; pontos migrados podem manter `mensagem` ou `message` com o mesmo texto como alias transitório.
- Recurso privado existente com bytes indisponíveis mantém 503; 404 continua reservado a recurso inexistente.
- `/healthz` é liveness; `/readyz` é readiness; ambos retornam somente `status`. `/api/health` e `/api/admin/metrics` exigem ADMIN.
- O frontend reconhece `error`, `mensagem` e `message` durante a migração. Formatos históricos de sucesso (array direto e envelopes de domínio) foram preservados para evitar quebra ampla; por isso D-24 permanece PARCIAL.
