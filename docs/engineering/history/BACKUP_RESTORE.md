> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Backup e restauração

O procedimento operacional, formato, configuração, recuperação de VM, dry-run/APPLY, offsite,
retenção e RPO/RTO estão no
[runbook de backup e disaster recovery](BACKUP_RESTORE_RUNBOOK.md).

O resumo atualizado da instância dedicada, identidade obrigatória e comandos locais seguros está em
[ARQUITETURA_BANCO.md](ARQUITETURA_BANCO.md). O backup é exclusivamente lógico via `mysqldump`;
o restore valida a identidade persistente do destino e do manifesto antes de qualquer `DROP DATABASE`.

Não use os scripts históricos de três argumentos. O restore atual exige `--backup`, `--target` e,
para qualquer alteração, `--apply` explícito. Um `.sql.gz` isolado não é um backup funcional.
