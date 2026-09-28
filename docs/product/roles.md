# Perfis e autorização

Cada usuário possui um perfil: ALUNO, PROFESSOR ou ADMIN. A sessão consulta o usuário
no banco em cada requisição; o perfil enviado pelo navegador não concede permissão.

| Ação | ALUNO | PROFESSOR | ADMIN |
| --- | --- | --- | --- |
| Consultar catálogo público | Sim | Sim | Sim |
| Matricular/rematricular a si próprio | Sim, turma ABERTA | Não | Não pelo endpoint de automatrícula |
| Estudar e responder avaliações | Própria matrícula válida | Não como aluno | Não como aluno |
| Ver matrículas | Próprias | Turmas sob sua responsabilidade | Todas |
| Gerenciar aulas, conteúdos e avaliações | Não | Turmas sob sua responsabilidade | Todas as turmas |
| Alterar resultado acadêmico | Não | Próprias turmas, sujeito aos requisitos | Sujeito aos mesmos requisitos |
| Cancelar matrícula | Própria, sem certificado ativo | Não | Sem certificado ativo |
| Gerenciar cursos, turmas e perfis | Não | Não | Sim |
| Replicar turma | Não | Não | Sim |
| Recuperar emissão pendente | Não | Próprias turmas | Sim |
| Revogar ou reemitir certificado | Não | Não | Sim, com motivo |
| Health detalhado e métricas | Não | Não | Sim |

Turma ENCERRADA bloqueia estudo e autoria estrutural, inclusive pelo ADMIN; a emissão
para matrícula elegível continua permitida. As verificações de autoria e estado são repetidas
sob lock na transação, evitando que uma troca de professor autorize uma escrita antiga.

Cadastro público cria somente ALUNO. ADMIN cria outros perfis. O primeiro administrador
é criado pelo [bootstrap operacional](../operations/deployment.md), sem credenciais padrão.
O último ADMIN não pode ser removido ou rebaixado; autoexclusão administrativa é recusada.
Vínculos acadêmicos também restringem exclusões e mudanças de perfil.

A autorização de um PDF depende do vínculo acadêmico ou do certificado; conhecer o ID
não dá acesso. Detalhes em [segurança](../security/overview.md).
