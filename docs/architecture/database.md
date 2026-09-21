# Banco e storage

MySQL guarda usuários, ofertas, aprendizagem e metadados dos documentos. PDFs ficam em diretórios
privados; o banco referencia identidade, tamanho, hash e estado desses arquivos.

## Isolamento

| Ambiente | Banco | Identidade persistente |
| --- | --- | --- |
| Desenvolvimento | `plataforma_cursos_dev` | `plataforma_cursos_dev` |
| Integração | `plataforma_cursos_test` | `plataforma_cursos_test` |
| Staging | `plataforma_cursos_staging` | `plataforma_cursos_staging` |
| Produção | `plataforma_cursos` | `plataforma_cursos_prod` |

`environment_identity` contém o marcador conferido contra `DB_ENVIRONMENT_IDENTITY`.
Runtime, setup, seed, migrations e procedimentos operacionais validam o alvo. O MySQL nativo
do host e o container do projeto vizinho `motor_ia` não pertencem à plataforma.

Localmente, use o override `compose.local-db.yaml` e o volume nomeado
`plataforma_cursos_local_mysql84_data`. Node no host conecta exclusivamente em
`127.0.0.1:33307`. Containers conectam a `db` na rede Compose; a porta interna do MySQL
não é uma alternativa de conexão local.

## Consistência de arquivos

Materiais e certificados têm namespaces separados. Publicação usa arquivo temporário no
volume e publicação sem sobrescrever bytes anteriores. Locks por UUID coordenam escrita
e reconciliação. Falha conhecida permite compensação; COMMIT incerto preserva o arquivo
para diagnóstico, pois apagá-lo poderia quebrar um registro confirmado.

Material sem referência passa a RETIDO. A retenção padrão é 90 dias, com carência operacional
de 48 horas para candidatos; coleta exige ação explícita revisada. Certificados históricos
não participam da coleta de materiais. Nunca limpe `storage/` por parecer temporário.

Banco e volumes precisam de backup coordenado. Restaurar somente o dump não recupera PDFs.
Veja [schema](../database/schema.md), [migrations](../database/migrations.md) e
[backup e restore](../operations/backup-and-restore.md).
