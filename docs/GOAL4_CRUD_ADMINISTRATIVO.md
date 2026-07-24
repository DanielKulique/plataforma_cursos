# Goal 4 — CRUD administrativo

## Escopo entregue

O painel `/admin.html` administra usuários, cursos e turmas por meio das APIs reais. Cada módulo possui carregamento, listagem, busca ou filtro, estado vazio, criação, edição, confirmação de exclusão e mensagens de sucesso, validação e erro. As listagens são atualizadas após mutações sem recarregar a página inteira.

O frontend cria elementos com APIs seguras do DOM. Não usa `innerHTML`, handlers inline nem scripts inline, e a CSP não foi relaxada.

## Decisões de negócio adotadas

Antes da implementação foram consultados os documentos existentes, especialmente `GOAL2_BANCO_MATRICULA.md` e `GOAL3_FLUXOS_ALUNO_PROFESSOR.md`. Não foi encontrada regra anterior contraditória. As regras abaixo são decisões adotadas para este Goal, e não fatos históricos previamente confirmados:

- exclusão de usuários é física, nunca soft delete;
- autoexclusão administrativa é bloqueada;
- o último `ADMIN` não pode ser rebaixado nem excluído;
- professor com turmas não pode mudar para papel incompatível nem ser excluído;
- aluno com matrícula ou outros vínculos acadêmicos não pode mudar para papel incompatível nem ser excluído;
- usuários com tentativas, respostas, progresso de conteúdo ou análises de plágio também são protegidos contra exclusão;
- registros de verificação de e-mail sem vínculo acadêmico são removidos junto com uma exclusão física válida;
- todas as transições entre `ABERTA`, `FECHADA` e `ENCERRADA` são aceitas. Não existia matriz anterior de transições; os três códigos canônicos continuam sendo o contrato interno.

As decisões de reativação de matrícula e de zerar nota/progresso continuam documentadas no Goal 2 e não foram alteradas neste Goal.

## Contratos principais

### Usuários

- `GET /api/admin/usuarios`
- `GET /api/admin/usuarios/:id`
- `POST /api/admin/usuarios`
- `PATCH /api/admin/usuarios/:id`
- `DELETE /api/admin/usuarios/:id`
- `PATCH /api/usuarios/:id/senha`

As rotas sob `/api/admin` exigem sessão válida e papel `ADMIN` atual consultado no banco. O PATCH administrativo permite apenas `nome_completo`, `cpf`, `email`, `telefone` e `tipo`. Senha não é aceita nesse contrato.

A troca de senha exige que o ID seja o do próprio usuário autenticado, a senha atual esteja correta e a nova senha satisfaça a política de força. Nenhuma resposta contém senha ou hash.

Recuperação de senha e redefinição administrativa permanecem pendentes. Nenhum fluxo parcial de reset foi criado.

### Cursos

- listagem e consulta permanecem públicas para preservar o catálogo;
- criação, edição e exclusão exigem `ADMIN`;
- nome duplicado e curso com turmas retornam `409`;
- curso inexistente retorna `404`.

### Turmas

- `GET /api/turmas` e `GET /api/turmas/:id` incluem `nome_curso` e `nome_professor`;
- criação, edição e exclusão exigem `ADMIN`;
- curso e professor precisam existir, e o usuário associado precisa ter papel atual `PROFESSOR`;
- `data_fim`, quando informada, precisa ser igual ou posterior a `data_inicio`;
- turma com matrícula não pode ser excluída.

## Integridade e HTTP

As alterações de papel e exclusões protegidas usam transações e bloqueios de leitura. Duplicidades, vínculos e invariantes retornam `409`; payloads inválidos retornam `400`; ausência de sessão retorna `401`; papel inadequado retorna `403`; recursos ausentes retornam `404`; falhas inesperadas permanecem `500`.

O banco legado `site_cursos` não é usado pelo runtime e não foi alterado. Os testes de integração deste Goal usam exclusivamente `plataforma_cursos_test`.

## Fora do escopo

Não foram implementados recuperação administrativa de senha, autoria de conteúdo/questionários, alterações no detector de plágio, migração de JWT para cookie ou qualquer atividade do Goal 5.
