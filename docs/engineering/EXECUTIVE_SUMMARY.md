> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../index.md).

# Síntese executiva — plataforma de cursos Plágio

Levantamento técnico e funcional realizado em 6–7 de setembro de 2026, baseado na árvore de trabalho atual de `plataforma_cursos`. Este documento destina-se a apresentação acadêmica, onboarding e planejamento de manutenção. A documentação descreve o sistema implementado; não constitui homologação de produção, auditoria jurídica ou teste de invasão. O detalhamento e as referências estão no [índice técnico](README.md).

## Objetivo, público e funcionalidades

A plataforma organiza cursos em turmas, com professor responsável, matrícula de alunos, aulas e materiais, avaliações objetivas, acompanhamento e certificados. A interface é apresentada como Plágio e inclui páginas institucionais e um verificador experimental de textos. O ambiente permite reunir oferta formativa, participação, publicação de conteúdo e registro de resultados em uma aplicação web acessível pelo navegador.

Foram identificados cinco atores humanos: visitante, aluno, professor, administrador e operador de infraestrutura. Os três papéis persistidos no cadastro são ALUNO, PROFESSOR e ADMIN. O visitante consulta catálogo e valida certificados; o aluno inscreve-se e estuda; o professor gerencia a estrutura e o acompanhamento das turmas atribuídas; o administrador mantém a oferta e os usuários; o operador executa entrega, diagnóstico e recuperação por ferramentas externas à API.

O levantamento catalogou **47 requisitos funcionais, 26 não funcionais e 41 regras de negócio**, além de **84 operações HTTP**, incluindo o healthcheck público. Há implementação de autenticação por cookie, recuperação de senha, CRUD administrativo, matrícula e cancelamento, organização por aulas, conteúdos de texto/vídeo/PDF/link/atividade, upload privado de PDF, exercícios e provas objetivas, correção e histórico de tentativas, progresso, nota e situação acadêmica, replicação de turmas e certificação.

As funcionalidades possuem delimitações relevantes. A matrícula exige turma ABERTA; FECHADA mantém acesso dos já matriculados; ENCERRADA bloqueia estudo e submissões do aluno, mas pode ser reaberta por ADMIN. O professor tem escopo de turma, não administração global. “Atividade” é um material textual, sem fluxo de entrega pelo aluno. Resposta curta existe no schema como legado, mas não é aceita nas avaliações atuais.

A pontuação das tentativas é calculada no servidor com pesos das perguntas. O Teste Final libera com pelo menos 80% dos conteúdos; exercícios, incluindo Simulado, são opcionais. Há uma tentativa finalizada por aluno/turma. Resultado >=75% aprova automaticamente e inicia a emissão do certificado, mesmo que restem conteúdos. A nota final manual não é requisito.

## Arquitetura e tecnologias

O sistema é um **monólito web modular**, com API Express e páginas HTML/CSS/JavaScript servidas pelo mesmo processo Node.js. O frontend é multipágina, usa módulos ES e manipulação direta do DOM; não há framework SPA ou compilação de frontend. O backend usa CommonJS, validações de rota, middlewares, controllers, models SQL e services especializados. Muitas regras e transações residem nos models, enquanto certificados e replicação possuem orquestração própria em services.

O MySQL é a fonte de verdade relacional, com 19 tabelas InnoDB. As entidades centrais são Usuarios, Cursos, Turmas, Matriculas, Modulos, Conteudos, ConteudosProgresso, Questionarios, Q_Perguntas, Q_Opcoes, Q_Tentativas, Q_Respostas e Certificados. Tabelas adicionais sustentam arquivos, recuperação de acesso, verificação de e-mail, replicação e análise de textos. Chaves estrangeiras, índices únicos e CHECKs reforçam integridade, embora regras de pertencimento, papéis e histórico dependam também do backend.

As bibliotecas críticas incluem mysql2, bcrypt, jsonwebtoken, Helmet, express-validator, express-rate-limit, multer, pdf-lib, qrcode e Resend. Docker e Compose definem app, banco e Caddy. O motor de análise de textos é uma dependência externa opcional, controlada por feature flag; não está incluído como serviço no Compose da plataforma. YouTube fornece vídeos incorporados e Google Fonts fornece fontes com alternativas locais no CSS.

Arquivos PDF novos são armazenados em diretórios privados persistentes. Os materiais usam UUID, nome original separado, tamanho e SHA-256. Substituir um PDF cria novo ativo, preservando o anterior. A replicação faz cópia das linhas estruturais com IDs novos, sem matrículas ou tentativas, compartilhando somente a referência a arquivos imutáveis. Isso reduz duplicação de bytes e mantém independência da estrutura acadêmica.

## Certificados e segurança

Certificados são emitidos automaticamente após a aprovação; ADMIN/professor responsável podem recuperar falhas de emissão para matrícula APROVADO. O PDF final contém dados acadêmicos, identificação do aluno, responsável, conteúdo/aulas, código público e QR. O banco preserva snapshot dos dados principais e hash dos bytes finais. Cada aluno/turma pode ter várias versões históricas, com no máximo uma ATIVA garantida pelo banco e proteção contra concorrência e repetição. O download exige autorização; a validação pública por código consulta existência/status, e o upload público compara SHA-256 dos bytes recebidos.

A revogação é administrativa, preserva documento e histórico e passa a ser informada na validação pública. Não existe reativação. ADMIN corrige/reemite explicitamente com motivo e nova versão; emissão normal recusa histórico revogado. O banco garante no máximo um ATIVO por aluno/turma. O mecanismo é validação registral e comparação de integridade, não assinatura digital criptográfica do emissor.

A sessão usa cookie HttpOnly, Secure em configuração de produção e SameSite=Lax. Mutações autenticadas por cookie exigem CSRF vinculado ao token. O backend consulta o usuário e a versão da sessão no banco em cada requisição, permitindo revogação global no logout, troca ou reset de senha. A autorização considera papel, identidade e turma. Há SQL parametrizado, proteção de arquivos por rota autenticada, CSP, limites de payload, rate limits específicos e logs com redação de dados sensíveis.

O hardening de identidade de 07/09/2026 resolveu D-01, D-02 e D-15: cadastro de ALUNO cria estado pendente na mesma transação do usuário; login exige confirmação explícita; reenvio não desconfirma; os endpoints reais têm limites por IP e identidade normalizada; e o serviço Resend valida retorno, erro, exceção e timeout. Falha de entrega deixa a conta pendente e recuperável. Permanecem fora deste Goal a exposição da rota de disponibilidade cadastral, códigos legíveis no banco, rate limit local por processo e os demais caminhos legados documentados.

A análise de privacidade inventaria nome, CPF, e-mail, telefone, dados acadêmicos, certificados, logs e backups. A API pública de validação omite CPF/e-mail, mas o CPF está no PDF e, para novas versões, no snapshot estruturado privado. Não foram identificados mecanismos completos de retenção, anonimização ou atendimento a titulares. Isso delimita maturidade técnica, sem conclusão sobre conformidade jurídica.

## Entrega, testes e maturidade

A implantação configurada segue Internet/DNS → Caddy/TLS → Node/Express → MySQL e volumes de arquivos. App e banco não publicam portas no host no Compose. A imagem executa como usuário node; os serviços têm políticas de restart e verificações de saúde. O histórico operacional relata staging/demo em VM Azure Ubuntu 24.04, com Basic Auth adicional e validações HTTPS anteriores. O estado remoto atual não foi revalidado neste levantamento, e não há evidência suficiente de produção institucional independente em operação.

A entrega combina CI e procedimentos manuais. GitHub Actions prepara Node 20/MySQL 8.4, executa o conjunto de testes duas vezes e constrói a imagem. O script de staging valida configuração, faz backup prévio quando aplicável, executa migrations, verifica schema e sobe serviços. Não há publicação/deploy automático no workflow analisado. `npm run build` valida artefatos de produção; não compila o frontend.

Em 07/09, passaram **54 suítes principais com 511 testes**. O Goal acrescentou testes de transação, fail-closed no login, reenvio idempotente, contrato do Resend, rate limits nos paths reais e frontend recuperável. A integração direcionada foi tentada, mas o MySQL local respondeu `ECONNREFUSED 127.0.0.1:3306`; os novos cenários concorrentes permanecem na suíte para o próximo ambiente com banco. A cobertura principal foi 61,26% de statements, 56,48% de branches, 61,64% de funções e 64,12% de linhas, com frontend fora desse cálculo.

A arquitetura, backend, frontend e banco são adequados ao escopo acadêmico atual. Os testes são maduros para esse escopo. Segurança, observabilidade, UX e escalabilidade permanecem parciais por limitações documentadas; backup/restore possui agora baseline operacional comprovada. Os pontos fortes são o uso de banco real nos testes, controles por recurso, transações e unicidade, arquivos privados, replicação sem histórico pessoal, certificação verificável e recuperação offsite ensaiada.

## Riscos prioritários e próximos passos

O Goal 02 corrigiu a conclusão por contagens exatas (D-03) e a revalidação de novas emissões (parte de D-13). Os Goals 04 e 06 formalizaram ciclos de matrícula e protegeram autoria/avaliações contra decisões obsoletas. As prioridades seguintes são acompanhar a operação de certificados versionados (Goal 03); e, quando houver múltiplas réplicas, avaliar store compartilhado para rate limiting. D-01, D-02 e D-15 foram implementados no Goal 01.

Na operação, permanecem host único, ausência de HA/PITR e offsite na mesma região. O Goal 07 tornou as janelas SQL/filesystem detectáveis e reconciliáveis; o Goal 08 adicionou captura coordenada, manifesto/hashes, agendamento, retenção, Azure Blob privado e restore isolado real. RPO alvo é 24 h e RTO alvo 4 h; staging apresentou RPO_OK e RTO autenticado observado de 50 s na revalidação de 14/09/2026 (15/09 UTC). Isso não equivale a disponibilidade ou DR regional.

Para manutenção, convém reduzir duplicação de regras de progresso/autorização e completar autoria docente, preservando contratos e testes. Em crescimento, devem ser medidos paginação, consultas, pool e transações longas antes de propor serviços distribuídos. O levantamento fornece diagramas C4, ER, sequências, estados, matriz de autorização, inventário de API e rastreabilidade para que essas decisões futuras partam de evidência do sistema real.

O Goal 04 formalizou o ciclo da matrícula: CANCELADO só retorna a CURSANDO pela rematrícula própria em turma ABERTA, com incremento monotônico do ciclo. A regra acadêmica vigente mantém conteúdos e exercícios no ciclo atual, enquanto a tentativa única do Teste Final e seu resultado são por aluno+turma entre ciclos. Resultado >=75 pode aprovar a matrícula reativada e iniciar a emissão automática do certificado. O relatório do Goal 04 registra o contexto histórico e as regras atuais devem ser lidas em [regras de negócio](02-business-rules.md).


Goal 02 inicial (histórico, substituído pela consolidação abaixo): **ACADEMIC_COMPLETION_INTEGRITY_READY**. 200/201 não permite decisão final nem nova emissão; a conclusão é exata e a certificação revalida a estrutura atual. Gates locais concluídos e smoke A–D aprovado no staging Azure, com limpeza e certificados anteriores preservados. D-03 RESOLVIDO; D-13 PARCIAL pela política pós-emissão reservada ao Goal 03. [Evidências e limites](goals/GOAL_02_ACADEMIC_COMPLETION_INTEGRITY.md).


O Goal 02 histórico foi supersedido pela refatoração final das regras acadêmicas. O contrato vigente libera o Teste Final com 80% dos conteúdos, limita a uma tentativa finalizada e aprova com >=75%, sem conclusão integral. A emissão do certificado é automática e idempotente. O relatório histórico preserva evidências da política anterior e está marcado como substituído.


**ACADEMIC_PROGRESS_EXAM_APPROVAL_READY** — staging validado em 09/09/2026: casos A–F aprovados, cenário temporário removido, certificados anteriores preservados e fontes implantados iguais aos locais. [Evidências finais](goals/GOAL_02_ACADEMIC_EXAM_APPROVAL.md).

## Goal 03 — certificados versionados

**CERTIFICATE_REISSUANCE_VERSIONING_READY** — D-14 **RESOLVIDO** em 09/09/2026. ADMIN pode corrigir/reemitir com motivo, preservando versões e PDFs históricos; MySQL garante um único ATIVO por aluno/turma. Migration 009 aplicada, 566 testes unitários/frontend e 190 integrações aprovados; lint/build/audit/diff verdes. Staging comprovou v1 REVOGADA e v2 ATIVA, código/upload/download, concorrência 201/409 e persistência após restart. Regras acadêmicas do Goal 02 e template institucional preservados. [Entrega, evidências e limitações](goals/GOAL_03_CERTIFICATE_VERSIONING.md).

Revalidado em 10/09/2026: fontes locais e remotos continuam idênticos ao deploy validado; 68 testes direcionados e contrato remoto aprovados. Smoke confirmou versões, validação por código/upload, downloads históricos e quatro certificados preservados, sem duplicidade de ATIVO. Não houve alteração de código nem novo deploy; gates completos permanecem os registrados em 09/09.

O Goal 06 concentra a autorização de autoria na transação: troca de responsável e encerramento disputam a mesma linha da turma. Mantidos papéis, 80%/75%, ciclos e certificados. [Contrato e evidências do Goal 06](goals/GOAL_06_ATOMIC_ACADEMIC_AUTHORIZATION.md).

## Goal 07 validado — 11/09/2026

**STORAGE_DATABASE_INTEGRITY_READY.** D-09 e D-12 resolvidos no escopo de escrita recuperável e reconciliação: materiais têm retenção de 90 dias e purge explícito; certificados permanecem preservados. Passaram 595 testes unitários e 248 de integração na execução completa, mais quatro verificações finais direcionadas. Staging atualizado: primeiro dry-run sem inconsistências, APPLY limitado a um órfão de teste, hashes preservados após recriação e quatro certificados históricos/ativos intactos. Restore/offsite continuam no Goal 08. [Relatório completo](goals/GOAL_07_STORAGE_DATABASE_INTEGRITY.md).

**BACKUP_RESTORE_DISASTER_RECOVERY_READY.** D-10 e D-11 resolvidos: backup diário bloqueia
sobreposição, suspende writes, coordena purge, valida dump/storage/manifesto/SHA antes de publicar
latest-good e replica para Blob privado com completion marker. Restore é dry-run por padrão e APPLY
exige target, banco limpo e validação pós-restore. O ciclo real offsite → download → restore isolado
preservou 19 tabelas, sete materiais e quatro certificados; reconciliador/health passaram e RTO foi
50 s. A cópia na mesma região é off-host, não multirregional. [Relatório completo](goals/GOAL_08_BACKUP_RESTORE_DISASTER_RECOVERY.md).
