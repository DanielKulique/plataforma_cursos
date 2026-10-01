SET @question_type_sql = IF(
  (SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Q_Perguntas' AND COLUMN_NAME = 'tipo_pergunta')
    LIKE '%ASSOCIACAO%',
  'SELECT 1',
  'ALTER TABLE `Q_Perguntas` MODIFY COLUMN `tipo_pergunta` ENUM(''MULTIPLA_ESCOLHA'', ''VERDADEIRO_FALSO'', ''ASSOCIACAO'', ''RESPOSTA_CURTA'') NOT NULL'
);
PREPARE question_type_statement FROM @question_type_sql;
EXECUTE question_type_statement;
DEALLOCATE PREPARE question_type_statement;

SET @question_boolean_sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Q_Perguntas' AND COLUMN_NAME = 'resposta_booleana') = 0,
  'ALTER TABLE `Q_Perguntas` ADD COLUMN `resposta_booleana` TINYINT(1) NULL AFTER `tipo_pergunta`',
  'SELECT 1'
);
PREPARE question_boolean_statement FROM @question_boolean_sql;
EXECUTE question_boolean_statement;
DEALLOCATE PREPARE question_boolean_statement;

SET @question_boolean_check_sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'Q_Perguntas'
     AND CONSTRAINT_NAME = 'chk_pergunta_resposta_booleana') = 0,
  'ALTER TABLE `Q_Perguntas` ADD CONSTRAINT `chk_pergunta_resposta_booleana` CHECK (`resposta_booleana` IS NULL OR (`tipo_pergunta` = ''VERDADEIRO_FALSO'' AND `resposta_booleana` IN (0, 1)))',
  'SELECT 1'
);
PREPARE question_boolean_check_statement FROM @question_boolean_check_sql;
EXECUTE question_boolean_check_statement;
DEALLOCATE PREPARE question_boolean_check_statement;

SET @answer_boolean_sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Q_Respostas' AND COLUMN_NAME = 'resposta_booleana') = 0,
  'ALTER TABLE `Q_Respostas` ADD COLUMN `resposta_booleana` TINYINT(1) NULL AFTER `resposta_opcao`',
  'SELECT 1'
);
PREPARE answer_boolean_statement FROM @answer_boolean_sql;
EXECUTE answer_boolean_statement;
DEALLOCATE PREPARE answer_boolean_statement;

SET @answer_boolean_check_sql = IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
   WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'Q_Respostas'
     AND CONSTRAINT_NAME = 'chk_resposta_booleana') = 0,
  'ALTER TABLE `Q_Respostas` ADD CONSTRAINT `chk_resposta_booleana` CHECK (`resposta_booleana` IS NULL OR `resposta_booleana` IN (0, 1))',
  'SELECT 1'
);
PREPARE answer_boolean_check_statement FROM @answer_boolean_check_sql;
EXECUTE answer_boolean_check_statement;
DEALLOCATE PREPARE answer_boolean_check_statement;

CREATE TABLE IF NOT EXISTS `Q_AssociacaoItens` (
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

CREATE TABLE IF NOT EXISTS `Q_AssociacaoGabaritos` (
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

CREATE TABLE IF NOT EXISTS `Q_RespostaOpcoes` (
  `id_resposta` INT NOT NULL,
  `id_opcao` INT NOT NULL,
  PRIMARY KEY (`id_resposta`, `id_opcao`),
  KEY `idx_resposta_opcao_opcao` (`id_opcao`),
  CONSTRAINT `fk_resposta_opcao_resposta`
    FOREIGN KEY (`id_resposta`) REFERENCES `Q_Respostas` (`id_resposta`) ON DELETE CASCADE,
  CONSTRAINT `fk_resposta_opcao_opcao`
    FOREIGN KEY (`id_opcao`) REFERENCES `Q_Opcoes` (`id_opcao`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Q_RespostaAssociacoes` (
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
