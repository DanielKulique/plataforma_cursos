> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Emissão e validação pública de certificados

## Arquitetura e regras

O módulo segue as camadas existentes: rotas → controller → serviço → model MySQL.
`certificate-pdf.service.js` gera o PDF e o QR; `certificate-storage.service.js` publica
o arquivo privado; `certificate.service.js` coordena autorização, transação e compensação.

A emissão é explícita. A matrícula deve estar `APROVADO`, após o fluxo acadêmico de
conclusão exata dos conteúdos e conquista >=75% na PROVA FINAL ativa (Goal 02). ADMIN emite em qualquer turma; PROFESSOR somente
na turma sob sua responsabilidade. ALUNO e visitante não emitem. Turmas `ENCERRADA`
continuam elegíveis para emissão, sem reabertura ou alteração da estrutura.

A migration `mysql/migrations/006_certificados.sql`, criada pelo usuário, foi preservada
e incorporada ao schema canônico (19 tabelas). `Certificados` registra aluno/turma,
snapshot dos nomes e carga horária, emissor/data, código público, hash, referência privada,
tamanho e histórico de revogação. A migration 009 acrescenta versão, predecessor e metadados
de reemissão. Novas versões incluem CPF e dados utilizados em snapshot_json privado;
legados preservam o snapshot estruturado adicional como NULL. CPF nunca é retornado pelo verificador público.

A migration 009 substitui `uk_certificado_aluno_turma` por `uk_certificado_ativo`,
`uk_certificado_versao` e `uk_certificado_anterior`; preserva `uk_certificado_codigo_publico`
e `uk_certificado_storage_name`. Esses índices são a proteção final de unicidade. A emissão bloqueia a
matrícula durante a transação; pedidos repetidos devolvem somente o registro ATIVO existente com
`reutilizado: true`. O código público contém 128 bits obtidos de `crypto.randomBytes`,
no formato `CERT-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX`; não é o hash nem o ID interno.

## PDF, QR e armazenamento

O PDF final reproduz o template institucional `certificado_temp.pptx` em duas páginas
de 1440 × 810 pontos. A primeira preserva faixa amarela, logo UTFPR, brasão, título
“DECLARAÇÃO”, redação acadêmica e área de responsável; a segunda preserva linhas amarelas,
metadados e conteúdos abordados. Brasão, faixa e logo foram extraídos do próprio PPTX e ficam
em `src/assets/certificates`, sem dependência de PowerPoint ou LibreOffice no runtime.

Os valores de aluno, CPF, curso, turma, carga horária, professor responsável e conteúdos vêm
do banco. A lista prioriza títulos de módulos; quando não há módulos, usa títulos de conteúdos.
A data usa o encerramento da turma quando ele já ocorreu; caso contrário, usa a emissão, pois o
schema atual não possui um timestamp específico de aprovação. Instituição, campus e função do
responsável são configuráveis por `CERTIFICATE_INSTITUTION_NAME`, `CERTIFICATE_CAMPUS` e
`CERTIFICATE_RESPONSIBLE_ROLE`; nenhum título acadêmico é inferido.

O QR e o mesmo código público foram adaptados discretamente ao canto inferior direito da primeira
página. O QR contém somente a URL `${APP_BASE_URL}/certificados/validar/CODIGO`, sem dados
pessoais. Configure o domínio correto antes de emitir.

O SHA-256 é calculado sobre os bytes finais, depois de adicionar texto, código e QR.
O PDF recebe UUID v4 como nome, permissão 0600 e diretório 0700, fora de `src/public`.
A publicação usa hard link atômico exclusivo: uma colisão de nome não sobrescreve nem
remove o arquivo anterior. Erros de geração não criam registro; falhas no INSERT
desfazem a transação e removem somente o novo arquivo.

`certificate_uploads:/app/storage/certificates` é um volume Docker separado de materiais.
Caddy não monta esse volume. A rota autenticada resolve o caminho pelo registro do banco,
verifica propriedade/responsabilidade e usa `application/pdf`, `Content-Disposition`,
`nosniff` e `private, no-store`. IDs ou caminhos enviados pelo cliente não escolhem arquivos
arbitrários.

## Rotas e interface

| Rota | Acesso / comportamento |
| --- | --- |
| `POST /api/certificados/matriculas/:id_matricula/emitir` | ADMIN ou PROFESSOR responsável; 201 novo, 200 existente |
| `GET /api/certificados/meus` | Certificados do ALUNO autenticado |
| `GET /api/certificados/:id_certificado/pdf` | Dono, PROFESSOR responsável ou ADMIN; `?download=1` para baixar |
| `POST /api/certificados/:id_certificado/revogar` | ADMIN; corpo `{ "motivo": "..." }`, 3–500 caracteres |
| `GET /api/public/certificados/:codigo` | Sem sessão; `VALIDO`, `REVOGADO` ou `NAO_ENCONTRADO` |
| `POST /api/public/certificados/validar-arquivo` | Sem sessão; um PDF no campo multipart `arquivo` |
| `/certificados/validar` e `/certificados/validar/:codigo` | Página pública e destino do QR |

A turma do professor/admin oferece emitir, visualizar, baixar, copiar código e, para ADMIN,
revogar. A sala virtual oferece “Meus certificados”. A validação pública mostra somente
nome do aluno, curso, turma, carga, emissão e código, sem IDs internos ou dados de contato.

O visitante envia o PDF somente para comparação. O backend calcula o hash, rejeita campos
extras (inclusive hash fornecido pelo cliente), múltiplos arquivos, MIME/extensão/cabeçalho
incompatíveis e excesso de tamanho. O buffer fica em memória e é descartado; não há upload
anônimo permanente. Resultado: `AUTENTICO`, `REVOGADO` ou `NAO_VALIDADO`, sem acusação de fraude.
Há limitadores separados por IP para código e upload (padrões: 30 e 10 por minuto).
O limite padrão do upload é 10 MB.

## Imutabilidade, revogação e replicação

Somente ADMIN revoga; registra motivo, ator e data, preservando bytes, hash e snapshots.
A matrícula com certificado ativo não pode ser cancelada nem rebaixada antes da revogação.
A alteração posterior do cadastro/curso não modifica o certificado emitido.

ADMIN pode corrigir/reemitir a última versão em `POST /api/certificados/:id_certificado/reemitir`,
com JSON contendo somente `motivo` (3–500 caracteres). A elegibilidade do Goal 02 é revalidada;
a versão anterior permanece REVOGADA e uma nova identidade é gerada, com PDF/QR/código/SHA/UUID
próprios. A migration 009 garante único ATIVO com coluna gerada + UNIQUE, mantendo várias
versões históricas. Emissão inicial comum recusa histórico revogado; professor não reemite.
`GET /api/certificados/:id_certificado/historico` preserva acesso autorizado a todas as versões.
[Modelo, concorrência, migration e evidências](../goals/GOAL_03_CERTIFICATE_VERSIONING.md).

A replicação copia apenas estrutura acadêmica. Não copia registros de `Certificados`,
arquivos, hashes, códigos ou revogações. O teste de integração coloca certificado na turma
de origem e comprova zero certificados na turma de destino.

## Backup e recuperação

O conjunto completo contém dump MySQL, materiais, certificados e manifesto SHA-256,
todos do mesmo timestamp. Consulte [BACKUP_RESTORE.md](BACKUP_RESTORE.md).
`scripts/verify_certificate_storage.js` confere presença, tamanho e hash de todos os
certificados registrados. O restore executa essa conferência ao terminar.

## Testes e operação

No ajuste institucional de 2026-09-06, lint, build, `git diff --check`, **503 testes
unitários** e **152 testes de integração** foram aprovados. As três
amostras visuais (campos curtos, campos longos e muitos conteúdos) estão em
`docs/screenshots/certificado-institucional-2026-09-06`.

Como o MySQL local existente recusava conexões, a integração foi executada em uma cópia
do mesmo código com MySQL 8.0 temporário, banco `plataforma_cursos_test`, diretório próprio
em `/tmp` e porta 13307. Nenhum banco existente foi recriado. A produção/staging usa MySQL 8.4.

A cobertura inclui permissões, elegibilidade, concorrência real, constraint de duplicidade,
PDF/QR, hash dos bytes finais, armazenamento, download privado, consulta pública,
upload original/alterado/inválido/grande, revogação, exclusão da replicação e falhas com
compensação. A página foi conferida em desktop/celular e nos estados válido/revogado.

O smoke HTTPS pode ser repetido com `scripts/smoke_certificates_staging.js`:

- `CERTIFICATE_SMOKE_MODE=issue`: emite pela conta fictícia do professor e verifica o fluxo;
- `CERTIFICATE_SMOKE_MODE=verify`: confere novamente por código e hash, sem emitir;
- `CERTIFICATE_SMOKE_MODE=revoke`: revoga pela conta ADMIN e confirma os dois validadores.

Informe `STAGING_BASE_URL`; nos modos verify/revoke, informe também
`CERTIFICATE_SMOKE_CODE` e `CERTIFICATE_SMOKE_SHA256`. Com `SMOKE_CREDENTIALS_STDIN=1`,
o script recebe as credenciais pela entrada padrão, sem imprimi-las. Um certificado demo
já revogado exige fluxo administrativo explícito. Para validar o ciclo v1 → v2, utilize
`scripts/smoke_certificate_versioning_staging.js`; modo `CERTIFICATE_VERSION_SMOKE_MODE=verify`
confere o cenário persistente após restart. O smoke recebe credenciais somente via stdin.

O staging foi atualizado em 2026-09-06 após backup completo. O certificado institucional
`CERT-5EAAAEBC-72EAD35F-D7AF5F65-CF16DD53` foi emitido para a segunda conta fictícia,
validado por código e upload, e permaneceu íntegro após reinício do container da aplicação.
O arquivo final possui duas páginas, 120040 bytes e SHA-256
`cf0aad4e2fd7103a1c30cf0f77bade53ea9334c13c3ed3d9f4119dd488c3b97a`.

## Limites do MVP

Não há ICP-Brasil, PAdES, Ed25519 ou armazenamento externo. Hash e consulta
confirmam correspondência com o registro da plataforma; não constituem assinatura digital.
O template utiliza fontes PDF padrão, sem cobertura Unicode universal. Listas com mais de 12
tópicos são resumidas para preservar duas páginas, informando quantos módulos adicionais existem.
Mudança de domínio
exige manter acessível a URL já impressa nos QR Codes.

Banco e filesystem não compartilham uma transação distribuída: erros tratados recebem
compensação, mas um encerramento abrupto do processo entre a publicação do arquivo e o
commit pode deixar um arquivo sem registro. A aplicação não publica esse arquivo por URL;
reconciliação após falhas de host deve ser feita a partir do banco e do backup, sem exclusões
indiscriminadas.
