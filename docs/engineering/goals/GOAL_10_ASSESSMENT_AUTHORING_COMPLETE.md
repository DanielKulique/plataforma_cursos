> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# GOAL 10 — ASSESSMENT_AUTHORING_COMPLETE

Data da validação: 2026-09-16 (America/Sao_Paulo)

Status: **ASSESSMENT_AUTHORING_COMPLETE_READY**
D-20: **RESOLVIDO**

## Banco isolado utilizado

- Serviço iniciado: somente `db`, pelos arquivos `compose.yaml` e `compose.local-db.yaml`.
- Imagem/versão: `mysql:8.4` / MySQL `8.4.11`.
- Publicação: `127.0.0.1:33307 -> container:3306`, restrita ao loopback.
- Banco e identidade: `plataforma_cursos_test`.
- Schema canônico: 20 tabelas verificadas por `npm run db:test:setup`.
- Container observado saudável antes da execução.
- O MySQL nativo de `localhost:3306` não foi iniciado, reiniciado, desmascarado, consultado ou alterado.

Não existe fallback silencioso para `3306`: as variáveis de conexão são obrigatórias,
o runtime recusa explicitamente MySQL local nessa porta e a validação estática
`node scripts/validate_database_isolation.js` passou.

Após os testes, o container, o volume e a rede descartáveis foram removidos. Com a
porta `33307` fechada, `npm run db:test:setup` falhou explicitamente com
`ECONNREFUSED 127.0.0.1:33307`, confirmando o comportamento fail-closed sem fallback.

## Resultado dos testes

- Integrações direcionadas de questionários, perguntas, alternativas, professor/admin,
  gabarito, freeze e atomicidade: **86/86 aprovadas**.
- `npm run test:integration` foi executado **uma única vez**: 252/253 passaram.
- A única falha era externa ao Goal 10 e estava na fixture de expiração de senha, que
  misturava `NOW()` do servidor UTC com a interpretação local de `DATETIME` pelo Node.
  Após tornar a fixture independente do fuso do servidor, o arquivo afetado passou
  **5/5** isoladamente. Assim, os **253 testes correntes** possuem resultado aprovado,
  sem uma segunda execução da suíte completa.
- Os 114 testes direcionados anteriores, lint e build não foram repetidos.

## Ajustes mínimos de infraestrutura de teste

- O usuário do banco de teste recebeu somente `SELECT` em
  `performance_schema.data_lock_waits`, necessário à observação dos testes de lock.
- O override local habilita `log_bin_trust_function_creators=1`, necessário ao trigger
  temporário usado pelo teste de rollback com MySQL 8.4 e binlog ativo.
- A fixture de token expirado agora grava um `Date` expirado pelo mesmo cliente que o lê.

Nenhuma regra acadêmica dos Goals 02, 04, 05, 06 ou 09 foi alterada.
