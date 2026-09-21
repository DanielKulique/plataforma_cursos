# ADR 002 — Cookie de sessão e CSRF

**Estado:** adotado; registro da implementação existente em 19/09/2026.

## Contexto

A interface de mesma origem precisa manter sessão sem expor JWT ao JavaScript e permitir
revogação após logout ou mudança de senha. Cookies exigem proteção para mutações autenticadas.

## Decisão

Guardar JWT em cookie HttpOnly, SameSite=Lax, Secure em produção. Exigir token CSRF nas
mutações por cookie. Consultar perfil e versão de sessão no banco em cada requisição.
Incrementar versão para invalidar sessões anteriores. Bearer permanece compatível no backend.

## Consequências

O frontend guarda somente dados de apresentação/CSRF, não o JWT. Sessão depende de consulta
ao banco. Logout revoga tokens anteriores globalmente, não apenas o cookie de um navegador.
CSRF não substitui autorização por papel/vínculo.

Referências: [autenticação](../api/authentication.md), [segurança](../security/overview.md).
