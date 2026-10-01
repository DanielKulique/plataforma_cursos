# Contrato das questões por tipo

`POST /api/questionarios/:id_questionario/perguntas` e `PATCH /api/perguntas/:id_pergunta` recebem `texto_pergunta`, `tipo_pergunta`, `ordem` e `pontos`. A criação exige também o conteúdo completo do tipo. A edição que troca tipo ou conteúdo substitui a estrutura numa transação; erro de validação ou SQL não deixa pergunta parcial. Turmas encerradas e avaliações com histórico continuam protegidas pelas regras acadêmicas existentes.

| Tipo | Conteúdo de autoria | Forma entregue ao aluno | Resposta em `respostas[]` |
| --- | --- | --- | --- |
| `MULTIPLA_ESCOLHA` | `opcoes: [{texto_opcao, ordem, correta}]`, pelo menos duas e uma ou mais corretas | `opcoes: [{id_opcao, texto_opcao, ordem}]` | `{id_pergunta, selected_option_ids: [id_opcao, ...]}` |
| `VERDADEIRO_FALSO` | `resposta_booleana: true` ou `false`, sem opções | `formato_resposta: "BOOLEANO"` | `{id_pergunta, resposta_booleana: true/false}` |
| `ASSOCIACAO` | `pares: [{esquerda, direita, ordem}]`, pelo menos dois pares | `itens_esquerda` e `itens_direita` com `id_item` e `texto`; direita embaralhada | `{id_pergunta, matches: [{left_id, right_id}, ...]}` |

Os itens de associação têm IDs UUID distintos; o aluno não recebe a lista de pares nem os IDs do gabarito. A API valida que cada ID pertence à pergunta e ao lado correto, que todos os itens são usados uma vez e que não há duplicatas. A resposta vale integralmente apenas se todos os vínculos estiverem corretos. Múltipla escolha compara os conjuntos de IDs, sem depender da ordem; opção extra ou faltante torna a questão incorreta. V/F compara o booleano exato. Não há pontuação parcial. O servidor calcula acertos e pontos; o cliente não envia nota.

Questões `VERDADEIRO_FALSO` criadas antes da migração, com `resposta_booleana` nulo, conservam suas opções e aceitam `id_opcao` na submissão. `RESPOSTA_CURTA` permanece no enum para dados históricos, mas a autoria e a correção atuais não o aceitam. A migração `016_question_authoring_types.sql` é incremental e preserva linhas existentes; `mysql/schema.sql` e `scripts/schema-contract.json` descrevem o estado final. A replicação de turmas cria novos IDs para itens e refaz as correspondências.
