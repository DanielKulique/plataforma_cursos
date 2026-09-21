> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Deploy do MVP em VPS

Este é o procedimento canônico para uma VPS Linux com Docker Engine, Compose v2, DNS apontado para o host e portas 80/443 liberadas. O MySQL não é publicado na máquina.

## 1. Preparação

Clone a revisão aprovada, entre em `plataforma_cursos`, copie `.env.production.example` para `.env.production` e substitua todos os placeholders. Gere segredos aleatórios diferentes para MySQL, JWT e integração com o detector. Mantenha o arquivo com permissão restrita e fora do Git.

`APP_DOMAIN` deve conter somente o domínio, enquanto `APP_BASE_URL` e `CORS_ORIGIN` devem usar o mesmo endereço HTTPS. Configure um remetente verificado e uma chave válida do Resend. Para publicar sem o motor de IA, use `DETECTOR_ENABLED=false`.

Valide antes de subir:

```bash
npm ci
npm run test:all
docker compose --env-file .env.production config --quiet
docker build -t plataforma-cursos:release .
```

## 2. Primeira instalação

```bash
docker compose --env-file .env.production up -d db
docker compose --env-file .env.production run --rm app npm run db:schema:verify
docker compose --env-file .env.production up -d app caddy
```

O arquivo `mysql/schema.sql` é aplicado pelo MySQL somente quando o volume está vazio. Em banco existente, faça backup e aplique a migration explícita:

```bash
docker compose --env-file .env.production run --rm \
  -e ALLOW_PRODUCTION_MIGRATIONS=I_UNDERSTAND app npm run db:migrate
```

Crie o primeiro administrador apenas depois do schema validado:

```bash
docker compose --env-file .env.production run --rm \
  -e ALLOW_PRODUCTION_ADMIN_BOOTSTRAP=I_UNDERSTAND app npm run admin:bootstrap
```

Remova `INITIAL_ADMIN_PASSWORD` do arquivo operacional após o bootstrap. Consulte os logs com `docker compose --env-file .env.production logs --tail=200 app caddy`, sem publicar conteúdo sensível.

## 3. Atualização e rollback

Antes de atualizar, gere e teste um backup conforme `BACKUP_RESTORE.md`. Depois:

```bash
git fetch --all --prune
git switch --detach <commit-aprovado>
docker compose --env-file .env.production build app
docker compose --env-file .env.production run --rm \
  -e ALLOW_PRODUCTION_MIGRATIONS=I_UNDERSTAND app npm run db:migrate
docker compose --env-file .env.production up -d --remove-orphans
```

O app trata `SIGTERM`, para de aceitar conexões e fecha o pool MySQL. Para rollback de código, volte ao commit/imagem anterior e recrie `app`; se a migration for incompatível com a versão anterior, restaure o backup em uma janela de manutenção. Nunca reverta schema por tentativa.

Finalize executando todo o checklist de staging. A publicação só está concluída quando HTTPS, login, CSRF, recuperação de senha e o modo sem detector forem validados.
