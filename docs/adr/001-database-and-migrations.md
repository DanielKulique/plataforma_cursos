# ADR 001 — Banco Docker explícito e migrations forward-only

**Estado:** adotado; registro da implementação existente em 19/09/2026.

## Contexto

Desenvolvimento, teste e operação precisam distinguir destinos e identificar a versão aplicada.
DDL MySQL pode fazer commit implícito, tornando rollback automático inseguro.

## Decisão

Usar MySQL 8.4 dedicado em Docker, conexão explícita e marcador `environment_identity`.
Integração local usa somente `127.0.0.1:33307`. MySQL nativo não participa da arquitetura.
Usar migrations sequenciais imutáveis com ledger, checksum SHA-256 e lock do runner.
Evolução é forward-only; banco existente sem ledger exige adoção explícita validada.

## Consequências

Configuração ou identidade divergente bloqueia operação. Não há fallback local de conexão
nem migration down. Falha parcial exige diagnóstico/correção forward ou restore validado.
Init de volume não substitui o runner em bancos persistentes. A CI possui uma exceção explícita
para instância efêmera, que não se aplica ao desenvolvimento local.

Referências: [isolamento](../architecture/database.md), [migrations](../database/migrations.md).
