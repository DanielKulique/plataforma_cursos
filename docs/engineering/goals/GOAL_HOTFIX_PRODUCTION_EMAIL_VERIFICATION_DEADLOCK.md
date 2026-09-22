# Hotfix — bloqueio de verificação de e-mail em produção

Com `EMAIL_DELIVERY_ENABLED=false`, o cadastro público agora responde 503 antes de
qualquer escrita. Recuperação de senha e reenvio preservam respostas públicas
genéricas, mas não criam tokens ou códigos sem possibilidade de entrega. O frontend
consulta `GET /api/usuarios/cadastro-status` e desabilita o formulário enquanto o
cadastro estiver indisponível.

Contas ADMIN e PROFESSOR criadas pelo fluxo administrativo nascem verificadas e sem
código. A migration 015 permite `codigo` e `expira_em` nulos para esse estado final.
O comando `npm run user:verify -- email@exemplo.com` exige autorização explícita em
produção, localiza o e-mail exato, mostra somente campos seguros, confirma a conta,
limpa código/expiração e valida que senha e papel foram preservados. `--list` é apenas
leitura. Ambos validam a identidade canônica do banco.

O login continua recusando contas públicas pendentes. A flag de produção permanece
desligada até a configuração futura do provedor. Nenhum fluxo do hotfix envia e-mail.
