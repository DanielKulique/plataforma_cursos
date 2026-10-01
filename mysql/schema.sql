-- Schema canônico da plataforma.
-- Este arquivo não cria nem seleciona bancos. O banco-alvo é escolhido somente
-- pelos scripts protegidos scripts/setup_database.js.

SET NAMES utf8mb4;

CREATE TABLE `environment_identity` (
  `singleton_id` TINYINT UNSIGNED NOT NULL,
  `identity_key` VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `database_name` VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`singleton_id`),
  UNIQUE KEY `uk_environment_identity_key` (`identity_key`),
  CONSTRAINT `chk_environment_identity_singleton` CHECK (`singleton_id` = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Usuarios` (
  `id_usuario` INT NOT NULL AUTO_INCREMENT,
  `nome_completo` VARCHAR(255) NOT NULL,
  `cpf` VARCHAR(11) NULL,
  `email` VARCHAR(255) NOT NULL,
  `senha` VARCHAR(255) NOT NULL COMMENT 'Hash da senha; nunca armazenar texto puro.',
  `telefone` VARCHAR(20) NULL,
  `tipo` ENUM('ALUNO', 'PROFESSOR', 'ADMIN') NOT NULL,
  `versao_sessao` INT UNSIGNED NOT NULL DEFAULT 0,
  `data_cadastro` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_usuario`),
  UNIQUE KEY `uk_usuarios_cpf` (`cpf`),
  UNIQUE KEY `uk_usuarios_email` (`email`),
  KEY `idx_usuarios_nome_lista` (`nome_completo`, `id_usuario`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `PasswordResetTokens` (
  `id_token` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `id_usuario` INT NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `expira_em` DATETIME NOT NULL,
  `usado_em` DATETIME NULL,
  `criado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_token`),
  UNIQUE KEY `uk_password_reset_hash` (`token_hash`),
  KEY `idx_password_reset_usuario_estado` (`id_usuario`, `usado_em`, `expira_em`),
  CONSTRAINT `fk_password_reset_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `Usuarios` (`id_usuario`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `EmailVerificacoes` (
  `id_verificacao` INT NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(255) NOT NULL,
  `codigo` VARCHAR(6) NULL,
  `verificado` TINYINT(1) NOT NULL DEFAULT 0,
  `expira_em` DATETIME NULL,
  `criado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_verificacao`),
  UNIQUE KEY `uk_email_verificacao` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `ArquivosMateriais` (
  `id_arquivo_material` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `storage_name` VARCHAR(64) NOT NULL,
  `original_name` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(100) NOT NULL,
  `size_bytes` BIGINT UNSIGNED NOT NULL,
  `sha256` CHAR(64) NOT NULL,
  `id_usuario_upload` INT NULL,
  `status` ENUM('ATIVO', 'RETIDO', 'PURGANDO', 'PURGADO') NOT NULL DEFAULT 'ATIVO',
  `criado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `retido_em` DATETIME NULL,
  `purgado_em` DATETIME NULL,
  PRIMARY KEY (`id_arquivo_material`),
  UNIQUE KEY `uk_arquivo_material_storage` (`storage_name`),
  KEY `idx_arquivo_material_sha256` (`sha256`),
  KEY `idx_arquivo_material_usuario` (`id_usuario_upload`),
  CONSTRAINT `fk_arquivo_material_usuario` FOREIGN KEY (`id_usuario_upload`) REFERENCES `Usuarios` (`id_usuario`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Cursos` (
  `id_curso` INT NOT NULL AUTO_INCREMENT,
  `nome_curso` VARCHAR(255) NOT NULL,
  `descricao` TEXT NULL,
  `carga_horaria` INT NOT NULL,
  PRIMARY KEY (`id_curso`),
  UNIQUE KEY `uk_cursos_nome` (`nome_curso`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Turmas` (
  `id_turma` INT NOT NULL AUTO_INCREMENT,
  `id_curso` INT NOT NULL,
  `id_professor` INT NOT NULL,
  `nome_turma` VARCHAR(100) NOT NULL,
  `data_inicio` DATE NOT NULL,
  `data_fim` DATE NULL,
  `status` ENUM('ABERTA', 'FECHADA', 'ENCERRADA') NOT NULL DEFAULT 'ABERTA',
  PRIMARY KEY (`id_turma`),
  UNIQUE KEY `uk_turmas_nome` (`nome_turma`),
  KEY `idx_turmas_curso` (`id_curso`),
  KEY `idx_turmas_professor` (`id_professor`),
  KEY `idx_turmas_data_lista` (`data_inicio` DESC, `id_turma` DESC),
  CONSTRAINT `fk_turmas_curso` FOREIGN KEY (`id_curso`) REFERENCES `Cursos` (`id_curso`) ON DELETE RESTRICT,
  CONSTRAINT `fk_turmas_professor` FOREIGN KEY (`id_professor`) REFERENCES `Usuarios` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `ReplicacoesTurma` (
  `id_replicacao` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `id_turma_origem` INT NULL,
  `id_turma_destino` INT NOT NULL,
  `id_usuario_admin` INT NULL,
  `chave_idempotencia` VARCHAR(64) NOT NULL,
  `requisicao_hash` CHAR(64) NOT NULL,
  `criada_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_replicacao`),
  UNIQUE KEY `uk_replicacao_chave` (`chave_idempotencia`),
  UNIQUE KEY `uk_replicacao_destino` (`id_turma_destino`),
  KEY `idx_replicacao_origem` (`id_turma_origem`),
  KEY `idx_replicacao_admin` (`id_usuario_admin`),
  CONSTRAINT `fk_replicacao_origem` FOREIGN KEY (`id_turma_origem`) REFERENCES `Turmas` (`id_turma`) ON DELETE SET NULL,
  CONSTRAINT `fk_replicacao_destino` FOREIGN KEY (`id_turma_destino`) REFERENCES `Turmas` (`id_turma`) ON DELETE CASCADE,
  CONSTRAINT `fk_replicacao_admin` FOREIGN KEY (`id_usuario_admin`) REFERENCES `Usuarios` (`id_usuario`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Matriculas` (
  `id_matricula` INT NOT NULL AUTO_INCREMENT,
  `id_aluno` INT NOT NULL,
  `id_turma` INT NOT NULL,
  `data_matricula` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `nota_final` DECIMAL(5,2) NULL,
  `status_aprovacao` ENUM('CURSANDO', 'APROVADO', 'REPROVADO', 'CANCELADO') NOT NULL DEFAULT 'CURSANDO',
  `progresso_percentual` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `ciclo_atual` INT UNSIGNED NOT NULL DEFAULT 1,
  PRIMARY KEY (`id_matricula`),
  UNIQUE KEY `uk_aluno_turma` (`id_aluno`, `id_turma`),
  KEY `idx_matriculas_turma` (`id_turma`),
  CONSTRAINT `chk_matriculas_nota` CHECK (`nota_final` IS NULL OR (`nota_final` >= 0 AND `nota_final` <= 10)),
  CONSTRAINT `chk_matriculas_progresso` CHECK (`progresso_percentual` >= 0 AND `progresso_percentual` <= 100),
  CONSTRAINT `chk_matriculas_ciclo` CHECK (`ciclo_atual` >= 1),
  CONSTRAINT `fk_matriculas_aluno` FOREIGN KEY (`id_aluno`) REFERENCES `Usuarios` (`id_usuario`) ON DELETE CASCADE,
  CONSTRAINT `fk_matriculas_turma` FOREIGN KEY (`id_turma`) REFERENCES `Turmas` (`id_turma`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Certificados` (
  `id_certificado` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `id_aluno` INT NOT NULL,
  `id_turma` INT NOT NULL,
  `codigo_publico` VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `aluno_nome` VARCHAR(255) NOT NULL,
  `curso_nome` VARCHAR(255) NOT NULL,
  `turma_nome` VARCHAR(100) NOT NULL,
  `carga_horaria` INT NOT NULL,
  `emitido_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status` ENUM('ATIVO', 'REVOGADO') NOT NULL DEFAULT 'ATIVO',
  `sha256` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `storage_name` VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `tamanho_bytes` BIGINT UNSIGNED NOT NULL,
  `id_usuario_emissor` INT NOT NULL,
  `revogado_em` DATETIME NULL,
  `id_usuario_revogador` INT NULL,
  `motivo_revogacao` VARCHAR(500) NULL,
  `criado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `versao` INT UNSIGNED NOT NULL DEFAULT 1,
  `id_certificado_anterior` BIGINT UNSIGNED NULL,
  `motivo_reemissao` VARCHAR(500) NULL,
  `reemitido_em` DATETIME NULL,
  `id_usuario_reemissor` INT NULL,
  `snapshot_json` JSON NULL,
  `ativo_unico` TINYINT GENERATED ALWAYS AS (CASE WHEN `status` = 'ATIVO' THEN 1 ELSE NULL END) STORED,
  PRIMARY KEY (`id_certificado`),
  UNIQUE KEY `uk_certificado_ativo` (`id_aluno`, `id_turma`, `ativo_unico`),
  UNIQUE KEY `uk_certificado_versao` (`id_aluno`, `id_turma`, `versao`),
  UNIQUE KEY `uk_certificado_anterior` (`id_certificado_anterior`),
  CONSTRAINT `fk_certificado_anterior` FOREIGN KEY (`id_certificado_anterior`) REFERENCES `Certificados` (`id_certificado`) ON DELETE RESTRICT,
  CONSTRAINT `fk_certificado_reemissor` FOREIGN KEY (`id_usuario_reemissor`) REFERENCES `Usuarios` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `chk_certificado_versao` CHECK (`versao` >= 1),
  CONSTRAINT `chk_certificado_reemissao` CHECK (
    (`versao` = 1 AND `id_certificado_anterior` IS NULL AND `motivo_reemissao` IS NULL AND `reemitido_em` IS NULL AND `id_usuario_reemissor` IS NULL)
    OR (`versao` > 1 AND `id_certificado_anterior` IS NOT NULL AND `motivo_reemissao` IS NOT NULL
        AND CHAR_LENGTH(TRIM(`motivo_reemissao`)) BETWEEN 3 AND 500 AND `reemitido_em` IS NOT NULL
        AND `id_usuario_reemissor` IS NOT NULL AND `snapshot_json` IS NOT NULL)
  ),
  UNIQUE KEY `uk_certificado_codigo_publico` (`codigo_publico`),
  UNIQUE KEY `uk_certificado_storage_name` (`storage_name`),
  KEY `idx_certificado_sha256` (`sha256`),
  CONSTRAINT `fk_certificado_matricula` FOREIGN KEY (`id_aluno`, `id_turma`) REFERENCES `Matriculas` (`id_aluno`, `id_turma`) ON DELETE RESTRICT,
  CONSTRAINT `fk_certificado_emissor` FOREIGN KEY (`id_usuario_emissor`) REFERENCES `Usuarios` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `fk_certificado_revogador` FOREIGN KEY (`id_usuario_revogador`) REFERENCES `Usuarios` (`id_usuario`) ON DELETE RESTRICT,
  CONSTRAINT `chk_certificado_carga_horaria` CHECK (`carga_horaria` > 0),
  CONSTRAINT `chk_certificado_revogacao` CHECK (
    (`status` = 'ATIVO' AND `revogado_em` IS NULL AND `id_usuario_revogador` IS NULL AND `motivo_revogacao` IS NULL)
    OR
    (`status` = 'REVOGADO' AND `revogado_em` IS NOT NULL AND `id_usuario_revogador` IS NOT NULL AND `motivo_revogacao` IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Questionarios` (
  `id_questionario` INT NOT NULL AUTO_INCREMENT,
  `id_curso` INT NOT NULL,
  `id_turma` INT NOT NULL,
  `titulo` VARCHAR(255) NOT NULL,
  `descricao` VARCHAR(255) NOT NULL,
  `ativo` TINYINT(1) NOT NULL DEFAULT 1,
  `tipo` ENUM('PROVA', 'EXERCICIO') NOT NULL DEFAULT 'EXERCICIO',
  UNIQUE KEY `uk_prova_final_turma` (`id_turma`, `prova_final`),
  CONSTRAINT `chk_prova_final_tipo` CHECK (prova_final IS NULL OR (prova_final = 1 AND tipo = 'PROVA')),
  `id_modulo` INT NULL,
  `ordem` INT NOT NULL DEFAULT 0,
  `prova_final` TINYINT(1) NULL DEFAULT NULL,
  PRIMARY KEY (`id_questionario`),
  UNIQUE KEY `uk_questionario_turma_tipo_titulo` (`id_turma`, `tipo`, `titulo`),
  KEY `idx_questionarios_curso` (`id_curso`),
  CONSTRAINT `fk_questionarios_curso` FOREIGN KEY (`id_curso`) REFERENCES `Cursos` (`id_curso`) ON DELETE CASCADE,
  CONSTRAINT `fk_questionarios_turma` FOREIGN KEY (`id_turma`) REFERENCES `Turmas` (`id_turma`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Q_Perguntas` (
  `id_pergunta` INT NOT NULL AUTO_INCREMENT,
  `id_questionario` INT NOT NULL,
  `texto_pergunta` VARCHAR(255) NOT NULL,
  `tipo_pergunta` ENUM('MULTIPLA_ESCOLHA', 'VERDADEIRO_FALSO', 'ASSOCIACAO', 'RESPOSTA_CURTA') NOT NULL,
  `resposta_booleana` TINYINT(1) NULL,
  `ordem` INT NOT NULL,
  `pontos` DECIMAL(6,2) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id_pergunta`),
  UNIQUE KEY `uk_pergunta_questionario_ordem` (`id_questionario`, `ordem`),
  CONSTRAINT `chk_pergunta_resposta_booleana` CHECK (`resposta_booleana` IS NULL OR (`tipo_pergunta` = 'VERDADEIRO_FALSO' AND `resposta_booleana` IN (0, 1))),
  CONSTRAINT `fk_perguntas_questionario` FOREIGN KEY (`id_questionario`) REFERENCES `Questionarios` (`id_questionario`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Q_Opcoes` (
  `id_opcao` INT NOT NULL AUTO_INCREMENT,
  `id_pergunta` INT NOT NULL,
  `texto_opcao` VARCHAR(255) NOT NULL,
  `ordem` INT NOT NULL,
  `correta` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id_opcao`),
  UNIQUE KEY `uk_opcao_pergunta_ordem` (`id_pergunta`, `ordem`),
  CONSTRAINT `fk_opcoes_pergunta` FOREIGN KEY (`id_pergunta`) REFERENCES `Q_Perguntas` (`id_pergunta`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Q_AssociacaoItens` (
  `id_item` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `id_pergunta` INT NOT NULL,
  `lado` ENUM('ESQUERDA', 'DIREITA') NOT NULL,
  `texto` VARCHAR(255) NOT NULL,
  `ordem` INT NOT NULL,
  PRIMARY KEY (`id_item`),
  UNIQUE KEY `uk_associacao_pergunta_lado_ordem` (`id_pergunta`, `lado`, `ordem`),
  KEY `idx_associacao_item_pergunta_lado` (`id_pergunta`, `lado`),
  CONSTRAINT `fk_associacao_item_pergunta`
    FOREIGN KEY (`id_pergunta`) REFERENCES `Q_Perguntas` (`id_pergunta`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Q_AssociacaoGabaritos` (
  `id_pergunta` INT NOT NULL,
  `id_item_esquerda` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `id_item_direita` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (`id_pergunta`, `id_item_esquerda`),
  UNIQUE KEY `uk_associacao_gabarito_direita` (`id_pergunta`, `id_item_direita`),
  KEY `idx_associacao_gabarito_direita` (`id_item_direita`),
  CONSTRAINT `fk_associacao_gabarito_pergunta`
    FOREIGN KEY (`id_pergunta`) REFERENCES `Q_Perguntas` (`id_pergunta`) ON DELETE CASCADE,
  CONSTRAINT `fk_associacao_gabarito_esquerda`
    FOREIGN KEY (`id_item_esquerda`) REFERENCES `Q_AssociacaoItens` (`id_item`) ON DELETE CASCADE,
  CONSTRAINT `fk_associacao_gabarito_direita`
    FOREIGN KEY (`id_item_direita`) REFERENCES `Q_AssociacaoItens` (`id_item`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Q_Tentativas` (
  `id_tentativa` INT NOT NULL AUTO_INCREMENT,
  `id_questionario` INT NOT NULL,
  `id_usuario` INT NOT NULL,
  `id_turma` INT NOT NULL,
  `pontuacao` DECIMAL(8,2) NOT NULL DEFAULT 0,
  `percentual` DECIMAL(5,2) NOT NULL DEFAULT 0,
  `acertos` INT NOT NULL DEFAULT 0,
  `total_perguntas` INT NOT NULL,
  `chave_idempotencia` CHAR(36) NOT NULL,
  `ciclo_matricula` INT UNSIGNED NOT NULL DEFAULT 1,
  `iniciada_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finalizada_em` DATETIME NULL,
  PRIMARY KEY (`id_tentativa`),
  UNIQUE KEY `uk_tentativa_idempotente` (`id_usuario`, `id_questionario`, `ciclo_matricula`, `chave_idempotencia`),
  KEY `idx_tentativas_aluno_questionario` (`id_usuario`, `id_questionario`),
  KEY `idx_tentativas_ciclo_atual` (`id_usuario`, `id_turma`, `ciclo_matricula`, `id_questionario`, `finalizada_em`),
  KEY `idx_tentativas_turma` (`id_turma`),
  KEY `idx_tentativas_aluno_data` (`id_usuario`, `iniciada_em` DESC, `id_tentativa` DESC),
  KEY `idx_tentativas_turma_data` (`id_turma`, `iniciada_em` DESC, `id_tentativa` DESC),
  CONSTRAINT `chk_tentativas_percentual` CHECK (`percentual` >= 0 AND `percentual` <= 100),
  CONSTRAINT `chk_tentativas_ciclo` CHECK (`ciclo_matricula` >= 1),
  CONSTRAINT `fk_tentativa_questionario` FOREIGN KEY (`id_questionario`) REFERENCES `Questionarios` (`id_questionario`) ON DELETE CASCADE,
  CONSTRAINT `fk_tentativa_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `Usuarios` (`id_usuario`) ON DELETE CASCADE,
  CONSTRAINT `fk_tentativa_turma` FOREIGN KEY (`id_turma`) REFERENCES `Turmas` (`id_turma`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Q_Respostas` (
  `id_resposta` INT NOT NULL AUTO_INCREMENT,
  `id_pergunta` INT NOT NULL,
  `id_usuario` INT NOT NULL,
  `id_questionario` INT NOT NULL,
  `id_tentativa` INT NOT NULL,
  `resposta_texto` TEXT NULL,
  `resposta_opcao` INT NULL,
  `resposta_booleana` TINYINT(1) NULL,
  `data_resposta` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `correta` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id_resposta`),
  UNIQUE KEY `uk_resposta_tentativa_pergunta` (`id_tentativa`, `id_pergunta`),
  KEY `idx_respostas_usuario` (`id_usuario`),
  KEY `idx_respostas_questionario` (`id_questionario`),
  KEY `idx_respostas_opcao` (`resposta_opcao`),
  CONSTRAINT `chk_resposta_booleana` CHECK (`resposta_booleana` IS NULL OR `resposta_booleana` IN (0, 1)),
  CONSTRAINT `fk_respostas_pergunta` FOREIGN KEY (`id_pergunta`) REFERENCES `Q_Perguntas` (`id_pergunta`) ON DELETE CASCADE,
  CONSTRAINT `fk_respostas_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `Usuarios` (`id_usuario`) ON DELETE CASCADE,
  CONSTRAINT `fk_respostas_questionario` FOREIGN KEY (`id_questionario`) REFERENCES `Questionarios` (`id_questionario`) ON DELETE CASCADE,
  CONSTRAINT `fk_respostas_tentativa` FOREIGN KEY (`id_tentativa`) REFERENCES `Q_Tentativas` (`id_tentativa`) ON DELETE CASCADE,
  CONSTRAINT `fk_respostas_opcao` FOREIGN KEY (`resposta_opcao`) REFERENCES `Q_Opcoes` (`id_opcao`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Q_RespostaOpcoes` (
  `id_resposta` INT NOT NULL,
  `id_opcao` INT NOT NULL,
  PRIMARY KEY (`id_resposta`, `id_opcao`),
  KEY `idx_resposta_opcao_opcao` (`id_opcao`),
  CONSTRAINT `fk_resposta_opcao_resposta`
    FOREIGN KEY (`id_resposta`) REFERENCES `Q_Respostas` (`id_resposta`) ON DELETE CASCADE,
  CONSTRAINT `fk_resposta_opcao_opcao`
    FOREIGN KEY (`id_opcao`) REFERENCES `Q_Opcoes` (`id_opcao`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Q_RespostaAssociacoes` (
  `id_resposta` INT NOT NULL,
  `id_item_esquerda` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `id_item_direita` CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (`id_resposta`, `id_item_esquerda`),
  UNIQUE KEY `uk_resposta_associacao_direita` (`id_resposta`, `id_item_direita`),
  KEY `idx_resposta_associacao_item_direita` (`id_item_direita`),
  CONSTRAINT `fk_resposta_associacao_resposta`
    FOREIGN KEY (`id_resposta`) REFERENCES `Q_Respostas` (`id_resposta`) ON DELETE CASCADE,
  CONSTRAINT `fk_resposta_associacao_item_esquerda`
    FOREIGN KEY (`id_item_esquerda`) REFERENCES `Q_AssociacaoItens` (`id_item`) ON DELETE RESTRICT,
  CONSTRAINT `fk_resposta_associacao_item_direita`
    FOREIGN KEY (`id_item_direita`) REFERENCES `Q_AssociacaoItens` (`id_item`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Modulos` (
  `id_modulo` INT NOT NULL AUTO_INCREMENT,
  `id_turma` INT NOT NULL,
  `titulo` VARCHAR(255) NOT NULL,
  `descricao` TEXT NULL,
  `ordem` INT NOT NULL,
  PRIMARY KEY (`id_modulo`),
  UNIQUE KEY `uk_modulo_turma_ordem` (`id_turma`, `ordem`),
  CONSTRAINT `fk_modulo_turma` FOREIGN KEY (`id_turma`) REFERENCES `Turmas` (`id_turma`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `Questionarios` ADD CONSTRAINT `fk_questionario_modulo` FOREIGN KEY (`id_modulo`) REFERENCES `Modulos` (`id_modulo`) ON DELETE RESTRICT;

CREATE TABLE `Conteudos` (
  `id_conteudo` INT NOT NULL AUTO_INCREMENT,
  `id_turma` INT NOT NULL,
  `id_modulo` INT NULL,
  `titulo` VARCHAR(255) NOT NULL,
  `descricao` TEXT NULL,
  `tipo` ENUM('VIDEO', 'TEXTO', 'PDF', 'LINK', 'ATIVIDADE') NOT NULL,
  `id_arquivo_material` BIGINT UNSIGNED NULL,
  `url` VARCHAR(1000) NULL,
  `corpo` MEDIUMTEXT NULL,
  `duracao_minutos` INT UNSIGNED NULL,
  `ordem` INT NOT NULL,
  PRIMARY KEY (`id_conteudo`),
  UNIQUE KEY `uk_conteudo_turma_ordem` (`id_turma`, `ordem`),
  KEY `idx_conteudo_modulo` (`id_modulo`),
  KEY `idx_conteudo_arquivo_material` (`id_arquivo_material`),
  CONSTRAINT `fk_conteudo_turma` FOREIGN KEY (`id_turma`) REFERENCES `Turmas` (`id_turma`) ON DELETE CASCADE,
  CONSTRAINT `fk_conteudo_modulo` FOREIGN KEY (`id_modulo`) REFERENCES `Modulos` (`id_modulo`) ON DELETE SET NULL,
  CONSTRAINT `fk_conteudo_arquivo_material` FOREIGN KEY (`id_arquivo_material`) REFERENCES `ArquivosMateriais` (`id_arquivo_material`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `ConteudosProgresso` (
  `id_progresso` INT NOT NULL AUTO_INCREMENT,
  `id_aluno` INT NOT NULL,
  `id_conteudo` INT NOT NULL,
  `status` ENUM('NAO_INICIADO', 'INICIADO', 'CONCLUIDO') NOT NULL DEFAULT 'NAO_INICIADO',
  `iniciado_em` DATETIME NULL,
  `concluido_em` DATETIME NULL,
  PRIMARY KEY (`id_progresso`),
  UNIQUE KEY `uk_aluno_conteudo` (`id_aluno`, `id_conteudo`),
  CONSTRAINT `fk_progresso_aluno` FOREIGN KEY (`id_aluno`) REFERENCES `Usuarios` (`id_usuario`) ON DELETE CASCADE,
  CONSTRAINT `fk_progresso_conteudo` FOREIGN KEY (`id_conteudo`) REFERENCES `Conteudos` (`id_conteudo`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `AnalisesPlagio` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `usuario_id` INT NOT NULL,
  `trecho_texto` TEXT NOT NULL,
  `score_similaridade` DECIMAL(5,2) NOT NULL,
  `fontes_encontradas` JSON NULL,
  `criado_em` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_analises_usuario` (`usuario_id`),
  CONSTRAINT `fk_analises_plagio_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `Usuarios` (`id_usuario`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `AnalisesContextuais` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `id_usuario` INT NOT NULL,
  `status` VARCHAR(30) NOT NULL,
  `total_segmentos` INT UNSIGNED NOT NULL,
  `segmentos_analisados` INT UNSIGNED NOT NULL,
  `total_alertas` INT UNSIGNED NOT NULL,
  `gravidade_maxima` ENUM('INFORMATIVA', 'BAIXA', 'MEDIA', 'ALTA') NULL,
  `versao_contrato` VARCHAR(20) NOT NULL,
  `tempo_total_ms` DECIMAL(12,3) NULL,
  `parametros_json` JSON NOT NULL,
  `criado_em` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_analises_contextuais_usuario_criado` (`id_usuario`, `criado_em`),
  CONSTRAINT `fk_analises_contextuais_usuario`
    FOREIGN KEY (`id_usuario`) REFERENCES `Usuarios` (`id_usuario`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
