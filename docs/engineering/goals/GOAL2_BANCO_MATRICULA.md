> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Goal 2 — Banco canônico e matrícula

Este documento é o contrato vigente para banco local, testes automatizados, status de turma e matrícula. Documentos de mock anteriores a julho de 2026 são históricos quando divergirem deste contrato.

## Isolamento dos bancos

- `site_cursos`: legado protegido, somente consulta/backup. Nenhum setup, seed, runtime ou teste pode escrevê-lo.
- `plataforma_cursos_dev`: desenvolvimento e validação manual em `localhost:3000`. Schema e seed somente por comando explícito.
- `plataforma_cursos_test`: exclusivamente descartável. Pode ser recriado automaticamente pelos testes.

O SQL em `mysql/schema.sql` não contém `CREATE DATABASE`, `USE` nem nome fixo de banco. Os scripts validam o nome exato antes da conexão. O setup de desenvolvimento aplica o schema apenas se o banco estiver vazio; se já houver tabelas, valida o contrato e recusa drift em vez de migrar ou limpar automaticamente.

```bash
npm run db:dev:setup
CANONICAL_SEED_PASSWORD='<senha-das-contas-mock>' npm run db:dev:seed
npm run db:test:setup
npm run db:test:seed
npm run db:legacy:fingerprint
```

O seed é transacional e logicamente idempotente. O seed de desenvolvimento exige senha explícita, não tem senha padrão e não imprime credenciais. O seed de teste usa somente a credencial descartável conhecida pela suíte.

## Contrato canônico

- A chave de aluno em `Matriculas` é `id_aluno`.
- Existe índice único `uk_aluno_turma (id_aluno, id_turma)`.
- Os códigos internos de turma são `ABERTA`, `FECHADA` e `ENCERRADA`.
- A interface apresenta os rótulos “Inscrições abertas”, “Inscrições fechadas” e “Turma encerrada”.
- Somente `ABERTA` aceita nova matrícula.
- Matrículas ativas em turmas `ABERTA` ou `FECHADA` aparecem na sala virtual; `ENCERRADA` não é tratada como sala ativa.

## Decisões de negócio adotadas

Não foi encontrada regra canônica anterior que impeça a reativação de matrícula. Portanto, o Goal 2 adota:

- uma matrícula `CANCELADO` é reativada na mesma linha quando o aluno ingressa novamente em uma turma `ABERTA`;
- a reativação define `status_aprovacao=CURSANDO`, `nota_final=NULL`, `progresso_percentual=0`, remove o progresso detalhado dos conteúdos daquela turma e atualiza `data_matricula`;
- uma matrícula não cancelada para o mesmo aluno/turma produz conflito e não é duplicada.

As premissas de exclusão física de usuários, proteção do último `ADMIN` e bloqueio de usuários com vínculos também são decisões adotadas pelo plano, mas pertencem ao Goal 4. Elas não foram implementadas nem validadas neste Goal 2.

## Contrato HTTP de matrícula

| Situação | Status |
|---|---:|
| nova matrícula | 201 |
| matrícula cancelada reativada | 200 |
| payload inválido | 400 |
| sem autenticação | 401 |
| papel diferente de `ALUNO` ou turma não aberta | 403 |
| turma inexistente | 404 |
| matrícula ativa duplicada | 409 |
| falha inesperada | 500 |

A transação bloqueia a linha da turma antes de consultar/inserir a matrícula. Assim, requisições concorrentes para o mesmo aluno/turma resultam em uma criação e um conflito, mantendo uma única linha.
