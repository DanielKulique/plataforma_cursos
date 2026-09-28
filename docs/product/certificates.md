# Certificados

O certificado é um PDF próprio da plataforma, associado à matrícula e a uma versão acadêmica.
Seu código permite consultar o registro; o hash SHA-256 permite comparar os bytes recebidos
com os emitidos. Isso não é assinatura ICP-Brasil ou PAdES.

## Emissão e preservação

Quando o Teste Final é finalizado com nota >=75, o sistema marca a matrícula APROVADO e inicia
a emissão automaticamente. A elegibilidade revalida matrícula APROVADO e resultado >=75 do
Teste Final; conteúdos restantes não bloqueiam aprovação ou certificado. Simulado e outros
EXERCICIO são opcionais. Professor responsável ou ADMIN pode recuperar uma emissão ausente,
mas nenhuma ação humana é necessária no fluxo normal. Alunos não podem chamar emissão pela API.
Documento ATIVO existente é reutilizado; histórico revogado exige reemissão administrativa.

Se a geração do PDF falhar, a tentativa e o estado APROVADO permanecem persistidos. A emissão
idempotente pode ser repetida sem criar segundo certificado ATIVO. O procedimento administrativo
`npm run academic:reconcile-certificates` localiza estados legados inconsistentes; começa em
DRY-RUN e só aplica com `--apply`.

Cada versão tem PDF, UUID, código, hash, dados do emissor e snapshot acadêmico próprios.
O snapshot inclui nome, CPF, curso, turma, carga, data, responsável, conteúdos e requisitos.
Alterar cadastros não reescreve o PDF emitido. Legados sem snapshot não têm sua história
reconstruída artificialmente a partir dos cadastros atuais.

## Revogação e reemissão

Somente ADMIN revoga ou reemite, com `motivo` entre 3 e 500 caracteres. Reemissão atua
sobre a última versão, revalida elegibilidade e gera identidade nova, preservando a anterior
como REVOGADO. A constraint de banco permite somente um ATIVO por aluno/turma.
Revogação mantém PDF, hash, motivo, ator e data. O histórico fica disponível aos usuários
autorizados. Downloads históricos continuam privados.

## Validação e privacidade

A consulta pública por código apresenta dados reduzidos e não libera o PDF. O upload público
aceita somente o campo multipart `arquivo`, PDF até 10 MB por padrão, sem hash informado
pelo cliente. O servidor calcula SHA-256 dos bytes em memória e os descarta após comparar.
Resultados são AUTENTICO, REVOGADO ou NAO_VALIDADO; não são acusação de fraude.

O download privado é autorizado ao aluno titular, responsável pela turma ou ADMIN e usa
cache restrito. Código público, QR e consulta não substituem essa autorização.
Manter o domínio impresso no QR acessível é necessário para documentos já emitidos.

## Operação

O backup deve conter banco e PDFs do mesmo conjunto. Não remova versões antigas do storage.
`node scripts/verify_certificate_storage.js` verifica presença, tamanho e hash dos arquivos
registrados. O reconciliador não aplica a política de expiração de materiais a certificados.

O template usa fontes padrão de PDF e não oferece cobertura Unicode universal. Listas longas
de tópicos são resumidas para preservar a paginação institucional.

Referências: [serviço](../../src/api/services/certificate.service.js),
[gerador PDF](../../src/api/services/certificate-pdf.service.js),
[API](../api/overview.md) e [backup/restore](../operations/backup-and-restore.md).
