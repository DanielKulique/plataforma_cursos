# Release e bootstrap de produção

Produção é separada do staging. A Turma 2026/2 permanece FECHADA; veja o
[manifesto e as pendências pedagógicas](../../production-content/README.md).

## Release verificável

Revisar status, diff, arquivos novos, histórico e secrets. Executar lint, unitários,
integração Docker em `127.0.0.1:33307`, build e ambas as auditorias npm. Confirmar
SHA local = SHA remoto após commit/push. Não publicar credenciais de `.env.test`.

```bash
APP_RELEASE_SHA=<sha_completo> RELEASE_BRANCH=<branch_revisada> \
  RELEASE_ARCHIVE=/diretorio/privado/release.tar.gz scripts/package_production_release.sh
```

O script recusa árvore suja, remote inesperado ou SHA não confirmado no GitHub.
Extrair em `/opt/plataforma-cursos/releases/<sha>` na nova VM; registrar SHA e hash
do pacote fora do Git. Nunca copiar `.env`, dados, backups ou storage do staging.

## Infraestrutura

`scripts/provision_azure_production.sh` exige `ADMIN_CIDR` individual e chave SSH
própria. Cria recursos em `plataforma-cursos-prod-rg`. `SkuNotAvailable` não comprova
criação da VM. Região/tamanho devem refletir disponibilidade da assinatura Azure.
Após provisionar, usar `scripts/bootstrap_azure_vm.sh` apenas na VM nova.

Criar `.env.production` somente na VM/secret storage, modo 0600. Gerar credenciais
DB/JWT novas. Enquanto domínio próprio e e-mail permanecem pendentes, usar o FQDN
Azure real com HTTPS e `EMAIL_DELIVERY_ENABLED=false`.

Todos os comandos usam os dois arquivos (Compose >= 2.24.4, suporte a `!override`):

```bash
docker compose --env-file /opt/plataforma-cursos/.env.production \
  -f compose.yaml -f compose.production.yaml config --quiet
```

O override exige APP_RELEASE_SHA, volumes exclusivos e remove init SQL automático,
deixando DB vazio para migrations. App/DB não publicam portas. Caddy publica 80/443;
NSG limita SSH. Detector permanece desligado. SHA integra ambiente e label OCI.

## Migrations e dados reais

Nos exemplos abaixo, `dc` representa o comando Compose completo acima, executado
na pasta da release confirmada:

```bash
dc build app
dc up -d db
dc run --rm --no-deps -e ALLOW_PRODUCTION_MIGRATIONS=I_UNDERSTAND app npm run db:migrate
dc run --rm --no-deps -e ALLOW_PRODUCTION_MIGRATIONS=I_UNDERSTAND app npm run db:migrate
dc run --rm --no-deps app npm run db:schema:validate
```

Exigir segunda migração NO-OP e schema OK. O runner usa checksums, GET_LOCK e
identidade. Não usar baseline em banco vazio nem alterar migrations históricas.

```bash
dc run --rm --no-deps -it \
  -e ALLOW_PRODUCTION_USER_BOOTSTRAP=I_UNDERSTAND \
  -e BOOTSTRAP_USER_NAME -e BOOTSTRAP_USER_EMAIL -e BOOTSTRAP_USER_ROLE \
  app npm run user:bootstrap
```

O prompt solicita e confirma a senha sem eco. A CLI não aceita senha em argumento,
variável ou arquivo, gera somente o hash bcrypt e marca o e-mail da conta privilegiada
como verificado para permitir acesso quando o serviço de e-mail está desligado. CPF e
telefone são opcionais; o bootstrap recusa conflito de CPF/e-mail/papel e não promove
contas silenciosamente.

Para a primeira execução completa, a CLI coordenada solicita as duas senhas, cria
ADMIN e PROFESSOR, importa conteúdo e valida login/cookie/CSRF e escopo do professor:

```bash
dc run --rm --no-deps -it \
  -v /opt/plataforma-cursos/imports/turmaInicial:/imports:ro \
  -e ALLOW_PRODUCTION_USER_BOOTSTRAP=I_UNDERSTAND \
  -e ALLOW_PRODUCTION_CONTENT_BOOTSTRAP=I_UNDERSTAND \
  app npm run production:initial-access -- --materials=/imports
```

Para repetir apenas o import idempotente, montar as fontes e executar:

```bash
dc run --rm --no-deps \
  -v /opt/plataforma-cursos/imports/turmaInicial:/imports:ro \
  -e BOOTSTRAP_COURSE_HOURS -e BOOTSTRAP_TEACHER_EMAIL \
  -e BOOTSTRAP_START_DATE -e BOOTSTRAP_END_DATE \
  -e ALLOW_PRODUCTION_CONTENT_BOOTSTRAP=I_UNDERSTAND \
  app npm run production:bootstrap -- --apply --materials=/imports
```

Repetir e comparar IDs/contagens. Não executar seeds demo/staging ou smoke com
tentativas fictícias na turma real. O importador deixa avaliações indisponíveis.

## Aceite, backup e rollback

Após configurar o FQDN/HTTPS temporário, iniciar `dc up -d app caddy`; validar landing,
healthz, readyz, login/CSRF, nove aulas, PDF privado autorizado e negação sem sessão,
links/vídeos e avaliações. Resolver pendências e revisar manualmente antes da abertura.

Provisionar offsite com `scripts/provision_backup_offsite_azure.sh`, definindo
`AZURE_ENVIRONMENT=production`, grupo/VM próprios e conta exclusiva. Confirmar
identidade gerenciada e permissão no container privado. Executar e validar
[backup coordenado](backup-and-restore.md): DB + storage + manifest + offsite, status
GOOD. Instalar timers conforme o guia. Sem DB/storage reais não existe backup inicial.

Em instalação por pacote Git sem diretório `.git`, definir `APP_RELEASE_SHA` também
no ambiente de backup. Usar `COMPOSE_OVERRIDE_FILE=compose.production.yaml` e ajustar
o serviço systemd para `/opt/plataforma-cursos/current`, apontando para a release ativa.

Registrar release anterior antes de atualizar. Rollback de código exige compatibilidade
com schema; migrations são FORWARD-ONLY. Se necessário, restaurar conjunto coordenado
em manutenção, nunca usar migration down.

Status `PRODUCTION_INITIAL_ACCESS_READY` após bootstrap, smoke e backup GOOD/offsite.
Manter `PUBLIC_COURSE_LAUNCH_PENDING` enquanto a turma estiver FECHADA e houver
materiais, domínio próprio, e-mail ou Teste Final pendentes.
