# Autenticação e sessão

O navegador recebe um cookie de sessão após login. O token JWT permanece no cookie
`plataforma_session`, HttpOnly, SameSite=Lax, path `/` e Secure em produção.
O JavaScript recebe apenas o usuário e um token CSRF para enviar nas mutações.

## Fluxo web

1. `POST /api/usuarios` cria ALUNO e verificação pendente na mesma transação.
2. O envio do código acontece após commit; falha no provedor preserva a conta pendente.
3. `POST /api/auth/enviar-codigo-verificacao` permite solicitar novo código por e-mail.
4. `POST /api/auth/verificar-codigo-email` recebe `email` e código de seis dígitos.
5. `POST /api/auth/login` recebe `email`/`senha`; exige verificação explícita no banco.
6. Login retorna `csrf_token` e `usuario`, além de Set-Cookie. Não retorna JWT para armazenamento web.
7. `GET /api/auth/me` lê o usuário atual; `GET /api/auth/csrf` recupera o CSRF da sessão.
8. POST/PUT/PATCH/DELETE autenticados por cookie enviam `X-CSRF-Token` correspondente.

Requisições web devem manter cookies; o wrapper do frontend centraliza esse contrato.
Não coloque token em URL, localStorage ou logs. Um cookie válido tem precedência sobre
Authorization. Bearer continua aceito por compatibilidade, mas não é o fluxo usado pelo frontend.
A verificação CSRF se aplica quando a autenticação veio de cookie.

## Revogação e troca de senha

A cada requisição, o middleware consulta usuário e `versao_sessao`; papel atual e validade vêm
do banco. Logout incrementa a versão e remove o cookie. Troca de senha exige a senha atual
e só pode ser feita pelo próprio usuário. Logout, troca e reset invalidam sessões anteriores
em todos os dispositivos.

`POST /api/auth/recuperar-senha` retorna 202 indistinguível para e-mails sintaticamente válidos,
independentemente da existência da conta ou da entrega. O token aleatório tem somente hash
SHA-256 persistido, expiração e uso único. `POST /api/auth/redefinir-senha` recebe `token` e
`nova_senha`; consome o token e invalida sessões em transação.

E-mail desabilitado não cria atalho de login: novos cadastros continuam pendentes. Para testes
locais use fixtures/seeds próprios; para testar a jornada real configure entrega.

## Erros de sessão

401 indica sessão ausente, inválida ou revogada. 403 pode indicar CSRF inválido, perfil/vínculo
insuficiente ou e-mail ainda não confirmado (`EMAIL_NAO_VERIFICADO`). O cliente deve tratar
expiração sem reenviar mutações automaticamente em loop.

Referências: [rotas](../../src/api/routes/auth.routes.js),
[middleware](../../src/middlewares/checkAuth.middleware.js),
[cookie](../../src/config/session.js) e [segurança](../security/overview.md).
