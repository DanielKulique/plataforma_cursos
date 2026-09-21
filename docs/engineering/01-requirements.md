> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../index.md).

# Requisitos funcionais e não funcionais

Catálogo do comportamento observado, sem compromisso de produção. RF com dependência externa permanece condicionado a ela. Evidências citam implementação e testes existentes; presença de teste não implica execução nesta data. Ver [registro de validação](08-testing-quality.md).

## Requisitos funcionais

### RF-001 — Consultar páginas e catálogo

**Descrição:** Consultar páginas e catálogo por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** Visitante e autenticados. **Pré-condições:** Nenhuma sessão necessária.

**Fluxo principal:** Abrir páginas institucionais, consultar cursos/turmas e selecionar oferta. **Pós-condições:** Metadados públicos exibidos.

**Regras:** RN-007.

**Evidência:** `GET /api/cursos; GET /api/turmas`; `cursos.models.js; turmas.models.js; script.js`; teste `src/__tests__/integration/cursos-turmas.integration.test.js`.

### RF-002 — Cadastrar aluno

**Descrição:** Cadastrar aluno por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** Visitante. **Pré-condições:** CPF/e-mail disponíveis e senha válida.

**Fluxo principal:** Normalizar e validar entrada; inserir usuário ALUNO e sua verificação pendente na mesma transação; após o commit, solicitar o envio do código. **Pós-condições:** Usuário e estado pendente persistidos atomicamente; falha externa de envio não remove a conta e permite reenvio.

**Regras:** RN-001, RN-002.

**Evidência:** `POST /api/usuarios`; `usuarios.controller.js; usuarios.models.js`; testes `src/__tests__/usuarios.controller.test.js`, `src/__tests__/goal4.models.test.js` e `src/__tests__/integration/auth.integration.test.js`.

### RF-003 — Verificar disponibilidade cadastral

**Descrição:** Verificar disponibilidade cadastral por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** Visitante. **Pré-condições:** E-mail e CPF com formato válido.

**Fluxo principal:** Consultar existência e retornar dois indicadores. **Pós-condições:** Disponibilidade informada, sem reserva.

**Regras:** RN-001.

**Evidência:** `POST /api/usuarios/verificar-disponibilidade`; `usuarios.models.js:verificarDisponibilidade`; teste `src/__tests__/usuarios.controller.test.js`.

### RF-004 — Enviar código de e-mail

**Descrição:** Enviar código de e-mail por meio do fluxo existente. **Estado:** IMPLEMENTADO; entrega real depende do provedor.

**Atores:** Visitante/usuário. **Pré-condições:** E-mail válido; resposta pública não confirma se a conta existe.

**Fluxo principal:** Sob lock, gerar/substituir código somente para conta pendente e solicitar envio após commit. Conta inexistente ou já verificada recebe a mesma aceitação pública sem emissão. **Pós-condições:** Verificação pendente mantém validade configurável; conta confirmada nunca volta a pendente.

**Regras:** RN-002.

**Evidência:** `POST /api/auth/enviar-codigo-verificacao`; `auth.models.js; email.service.js; emailVerificationRateLimit.middleware.js`; testes `src/__tests__/auth.model.test.js`, `src/__tests__/email.service.test.js` e `src/__tests__/identity-email-flow.routes.test.js`.

### RF-005 — Confirmar e-mail

**Descrição:** Confirmar e-mail por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** Visitante/usuário. **Pré-condições:** Código gerado e não expirado.

**Fluxo principal:** Sob lock, verificar formato, expiração e igualdade do código e marcar verificado. Limites por IP e identidade restringem tentativas repetidas. **Pós-condições:** Registro confirmado de forma idempotente; já verificado retorna sucesso.

**Regras:** RN-002.

**Evidência:** `POST /api/auth/verificar-codigo-email`; `auth.models.js:verificarCodigoEmail`; teste `src/__tests__/auth.model.test.js`.

### RF-006 — Autenticar

**Descrição:** Autenticar por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** Todos os usuários. **Pré-condições:** Conta e senha corretas e verificação explicitamente confirmada.

**Fluxo principal:** Comparar bcrypt, criar JWT/cookie e devolver usuário/CSRF. **Pós-condições:** Sessão disponível ao navegador.

**Regras:** RN-002, RN-003.

**Evidência:** `POST /api/auth/login`; `auth.controller.js; auth.models.js; session.js`; teste `src/__tests__/integration/mvp-security.integration.test.js`.

### RF-007 — Consultar sessão e CSRF

**Descrição:** Consultar sessão e CSRF por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** Autenticados. **Pré-condições:** Token vigente e usuário existente.

**Fluxo principal:** Consultar versão/papel no banco e devolver perfil ou CSRF. **Pós-condições:** Frontend resolve sessão e pode proteger mutações.

**Regras:** RN-003.

**Evidência:** `GET /api/auth/me; GET /api/auth/csrf`; `checkAuth.middleware.js; auth.controller.js`; teste `src/__tests__/session.frontend.test.js`.

### RF-008 — Encerrar sessões

**Descrição:** Encerrar sessões por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** Autenticados. **Pré-condições:** Sessão válida e CSRF para cookie.

**Fluxo principal:** Incrementar versão e limpar cookie. **Pós-condições:** Tokens anteriores invalidados globalmente.

**Regras:** RN-004.

**Evidência:** `POST /api/auth/logout`; `auth.models.js:invalidarSessoes`; teste `src/__tests__/integration/mvp-security.integration.test.js`.

### RF-009 — Solicitar recuperação

**Descrição:** Solicitar recuperação por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** Visitante. **Pré-condições:** E-mail válido.

**Fluxo principal:** Criar token hash se conta existe e tentar enviar link. **Pós-condições:** Resposta 202 indistinguível; entrega externa condicionada.

**Regras:** RN-005.

**Evidência:** `POST /api/auth/recuperar-senha`; `auth.controller.js; auth.models.js; email.service.js`; teste `src/__tests__/integration/mvp-security.integration.test.js`.

### RF-010 — Redefinir senha

**Descrição:** Redefinir senha por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** Visitante. **Pré-condições:** Token válido não usado e senha forte.

**Fluxo principal:** Bloquear token, trocar hash, consumir tokens e invalidar sessões. **Pós-condições:** Nova senha vigente.

**Regras:** RN-004, RN-005.

**Evidência:** `POST /api/auth/redefinir-senha`; `auth.models.js:redefinirSenha`; teste `src/__tests__/integration/mvp-security.integration.test.js`.

### RF-011 — Manter próprio perfil e senha

**Descrição:** Manter próprio perfil e senha por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** Autenticados; ADMIN para perfil de terceiros. **Pré-condições:** Ownership; senha atual para troca.

**Fluxo principal:** Consultar/editar campos permitidos ou trocar própria senha. **Pós-condições:** Perfil alterado; troca exige novo login.

**Regras:** RN-001, RN-004.

**Evidência:** `GET/PATCH /api/usuarios/:id; PATCH /api/usuarios/:id/senha`; `usuarios.models.js`; teste `src/__tests__/usuarios.controller.test.js`.

### RF-012 — Administrar usuários

**Descrição:** Administrar usuários por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** ADMIN. **Pré-condições:** Sessão e integridade de vínculos.

**Fluxo principal:** Listar/criar/editar/excluir com validação de papéis. **Pós-condições:** Cadastro global atualizado ou conflito explícito.

**Regras:** RN-001, RN-006.

**Evidência:** `GET/POST /api/admin/usuarios; GET/PATCH/DELETE /api/admin/usuarios/:id`; `usuarios.models.js`; teste `src/__tests__/integration/goal4-admin.integration.test.js`.

### RF-013 — Administrar cursos

**Descrição:** Administrar cursos por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** ADMIN. **Pré-condições:** Nome/carga válidos e vínculos compatíveis.

**Fluxo principal:** Criar, substituir dados ou excluir curso sem turmas. **Pós-condições:** Oferta persistida.

**Regras:** RN-007, RN-024.

**Evidência:** `POST /api/cursos; PUT/DELETE /api/cursos/:id`; `cursos.models.js`; teste `src/__tests__/integration/goal4-admin.integration.test.js`.

### RF-014 — Administrar turmas e estados

**Descrição:** Administrar turmas e estados por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** ADMIN. **Pré-condições:** Curso/professor válidos, datas consistentes.

**Fluxo principal:** Criar/editar turma ou remover turma sem matrículas. **Pós-condições:** Oferta, responsável e disponibilidade atualizados.

**Regras:** RN-007, RN-008, RN-024.

**Evidência:** `POST /api/turmas; PATCH/DELETE /api/turmas/:id`; `turmas.models.js`; teste `src/__tests__/integration/cursos-turmas.integration.test.js`.

### RF-015 — Consultar turmas atribuídas

**Descrição:** Consultar turmas atribuídas por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** PROFESSOR. **Pré-condições:** ID consultado igual ao usuário logado.

**Fluxo principal:** Listar turmas e totais de matrículas não canceladas. **Pós-condições:** Painel docente abastecido.

**Regras:** RN-011, RN-013.

**Evidência:** `GET /api/turmas/professor/:id`; `turmas.controller.js; turmas.models.js`; teste `src/__tests__/turmas.controller.test.js`.

### RF-016 — Matricular ou reativar

**Descrição:** Matricular ou reativar por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** ALUNO. **Pré-condições:** Turma ABERTA.

**Fluxo principal:** Bloquear turma e vínculo; inserir no ciclo 1 ou reativar somente CANCELADO, incrementando uma vez o ciclo, zerando nota/progresso atual e preservando tentativas históricas. **Pós-condições:** Matrícula CURSANDO na turma ABERTA, com ciclo explícito e estado acadêmico atual inicial.

**Regras:** RN-009, RN-010.

**Evidência:** `POST /api/matriculas`; `matricula.models.js`; testes `integration/matriculas.integration.test.js` e `integration/enrollment-lifecycle.integration.test.js`.

### RF-017 — Consultar matrícula e sala virtual

**Descrição:** Consultar matrícula e sala virtual por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** ALUNO; responsáveis conforme rota. **Pré-condições:** Sessão e escopo autorizado.

**Fluxo principal:** Consultar dados e derivar progresso; sala filtra canceladas/encerradas. **Pós-condições:** Participação atual e turmas acessíveis exibidas.

**Regras:** RN-008, RN-011, RN-021.

**Evidência:** `GET /api/matriculas/minha-sala; GET /api/matriculas/:id; GET /api/matriculas/aluno/:id`; `matricula.models.js`; teste `src/__tests__/integration/goal3-fluxos.integration.test.js`.

### RF-018 — Cancelar matrícula

**Descrição:** Cancelar matrícula por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** ALUNO dono ou ADMIN. **Pré-condições:** Matrícula existente sem certificado ativo.

**Fluxo principal:** Atualizar status mantendo registro. **Pós-condições:** Matrícula CANCELADO e acesso acadêmico negado.

**Regras:** RN-011, RN-012.

**Evidência:** `DELETE /api/matriculas/:id`; `matricula.models.js:cancelarMatricula`; teste `src/__tests__/integration/matriculas.integration.test.js`.

### RF-019 — Organizar aulas

**Descrição:** Organizar aulas por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** Professor responsável ou ADMIN. **Pré-condições:** Turma editável; ordem livre.

**Fluxo principal:** Criar/editar módulo; excluir somente sem conteúdos/avaliações. **Pós-condições:** Aula persistida e ordenada.

**Regras:** RN-013, RN-014, RN-015, RN-024.

**Evidência:** `POST /api/turmas/:id_turma/modulos; PATCH/DELETE /api/modulos/:id_modulo`; `conteudos.models.js`; teste `src/__tests__/integration/professor-content-management.integration.test.js`.

### RF-020 — Publicar e manter conteúdos

**Descrição:** Publicar e manter conteúdos por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** Professor responsável ou ADMIN. **Pré-condições:** Turma editável; referência e módulo válidos.

**Fluxo principal:** Criar/editar/remover conteúdo conforme tipo e histórico. **Pós-condições:** Material disponível aos autorizados.

**Regras:** RN-013, RN-014, RN-015, RN-016, RN-024.

**Evidência:** `POST /api/turmas/:id_turma/conteudos; PATCH/DELETE /api/conteudos/:id_conteudo`; `conteudos.models.js`; teste `src/__tests__/integration/professor-content-management.integration.test.js`.

### RF-021 — Percorrer sala por aulas

**Descrição:** Percorrer sala por aulas por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** ALUNO matriculado. **Pré-condições:** Turma não encerrada.

**Fluxo principal:** Combinar módulos, conteúdos e avaliações; filtrar e abrir item. **Pós-condições:** Navegação e resumo por aula sem pré-requisito sequencial.

**Regras:** RN-014, RN-017, RN-022.

**Evidência:** `GET /api/turmas/:id_turma/conteudos; GET /api/turmas/:id_turma/questionarios`; `sala-aula.js; learning-path.js`; teste `src/__tests__/learning-path.frontend.test.js`.

### RF-022 — Ler material PDF privado

**Descrição:** Ler material PDF privado por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** ALUNO matriculado; professor responsável; ADMIN. **Pré-condições:** PDF existente e escopo de leitura permitido.

**Fluxo principal:** Autorizar conteúdo, resolver caminho seguro e enviar arquivo. **Pós-condições:** Bytes servidos com cache privado.

**Regras:** RN-017, RN-018.

**Evidência:** `GET /api/conteudos/:id_conteudo/material`; `conteudos.controller.js:material`; teste `src/__tests__/integration/pdf-upload.integration.test.js`.

### RF-023 — Enviar PDF de material

**Descrição:** Enviar PDF de material por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** Professor responsável ou ADMIN. **Pré-condições:** Turma editável e arquivo válido.

**Fluxo principal:** Receber multipart, validar assinatura, gravar UUID, hash e vínculo. **Pós-condições:** Conteúdo PDF publicado ou limpeza compensatória.

**Regras:** RN-013, RN-018, RN-019.

**Evidência:** `POST /api/turmas/:id_turma/conteudos/pdf`; `material-upload.service.js; conteudos.models.js`; teste `src/__tests__/integration/pdf-upload.integration.test.js`.

### RF-024 — Substituir PDF

**Descrição:** Substituir PDF por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** Professor responsável ou ADMIN. **Pré-condições:** Conteúdo existente e turma editável.

**Fluxo principal:** Gravar novo ativo e atualizar referência sem apagar anterior. **Pós-condições:** Novo PDF associado; cópias anteriores preservadas.

**Regras:** RN-018, RN-019.

**Evidência:** `PUT /api/conteudos/:id_conteudo/pdf`; `conteudos.models.js:substituirPdfComArquivo`; teste `src/__tests__/integration/pdf-upload.integration.test.js`.

### RF-025 — Registrar progresso

**Descrição:** Registrar progresso por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** ALUNO. **Pré-condições:** Matrícula não cancelada, conteúdo e turma ativa para estudo.

**Fluxo principal:** Informar INICIADO/CONCLUIDO, upsert e recalcular percentual. **Pós-condições:** Conclusão monotônica e percentual atualizado.

**Regras:** RN-020, RN-021.

**Evidência:** `PUT /api/conteudos/:id_conteudo/progresso`; `conteudos.models.js:registrarProgresso`; teste `src/__tests__/integration/goal3-fluxos.integration.test.js`.

### RF-026 — Acompanhar turma

**Descrição:** Acompanhar turma por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** Professor responsável ou ADMIN. **Pré-condições:** Ownership.

**Fluxo principal:** Listar matrículas, progresso derivado e dados de certificados. **Pós-condições:** Visão acadêmica por aluno.

**Regras:** RN-011, RN-021.

**Evidência:** `GET /api/matriculas/turma/:id_turma; GET /api/turmas/:id_turma/progresso`; `matricula.models.js; conteudos.models.js`; teste `src/__tests__/integration/goal3-fluxos.integration.test.js`.

### RF-027 — Lançar nota e situação

**Descrição:** Lançar nota e situação por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** Professor responsável ou ADMIN. **Pré-condições:** Matrícula; contagens exatas (`total > 0 && concluidos === total`); prova final >=75 para APROVADO; nota manual para REPROVADO.

**Fluxo principal:** Concluir conteúdos e prova final >=75 do ciclo atual aprova automaticamente; PATCH manual revalida esses requisitos. CANCELADO não aceita transição de status por PATCH e exige rematrícula oficial. Nota 0–10 permanece opcional para APROVADO, sem conversão do percentual. **Pós-condições:** Situação consistente, sem reprovação automática ou bypass do ciclo.

**Regras:** RN-012, RN-023.

**Evidência:** `PATCH /api/matriculas/:id`; `matricula.models.js:atualizarMatricula`; teste `src/__tests__/integration/goal3-fluxos.integration.test.js`.

### RF-028 — Manter questionários

**Descrição:** Manter questionários por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** Professor responsável ou ADMIN. **Pré-condições:** Turma editável; regras de histórico.

**Fluxo principal:** Criar/editar/ativar/inativar/excluir questionário. **Pós-condições:** Avaliação organizada por aula ou final.

**Regras:** RN-013, RN-014, RN-025, RN-028.

**Evidência:** `POST /api/turmas/:id_turma/questionarios; PATCH/DELETE /api/questionarios/:id_questionario`; `questoes.models.js`; teste `src/__tests__/integration/professor-content-management.integration.test.js`.

### RF-029 — Criar e manter perguntas

**Descrição:** Criar e manter perguntas por meio do fluxo existente. **Estado:** PARCIALMENTE IMPLEMENTADO (UX/integração).

**Atores:** Professor responsável ou ADMIN. **Pré-condições:** Questionário próprio; edição/exclusão sem respostas.

**Fluxo principal:** Criar pergunta com opções ou editar/remover por ID. **Pós-condições:** Pergunta objetiva persistida; UX de edição parcial.

**Regras:** RN-026, RN-028.

**Evidência:** `POST /api/questionarios/:id_questionario/perguntas; PATCH/DELETE /api/perguntas/:id_pergunta`; `questoes.models.js`; teste `src/__tests__/integration/goal3-fluxos.integration.test.js`.

### RF-030 — Manter opções e gabarito

**Descrição:** Manter opções e gabarito por meio do fluxo existente. **Estado:** PARCIALMENTE IMPLEMENTADO (UX/integração).

**Atores:** Professor responsável ou ADMIN. **Pré-condições:** Pergunta própria sem respostas.

**Fluxo principal:** Inserir/editar/excluir opção com conservação de gabarito. **Pós-condições:** Alternativas consistentes; recurso majoritariamente API.

**Regras:** RN-026, RN-027.

**Evidência:** `POST /api/perguntas/:id_pergunta/opcoes; PATCH/DELETE /api/opcoes/:id_opcao`; `questoes.models.js`; teste `src/__tests__/integration/goal3-fluxos.integration.test.js`.

### RF-031 — Abrir avaliação respondível

**Descrição:** Abrir avaliação respondível por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** ALUNO. **Pré-condições:** Questionário ativo, matrícula e turma não encerrada.

**Fluxo principal:** Selecionar tipo/ID e carregar perguntas sem gabarito. **Pós-condições:** Formulário objetivo disponível.

**Regras:** RN-025, RN-026.

**Evidência:** `GET /api/turmas/:id_turma/questionarios/disponivel`; `questoes.models.js:listarAluno`; teste `src/__tests__/questionario.frontend.test.js`.

### RF-032 — Submeter e corrigir avaliação

**Descrição:** Submeter e corrigir avaliação por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** ALUNO. **Pré-condições:** Questionário disponível e respostas integrais.

**Fluxo principal:** Validar escopo, deduplicar chave, calcular e persistir resultado. **Pós-condições:** Tentativa finalizada, sem alterar nota final da matrícula.

**Regras:** RN-029, RN-030, RN-031.

**Evidência:** `POST /api/questionarios/:id_questionario/submissoes`; `questoes.models.js:submeter`; teste `src/__tests__/integration/goal3-fluxos.integration.test.js`.

### RF-033 — Consultar tentativas e resultados

**Descrição:** Consultar tentativas e resultados por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** ALUNO próprio; professor responsável; ADMIN. **Pré-condições:** Sessão e escopo.

**Fluxo principal:** Buscar histórico individual ou resultados da turma. **Pós-condições:** Histórico preservado apresentado.

**Regras:** RN-032.

**Evidência:** `GET /api/questionarios/historico; GET /api/turmas/:id_turma/questionarios/resultados`; `questoes.models.js`; teste `src/__tests__/integration/goal3-fluxos.integration.test.js`.

### RF-034 — Resumir e replicar turma

**Descrição:** Resumir e replicar turma por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** ADMIN. **Pré-condições:** Origem existente, destino válido, Idempotency-Key.

**Fluxo principal:** Consultar contagens; bloquear/copy/remap e registrar hash. **Pós-condições:** Nova estrutura independente sem dados de alunos.

**Regras:** RN-033, RN-034, RN-019.

**Evidência:** `GET /api/turmas/:id/replicacao-resumo; POST /api/turmas/:id/replicar`; `turma-replication.service.js`; teste `src/__tests__/integration/turma-replication.integration.test.js`.

### RF-035 — Emitir certificado

**Descrição:** Emitir certificado por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** Professor responsável ou ADMIN. **Pré-condições:** Matrícula APROVADO, conclusão exata atual e prova final ativa >=75 para nova emissão; turma ENCERRADA é permitida.

**Fluxo principal:** Bloquear contexto, reutilizar somente certificado ATIVO ou revalidar os requisitos do Goal 02 antes de gerar v1 com PDF/QR/hash próprio. Histórico revogado retorna 409 e exige ADMIN no endpoint de reemissão. Pendência retorna 409 sem PDF/registro; novo conteúdo não rebaixa APROVADO automaticamente. **Pós-condições:** Identidade única por versão, no máximo um ATIVO por aluno/turma e arquivo final privado.

**Regras:** RN-035, RN-036.

**Evidência:** `POST /api/certificados/matriculas/:id_matricula/emitir`; `certificate.service.js; certificados.models.js`; teste `src/__tests__/integration/certificados.integration.test.js`.

### RF-036 — Consultar e baixar certificado

**Descrição:** Consultar e baixar certificado por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** ALUNO próprio; professor responsável; ADMIN. **Pré-condições:** Certificado e arquivo existentes.

**Fluxo principal:** Listar próprios ou autorizar e transmitir PDF. **Pós-condições:** Documento original entregue.

**Regras:** RN-037.

**Evidência:** `GET /api/certificados/meus; GET /api/certificados/:id_certificado/pdf`; `certificate.service.js; certificados.controller.js`; teste `src/__tests__/integration/certificados.integration.test.js`.

### RF-037 — Revogar certificado

**Descrição:** Revogar certificado por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** ADMIN. **Pré-condições:** Certificado existente e motivo válido.

**Fluxo principal:** Atualizar estado e dados de revogação. **Pós-condições:** Validação passa a REVOGADO mantendo PDF.

**Regras:** RN-038.

**Evidência:** `POST /api/certificados/:id_certificado/revogar`; `certificate.service.js`; teste `src/__tests__/integration/certificados.integration.test.js`.

### RF-038 — Validar certificado por código

**Descrição:** Validar certificado por código por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** Qualquer visitante. **Pré-condições:** Código informado; limite de chamadas.

**Fluxo principal:** Normalizar código e consultar registro. **Pós-condições:** Resultado e dados públicos mínimos.

**Regras:** RN-039.

**Evidência:** `GET /api/public/certificados/:codigo`; `certificate.service.js:validarPorCodigo`; teste `src/__tests__/integration/certificados.integration.test.js`.

### RF-039 — Validar arquivo de certificado

**Descrição:** Validar arquivo de certificado por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** Qualquer visitante. **Pré-condições:** PDF no limite permitido.

**Fluxo principal:** Receber em memória, calcular SHA-256 e comparar; zerar buffer. **Pós-condições:** Autenticidade dos bytes e revogação informadas.

**Regras:** RN-039.

**Evidência:** `POST /api/public/certificados/validar-arquivo`; `certificate.service.js:validarArquivo`; teste `src/__tests__/integration/certificados.integration.test.js`.

### RF-040 — Consultar capacidades

**Descrição:** Consultar capacidades por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** Autenticados. **Pré-condições:** Sessão.

**Fluxo principal:** Ler feature flag. **Pós-condições:** Interface informa detector experimental disponível/desligado.

**Regras:** RN-040.

**Evidência:** `GET /api/capabilities`; `capabilities.controller.js`; teste `src/__tests__/integration/mvp-security.integration.test.js`.

### RF-041 — Analisar textos pelo gateway contextual

**Descrição:** Analisar textos pelo gateway contextual por meio do fluxo existente. **Estado:** PARCIALMENTE IMPLEMENTADO (UX/integração).

**Atores:** ALUNO/PROFESSOR/ADMIN. **Pré-condições:** Flag ativa e motor disponível.

**Fluxo principal:** Validar documento/fonte, chamar contrato externo, salvar resumo. **Pós-condições:** Resultado validado e identificador de análise.

**Regras:** RN-040.

**Evidência:** `POST /api/analises/contextual; POST /api/analises/contextual/documento`; `detector-contextual.service.js; analise-contextual.model.js`; teste `src/__tests__/integration/detector-contextual.test.js`.

### RF-042 — Analisar segmento incremental

**Descrição:** Analisar segmento incremental por meio do fluxo existente. **Estado:** PARCIALMENTE IMPLEMENTADO (UX/integração).

**Atores:** ALUNO/PROFESSOR/ADMIN. **Pré-condições:** Flag ativa e segmento versionado.

**Fluxo principal:** Enviar segmento/contexto, aceitar resposta compatível, descartar obsoletas na UI. **Pós-condições:** Feedback sem histórico local do segmento.

**Regras:** RN-040.

**Evidência:** `POST /api/analises/contextual/segmento`; `detector-contextual.service.js; incremental-editor.js`; teste `src/__tests__/incremental-editor.frontend.test.js`.

### RF-043 — Analisar similaridade indexada

**Descrição:** Analisar similaridade indexada por meio do fluxo existente. **Estado:** PARCIALMENTE IMPLEMENTADO (UX/integração).

**Atores:** ALUNO/PROFESSOR/ADMIN. **Pré-condições:** Flag, motor/corpus/token interno configurados.

**Fluxo principal:** Validar texto/filtros, encaminhar e limitar/validar resposta. **Pós-condições:** Candidatos e métricas sem persistência local; sem UX identificada.

**Regras:** RN-040.

**Evidência:** `POST /api/analises/similaridade`; `indexed-analysis.service.js`; teste `src/__tests__/indexed-analysis.routes.test.js`.

### RF-044 — Administrar índice externo

**Descrição:** Administrar índice externo por meio do fluxo existente. **Estado:** PARCIALMENTE IMPLEMENTADO (UX/integração).

**Atores:** ADMIN. **Pré-condições:** Flag ativa e motor acessível.

**Fluxo principal:** Consultar status ou solicitar reload. **Pós-condições:** Estado do índice externo retornado.

**Regras:** RN-040.

**Evidência:** `GET /api/admin/corpus/index/status; POST /api/admin/corpus/index/reload`; `indexed-analysis.service.js`; teste `src/__tests__/indexed-analysis.routes.test.js`.

### RF-045 — Comparar dois textos pelo fluxo legado

**Descrição:** Comparar dois textos pelo fluxo legado por meio do fluxo existente. **Estado:** LEGADO.

**Atores:** ALUNO. **Pré-condições:** Flag ativa e textos de 10–20000 caracteres.

**Fluxo principal:** Chamar motor antigo e persistir trecho suspeito/score/fontes. **Pós-condições:** Resultado bruto e histórico persistido.

**Regras:** RN-040.

**Evidência:** `POST /api/plagio/analisar`; `plagio.service.js; analise.model.js`; teste `src/__tests__/integration/plagio.test.js`.

### RF-046 — Verificar saúde

**Descrição:** Verificar saúde por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** Operador; ADMIN para diagnóstico. **Pré-condições:** App em execução.

**Fluxo principal:** Consultar SELECT 1 e responder estado. **Pós-condições:** Liveness/readiness parcial de app+banco.

**Regras:** RN-003.

**Evidência:** `GET /healthz; GET /api/health`; `index.js; health.controller.js`; teste `src/__tests__/health.controller.test.js`.

### RF-047 — Executar backup e restauração

**Descrição:** Executar backup e restauração por meio do fluxo existente. **Estado:** IMPLEMENTADO no escopo descrito.

**Atores:** Operador. **Pré-condições:** Acesso shell/Compose; arquivos e confirmação para restore.

**Fluxo principal:** Exportar ou importar banco e volumes; validar formatos/arquivos. **Pós-condições:** Conjunto de recuperação ou dados restaurados.

**Regras:** RN-041.

**Evidência:** `CLI scripts/backup_database.sh; scripts/restore_database.sh`; `scripts/verify_certificate_storage.js`; teste `src/__tests__/certificate.infrastructure.test.js`.

## Requisitos não funcionais observáveis

Não são SLAs prometidos. Estados descrevem mecanismos atuais; recomendações de evolução estão no documento de riscos.

### RNF-001 — Autenticação e sessão

**Descrição:** Cookie HttpOnly, Secure em production, SameSite=Lax; TTL padrão 8 h; versão e papel consultados no banco.

**Estado:** IMPLEMENTADO. **Evidência:** `session.js; checkAuth.middleware.js`.

**Risco/limitação:** Banco indisponível impede autenticação de requisições.

### RNF-002 — Proteção CSRF

**Descrição:** Mutações com cookie exigem X-CSRF-Token vinculado ao JWT e comparação timing-safe.

**Estado:** IMPLEMENTADO. **Evidência:** `checkAuth.middleware.js; auth.js`.

**Risco/limitação:** Endpoints públicos e Bearer não usam essa checagem; login não tem proteção Origin dedicada.

### RNF-003 — Autorização por escopo

**Descrição:** Papéis, próprio usuário, turma, matrícula e certificado conferidos no backend.

**Estado:** IMPLEMENTADO com autorização transacional de autoria (Goal 06). **Evidência:** `middlewares/check*.js; academic-access.service.js; certificate.service.js; src/__tests__/integration/atomic-academic-authorization.integration.test.js`.

**Risco/limitação:** Prechecks não autorizam writes: responsável/estado são revalidados na conexão transacional. Escrita SQL privilegiada externa deve respeitar o mesmo contrato.

### RNF-004 — Proteção de senhas

**Descrição:** Bcrypt custo 10 em cadastro/troca e 12 em reset; validação de força; token de reset hash/expiração/uso único.

**Estado:** IMPLEMENTADO. **Evidência:** `usuarios.models.js; auth.models.js; auth.routes.js`.

**Risco/limitação:** Não há MFA ou política de senhas comprometidas identificada.

### RNF-005 — Contenção de abuso

**Descrição:** Rate limits de login, recuperação/reset, contextual/indexado e certificado público.

**Estado:** PARCIALMENTE IMPLEMENTADO. **Evidência:** `index.js; auth.routes.js; *RateLimit.middleware.js; certificate-rate-limit.service.js`.

**Risco/limitação:** Verificação de e-mail usa caminhos sem o limitador configurado; cadastro/disponibilidade/legado não têm limite específico.

### RNF-006 — XSS e URLs

**Descrição:** DOM de texto nas áreas críticas, allowlist de URL e Helmet CSP sem script inline.

**Estado:** IMPLEMENTADO no escopo auditado. **Evidência:** `security-utils.js; frontend.security.test.js; index.js`.

**Risco/limitação:** Não equivale a pentest; style unsafe-inline e origens externas permanecem.

### RNF-007 — SQL e integridade

**Descrição:** Queries parametrizadas e allowlists para colunas dinâmicas; InnoDB, FK, UNIQUE e alguns CHECK.

**Estado:** IMPLEMENTADO. **Evidência:** `src/api/models; mysql/schema.sql`.

**Risco/limitação:** Regras entre várias linhas/papéis ainda dependem do backend.

### RNF-008 — Transações e rollback

**Descrição:** Matrícula, submissão, replicação, emissão e operações estruturais compostas usam transações.

**Estado:** IMPLEMENTADO. **Evidência:** `models e services respectivos`.

**Risco/limitação:** Arquivo e banco não compartilham transação atômica.

### RNF-009 — Idempotência

**Descrição:** Chaves de tentativa/replicação; certificado com versão única e no máximo um ATIVO por aluno/turma. Reemissão exige versão-alvo atual, com 409 no retry após substituição.

**Estado:** IMPLEMENTADO com semânticas distintas. **Evidência:** `questoes.models.js; turma-replication.service.js; certificate.service.js`.

**Risco/limitação:** Nem toda mutação é idempotente; tentativa não compara hash do payload.

### RNF-010 — Uploads limitados

**Descrição:** JSON 256 KiB; PDF material padrão 20 MiB e certificado público 10 MiB; multipart restrito.

**Estado:** IMPLEMENTADO. **Evidência:** `index.js; material-upload.service.js; public-certificados.routes.js`.

**Risco/limitação:** Magic bytes não substituem parser completo/antivírus; upload público usa memória.

### RNF-011 — Proteção de arquivos

**Descrição:** Storage externo a public, UUID, diretório 0700, arquivo final 0600, download autenticado no domínio privado.

**Estado:** IMPLEMENTADO. **Evidência:** `material-storage.js; certificate-storage.service.js; conteudos.controller.js`.

**Risco/limitação:** Privilégio no host permite alterar arquivo; downloads não recalculam hash.

### RNF-012 — Persistência e restart

**Descrição:** Volumes MySQL, materiais, certificados e Caddy; restart unless-stopped e shutdown do pool.

**Estado:** IMPLEMENTADO na configuração. **Evidência:** `compose.yaml; index.js`.

**Risco/limitação:** Single host continua ponto único de falha; healthcheck não é mecanismo de recuperação integral.

### RNF-013 — TLS e headers

**Descrição:** Caddy termina TLS, comprime e adiciona HSTS; Helmet endurece a aplicação.

**Estado:** IMPLEMENTADO na configuração. **Evidência:** `Caddyfile; Caddyfile.staging; index.js`.

**Risco/limitação:** DNS, portas e certificados ativos não revalidados remotamente nesta auditoria.

### RNF-014 — Configuração portável

**Descrição:** Docker em dois estágios, usuário node, configurações por ambiente, Compose parametrizado.

**Estado:** IMPLEMENTADO. **Evidência:** `Dockerfile; src/config/env.js`.

**Risco/limitação:** Proxy/healthcheck fixam 3000 embora PORT seja configurável; loadEnvironment usa override.

### RNF-015 — Eficiência de banco

**Descrição:** Pool runtime de dez conexões com fila ilimitada; consultas agregadas para acompanhamento.

**Estado:** PARCIALMENTE IMPLEMENTADO. **Evidência:** `database.js; matricula.models.js; conteudos.models.js`.

**Risco/limitação:** Sem paginação generalizada; subconsultas correlacionadas e transações extensas podem limitar escala.

### RNF-016 — Resiliência externa

**Descrição:** Timeouts/cancelamento e validação de contrato de gateways; o cliente HTTP tolera 204, erro sem JSON e falha de rede, descarta detalhes de respostas 5xx e repete somente GET transiente.

**Estado:** IMPLEMENTADO com lacunas. **Evidência:** `detector-contextual.service.js; indexed-analysis.service.js; api.js; api.frontend.test.js`.

**Risco/limitação:** Sem circuit breaker/fila; legado devolve bruto; e-mail não verifica explicitamente retorno de erro do SDK.

### RNF-017 — Responsividade

**Descrição:** CSS por camadas, breakpoints, navegação móvel, tabelas roláveis e salas por aula.

**Estado:** IMPLEMENTADO por evidência estática/histórica. **Evidência:** `css/responsive.css; css/learning-path.css; screenshots`.

**Risco/limitação:** Não houve nova medição visual em browser nesta baseline.

### RNF-018 — Acessibilidade

**Descrição:** Skip links, foco visível, labels, aria-live, progressbar e dialogs.

**Estado:** PARCIALMENTE IMPLEMENTADO. **Evidência:** `sala-aula.html; professor-turma.html; css/base.css`.

**Risco/limitação:** Sem comprovação integral com leitor de tela, contraste calculado ou testes automáticos WCAG.

### RNF-019 — Feedback de UX

**Descrição:** Estados de carregamento/vazio/erro, bloqueio durante gravação e contexto de aula/avaliação; turmas e certificados carregam em paralelo com resultados independentes e retry local de certificados.

**Estado:** IMPLEMENTADO. **Evidência:** `sala-aula.js; sala-virtual.js; academic-dialog.js; sala-virtual.resilience.test.js`.

**Risco/limitação:** Outros carregamentos multiparte permanecem legados e devem ser classificados entre dados críticos e acessórios antes de eventual separação.

### RNF-020 — Manutenibilidade

**Descrição:** Separação por domínios, helpers compartilhados, testes de regressão e convenções de scripts.

**Estado:** PARCIALMENTE IMPLEMENTADO. **Evidência:** `src/api; src/public/js; package.json`.

**Risco/limitação:** Models concentram regras/SQL e frontend de admin/professor é extenso.

### RNF-021 — Testabilidade

**Descrição:** Jest, Supertest, integração MySQL e proteção do banco descartável; limiar global de cobertura 50%.

**Estado:** IMPLEMENTADO. **Evidência:** `package.json; jest.integration.config.js; test_database_safety.js`.

**Risco/limitação:** Muitos testes frontend inspecionam fonte/DOM simulado; não substituem browser.

### RNF-022 — Observabilidade

**Descrição:** Logs JSON com redação, IDs de requisição, healthz público mínimo e diagnóstico ADMIN por componentes, sem mensagem técnica em respostas degradadas.

**Estado:** PARCIALMENTE IMPLEMENTADO. **Evidência:** `logger.js; requestContext.middleware.js; health.controller.js`.

**Risco/limitação:** Sem métricas/alertas/tracing distribuído ou auditoria geral imutável encontrados.

### RNF-023 — Backup

**Descrição:** Dump, materiais, certificados e manifesto SHA-256, com arquivos temporários e validação de formato.

**Estado:** IMPLEMENTADO como ferramenta; PARCIAL na operação. **Evidência:** `backup_database.sh; BACKUP_RESTORE.md`.

**Risco/limitação:** Sem offsite/agendamento/retention demonstrados; snapshot entre recursos não coordenado.

### RNF-024 — Recuperação

**Descrição:** Restore explícito, checagem de formato e reconciliação dos certificados.

**Estado:** PARCIALMENTE IMPLEMENTADO. **Evidência:** `restore_database.sh; verify_certificate_storage.js`.

**Risco/limitação:** Não verifica manifesto automaticamente; RPO/RTO/ensaio completo não medidos.

### RNF-025 — Privacidade técnica

**Descrição:** APIs privadas minimizam campos; validador não expõe CPF/e-mail; logger redige chaves sensíveis.

**Estado:** PARCIALMENTE IMPLEMENTADO. **Evidência:** `certificados.controller.js; certificate.service.js; logger.js`.

**Risco/limitação:** CPF está no PDF; disponibilidade cadastral permite inferir existência; sem política técnica de retenção.

### RNF-026 — Compatibilidade operacional

**Descrição:** Local observado MySQL 8.0; Compose/CI especificam 8.4; módulos ES em browser e CommonJS no servidor.

**Estado:** IMPLEMENTADO com validação limitada. **Evidência:** `package.json; Dockerfile; ci.yml; evidência MySQL`.

**Risco/limitação:** Não há matriz automatizada de navegadores ou paridade total de versões local/entrega.


## Consolidação acadêmica substitutiva — Goal 02 (08/09/2026)

PROVA FINAL é designada explicitamente, única por turma. Abertura e nova submissão exigem >=80% exatos de conteúdos + exercícios ativos realizados; EXERCICIO realizado significa ao menos uma tentativa finalizada, independentemente da nota. A prova exige >=75%; 74,99 falha e não reprova, retries permanecem ilimitados. Conteúdos completos + prova atendida aprovam automaticamente, sem nota/clique docente. Certificado revalida ambos os requisitos e APROVADO. Ver RN-021/023/025/030/035 e [evidências](goals/GOAL_02_ACADEMIC_EXAM_APPROVAL.md).

### Goal 03 — extensão de RF-035/036/037

ADMIN corrige/reemite explicitamente a última versão com motivo de 3–500 caracteres, revalidando o Goal 02. A operação preserva todas as versões anteriores e cria PDF, código, QR, hash e storage próprios. Professor responsável mantém emissão inicial e leitura; não substitui documentos. Aluno vê o ATIVO em destaque e versões anteriores recolhidas. O histórico autorizado preserva downloads e metadados específicos de emissão/revogação/reemissão. Não existe reemissão automática por alteração cadastral, acadêmica, template, login ou deploy.

### Goal 04 — ciclo da matrícula

O vínculo aluno/turma permanece único, mas possui `ciclo_atual` monotônico. A matrícula inicial começa no ciclo 1. Somente `POST /api/matriculas`, pelo próprio aluno e com turma ABERTA, pode reativar CANCELADO; professor e ADMIN recebem 409 ao tentar `CANCELADO → CURSANDO/APROVADO/REPROVADO` pelo PATCH acadêmico. A rematrícula incrementa o ciclo uma vez sob lock, reinicia conteúdo/nota e preserva tentativas/respostas. Exercícios, meta de 80%, prova final >=75, aprovação e certificação consultam exclusivamente `Q_Tentativas.ciclo_matricula = Matriculas.ciclo_atual`; histórico retorna todos os ciclos.
