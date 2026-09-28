> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Auditoria do fluxo acadêmico

Data da consolidação: 2026-09-03.

## Escopo e fonte de verdade

O fluxo auditado parte de `Cursos`, `Turmas`, `Matriculas`, `Modulos`, `Conteudos`,
`ConteudosProgresso`, `Questionarios`, `Q_Perguntas`, `Q_Opcoes`, `Q_Tentativas` e
`Q_Respostas`. O MySQL é a fonte de verdade; a interface apenas apresenta dados e envia
intenções validadas pela API.

`Cursos` representa o item de catálogo. A disponibilidade acadêmica é definida por turma:

- `ABERTA`: aceita matrícula e permanece acessível aos matriculados;
- `FECHADA`: não aceita nova matrícula, mas a sala continua acessível aos já matriculados;
- `ENCERRADA`: sai da sala ativa e bloqueia conteúdo, alteração de progresso, novas tentativas
  e mudanças estruturais. Para editar a estrutura, um ADMIN deve reabrir a turma explicitamente.

## Jornada validada

1. O visitante consulta o catálogo público de cursos e turmas.
2. Um ALUNO autenticado matricula-se somente em turma `ABERTA`; a chave única aluno/turma e
   a transação impedem duplicidade concorrente.
3. O aluno vê apenas suas turmas ativas (`ABERTA` ou `FECHADA`) e acessa módulos e conteúdos
   somente com matrícula não cancelada.
4. PDF local é entregue por `/api/conteudos/:id/material`; `/assets/materiais/*` não é público.
   Vídeos aceitam apenas URLs incorporáveis do YouTube. Texto, PDF, vídeo, link e atividade
   compartilham a mesma ação explícita de conclusão.
5. Cada `(aluno, conteúdo)` possui no máximo um registro de progresso. `CONCLUIDO` não regride.
6. O percentual é derivado por `conteúdos concluídos / conteúdos da turma`, arredondado e
   limitado a 0–100. A coluna da matrícula é somente cache transacional e não é editável pela API.
7. O questionário ativo entrega perguntas/opções sem o campo de gabarito. O servidor valida uma
   opção pertencente a cada pergunta, calcula acertos/pontos/percentual e persiste tudo em uma
   transação.
8. Cada envio leva `submission_id` UUID. Na política histórica deste relatório, repetir o UUID
   reutilizava o resultado e outro UUID criava nova tentativa. A regra final limita o Teste Final
   a uma tentativa por aluno/turma; exercícios mantêm tentativas livres.
9. O professor responsável ou ADMIN consulta resultados. Conteúdo com progresso, pergunta com
   resposta e questionário com tentativa não podem sofrer exclusão/reescrita destrutiva.
10. Após 100% dos conteúdos, PROFESSOR responsável ou ADMIN registra nota final e situação
    `APROVADO`/`REPROVADO`. A nota deve existir e ficar entre 0 e 10.
11. Na área `professor-turma.html`, o professor responsável cria, edita, ordena e remove módulos
    e conteúdos pelos mesmos serviços e modelos acadêmicos usados pelo ADMIN. A interface recarrega
    a estrutura persistida após cada mutação. Questionários e perguntas usam o fluxo acadêmico já
    existente; tipos novos não foram introduzidos.

O percentual de uma prova/exercício não é convertido automaticamente em nota final porque o
produto não possui regra de média, pesos ou nota mínima configurada. Inventar esse limiar mudaria
a política acadêmica. A correção objetiva continua automática e auditável; a situação final é uma
decisão acadêmica autorizada e só ocorre depois da conclusão da trilha.

## Matriz de permissão

| Operação | ALUNO | PROFESSOR responsável | PROFESSOR alheio | ADMIN |
|---|---:|---:|---:|---:|
| Catálogo de cursos/turmas | sim | sim | sim | sim |
| Criar matrícula própria em turma aberta | sim | não | não | não |
| Ler sala, módulos, conteúdos e PDF | matriculado | própria turma | não | sim |
| Registrar progresso | matriculado | não | não | não |
| Responder questionário ativo | matriculado | não | não | não |
| Ver histórico próprio | sim | não | não | não |
| Ver alunos, progresso e resultados da turma | não | própria turma | não | sim |
| Criar/alterar estrutura acadêmica | não | própria turma não encerrada | não | turma não encerrada |
| Definir nota/situação final | não | própria turma | não | sim |
| Editar progresso manualmente | não | não | não | não |

## Integridade e segurança implementadas

- constraints de banco para nota 0–10, progresso 0–100 e percentual de tentativa 0–100;
- índice único de idempotência em `(id_usuario, id_questionario, chave_idempotencia)`;
- validação de campos desconhecidos e limites nos payloads acadêmicos;
- vínculo de módulo conferido contra a turma do conteúdo;
- CRUD de alternativas preservando mínimo de duas opções e exatamente um gabarito correto;
- autorização por matrícula, professor responsável e papel, incluindo acesso direto por URL;
- bloqueio de material estático e entrega autenticada com cache privado;
- transações com rollback para matrícula, progresso, conteúdo e submissão;
- preservação do histórico contra cascatas acionadas pelas rotas de CRUD;
- cálculo de nota/percentual exclusivamente no backend;
- rascunho de questionário isolado por usuário/questionário e sanitizado antes de restaurar o DOM.

## Endpoints estruturais compartilhados

- `POST /api/turmas/:id_turma/modulos`, `PATCH|DELETE /api/modulos/:id_modulo`;
- `POST /api/turmas/:id_turma/conteudos`, `PATCH|DELETE /api/conteudos/:id_conteudo`;
- `POST /api/turmas/:id_turma/questionarios`, `PATCH|DELETE /api/questionarios/:id_questionario`;
- `POST /api/questionarios/:id_questionario/perguntas` e as rotas existentes de perguntas/opções.

A autorização estrutural é centralizada no serviço acadêmico: ADMIN tem escopo global;
PROFESSOR precisa coincidir com `Turmas.id_professor`; ALUNO não escreve. O escopo é sempre
obtido do banco pelo recurso-alvo, e não aceito como prova a partir de IDs enviados pelo cliente.
Turmas `ABERTA` e `FECHADA` permitem autoria; `ENCERRADA` retorna conflito antes da mutação.

## Migração e contrato

`mysql/migrations/002_academic_flow_integrity.sql` adiciona a chave de idempotência e as
constraints numéricas. `scripts/migrate_database.js` aplica, em ordem, todas as migrations
numéricas de `mysql/migrations`. O processo foi executado duas vezes no banco descartável e o
contrato foi verificado nas duas passagens.

Antes de produção: faça backup, execute `npm run db:migrate` com as salvaguardas descritas em
`docs/engineering/history/DEPLOY_VPS.md` e finalize com `npm run db:schema:verify`.

## Cobertura de teste

Os testes unitários e de integração cobrem, entre outros:

- matrícula inexistente, duplicada, concorrente, cancelada e reativada;
- papéis ALUNO/PROFESSOR/ADMIN e professor de outra turma;
- conteúdo sem matrícula, turma encerrada e módulo cruzado;
- PDF direto/anônimo/sem matrícula/matriculado;
- progresso 0%, parcial, 100%, repetição e recomposição quando surge novo conteúdo;
- permanência após novo login;
- payload de avaliação incompleto, duplicado, cruzado e sem pergunta suportada;
- cálculo ponderado no backend, rollback pós-inserção e ausência de gabarito na leitura;
- submissão idempotente e nova tentativa deliberada;
- bloqueio de alteração ou exclusão após existir histórico;
- criação e edição por professor responsável, inclusive em turma fechada;
- manipulação direta de turma, módulo, conteúdo e questionário de outro professor;
- rejeição de turma encerrada e de alteração manual do progresso pelo professor;
- conteúdo criado pelo professor visível ao aluno matriculado após nova leitura;
- conclusão acadêmica negada antes de 100% e aceita com 100% + nota.

O checklist manual correspondente está em `docs/engineering/history/STAGING_CHECKLIST.md`.
