# Evidências preservadas

Evidência registra o que foi observado numa revisão e data. Ela não substitui a
[documentação vigente](../../index.md) nem demonstra disponibilidade atual de um ambiente.

## Registros

- `goal07-*.json`: integridade de storage, dry-runs e aplicação controlada.
- `goal08-validation.json`: backup, restore e recuperação.
- `goal11a-staging-validation.json`: migrations e contrato de schema.
- `goal11b-staging-validation.json`: runtime e observabilidade.
- `goal12-staging-validation.json`: fluxo de identidade/e-mail.
- `routes.json`, `test-summary.json`, `validation.json`, `source-manifest.json`: baseline histórica;
  paths e hashes referem-se à revisão capturada, sem atualização retroativa.
- [Cobertura anterior à limpeza](coverage-before-goal14/): quatro saídas originais JSON/LCOV/XML
  preservadas byte a byte; data de execução não foi inferida do mtime.
- [Inventário da limpeza](goal14-cleanup-inventory.json) e
  [validação documental](goal14-documentation-validation.json): evidência desta consolidação.

## Capturas visuais

As [capturas em docs/screenshots](../../screenshots/) permanecem no caminho que os scripts
usam para gerar e comparar evidências: certificados, jornadas, autorização e informação arquitetural.
Os PDFs de amostra ali são evidência, não lixo. Há registros locais e de staging; considere o
README/manifesto de cada conjunto antes de comparar imagens.

`.deployments/` continua ignorado no Git e contém logs de execução importantes para auditoria.
Não foi apagado nem copiado integralmente, pois pode conter dados operacionais. `.azure-staging/`
e diretórios operacionais externos ao repositório também foram mantidos. Evidência local ignorada
não acompanha um clone; os relatórios sanitizados nesta pasta são a parte compartilhável.
