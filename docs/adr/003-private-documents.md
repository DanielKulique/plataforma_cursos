# ADR 003 — PDFs privados e certificados versionados com SHA-256

**Estado:** adotado; registro da implementação existente em 19/09/2026.

## Contexto

Materiais e certificados contêm dados acadêmicos e precisam de acesso autorizado,
preservação histórica e recuperação conjunta com o banco.

## Decisão

Guardar bytes em volumes privados separados, metadados no MySQL e servir downloads pela API.
Publicar arquivos sem sobrescrever versões. Certificados usam identidade própria, snapshot,
código/QR e hash SHA-256 dos bytes finais, com revogação/reemissão explícitas e histórico imutável.
Backup coordena dump e volumes; reconciliação é procedimento explícito.

## Consequências

Conhecer o caminho/código não dá acesso ao PDF. Alteração cadastral não reescreve o documento.
Hash confirma correspondência com o registro, sem equivaler a assinatura ICP-Brasil.
Filesystem e banco não têm transação distribuída: compensação e preservação em COMMIT incerto
exigem diagnóstico/reconciliação. Certificados não expiram pela coleta de materiais.

Referências: [certificados](../product/certificates.md),
[backup](../operations/backup-and-restore.md), [storage](../architecture/database.md).
