# Documentação da Plataforma de Cursos

Esta é a documentação vigente, consolidada a partir do código em 19/09/2026.
Ela descreve como desenvolver, testar e operar a plataforma; resultados de staging
ou de testes anteriores são evidências datadas, não garantias sobre o ambiente atual.

## Por onde começar

| Necessidade | Guia |
| --- | --- |
| Entender a plataforma | [Produto](product/overview.md), [perfis](product/roles.md), [regras de negócio](product/business-rules.md) |
| Instalar e desenvolver | [Instalação](getting-started/installation.md), [rotina local](getting-started/local-development.md), [variáveis](getting-started/environment-variables.md) |
| Entender o código | [Arquitetura](architecture/overview.md), [backend](architecture/backend.md), [frontend](architecture/frontend.md), [banco e storage](architecture/database.md) |
| Consumir a API | [Referência de endpoints](api/overview.md), [autenticação](api/authentication.md) |
| Evoluir o banco | [Entidades e relações](database/schema.md), [migrations](database/migrations.md) |
| Manter integridade | [Segurança](security/overview.md), [certificados](product/certificates.md) |
| Validar alterações | [Testes](testing/overview.md) |
| Operar | [Deploy](operations/deployment.md), [backup e restore](operations/backup-and-restore.md), [monitoramento](operations/monitoring.md), [troubleshooting](operations/troubleshooting.md) |
| Preparar a turma inicial real | [Release de produção](operations/production-release.md), [conteúdos e pendências](../production-content/README.md) |
| Entender decisões | [ADRs](adr/README.md) |
| Consultar entregas anteriores | [Histórico de engenharia](engineering/README.md), [Goals](engineering/goals/README.md), [evidências](engineering/evidence/README.md) |

## Convenções

“Aula” na interface corresponde a `Modulos` no banco. “Prova final” é uma `PROVA`
explicitamente marcada com `prova_final=1`. Professor responsável é o usuário
atualmente associado a `Turmas.id_professor`. O backend é a autoridade para todos esses vínculos.

Comandos partem da raiz `plataforma_cursos/`, salvo indicação contrária.
Valores entre `<...>` são placeholders a substituir localmente; nunca publique secrets.
Integração local usa somente `127.0.0.1:33307` via Docker, sem fallback para MySQL nativo.

Código, configurações, migrations e testes são as fontes técnicas. Ao alterar comportamento,
atualize o guia correspondente e preserve as evidências históricas. O
[relatório de limpeza](engineering/PROJECT_CLEANUP_REPORT.md) delimita esta consolidação.
