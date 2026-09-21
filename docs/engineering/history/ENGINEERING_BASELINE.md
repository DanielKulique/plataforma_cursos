> **Histórico.** Consulte a [documentação vigente](../../index.md).

# Baseline de Engenharia de Software

Levantamento técnico e funcional do sistema **como implementado**, iniciado em **2026-09-06 e 2026-09-07** e atualizado até **2026-09-15** pelos Goals subsequentes. Escopo principal: `plataforma_cursos`. Commit-base `4eb8886ea2da5ec361960e47bc57ab6458537fe8`; a árvore contém alterações locais anteriores, incluindo infraestrutura e features ainda não commitadas. O commit isolado não reproduz a baseline. O [manifesto de fontes](../evidence/source-manifest.json) registra a árvore-fonte nesta conclusão, sem conteúdos ou valores de segredos; a inclusão no manifesto não significa inspeção individual de cada arquivo.

**Resultado documental:** cobertura de código, requisitos, regras, API, autorização, banco, arquitetura, segurança, testes e infraestrutura. Não equivale a homologação de produção. Limitações de evidência e cobertura item a item estão na [rastreabilidade](../10-traceability.md).

## Navegação

| Documento | Uso |
| --- | --- |
| [Síntese executiva](../EXECUTIVE_SUMMARY.md) | Apresentação acadêmica: finalidade, arquitetura, maturidade, riscos e próximos passos. |
| [00 — Visão geral](../00-system-overview.md) | Árvore do repositório, atores, jornadas e inventário de features. |
| [01 — Requisitos](../01-requirements.md) | 47 RF e 26 RNF derivados do código. |
| [02 — Regras de negócio](../02-business-rules.md) | 41 RN e suas exceções reais. |
| [03 — Arquitetura](../03-architecture.md) | C4, fluxos E2E, oito sequências, quatro estados e decisões. |
| [04 — Dados](../04-data-model.md) | 19 tabelas, ER, dicionário, sete migrations e integridade por camada. |
| [05 — API e autorização](../05-api-and-authorization.md) | API + healthz/readyz, matriz de papéis e integrações parciais. |
| [06 — Segurança](../06-security.md) | Sessão, CSRF, acesso a arquivos, lifecycle e privacidade técnica. |
| [07 — Deploy e infraestrutura](../07-deployment-infrastructure.md) | Local/CI/staging/produção, Docker/Caddy/Azure, backup e dependências. |
| [08 — Testes e qualidade](../08-testing-quality.md) | Execuções datadas, cobertura, atributos de qualidade, UX e manutenção. |
| [09 — Riscos e dívida](../09-risks-technical-debt.md) | 28 achados, concorrência, gaps, escala e matriz de maturidade. |
| [10 — Rastreabilidade](../10-traceability.md) | RF → RN → endpoint → implementação → tabela → teste; 49 itens do pedido. |

## Método e significado dos estados

Foram lidos rotas, controllers, models, services, middleware, frontend, schema/migrations, testes, Docker/Compose/Caddy, scripts e runbooks. Declarações antigas de READY, screenshots e comentários foram tratados como pistas e evidência datada, não como substitutos do código. Caminhos em código nos documentos são relativos à raiz do repositório; nomes abreviados seguem o domínio indicado. Os links Markdown de navegação e arquivos de rota são relativos ao documento.

- **IMPLEMENTADO:** há caminho executável observado no backend/frontend conforme escopo descrito. Não garante disponibilidade externa ou ausência de defeitos.
- **PARCIALMENTE IMPLEMENTADO:** parte do fluxo/controle/UX existe, com lacuna identificada.
- **PLANEJADO:** intenção documentada em roadmap; não implica implementação ou compromisso aprovado.
- **LEGADO:** caminho antigo ainda presente ou suportado por compatibilidade, identificado por comportamento e uso.
- **NÃO UTILIZADO:** nenhum consumidor/fluxo integrado encontrado no escopo pesquisado; ausência de evidência de uso não prova ausência em clientes externos.
- **INCERTO:** não foi possível obter evidência suficiente, especialmente sobre ambiente remoto e serviços externos.

READY/PARTIAL no inventário apenas traduz IMPLEMENTADO/PARCIALMENTE IMPLEMENTADO. A matriz de maturidade usa as categorias qualitativas pedidas e justificativas, sem notas arbitrárias. Recomendação não é requisito implementado. Motivações não documentadas são marcadas como inferidas.

## Evidências e validação

- [Inventário de rotas](../evidence/routes.json): método, path, fonte, linha, handler e escopo; 86 operações.
- [Resumo Jest atual](../evidence/test-summary.json): execução principal de 07/09, sem logs brutos ou valores de ambiente.
- [Manifesto de fontes](../evidence/source-manifest.json): SHA-256 de arquivos de código/configuração pública, excluindo .env e segredos.
- [Validação documental](../evidence/validation.json): contagens, links, Mermaid, referências e preservação de fontes.
- [Validador documental](../validate_docs.py): reconfere links locais, IDs, rotas, referências de testes, whitespace e manifesto, sem alterar aplicação/banco.

Em 06/09 passaram 503 testes principais e 152 de integração MySQL. Em 07/09 passaram novamente os 503 principais, lint e build. A pré-checagem MySQL em 07/09 retornou ECONNREFUSED, portanto não houve nova integração nesse dia. A constatação de schema MySQL real (19 tabelas) é de 06/09. O banco local de desenvolvimento não pôde ser acessado; a configuração remota não foi consultada.

Na atualização do Goal 09, em 15/09/2026, passaram 64 suítes/648 testes principais, 16 suítes/253 testes de integração em MySQL 8.4.11 descartável, lint, build e auditorias sem vulnerabilidades. O staging existente foi atualizado e observado em 16/09 UTC: schema com 19 tabelas funcionais mais `environment_identity`, health público/ADMIN seguro, login, Sala Virtual, certificados e PDF privado passaram no smoke direcionado. Detalhes e limites estão no [relatório do Goal 09](../goals/GOAL_09_FRONTEND_API_RESILIENCE.md).

O validador de Mermaid foi instalado temporariamente fora do repositório e usado para analisar os 18 blocos (3 C4, 1 ER, 8 sequências, 4 estados, 1 segurança e 1 deploy). A inspeção de UX foi estática e apoiada por capturas históricas; o detector de estilo teve capacidade degradada e seus avisos estéticos não foram classificados como dívida técnica. Não houve nova auditoria de contraste/browser, pentest externo, benchmark ou restore.

Nenhum segredo, senha, token, cookie, hash de Basic Auth ou string de conexão foi incluído. Na auditoria documental inicial, documentos eram a única mudança; os Goals posteriores alteraram aplicação e operação de forma rastreada em seus relatórios. O manifesto atual identifica a árvore completa, e alterações locais anteriores foram preservadas.

## Como manter esta baseline

Após uma mudança funcional, atualize primeiro a regra e o endpoint reais, depois RF/RN/RNF, matrizes e diagramas relacionados. Reexecute somente os gates apropriados, registre data/ambiente e atualize evidências sem copiar logs com dados sensíveis. Mudança de schema exige conferir migrations e DDL canônico; mudança de autorização exige teste negativo de outro papel/ownership. Estado de staging/produção deve ser confirmado em nova observação, sem transformar o relato de 2026 em fato permanente.

```bash
python3 docs/engineering/validate_docs.py
```

Esse comando valida documentação e manifesto; não executa setup, seed, migration, deploy, backup ou restore. Se o código mudou, a divergência de manifesto sinaliza necessidade de atualizar a baseline, não um erro da aplicação.

**ENGINEERING_BASELINE_COMPLETE** — conclusão do levantamento documental no escopo de evidências declarado, sem afirmação de prontidão operacional integral.

- [Goal 07 — integridade e reconciliação do storage](../goals/GOAL_07_STORAGE_DATABASE_INTEGRITY.md)
- [Goal 08 — backup, restore e disaster recovery](../goals/GOAL_08_BACKUP_RESTORE_DISASTER_RECOVERY.md)
- [Goal 09 — resiliência entre frontend e API](../goals/GOAL_09_FRONTEND_API_RESILIENCE.md)
- [Runtime e operações — Goal 11B](RUNTIME_OPERATIONS.md)
