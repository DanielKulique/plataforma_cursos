> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Runbook de backup, restore e recuperação de desastre

## Contrato operacional

O backup funcional é um conjunto identificado, validado e publicado como GOOD — não apenas um
arquivo SQL. Em staging, o fluxo diário é:

```text
systemd timer -> suspende app -> trava purge -> mysqldump + storage -> retoma app
              -> manifesto + SHA-256 -> LOCAL_GOOD -> upload Blob -> re-download + SHA-256
              -> completion marker remoto -> latest-good -> retenção
```

O alvo inicial é `RPO <= 24h` e `RTO <= 4h`. O staging revalidado em 14/09/2026 (15/09 UTC)
apresentou `RPO_OK` e restore isolado autenticado do offsite em 50 segundos. Esse tempo é evidência do conjunto pequeno
atual, não promessa para volumes futuros.

O Blob está em `chilecentral`, como a VM. Ele protege contra perda da VM, volume e erro local,
mas **não garante recuperação de desastre regional**. O container não é público; Azure exige TLS
1.2, criptografa os blobs at rest e a VM usa identidade gerenciada com acesso de dados restrito ao
container.

## Conteúdo e formato

Cada diretório `backup-YYYYMMDDTHHMMSSZ-UUID/` contém:

```text
database.sql.gz
database-metadata.json
storage/materials/<UUID>.pdf
storage/certificates/<UUID>.pdf
manifest.json
checksums.sha256
complete.json
```

O manifesto v1 registra revisão/hash da fonte, versão MySQL, migration mais recente, contagens de
todas as tabelas e inventário de materiais/certificados (estado, tamanho e hash). `checksums.sha256`
cobre dump, metadata, manifesto e cada PDF. `.pending`, cache, logs, código, `.git`, imagens,
`node_modules` e secrets não entram no conjunto. Código é recuperado pelo repositório/bundle.

Secrets necessários vêm por canal separado: credenciais MySQL, JWT, CORS/base URL, credenciais de
e-mail quando habilitado e identidade/credencial offsite. Nunca copie `.env` para o backup.

## Localização e configuração

- Local rápido no staging: `/var/backups/plataforma-cursos` (7 dias).
- Drill/download: `/var/backups/plataforma-cursos-drills`.
- Offsite: conta `platcursosbk20260912`, container privado `plataforma-backups`, prefixo exclusivo
  `plataforma-cursos/backups/` (30 dias pelo script).
- Configuração systemd: `/etc/plataforma-cursos/backup.env`, `root:root`, modo 600.
- Logs: `journalctl -u plataforma-backup.service`.

As opções ficam centralizadas no arquivo de ambiente: `BACKUP_DIR`,
`BACKUP_LOCAL_RETENTION_DAYS`, `BACKUP_SCHEDULE`, `BACKUP_OFFSITE_ENABLED`, `BACKUP_REMOTE_PROVIDER`,
`AZURE_STORAGE_ACCOUNT`, `AZURE_STORAGE_CONTAINER`, `BACKUP_REMOTE_PREFIX`,
`BACKUP_OFFSITE_RETENTION_DAYS`, `BACKUP_DRILL_DIR`, `RPO_HOURS` e `RTO_HOURS`.
Depois de mudar `BACKUP_SCHEDULE`, execute novamente `install_backup_systemd.sh`; o instalador
valida o calendário e grava o drop-in do timer.

## Operação diária

Verifique agenda e última execução:

```bash
systemctl list-timers plataforma-backup.timer
sudo systemctl show plataforma-backup.service -p Result -p ExecMainStatus
sudo journalctl -u plataforma-backup.service --since today --no-pager
```

Faça backup manual pelo mesmo service (offsite obrigatório):

```bash
sudo systemctl start plataforma-backup.service
sudo systemctl show plataforma-backup.service -p Result -p ExecMainStatus
```

Consulte RPO local e remoto como o usuário operacional, usando as opções do `backup.env` sem
imprimir secrets:

```bash
cd /opt/plataforma-cursos
COMPOSE_ENV_FILE=.env.staging COMPOSE_OVERRIDE_FILE=compose.staging.yaml \
BACKUP_DIR=/var/backups/plataforma-cursos BACKUP_OFFSITE_ENABLED=true \
AZURE_STORAGE_ACCOUNT=platcursosbk20260912 AZURE_STORAGE_CONTAINER=plataforma-backups \
BACKUP_REMOTE_PREFIX=plataforma-cursos/backups RPO_HOURS=24 \
./scripts/backup_status.sh
```

`RPO_AT_RISK` ou saída non-zero exige investigar timer, journal, espaço, identidade Azure e último
completion marker. Um upload parcial não tem `complete.json`, não é selecionado e não substitui
latest-good.

## Validação e download offsite

Valide um conjunto local sem restaurar:

```bash
docker compose --env-file .env.staging -f compose.yaml -f compose.staging.yaml \
  run --rm --no-deps -T -v /var/backups/plataforma-cursos:/backup:ro app \
  node scripts/backup_manifest.js verify --dir /backup/<backup-id>
```

Baixe o último COMPLETE do Azure em destino novo:

```bash
COMPOSE_ENV_FILE=.env.staging COMPOSE_OVERRIDE_FILE=compose.staging.yaml \
AZURE_STORAGE_ACCOUNT=platcursosbk20260912 AZURE_STORAGE_CONTAINER=plataforma-backups \
BACKUP_REMOTE_PREFIX=plataforma-cursos/backups \
./scripts/backup_offsite.sh download latest /var/backups/plataforma-cursos-drills/manual-$(date -u +%Y%m%dT%H%M%SZ)
```

O comando baixa primeiro o ponteiro remoto `latest-good.json`, exige o completion marker daquele
ID, confere o SHA-256 do pacote, recusa paths/tipos de
tar inseguros, extrai e executa a validação integral. Falha em qualquer etapa aborta.

## Restore dry-run e in-place

Dry-run é o padrão e não altera banco/storage:

```bash
COMPOSE_ENV_FILE=.env.staging COMPOSE_OVERRIDE_FILE=compose.staging.yaml \
DB_NAME=plataforma_cursos_staging ./scripts/restore_database.sh \
  --backup /caminho/backup-... --target staging --mode in-place
```

Para desastre ou restore in-place autorizado, confirme target e use `--apply`:

```bash
COMPOSE_ENV_FILE=.env.staging COMPOSE_OVERRIDE_FILE=compose.staging.yaml \
DB_NAME=plataforma_cursos_staging ./scripts/restore_database.sh \
  --backup /caminho/backup-... --target staging --mode in-place --apply
```

Antes de qualquer alteração, o preflight valida formato, manifesto, todos os hashes, completion
marker, gzip, espaço, secrets externos, Compose, target e versão principal do MySQL. No APPLY
in-place, o target precisa coincidir com `APP_ENV` (ou `production` quando este é o ambiente), e o
script para o app antes de derrubar/recriar o banco; Caddy fica sem upstream e writes
ficam suspensos. Ele substitui integralmente ambos os storages, fixa diretórios 700/arquivos 600,
valida schema, contagens, códigos/versões/status/hashes/bytes de certificados, materiais e executa
o reconciliador somente em DRY-RUN. A aplicação só volta após validação e health; falha posterior
mantém o app parado para diagnóstico.

## Drill isolado

O drill nunca usa staging como laboratório destrutivo:

```bash
COMPOSE_ENV_FILE=.env.staging COMPOSE_OVERRIDE_FILE=compose.staging.yaml \
BACKUP_DRILL_DIR=/var/backups/plataforma-cursos-drills \
BACKUP_OFFSITE_ENABLED=true AZURE_STORAGE_ACCOUNT=platcursosbk20260912 \
AZURE_STORAGE_CONTAINER=plataforma-backups BACKUP_REMOTE_PREFIX=plataforma-cursos/backups \
RESTORE_SMOKE_CREDENTIALS_FILE=/opt/plataforma-cursos/.staging-credentials \
RPO_HOURS=24 RTO_HOURS=4 ./scripts/restore_drill.sh
```

O script cria project name, rede, MySQL e volumes exclusivos; baixa novamente do offsite; restaura;
verifica; mede build/download/preflight/DB/storage/reconciliação/startup/smoke; grava relatório em
`reports/`; e remove containers, rede e volumes isolados no final. Com o arquivo externo indicado,
o smoke confirma health e login sem imprimir ou colocar a senha em argv. Não executa reconciliador APPLY.

## Falhas e retenção

- Dump/hash/storage/upload com falha retorna non-zero; o diretório parcial é descartado.
- Falha offsite pode preservar um conjunto `LOCAL_GOOD`, mas não atualiza latest-good nem o marker
  remoto COMPLETE.
- `flock` impede duas capturas; o reconciliador APPLY usa a trava MySQL
  `plataforma:backup-storage` e recusa purge durante a captura.
- Cleanup local/remoto só roda depois de um backup novo válido e sempre preserva latest-good.
- Cleanup remoto aceita apenas o prefixo dedicado e IDs canônicos; nunca opera na raiz do account.
- Não edite checksums para “corrigir” falha. Preserve logs, resolva a causa e gere novo backup.

## Cenário: VM perdida

1. Obtenha host Ubuntu compatível; instale Docker/Compose e Azure CLI com o bootstrap.
2. Recupere o código da revisão/hash do manifesto por Git ou bundle confiável.
3. Forneça `.env` e demais secrets por canal separado, modo 600.
4. Habilite identidade gerenciada equivalente ou forneça credencial externa protegida; nunca use
   chave existente apenas na VM perdida.
5. Configure Compose sem iniciar tráfego público.
6. Localize/baixe latest-good offsite e valide o conjunto.
7. Execute primeiro o dry-run com target explícito.
8. Execute APPLY em stack sem writes; restaure banco e storage.
9. Confirme schema, contagens, certificados/materiais, reconciliador DRY-RUN e health.
10. Execute smoke de autenticação e jornada essencial; só então reabra Caddy/DNS/tráfego.
11. Registre RPO real (idade do backup) e RTO real (início formal até serviço validado).

Não aplique migrations futuras dentro do restore. Primeiro valide o snapshot na migration registrada;
depois o deploy normal pode atualizar schema de forma explícita.
