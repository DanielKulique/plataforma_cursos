# Backup e restore

Um backup recuperável reúne banco e PDFs do mesmo instante lógico, manifesto, hashes e
marcador de conclusão. Um dump SQL sozinho não recupera a plataforma.

## Contrato do conjunto

A captura suspende o app Compose, obtém trava contra coleta, faz dump lógico e copia materiais
e certificados; depois retoma o app, verifica o conjunto e publica GOOD. Quando offsite está
habilitado, upload só é aceito após download de verificação, hashes e marcador remoto.
`latest-good` só avança após o sucesso exigido. O objetivo operacional é RPO <=24h e RTO <=4h;
um ensaio anterior não garante esses tempos para volumes futuros.

```text
backup-<timestamp>-<UUID>/
  database.sql.gz
  database-metadata.json
  storage/materials/
  storage/certificates/
  manifest.json
  checksums.sha256
  complete.json
```

O manifesto registra revisão/hash da fonte, MySQL, migrations, contagens e inventário dos PDFs.
Não inclui `.env`, secrets, `.git`, dependências, logs ou arquivos intermediários. Código e secrets
precisam ser recuperáveis por canais próprios. Preserve a revisão compatível com o snapshot.

## Configurar e capturar

Use [deploy/systemd/backup.env.example](../../deploy/systemd/backup.env.example) como modelo. Configure caminhos
absolutos fora dos volumes, `COMPOSE_ENV_FILE`, `COMPOSE_OVERRIDE_FILE` quando houver,
`BACKUP_DIR`, agenda, retenções e destino. Acrescente `BACKUP_DRILL_DIR` com caminho
absoluto fora do storage: o instalador exige esse campo, que não está no exemplo atual. Em staging, o diretório usual é
`/var/backups/plataforma-cursos`; o app o lê por montagem somente leitura para monitorar RPO.

```bash
COMPOSE_ENV_FILE=.env.production BACKUP_DIR=/var/backups/plataforma-cursos ./scripts/backup_database.sh
```

Esse exemplo captura localmente; não configura offsite. Para exigir cópia remota, configure
`BACKUP_OFFSITE_ENABLED=true`, `BACKUP_REQUIRE_OFFSITE=true`, `BACKUP_REMOTE_PROVIDER=azure`,
`AZURE_STORAGE_ACCOUNT`, `AZURE_STORAGE_CONTAINER` privado e `BACKUP_REMOTE_PREFIX` dedicado.
Acesso usa identidade gerenciada/credencial externa autorizada. Cópia na mesma região protege
contra perda do host, mas não garante desastre regional. Não há PITR/HA nesse mecanismo.

O script suspende somente o serviço `app` do Compose. Se Node estiver no host, pare-o
graciosamente antes de backup local e use `COMPOSE_ENV_FILE=.env`, override local e banco dev.

## Agenda, retenção e verificação

Após preencher um arquivo externo de configuração, instale o timer:

```bash
BACKUP_ENV_SOURCE=/caminho/seguro/backup.env ./scripts/install_backup_systemd.sh
systemctl list-timers plataforma-backup.timer
sudo systemctl start plataforma-backup.service
sudo systemctl show plataforma-backup.service -p Result -p ExecMainStatus
sudo journalctl -u plataforma-backup.service --since today --no-pager
```

As units e o instalador existentes assumem usuário `azureuser`, grupo `docker` e código
em `/opt/plataforma-cursos`; confira esses pré-requisitos em outra VPS antes de instalar.
O instalador usa sudo, grava `/etc/plataforma-cursos/backup.env` root:root modo 600 e agenda
`BACKUP_SCHEDULE`. Após mudar a agenda, execute o instalador novamente. Retenção padrão:
local 7 dias, offsite 30; limpeza só ocorre após novo backup válido e preserva latest-good.

Valide um conjunto montado no container sem restaurar:

```bash
docker compose --env-file .env.production -f compose.yaml run --rm --no-deps -T -v /var/backups/plataforma-cursos:/backup:ro app node scripts/backup_manifest.js verify --dir /backup/<backup-id>
```

Execute `scripts/backup_status.sh` com as mesmas variáveis operacionais para conferir RPO
local/remoto e marcador remoto. Esse status não substitui a validação do pacote baixado. Falha,
`RPO_AT_RISK`, espaço insuficiente ou marcador incompleto exigem diagnóstico; não altere checksums
para fazer um conjunto inválido passar.

## Offsite e ensaio

Com a configuração do provedor presente no ambiente, baixe para um diretório novo:

```bash
./scripts/backup_offsite.sh download latest /caminho/novo/drill-download
```

O download verifica ponteiro latest-good, complete, SHA-256 esperado do pacote, caminhos de extração,
manifesto e hashes internos. A extração usa `--no-same-owner`; como o downloader operacional pode
ser root, o script transfere somente a árvore temporária extraída ao UID/GID do serviço verificador
e normaliza diretórios para `0700` e arquivos para `0600`. O mount de verificação contém apenas o
backup baixado. O pacote e o marcador offsite originais não são alterados. Upload parcial não pode
ser selecionado como COMPLETE.

`./scripts/restore_drill.sh` usa `BACKUP_DRILL_DIR`, `RPO_HOURS`, `RTO_HOURS` e configuração
offsite. Requer Python 3, `setsid`, Docker local no contexto `default` com socket Unix e Compose
com suporte a `!override`/`!reset`. Não aceita `DOCKER_HOST`/`DOCKER_CONTEXT` no ambiente.

Por padrão, seleciona `compose.restore-drill.yaml`, mesmo se o ambiente de backup indicar outro
override. Esse arquivo remove os binds de init/backup-status, desativa Caddy, email e detector,
não publica portas e usa rede interna. `RESTORE_DRILL_ENV_FILE` escolhe o arquivo de ambiente.
O nome do banco/identidade deve corresponder ao snapshot, mas **os recursos Docker são novos**:
o ambiente pode fornecer credenciais da revisão a recuperar sem selecionar seus volumes.

Antes de build, downloader/verificador ou `up`, o guard valida o JSON resolvido pelo Compose:

- projeto com timestamp e token aleatório; volumes com o nome exato `<projeto>_<chave>`;
- nenhum volume externo, driver customizado/driver_opts, alias global, bind de serviço ou mount anônimo;
- rede própria interna; sem rede externa/host, portas públicas, serviços extras ou opções de acesso ao host;
- DB do app apontando somente ao serviço `db` local; storage nos dois mounts privados esperados;
- nenhum recurso preexistente reutilizado, mesmo com nome aparentemente compatível.

`RESTORE_DRILL_OVERRIDE_FILE` pode selecionar outro override, mas não contorna essas verificações.
Usar `compose.production.yaml` como override de drill é recusado preventivamente. Não tente
resolver uma recusa renomeando recursos permanentes ou mudando seus labels.

A configuração validada fica congelada em um arquivo `0600`, numa pasta nova `0700` em
`BACKUP_DRILL_DIR`. Drill, download e restore usam esse mesmo arquivo; não renderizam novamente
os overrides/variáveis originais para executar operações. O arquivo contém configuração sensível:
não o publique nem o inclua em evidências. A única montagem adicional de backup é somente leitura
e deve estar dentro da área privada de download dessa execução, sem symlinks para outro diretório.

O drill baixa/verifica o pacote, restaura DB e os dois storages, valida schema/contagens/hashes/
permissões/reconciliação e executa health. `RESTORE_SMOKE_CREDENTIALS_FILE` externo permite smoke
autenticado sem senha em argv. `restore_database.sh --mode isolated` exige o contexto validado
do drill; a simples presença de `restore` no nome do projeto não autoriza operação isolada.

### Cleanup e interrupções do drill

Recursos recebem o label `io.plataforma.restore.run`, além do projeto Compose. O cleanup confere
todos os proprietários antes de excluir e remove somente IDs/nomes exatos da execução. Não usa
`down -v --remove-orphans`, `prune` nem seleção por prefixo. A imagem app também precisa do label
da execução; imagens compartilhadas de MySQL não são removidas.

Sucesso, falha, SIGINT e SIGTERM param primeiro o grupo do comando ativo e tentam remover
containers/volumes/rede/imagem próprios, cópia baixada e relatórios temporários. A saída registra
`RESTORE_DRILL_TEMP_CLEANUP PASS` ou `FAIL`. Não redirecione nem publique conteúdo de snapshots
para obter evidências; registre a saída sanitizada e hashes.

Se o Docker falhar ou aparecer recurso de ownership divergente, o cleanup falha fechado e mantém
a pasta privada, informada por `retained=...`. Depois de inspecionar a causa, a limpeza pode ser
repetida com o mesmo guard e snapshot, sem tocar em recursos alheios:

```bash
python3 scripts/lib/restore-isolation.py cleanup \
  --project <projeto-da-execucao> --snapshot <pasta-retida>/compose.json
```

Apague a pasta retida somente após confirmar cleanup e necessidade de preservar diagnóstico.
SIGKILL, perda do host ou daemon indisponível não permitem garantir cleanup imediato. Não execute
`docker compose down -v` com o ambiente de produção para tentar limpar um drill.

### Regressões locais com dados fictícios

Os testes de configuração não fazem restore. Os testes Docker, opt-in, criam um MySQL privado,
schema 016, material/certificado fictícios e sentinela em volume alheio fictício. Azure CLI é
substituída por um servidor de arquivos local no processo de teste; nenhum backup real é baixado.

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover \
  -s tests/operations -p test_restore_isolation.py -v
PYTHONDONTWRITEBYTECODE=1 RUN_RESTORE_DOCKER_TESTS=1 python3 -m unittest discover \
  -s tests/operations -p test_restore_isolation_docker.py -v
```

Os testes cobrem restore completo, falha na importação, SIGINT/SIGTERM, rejeição de configuração
perigosa e integridade SHA-256 da sentinela. Usam apenas o Docker local, sem porta de MySQL publicada,
sem fallback para MySQL nativo e sem dados/volumes de produção.

## Restore: primeiro diagnóstico, depois aplicação explícita

Dry-run é o padrão. Exemplo de produção, após obter a revisão do manifesto e secrets externos:

```bash
COMPOSE_ENV_FILE=.env.production DB_NAME=plataforma_cursos ./scripts/restore_database.sh --backup /caminho/backup-ID --target production --mode in-place
```

Ele confere formato, hashes, complete, gzip, espaço, configuração, alvo e versão principal MySQL.
Para aplicar em janela de manutenção com destino conferido:

```bash
COMPOSE_ENV_FILE=.env.production DB_NAME=plataforma_cursos ./scripts/restore_database.sh --backup /caminho/backup-ID --target production --mode in-place --apply
```

APPLY para o app, derruba/recria o banco de destino e substitui integralmente os dois storages.
Não mistura dados. Valida schema, identidade, contagens, códigos/versões/status/hash/bytes,
permissões e reconciliador somente DRY-RUN; reinicia o app apenas após validação e health.
Falha posterior mantém o app parado para diagnóstico. Staging usa arquivo/override e target staging;
desenvolvimento usa target development com o override local.

Em perda da VM: obtenha host compatível e código da revisão do manifesto; forneça secrets por
canal separado; recupere acesso offsite; baixe/valide latest-good; execute dry-run; aplique sem
tráfego; confira schema, arquivos, autenticação e jornada essencial; só então reabra tráfego.
Meça RPO/RTO reais. Não aplique migrations futuras durante restore: valide o snapshot primeiro,
depois use o processo normal de deploy.

## Integridade e limites

`storage:reconcile` é DRY-RUN por padrão; não confunda diagnóstico com purge. Materiais possuem
retenção, mas certificados e suas versões históricas são preservados. Travas coordenam backup
e collector. Missing/corrupção exigem recuperação a partir do conjunto válido, sem exclusão em massa.
Fontes: [backup](../../scripts/backup_database.sh), [restore](../../scripts/restore_database.sh),
[drill](../../scripts/restore_drill.sh), [manifesto](../../scripts/backup_manifest.js).
