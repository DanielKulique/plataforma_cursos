# Goal 3 — Fluxos de aluno e professor

## Contratos adotados

- Conteúdo e progresso são lidos e persistidos exclusivamente no MySQL. A conclusão é idempotente e o percentual da matrícula é recalculado na mesma transação.
- A submissão de questionário aceita exatamente uma opção válida para cada pergunta. A tentativa, as respostas e a pontuação calculada pelo backend pertencem à mesma transação.
- O endpoint `GET /api/turmas/:id_turma/questionarios` expõe somente metadados para o professor responsável ou ADMIN; não inclui opções nem gabarito.
- Coleções vazias de alunos, conteúdos, módulos, questionários e tentativas retornam `200` com arrays vazios.

## Pendências mantidas fora do escopo

- `RESPOSTA_CURTA` permanece no schema por compatibilidade, mas não é disponibilizada nem aceita no fluxo de resposta. O tipo exige um contrato completo de avaliação antes de ser implementado.
- Interfaces de autoria de módulos, conteúdos e questionários pelo professor não fazem parte do Goal 3. As telas deste Goal são somente de consulta e acompanhamento.

## Dados simulados

O parâmetro `?demo=1` e seu propagador foram removidos. As telas de aluno e professor não usam payload hardcoded nem fallback de mock quando uma API falha; exibem um estado vazio ou um erro explícito.
