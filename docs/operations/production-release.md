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
DB/JWT novas e preencher domínio, e-mail/Resend e dados reais. App/Caddy só devem
iniciar após completar a configuração. Sem domínio definitivo não existe aceite HTTPS.

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
dc run --rm --no-deps -e ALLOW_PRODUCTION_ADMIN_BOOTSTRAP=I_UNDERSTAND app npm run admin:bootstrap
```

E-mail inicial: `danielricardokulique@gmail.com`. Nome, CPF e telefone são fornecidos
pelo titular no ambiente seguro. O prompt de senha é oculto. Alternativa: montar
arquivo 0600 e indicar `INITIAL_ADMIN_PASSWORD_FILE`. Nunca passar senha em argumento.
O bootstrap recusa conflito de CPF/e-mail/papel, sem promoção silenciosa. O login
mantém a confirmação normal de e-mail pelo produto.

Cadastrar professor real pelo fluxo oficial e preencher carga horária/data confirmadas.
Exportar as variáveis BOOTSTRAP no shell seguro e montar as fontes somente na importação:

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

Após configurar domínio/HTTPS e e-mail, iniciar `dc up -d app caddy`; validar landing,
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

Status `PRODUCTION_RELEASE_PARTIAL` até concluir domínio/HTTPS, e-mail, bootstrap real,
smoke, backup GOOD/offsite e revisão pedagógica.
