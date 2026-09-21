> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Azure staging / demo

## Estado desta execução

`AZURE_STAGING_READY` em 2026-09-01 e `CERTIFICATE_VALIDATION_READY` em 2026-09-05. O ambiente
está publicado, protegido e validado em HTTPS.
A assinatura utilizada foi **Azure for Students**. Não há dependência de DNS externo: foi usado o
hostname público fornecido pelo Azure.

Revisão-base observada: branch `agent/checkpoint-goals-1-5-frontend-visual`, commit
`4eb8886ea2da5ec361960e47bc57ab6458537fe8`. Como o worktree contém mudanças ainda não
commitadas, a entrega deve usar o bundle gerado por `scripts/package_staging_bundle.sh`. O
SHA-256 do bundle e o hash da árvore-fonte em `.deployments/staging-history.log` identificam o
artefato exato. O bundle implantado foi validado com SHA-256
`849986cc3d8f315ebca5d1edc38804e7bc726da6afcded50de12ac5147b8acac`.

## Arquitetura e recursos

```text
Internet -> IP público estático -> NSG (22 restrito, 80, 443) -> Ubuntu 24.04
                                                               -> Caddy
                                                               -> Node.js
                                                               -> MySQL 8.4 + volume
```

Recursos realmente provisionados:

| Recurso | Valor |
| --- | --- |
| Resource Group | `plataforma-cursos-demo-rg` |
| VM | `plataforma-cursos-demo` |
| Região | `chilecentral` |
| SKU | `Standard_B2als_v2` (2 vCPU, 4 GiB) |
| SO | Ubuntu Server 24.04 LTS x64 (`24.04.202608270`) |
| Disco | Standard SSD LRS, 32 GiB |
| IP público | `57.156.63.2` (Standard, estático) |
| Hostname | `plataforma-cursos-demo-dk-20260901.chilecentral.cloudapp.azure.com` |
| Containers | `db` (MySQL 8.4), `app` (Node 20), `caddy` |

Itens cobrados: VM enquanto alocada, disco gerenciado e IP público; tráfego de saída pode ser
cobrado. Não são criados AKS, balanceador, banco gerenciado ou storage adicional. O alerta de
orçamento deve ser criado no nível da assinatura pelo responsável financeiro, pois exige valor e
contatos que não pertencem ao repositório.

`Standard_B2s` não estava disponível nas regiões permitidas pela política da assinatura. A
`Standard_B2als_v2` foi a menor opção B-series disponível que preservou 2 vCPU e aproximadamente
4 GiB para Node, MySQL e Caddy. A API pública de preços respondeu com rate limit durante a
consulta; por isso não há estimativa monetária falsa registrada aqui.

## Evidências da validação real

- Docker Engine `29.7.2` e Docker Compose `v5.5.0`; build da imagem concluído na VM.
- `db`, `app` e `caddy` saudáveis após deploy e após reinício completo da VM.
- MySQL `8.4`, usuário próprio da aplicação, volume `plataforma-cursos_mysql_data`; portas 3000 e
  3306 fechadas externamente.
- Migrations idempotentes concluídas; schema canônico atual com 19 tabelas.
- Seed fictício: 1 ADMIN, 1 PROFESSOR, 2 ALUNOS, curso, turma aberta, cinco tipos de conteúdo,
  exercício e prova.
- `http://` retorna 308; HTTPS retorna certificado Let's Encrypt válido; `/healthz` retorna 200;
  landing sem Basic Auth retorna 401.
- Smoke externo com `scripts/smoke_staging.js`: 11 grupos passaram, cobrindo login dos três
  papéis, matrícula/sala, PDF protegido, vídeo incorporável, CSRF, progresso, exercício, prova,
  resultados, replicação A→B sem histórico, nota/aprovação, autorização ADMIN e logout/login.
- Persistência confirmada após `restart app`, `restart db`, `compose down/up` sem `-v` e reinício
  da VM. Progresso e tentativas continuaram presentes.
- Backup inicial válido:
  `/opt/plataforma-cursos/backups/plataforma_cursos_staging-20260901T043653Z.sql.gz`, 4.910 bytes,
  modo 600, `gzip -t` aprovado e 16 tabelas no dump à época.
- Certificado observado: Let's Encrypt, válido de 2026-09-01 a 2026-11-30. Caddy fará a
  renovação automática enquanto DNS e portas 80/443 permanecerem disponíveis.

### Evidências do módulo de certificados — 2026-09-05

- Certificado de demonstração emitido uma única vez pelo professor responsável para matrícula
  aprovada; repetição idempotente devolveu o mesmo registro.
- Download autorizado para o próprio aluno e negado para outro aluno e visitante anônimo.
- Consulta pública por código e upload do PDF original retornaram `VALIDO`; um PDF alterado não
  foi reconhecido. Após revogação pelo ADMIN, código e upload passaram a retornar `REVOGADO`.
- Arquivo privado preservado com 5.807 bytes e SHA-256
  `60d8fb3839b0fefc3ae1ea28ebe1b526de3cccfb53ab4a58d31181a2f480ffcb` após reinício do app,
  reinício do banco, `compose down/up` sem remoção de volumes e reinício completo da VM.
- Verificação banco/volume: `CERTIFICATE_STORAGE_OK certificados=1`.
- Conjunto de backup final verificado pelo manifesto SHA-256:
  `/opt/plataforma-cursos/backups/plataforma_cursos_staging-backup-20260905T182503Z.sha256`,
  contendo dump SQL, materiais e o volume privado de certificados.

### Evidências da arquitetura de informação — 2026-09-19

- Goal 13 publicado com árvore-fonte SHA-256
  `dfa6f9a276ac4d177e024eead7be7f5bf1fed76d5f0d72c4d7254d10372cf3f3`.
- Backup pré-deploy `backup-20260919T144805Z-663da16c-95f9-448d-bd3e-505bd75fc778`
  concluído e validado como `GOOD`; nenhuma migration nova foi aplicada (`NO-OP`, versão 013).
- Schema validado com 21 tabelas, 173 colunas, 78 índices e 94 constraints.
- Smoke autenticado `INFORMATION_ARCHITECTURE_STAGING_SMOKE_OK`: 24 rotas/variações nos
  papéis ALUNO, PROFESSOR e ADMIN, incluindo deep-links, reload, browser back, autorização,
  parâmetros inválidos, recurso inexistente e PDF privado.
- Inspeção visual em 360, 768 e 1440 px, com 16 capturas finais e sem overflow estrutural ou
  erros de página. Evidências em `docs/screenshots/goal13-staging/`.

As credenciais de demonstração não ficam no Git nem neste documento. Elas estão somente na VM em
`/opt/plataforma-cursos/.staging-credentials`, modo 600, acessível pelo operador via SSH.

## 1. Provisionamento Azure

Na estação administrativa, instale a Azure CLI, autentique-se e selecione a assinatura correta:

```bash
az login
az account set --subscription '<subscription-id>'
az account show --query '{name:name,id:id,tenant:tenantId}' -o table
```

Crie uma chave exclusiva e restrinja SSH ao IP administrativo atual:

```bash
install -d -m 700 .azure-staging
ssh-keygen -t ed25519 -a 100 -f .azure-staging/id_ed25519 -C plataforma-cursos-staging
export ADMIN_CIDR="$(curl -fsS https://api.ipify.org)/32"
./scripts/provision_azure_staging.sh
```

O script é aditivo/idempotente e não remove recursos. Para outra região/SKU, defina
`AZURE_LOCATION` e `AZURE_VM_SIZE`. Confira depois:

```bash
az vm show -d -g plataforma-cursos-demo-rg -n plataforma-cursos-demo -o table
az network nsg rule list -g plataforma-cursos-demo-rg \
  --nsg-name plataforma-cursos-demo-nsg -o table
```

Somente 22/TCP, 80/TCP e 443/TCP devem estar permitidos. A regra SSH deve ter o `/32`
administrativo; 3000 e 3306 não são publicados.

## 2. DNS e acesso SSH

Crie no provedor DNS:

```text
Tipo: A
Nome: staging (ou demo)
Valor: <PUBLIC_IP mostrado pelo provisionamento>
TTL: 300 durante a preparação
```

Valide com `dig +short staging.example.org`. Em seguida:

```bash
ssh -i .azure-staging/id_ed25519 azureuser@<PUBLIC_IP>
```

Copie e execute o bootstrap do host:

```bash
scp -i .azure-staging/id_ed25519 scripts/bootstrap_azure_vm.sh azureuser@<PUBLIC_IP>:/tmp/
ssh -i .azure-staging/id_ed25519 azureuser@<PUBLIC_IP> 'bash /tmp/bootstrap_azure_vm.sh'
```

Reconecte ao SSH para aplicar o grupo `docker`, então confirme `docker --version` e
`docker compose version`. O usuário é não-root e usa `sudo` apenas para a preparação do host.

## 3. Entrega do código e segredos

Enquanto o worktree não estiver consolidado em uma revisão Git, gere e envie um bundle:

```bash
./scripts/package_staging_bundle.sh /tmp/plataforma-cursos-staging.tgz
scp -i .azure-staging/id_ed25519 /tmp/plataforma-cursos-staging.tgz azureuser@<PUBLIC_IP>:/tmp/
ssh -i .azure-staging/id_ed25519 azureuser@<PUBLIC_IP> \
  'tar -xzf /tmp/plataforma-cursos-staging.tgz -C /opt/plataforma-cursos'
```

Na VM, copie `.env.staging.example` para `.env.staging`, substitua todos os placeholders e use
`chmod 600 .env.staging`. Gere valores independentes com `openssl rand -base64 36` (MySQL),
`openssl rand -base64 48` (JWT) e senhas fortes exclusivas para ADMIN/demo.

Gere a proteção temporária do Caddy sem gravar senha em texto no repositório:

```bash
docker run --rm caddy:2.8-alpine caddy hash-password
```

Copie o hash bcrypt para `STAGING_BASIC_AUTH_HASH`, duplicando cada `$` como `$$` para o
Compose. Configure `STAGING_BASIC_AUTH_USER`. O healthcheck `/healthz` permanece público e
retorna apenas `{"status":"ok"}`; as demais rotas exigem Basic Auth além do login da aplicação.
O header `X-Robots-Tag` impede indexação acidental, sem ser tratado como controle de acesso.

Para a demo inicial, mantenha `DETECTOR_ENABLED=false` e `EMAIL_DELIVERY_ENABLED=false`.
Não invente Resend: recuperação continua com resposta pública neutra, porém nenhuma mensagem é
entregue. Quando houver credenciais reais de staging, preencha `RESEND_API_KEY`, `MAIL_FROM` e
altere a flag para `true`.

O smoke direcionado do fluxo de identidade pode validar cadastro pendente, login bloqueado,
confirmação, reenvio idempotente e rate limits mesmo com entrega desabilitada. Ele lê o código
somente do banco descartável de staging, não o imprime e remove a conta criada ao final:

```bash
cat /opt/plataforma-cursos/.staging-credentials | \
  docker compose --env-file .env.staging -f compose.yaml -f compose.staging.yaml \
  run --rm -T -e SMOKE_CREDENTIALS_STDIN=1 app npm run staging:smoke:identity
```

## 4. Deploy, migration, bootstrap e seed

Na VM:

```bash
cd /opt/plataforma-cursos
chmod +x scripts/*.sh
STAGING_ENV_FILE=.env.staging ./scripts/deploy_staging.sh
```

O fluxo valida o Compose, cria backup se já houver banco ativo, faz build real, sobe MySQL,
aplica migrations explicitamente, verifica as 19 tabelas, executa o bootstrap ADMIN, aplica o seed
idempotente e sobe Caddy/app. O seed só aceita `NODE_ENV=production`, `APP_ENV=staging`, banco
com `staging` ou `demo` no nome e confirmação explícita. Ele cria apenas identidades `.test`, uma
turma aberta, aluno matriculado, aluno sem matrícula, módulo, texto, PDF, vídeo YouTube, link,
atividade, questionário e prova.

Após o primeiro bootstrap, mantenha a credencial no cofre/canal seguro da demonstração. É seguro
remover `INITIAL_ADMIN_PASSWORD` de `.env.staging`: em atualizações, o deploy confirma que já
existe um ADMIN antes de pular o bootstrap. Não registre senhas em tickets ou documentação.

Atualizações repetem o mesmo comando. Quando houver revisão Git limpa na VM, registre branch e
commit antes do deploy; não faça `git pull` sobre worktree sujo.

## 5. HTTPS e validações operacionais

Depois da propagação DNS, Caddy emite o certificado automaticamente. Neste ambiente, use o
hostname Azure registrado acima. Valide externamente:

```bash
curl -fsS https://staging.example.org/healthz
curl -sSI http://staging.example.org/ | sed -n '1,8p'
curl -sSI -u 'demo:<senha-basic-auth>' https://staging.example.org/ | sed -n '1,15p'
```

O primeiro comando deve retornar 200, HTTP deve redirecionar a HTTPS e a resposta autenticada
deve conter HSTS e `X-Robots-Tag`. No navegador, confirme certificado válido e cookie
`plataforma_session` com `Secure`, `HttpOnly` e `SameSite=Lax`.

Verifique serviços e logs sem copiar segredos:

```bash
docker compose --env-file .env.staging -f compose.yaml -f compose.staging.yaml ps
docker compose --env-file .env.staging -f compose.yaml -f compose.staging.yaml logs --tail=200 app db caddy
```

Procure falhas críticas e indícios de `password`, `cookie`, `jwt`, `csrf`, `token` ou `api_key`.
Não publique o output bruto se ele contiver valores sensíveis.

## 6. Smoke test real

Use uma janela privada e registre horário/resultado de cada item:

1. Acesse landing, catálogo e login usando Basic Auth.
2. Entre como `aluno.demo@example.test`, abra a turma e percorra texto, PDF, vídeo, link e atividade.
3. Confirme que `/assets/materiais/guia-integridade-academica.pdf` não entrega o PDF diretamente.
4. Marque conteúdo concluído, atualize a página, responda questionário e prova, saia e entre novamente.
5. Entre como `sem.matricula.demo@example.test` e confirme 403 no conteúdo/PDF da turma.
6. Entre como `professor.demo@example.test`, confira apenas a turma atribuída, alunos, progresso,
   avaliações e a regra corrente de nota/aprovação.
7. Entre com o ADMIN bootstrap, confira dashboard e operações acadêmicas essenciais.
8. Confirme 403 para aluno em rotas ADMIN e para professor em turma não atribuída.

O vídeo deve ser testado no browser publicado; sucesso por `curl` não comprova o iframe.

Na validação automatizada desta execução, o endpoint de embed do YouTube respondeu 200 e a CSP
publicada limitou `frame-src` a `self` e `https://www.youtube.com`. A confirmação visual no
navegador da apresentação continua sendo uma checagem operacional recomendada, não um bloqueio
de infraestrutura.

## 7. Persistência, reinício e backup

Após criar progresso real no smoke test:

```bash
C='docker compose --env-file .env.staging -f compose.yaml -f compose.staging.yaml'
$C restart app
$C restart db
$C down
$C up -d
```

Confirme os mesmos dados após cada etapa. Nunca use `down -v`. Reinicie a VM uma vez:

```bash
sudo reboot
```

Reconecte, aguarde os healthchecks e valide `ps`, `/healthz`, login e progresso. As políticas
`restart: unless-stopped` devem recuperar todos os containers.

Backup manual real pelo serviço instalado (offsite obrigatório):

```bash
sudo systemctl start plataforma-backup.service
sudo systemctl show plataforma-backup.service -p Result -p ExecMainStatus
systemctl list-timers plataforma-backup.timer
```

O timer diário está definido para 03:15 `America/Sao_Paulo`, com persistência após períodos em que
a VM ficou desligada. Os conjuntos locais ficam em `/var/backups/plataforma-cursos`; o latest-good
também é publicado no container Azure Blob privado. Consulte o
[runbook de backup/restore](BACKUP_RESTORE_RUNBOOK.md) antes de validar, baixar ou
restaurar qualquer conjunto. Restore in-place nunca deve ser usado como drill.

## 8. Rollback e troubleshooting

Antes de migration, preserve o backup. Para rollback de código, reenvie o bundle anterior (hash
registrado) ou faça checkout detached do commit anterior e reconstrua `app`. Se o schema não for
compatível com a versão anterior, não improvise downgrade: restaure o backup em janela controlada.

- Certificado não emitido: confirme DNS, relógio da VM, portas 80/443 e logs do Caddy.
- App unhealthy: confira `docker compose logs app db` e `db:schema:verify`.
- Login sem cookie: confirme URL HTTPS, `NODE_ENV=production`, domínio e proxy único Caddy→Node.
- Caddy rejeita configuração: confira hash bcrypt com `$` duplicados no arquivo de ambiente.
- Seed recusado: confirme `APP_ENV=staging` e nome dedicado do banco; não afrouxe a proteção.

## 9. Desligamento após apresentação

Desaloque para interromper cobrança de computação, preservando disco e dados:

```bash
az vm deallocate -g plataforma-cursos-demo-rg -n plataforma-cursos-demo
az vm get-instance-view -g plataforma-cursos-demo-rg -n plataforma-cursos-demo \
  --query instanceView.statuses -o table
```

Para retomar: `az vm start -g plataforma-cursos-demo-rg -n plataforma-cursos-demo`. O IP Standard
estático permanece reservado e pode continuar gerando custo. A remoção do Resource Group é
destrutiva e não faz parte deste procedimento.
