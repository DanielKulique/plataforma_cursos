# Backend

O servidor é uma aplicação Express 5 em Node.js. [index.js](../../index.js) monta os
middlewares, publica as páginas de `src/public`, registra rotas e encerra o pool no shutdown.
Não há compilação do backend; `npm run build` valida isolamento do banco e assets de produção.

## Caminho de uma requisição

1. Contexto atribui `X-Request-ID`; observabilidade acompanha status e duração.
2. Helmet, CORS e limite JSON aplicam controles de transporte e entrada.
3. A rota valida campos e exige sessão/perfil quando aplicável.
4. Controller chama model/serviço; as escritas relevantes usam conexão transacional.
5. Serviço/model verifica vínculos e estado atuais, persiste e responde sem expor SQL ou paths.

Os arquivos ficam em `src/api/routes`, `controllers`, `models` e `services`.
`src/services/email.service.js` encapsula envio de e-mail. `src/config` valida ambiente,
conexão, identidade do banco, sessão e políticas de storage.

## Serviços centrais

| Serviço | Uso |
| --- | --- |
| `academic-access` | Autoria por professor responsável/ADMIN e bloqueio de turma encerrada |
| `academic-progress` | Conteúdos completos, trilha de 80% e aprovação na final |
| `turma-replication` | Cópia transacional de estrutura com idempotência |
| `material-upload` / `pdf-validation` | Recepção, validação estrutural e publicação privada de PDF |
| `private-storage` / `material-lifecycle` | Arquivos imutáveis, referências e retenção |
| `certificate` / `certificate-pdf` | Elegibilidade, versão, snapshot, geração e hash |
| `storage-reconciliation` | Diagnóstico e coleta manual controlada de materiais |
| `operational-status` / `http-metrics` | Readiness, disco, pool, backup e métricas |

Autoria estrutural usa locks da turma e dos recursos; troca de responsável e encerramento
concorrem pelo mesmo contexto. Conexões explícitas são liberadas em `finally`.
Listagens crescentes aceitam paginação com limites. O pool tem fila finita e falha controlada.

Saiba mais em [autenticação](../api/authentication.md), [migrations](../database/migrations.md)
e [monitoramento](../operations/monitoring.md).
