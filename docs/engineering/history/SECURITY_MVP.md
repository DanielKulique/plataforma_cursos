> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Segurança do MVP

## Sessão web

O login emite um JWT assinado somente no cookie `plataforma_session`. O corpo da resposta não contém o JWT e o frontend não o grava em `localStorage` ou `sessionStorage`. Em produção o cookie é `HttpOnly`, `Secure`, `SameSite=Lax`, restrito a `/` e possui duração configurável.

O banco continua sendo a fonte de verdade para usuário e papel em cada requisição. O JWT carrega uma versão de sessão comparada com `Usuarios.versao_sessao`; logout e alteração de senha incrementam essa versão, invalidando tokens anteriores. Bearer permanece aceito para clientes de API existentes, sem mudar o contrato do navegador.

Mutações autenticadas por cookie (`POST`, `PUT`, `PATCH`, `DELETE`) exigem `X-CSRF-Token`. O valor é aleatório por sessão, fica apenas em memória no frontend e é comparado em tempo constante. Requisições Bearer não usam o cookie e, por isso, não dependem desse mecanismo de CSRF.

## Recuperação de senha

Pedidos com e-mail sintaticamente válido respondem de forma indistinguível, exista ou não a conta. O token possui 32 bytes aleatórios; somente seu SHA-256 fica no MySQL. Um novo pedido invalida tokens pendentes, e o reset exige token não usado e não expirado, aplica bcrypt e invalida todas as sessões do usuário.

O link usa fragmento `#token=`, que não é enviado ao servidor pelo navegador. A página move o token para memória e limpa imediatamente a barra de endereço. Tokens, senhas, cookies e chaves não devem aparecer em logs.

## Limites conhecidos

- O rate limit é mantido na memória do processo; múltiplas réplicas exigem um store compartilhado.
- Bearer existe por compatibilidade de API e deve ser entregue apenas a clientes confiáveis; o frontend oficial usa exclusivamente cookie.
- O detector é experimental, opcional e deve permanecer desabilitado até que rede, token interno e privacidade do motor sejam aprovados.
- O MVP não substitui WAF, monitoramento, gestão de vulnerabilidades, cofre de segredos, política de retenção ou revisão periódica de acesso.
- Acessibilidade completa, auditoria avançada e testes end-to-end multibrowser continuam pós-MVP; o checklist manual de staging é obrigatório.
