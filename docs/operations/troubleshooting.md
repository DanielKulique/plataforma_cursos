# Troubleshooting

Comece pelo sintoma, identifique o ambiente e correlacione a requisição por `X-Request-ID`.
Não tente reparar falha operacional apagando volumes, arquivos privados ou histórico de migrations.

| Sintoma | Verificação e ação |
| --- | --- |
| HTTP 503 | Compare healthz e readyz; confira DB, pool e permissões dos storages. Use health/metrics como ADMIN e logs sanitizados. |
| healthz não responde | Confira container/processo, APP_PORT, proxy e DNS; liveness não depende de query ao banco. |
| readyz falha com healthz OK | Confira conexão/identidade do banco e acesso de leitura/escrita aos volumes. |
| `DB_POOL_SATURATED` | Inspecione fila, latência e queries/transações; não aumente limites sem entender a causa. |
| Banco local recusa conexão | Confira `compose.local-db.yaml`, serviço saudável e `127.0.0.1:33307`. Não há fallback para MySQL nativo. |
| Identidade ausente/divergente | Confirme banco/volume/variáveis; não altere marcador de um banco desconhecido. |
| Migration falha | Execute `db:migrate:status`, confira ledger/checksum/schema e o DDL já aplicado. MySQL pode ter feito commit parcial. |
| Banco canônico sem ledger | Confira origem, identidade, backup e validator; siga adoção explícita em [migrations](../database/migrations.md). |
| `CHECKSUM_MISMATCH` | Restaure bytes do arquivo aplicado; não atualize o hash registrado. Correção funcional usa migration nova. |
| PDF retorna 422 | Verifique nome/extensão/MIME, arquivo vazio/corrompido, estrutura, páginas ou senha. Reexporte um PDF legível. |
| PDF retorna 413 | Arquivo excede limite: materiais 20 MB e comparação de certificado 10 MB por padrão. |
| PDF privado retorna 503 | Arquivo ausente/indisponível: confira storage e restaure a partir de conjunto validado; não recrie metadados fictícios. |
| PDF retorna 403 | Confira sessão, matrícula, estado da turma e professor responsável. URL conhecida não concede acesso. |
| Sessão retorna 401 | Faça novo login; logout/troca/reset revogam tokens anteriores. |
| CSRF retorna 403 | Obtenha `/api/auth/csrf` com a sessão atual e envie `X-CSRF-Token` nas mutações. |
| Login bloqueado por e-mail | Conta precisa de verificação explícita. Confira entrega, remetente e reenvio; falha de envio não deve apagar conta. |
| Código/reset não chega | Confira `EMAIL_DELIVERY_ENABLED`, provedor, timeout e limites. Modo desabilitado não devolve código no response. |
| Prova final bloqueada | Confira conteúdos + exercícios ativos realizados no ciclo atual; arredondamento da tela não substitui 80% real. |
| 100% na tela sem aprovação | Confira contagem exata dos conteúdos e tentativa da final ativa >=75 no ciclo atual. |
| Emissão retorna 409 | Revalide requisitos e histórico: certificado revogado exige reemissão ADMIN; não basta o status APROVADO. |
| Turma impede autoria | Confira estado ENCERRADA, responsabilidade atual e vínculos/histórico do item. |
| Backup fora do RPO | Confira timer/journal, espaço, identidade offsite, complete e latest-good; readiness pode continuar OK. |
| Detector retorna 503 | Com capacidade desabilitada é esperado; cursos funcionam sem ele. Não ative para corrigir uma falha acadêmica. |

## Comandos locais sem alteração de dados

```bash
docker compose --env-file .env -f compose.yaml -f compose.local-db.yaml ps db
npm run db:identity:verify
npm run db:migrate:status
npm run db:schema:validate
curl --fail http://localhost:3000/healthz
curl --fail http://localhost:3000/readyz
```

Use as variáveis de teste apenas para o banco descartável. Em produção, execute diagnósticos
pelo container da stack correta. Registre o erro curto, revisão e ambiente; não cole secrets,
cookies, tokens, SQL com dados pessoais ou strings de conexão em relatórios.
