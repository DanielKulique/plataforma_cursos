> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../index.md).

# Catálogo de regras de negócio

Regras derivadas do código atual; “permitido” significa aceito pelo backend, incluindo limitações observadas. Caminhos abreviados: rotas/controllers/models em `src/api/`; serviços em `src/api/services/`; middleware em `src/middlewares/`; schema em `mysql/schema.sql`; scripts frontend em `src/public/js/`.

## RN-001 — Cadastro público restrito

O controller força ALUNO. Somente ADMIN cria outros papéis. CPF e e-mail são únicos; CPF é validado como 11 dígitos, não por algoritmo de dígitos verificadores.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `usuarios.routes.js; usuarios.controller.js; usuarios.models.js; schema.sql`.

## RN-002 — Verificação de e-mail explícita

Cadastro público de ALUNO cria `Usuarios` e `EmailVerificacoes` pendente na mesma transação. O envio externo ocorre somente depois do commit; falha de entrega preserva a conta pendente e habilita reenvio. Login exige `verificado=1` e bloqueia também a ausência da linha. Reenvio serializa pelo usuário/verificação, atualiza apenas registros pendentes e responde de forma genérica; conta confirmada não é desconfirmada. Confirmação também usa lock e é idempotente. E-mails são normalizados com `trim` e lowercase nos pontos do fluxo.

**Estado:** IMPLEMENTADO no escopo descrito. **Evidência:** `usuarios.models.js:criarAlunoComVerificacao; auth.models.js:login/enviarCodigoVerificacaoPorEmail/verificarCodigoEmail; identity.js; cadastro.js`.

## RN-003 — Sessão atual no banco

Cookie JWT tem id, papel informativo, csrf e versão sv. Cada requisição autenticada consulta o usuário e sua versão no banco; o papel atual vem dessa consulta. Bearer continua aceito; cookie tem precedência.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `session.js; checkAuth.middleware.js`.

## RN-004 — Revogação global de sessões

Logout, troca e reset incrementam versao_sessao, invalidando todos os tokens anteriores da conta. Troca exige senha atual e só aceita o próprio usuário, inclusive para ADMIN.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `auth.models.js; usuarios.models.js:alterarSenha`.

## RN-005 — Recuperação de uso único

Token aleatório de 32 bytes; só SHA-256 persiste. Prazo padrão 20 minutos; reset bloqueia registro, verifica expiração/uso, troca senha e invalida tokens/sessões em transação. Solicitação responde 202 indistinguível, mesmo se envio falhar.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `auth.models.js; auth.controller.js`.

## RN-006 — Proteção administrativa e vínculos

Último ADMIN não pode ser rebaixado/excluído; autoexclusão administrativa é recusada. Professor com turmas e aluno com vínculos acadêmicos não mudam para outro papel. Exclusão de usuário com vínculos consultados é bloqueada.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `usuarios.models.js:protegerUltimoAdmin/obterVinculos/deletarUsuario`.

## RN-007 — Oferta administrada

CRUD de cursos e metadados de turmas é ADMIN. Curso tem nome único; turma tem nome global único, curso existente, professor de tipo PROFESSOR e data final não anterior à inicial.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `cursos.routes.js; turmas.routes.js; cursos.models.js; turmas.models.js`.

## RN-008 — Estados de turma

ABERTA aceita matrícula e estudo; FECHADA recusa novas matrículas mas mantém estudo; ENCERRADA bloqueia conteúdos/questionário respondível/progresso/submissão do aluno e alterações estruturais. ADMIN pode atualizar para qualquer um dos três estados, inclusive reabrir. Datas não mudam estado automaticamente.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `turmas.models.js; matricula.models.js; conteudos.controller.js; questoes.controller.js`.

## RN-009 — Matrícula do próprio aluno

POST usa req.user.id_usuario, exige ALUNO e turma ABERTA. Transação bloqueia turma; UNIQUE aluno+turma e teste de registro ativo impedem duplicata (409). Não há controle de vagas ou limite temporal por data de início/fim.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `matricula.routes.js; matricula.controller.js; matricula.models.js:matricularAluno`.

## RN-010 — Reativação de matrícula

Registro CANCELADO é reutilizado se turma ABERTA; volta a CURSANDO, incrementa `ciclo_atual` uma vez, redefine nota/progresso e data; exclui progresso dos conteúdos dessa turma, mas não apaga tentativas, respostas ou certificados revogados. O PATCH acadêmico não pode substituir essa operação.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `matricula.models.js:matricularAluno`.

## RN-011 — Escopo de matrícula

Aluno consulta a própria; professor consulta alunos da turma atribuída; ADMIN consulta globalmente. Listagem aluno/:id usa próprio ID ou ADMIN, não concede a professor visão arbitrária de aluno. Cancelamento só pelo próprio aluno ou ADMIN.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `checkProfessorPermission.middleware.js; checkUserPermission.middleware.js; matricula.routes.js`.

## RN-012 — Cancelamento preserva registro

DELETE de matrícula atualiza status para CANCELADO; não apaga a linha. Certificado ATIVO impede cancelamento e saída de APROVADO até revogação.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `matricula.models.js:cancelarMatricula/atualizarMatricula`.

## RN-013 — Autoria estrutural por ownership

ADMIN ou PROFESSOR cujo id é id_professor da turma podem gerir aulas/conteúdos/avaliações. Ambos devem reabrir turma ENCERRADA. Parte das checagens ocorre antes da transação e não é repetida em todos os models.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `academic-access.service.js; conteudos.controller.js; questoes.controller.js`.

## RN-014 — Organização por aula

Modulos pertence à turma; Conteudos e Questionarios aceitam id_modulo nulo. Referência não nula deve pertencer à mesma turma, validada no backend. Interface chama módulo de aula.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `conteudos.models.js:validarModuloDaTurma; questoes.models.js:validarAula; learning-path.js`.

## RN-015 — Ordenação

Ordem de módulo é única por turma; conteúdo também é único por turma, não por aula. Pergunta tem ordem única por questionário, opção por pergunta. Questionário tem ordem não única e título único por turma+tipo. UI desempata materiais/avaliações por tipo/título.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `schema.sql; learning-path.js:ordenarItens`.

## RN-016 — Tipos de conteúdo

VIDEO exige https://www.youtube.com/embed/…; PDF usa arquivo privado ou referência legada /assets/materiais/nome.pdf. URL deve passar allowlist mesma origem/YouTube. TEXTO e ATIVIDADE exibem corpo como texto; não há submissão de tarefa.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `conteudos.models.js:validarReferenciaConteudo; security-utils.js; sala-aula.js`.

## RN-017 — Leitura acadêmica

Aluno exige matrícula não CANCELADO e turma não ENCERRADA. Professor exige ownership; ADMIN tem escopo global. PDF repete autorização; acesso direto à pasta pública de materiais retorna 404.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `conteudos.controller.js:autorizarLeitura/material; index.js`.

## RN-018 — Publicação de PDF

Multipart tem exatamente arquivo, extensão .pdf, MIME application/pdf, magic bytes %PDF-, tamanho limitado e nome seguro. O PDF deve conter encerramento e páginas legíveis pelo parser; documento criptografado ou estruturalmente inválido é recusado antes da publicação. Usuário é autorizado antes do multipart; vínculo/estado são revalidados na transação de persistência.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `material-upload.service.js; conteudos.routes.js; conteudos.models.js`.

## RN-019 — Imutabilidade e retenção de materiais

Substituição gera novo UUID/arquivo/metadado e muda referência do conteúdo. Arquivo antigo não é sobrescrito nem automaticamente excluído. Replicação pode continuar apontando ao antigo. Quando não há referências restantes, o asset passa a RETIDO com retido_em. Collector explícito aplica retenção padrão de 90 dias, preserva metadata e nunca afeta certificados.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `material-upload.service.js; conteudos.models.js:substituirPdfComArquivo; turma-replication.service.js`.

## RN-020 — Progresso monotônico por conteúdo

Aluno informa INICIADO ou CONCLUIDO. Upsert preserva CONCLUIDO e datas anteriores; aluno não regride conclusão. Exige matrícula não cancelada e turma não encerrada, com transação.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `conteudos.models.js:registrarProgresso`.

## RN-021 — Progresso acadêmico derivado

Percentual = arredondar(100 × conteúdos concluídos / total de conteúdos da turma), limitado a 0–100; turma vazia retorna 0. VIDEO, TEXTO, PDF, LINK e ATIVIDADE (todos os registros de Conteudos) entram; Questionarios, inclusive EXERCICIO/PROVA, não entram. Campo armazenado é cache visual; consultas derivam contagens e percentual. Conclusão acadêmica usa exclusivamente `total_conteudos > 0 && conteudos_concluidos === total_conteudos` em `academic-progress.service.js`; 0/0 é falso. Não comprova leitura/tempo de vídeo.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `matricula.models.js:COLUNAS_PROGRESSO_DERIVADO; conteudos.models.js`.

## RN-022 — Progresso de apresentação da aula

Resumo por aula inclui conteúdos e questionários ativos. EXERCICIO/prova intermediária contam após tentativa finalizada; PROVA FINAL indica requisito atendido somente com tentativa >=75%. Esse resumo não decide conclusão nem liberação da prova. Não há bloqueio sequencial de aulas.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `learning-path.js:progressoAula; questoes.models.js:listarTrilhaAluno`.

## RN-023 — Aprovação objetiva e nota manual compatível

CURSANDO vira APROVADO automaticamente quando `total_conteudos > 0 && conteudos_concluidos === total_conteudos` e existe tentativa FINALIZADA da PROVA FINAL ativa da turma com percentual >=75. A avaliação ocorre na transação de progresso e de submissão final, nas duas ordens; é idempotente e não emite certificado. Tentativa pior não remove conquista anterior; resultado <75 não reprova. CANCELADO/REPROVADO manuais não são reativados automaticamente.

`nota_final` permanece campo manual opcional 0–10, sem conversão automática do percentual. Sua ausência não bloqueia APROVADO. PATCH de professor/ADMIN exige os mesmos requisitos objetivos para APROVADO. REPROVADO mantém decisão manual, conclusão integral e nota obrigatória. Não existe mínimo para EXERCICIO. 200/201 pode mostrar 100%, mas nunca passa no gate exato.

**Evidência:** `academic-progress.service.js:avaliarAprovacao/buscarRequisitos`; `conteudos.models.js:registrarProgresso`; `questoes.models.js:submeter`; `matricula.models.js:atualizarMatricula`.

## RN-024 — Exclusão preserva histórico

Conteúdo com qualquer progresso não pode ser excluído; módulo com conteúdos ou avaliações também não. Turma com qualquer matrícula e curso com turma não podem ser removidos.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `conteudos.models.js; turmas.models.js; cursos.models.js`.

## RN-025 — Avaliações disponíveis

Questionário ativo pode ser PROVA ou EXERCICIO. Rota respondível é apenas ALUNO matriculado, turma não encerrada; sem ID explícito escolhe um por ordem DESC/título, padrão PROVA. Metadados para aluno filtram ativos, mas não bloqueiam turma encerrada. A designação estrutural `Questionarios.prova_final=1` identifica a única prova final por turma; NULL significa avaliação comum. Nenhuma prova legada é inferida como final. Alterar a designação com histórico é bloqueado.

A PROVA FINAL somente entrega perguntas e aceita nova submissão se `total_trilha > 0 && trilha_realizada * 100 >= total_trilha * 80`. Trilha = todos os Conteudos + Questionarios EXERCICIO ativos da turma. Exercício vale uma unidade quando existe tentativa do aluno na mesma turma com finalizada_em não nula, qualquer nota, sem duplicar retries. Provas, inativos e outros alunos/turmas ficam fora. 0/0 bloqueia; 80/101 bloqueia; 81/101 libera. O gate é revalidado na submissão; metadados expõem requisitos sem perguntas/gabarito.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `questoes.controller.js:listar/listarMetadados; questoes.models.js:listarAluno`.

## RN-026 — Perguntas e gabarito

Fluxo aceita MULTIPLA_ESCOLHA e VERDADEIRO_FALSO; RESPOSTA_CURTA do schema é recusada. Criação de pergunta exige pelo menos duas opções e exatamente uma correta. Pontos positivos até 1000 na rota. Leitura do aluno não retorna correta.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `questoes.routes.js; questoes.models.js`.

## RN-027 — Integridade das opções

Selecionar outra correta desmarca as demais; não permite desmarcar/excluir correta sem substituta nem excluir abaixo de duas opções. Opções com respostas acadêmicas não podem ser alteradas/excluídas; checagens no backend, não CHECK de gabarito no banco.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `questoes.models.js:criarOpcao/atualizarOpcao/removerOpcao`.

## RN-028 — Proteção histórica de avaliação

Questionário com tentativas não pode ser excluído; alterações ficam limitadas a disponibilidade (`ativo`), aula (`id_modulo`) e ordem. O erro de conflito explicita que enunciado, tipo, perguntas, alternativas e gabarito estão congelados. Pergunta com respostas não pode ser editada/excluída. Criar nova pergunta em questionário com tentativas não tem bloqueio equivalente.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `questoes.models.js:atualizarQuestionario/removerQuestionario/criarPergunta`.

## RN-029 — Submissão integral

Somente aluno; envia UUID submission_id e exatamente uma opção por pergunta atual, sem duplicatas, com pertencimento validado. Não aceita nota/gabarito do cliente. Questionário precisa estar ativo e ter perguntas suportadas.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `questoes.routes.js; questoes.models.js:validarRespostas/submeter`.

## RN-030 — Correção ponderada

Acertos conta opções corretas e pontuação soma seus pontos; ambos calculados no backend. Pontos DECIMAL(...,2) são somados em centésimos inteiros para a razão. Percentual persiste com duas casas: PROVA FINAL usa truncamento conservador, para que um resultado real abaixo de 75 nunca arredonde para 75; demais avaliações mantêm arredondamento anterior. 74,99 não atende; 75,00 atende. Depois de finalizar a prova final, avalia aprovação automática na mesma transação. Não altera nota_final.

A conquista é EXISTS tentativa FINALIZADA >=75 da prova final atual/ativa; não depende da última tentativa. Tentativas ilimitadas, histórico e idempotência por submission_id permanecem. Repetir a mesma chave retorna a tentativa existente, sem criar nova tentativa ou exigir novamente a meta de abertura.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `questoes.models.js:submeter`.

## RN-031 — Idempotência de tentativa

UNIQUE usuário+questionário+ciclo+chave. Repetição de chave no mesmo ciclo devolve tentativa finalizada; a mesma chave em novo ciclo cria nova tentativa e nunca reutiliza resultado histórico. Não compara hash das respostas. Checagens de disponibilidade ocorrem antes da busca da tentativa; retry após inativação/encerramento pode falhar. Novos UUIDs criam novas tentativas sem limite acadêmico encontrado.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `questoes.models.js:submeter; schema.sql`.

## RN-032 — Histórico e resultados

Aluno vê todas as próprias tentativas, inclusive anteriores à reativação, com `ciclo_matricula`; responsável/ADMIN vê resultados por turma também identificados por ciclo. Somente cálculos de estado atual filtram o ciclo. Não há endpoint de histórico de terceiros para aluno nem correção discursiva.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `questoes.routes.js; questoes.controller.js; questoes.models.js:historico/resultadosTurma`.

## RN-033 — Replicação administrativa

Somente ADMIN; origem pode ter qualquer status. Copia turma no mesmo curso, módulos, conteúdos, questionários, perguntas e opções com IDs novos e remapeamento. Não copia matrículas, progresso, respostas, tentativas ou certificados.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `turmas.routes.js; turma-replication.service.js`.

## RN-034 — Idempotência de replicação

Idempotency-Key 16–64 caracteres seguros; UNIQUE global. Hash inclui origem e dados normalizados do destino. Mesma chave+dados reutiliza; mesma chave+dados diferentes retorna 409. Transação e tratamento de duplicata protegem corrida.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `turmas.routes.js; turma-replication.service.js; ReplicacoesTurma`.

## RN-035 — Emissão de certificado

Professor responsável ou ADMIN emite só para matrícula APROVADO. Uma nova emissão revalida a conclusão exata atual e a existência de tentativa FINALIZADA da PROVA FINAL ativa >=75 na mesma conexão/transação, após bloquear contexto (matrícula/turma) e antes de PDF, arquivo ou INSERT. Falha retorna 409 CONTEUDOS_PENDENTES ou PROVA_FINAL_PENDENTE sem efeitos de emissão. Turma ENCERRADA continua elegível; não exige ABERTA nem muda nota. Novo conteúdo após aprovação mantém APROVADO, mas impede nova emissão até sua conclusão. Retorna somente o documento ATIVO existente sem regeneração. Histórico revogado bloqueia emissão normal (409 REEMISSAO_ADMIN_NECESSARIA), inclusive para ADMIN. A correção usa o endpoint explícito de reemissão.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `certificate.service.js:autorizarEmissao/emitirCertificado; certificados.models.js`.

## RN-036 — Documento final e identidade

PDF contém dados acadêmicos, CPF, responsável e conteúdos/aulas; cada nova versão preserva snapshot estruturado do nome, CPF, curso, turma, carga, data do certificado, responsável, conteúdos e requisitos acadêmicos utilizados. Legados mantêm snapshot_json NULL; seus dados históricos não são reconstruídos a partir do cadastro atual. Código público aleatório de 128 bits, QR da URL de validação, UUID de storage e SHA-256 dos bytes finais. Não há assinatura digital criptográfica do emissor.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `certificate.service.js; certificate-pdf.service.js; certificate-storage.service.js`.

## RN-037 — Acesso ao certificado

Aluno dono, professor atualmente responsável e ADMIN podem ler/baixar PDF, inclusive revogado; lista meus é só ALUNO. Código público não concede download pela API privada.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `certificate.service.js:obterDownload/listarMeusCertificados`.

## RN-038 — Revogação irreversível pela API

Somente ADMIN com motivo de 3–500 caracteres; preserva PDF e metadados e registra revogador/data/motivo. Repetição retorna estado existente. Sem reativação. Reemissão administrativa explícita cria outra identidade e mantém a revogação anterior, inclusive sua autoria, data e motivo quando já estava revogada.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `certificados.routes.js; certificate.service.js:revogarCertificado; schema.sql`.

## RN-039 — Validação pública

Código normalizado retorna VALIDO/REVOGADO/NAO_ENCONTRADO. Upload calcula hash no servidor e retorna AUTENTICO/REVOGADO/NAO_VALIDADO; guarda buffer em memória e zera ao terminar. Expõe nome e dados acadêmicos, não CPF/e-mail/hash/caminho.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `public-certificados.routes.js; certificate.service.js; certificados.controller.js`.

## RN-040 — Detector experimental

DETECTOR_ENABLED controla gateways; desligado retorna 503 e capability false. Legado de dois textos é só ALUNO; contextual/indexado aceitam os três papéis; status/reload de índice só ADMIN. Persistência de texto ocorre no legado; contextual salva resumo, incremental/indexado não salvam histórico local.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `featureFlag.middleware.js; analises-contextuais.controller.js; indexed-analysis.controller.js; plagio.controller.js`.

## RN-041 — Backup e recuperação operacionais

Script exporta SQL transacional, materiais, certificados e manifesto SHA-256. Restore exige confirmação de operador e três arquivos; verifica arquivos de certificados ao final, mas não verifica automaticamente manifesto nem interrompe escritores.

**Estado:** IMPLEMENTADO no escopo descrito, salvo lacuna explicitada. **Evidência:** `scripts/backup_database.sh; scripts/restore_database.sh; scripts/verify_certificate_storage.js`.

## Inconsistências consolidadas

RN-002: cadastro e confirmação não atômicos; RN-008/RN-025: metadados e conteúdo respondível divergem para ENCERRADA; RN-021/RN-022: denominadores distintos; RN-028: adição de pergunta ainda altera estrutura histórica, mas a mensagem agora descreve corretamente disponibilidade, aula e ordem; RN-023/RN-035: gates corrigidos no Goal 02; alteração de estrutura após certificado existente continua fora do escopo (Goal 03). `docs/engineering/history/AZURE_STAGING.md` relata upload de certificado retornando VALIDO; o service atual retorna AUTENTICO. Ver recomendações e impacto em [riscos](09-risks-technical-debt.md).

### Goal 03 — versionamento e substituição

Versão começa em 1 e cresce sob lock de matrícula/turma, sem exclusão pelo fluxo da aplicação. Apenas ADMIN pode reemitir a última versão, ATIVA ou REVOGADA. Se ATIVA, a revogação e o INSERT da sucessora pertencem à mesma transação. Se já REVOGADA, seus metadados de revogação ficam intactos. Duas solicitações ao mesmo ID produzem uma sucessora e 409 para a perdedora. Reutilização de ATIVO não é reemissão; retry ao ID substituído exige atualizar o histórico. Alterações futuras do cadastro ou template não afetam documentos existentes.

### Goal 04 — ciclo acadêmico e rematrícula

CANCELADO é terminal no ciclo vigente. Sua única saída é o `POST /api/matriculas` feito pelo próprio aluno, com turma ABERTA; o PATCH de professor/ADMIN não pode transformá-lo em CURSANDO, APROVADO ou REPROVADO. A operação oficial reutiliza a linha, incrementa `ciclo_atual` exatamente uma vez sob os locks de turma/matrícula, redefine nota e progresso atual e apaga somente `ConteudosProgresso` da turma. FECHADA/ENCERRADA recusam rematrícula; REPROVADO mantém a política anterior.

Cada tentativa grava o `ciclo_matricula` obtido da matrícula bloqueada. Exercício realizado, 80%, prova final >=75, aprovação automática e elegibilidade de certificado consideram apenas o ciclo atual. Tentativas e respostas antigas permanecem consultáveis e rotuladas por ciclo. Certificado ATIVO continua bloqueando cancelamento; rematrícula nunca revoga, reemite ou modifica certificado histórico.


## Atualização — Goal 06

Autoria exige responsável atual (ou ADMIN) e turma ABERTA/FECHADA sob lock até o commit. ENCERRADA bloqueia inclusive ADMIN; reabertura restaura as regras normais. Histórico congela perguntas, gabarito e semântica da avaliação; disponibilidade e organização seguem a permissão existente. Curso só pode mudar sem estrutura/matrículas.

Contrato, inventário e evidências: [GOAL_06_ATOMIC_ACADEMIC_AUTHORIZATION.md](goals/GOAL_06_ATOMIC_ACADEMIC_AUTHORIZATION.md).

## Storage e reconciliação — Goal 07

Materiais privados têm lifecycle ATIVO → RETIDO → PURGANDO → PURGADO. Remover/substituir o último vínculo inicia retenção de 90 dias; compartilhamento entre turmas impede coleta. Certificados históricos não participam dessa política. [Contrato, inventário e evidências](goals/GOAL_07_STORAGE_DATABASE_INTEGRITY.md).
