# Histórico e evidências de engenharia

A documentação para desenvolver e operar está no [índice vigente](../index.md).
Esta área preserva o processo de engenharia, decisões datadas e validações anteriores.
Relatórios não são manuais operacionais atuais.

## Organização

- [Goals](goals/README.md): relatórios de entrega, inclusive integridade acadêmica,
  ciclos, certificados, autorização, storage, backup e frontend.
- [Histórico](history/README.md): análises e guias anteriores, preservados para rastreabilidade.
- [Evidências](evidence/README.md): relatórios sanitizados, manifests, resultados e capturas.
- [Limpeza deste Goal](PROJECT_CLEANUP_REPORT.md): inventário, remoções e validação sem mudança funcional.

A baseline detalhada numerada `00`–`10` permanece neste diretório para conservar navegação,
IDs e contexto do validador histórico. Seus textos estão marcados como históricos:
[visão geral](00-system-overview.md), [requisitos](01-requirements.md),
[regras](02-business-rules.md), [arquitetura](03-architecture.md),
[dados](04-data-model.md), [API](05-api-and-authorization.md),
[segurança](06-security.md), [deploy](07-deployment-infrastructure.md),
[testes](08-testing-quality.md), [riscos](09-risks-technical-debt.md),
[rastreabilidade](10-traceability.md) e [síntese](EXECUTIVE_SUMMARY.md).

O [manifesto de fontes histórico](evidence/source-manifest.json) e os demais JSONs anteriores
não foram reescritos para aparentar validação recente. `validate_docs.py` é o verificador daquela
baseline; divergência com fontes atuais não deve ser confundida com regressão comprovada.

Para validar a documentação atual sem iniciar aplicação ou banco:

```bash
python3 docs/engineering/validate_current_docs.py
```

Nenhum teste pesado, deploy, backup/restore, detector ou MySQL nativo é iniciado por esse comando.

- [Goal 25 — correções funcionais e validação de fechamento](GOAL_25_FINAL_APPLICATION_FIXES.md).
