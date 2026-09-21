SET NAMES utf8mb4;

SET @chave_idempotencia_existe = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Q_Tentativas'
    AND COLUMN_NAME = 'chave_idempotencia'
);
SET @adicionar_chave_idempotencia = IF(
  @chave_idempotencia_existe = 0,
  'ALTER TABLE `Q_Tentativas` ADD COLUMN `chave_idempotencia` CHAR(36) NULL AFTER `total_perguntas`',
  'SELECT 1'
);
PREPARE adicionar_chave_idempotencia_stmt FROM @adicionar_chave_idempotencia;
EXECUTE adicionar_chave_idempotencia_stmt;
DEALLOCATE PREPARE adicionar_chave_idempotencia_stmt;

UPDATE `Q_Tentativas`
SET `chave_idempotencia` = UUID()
WHERE `chave_idempotencia` IS NULL OR `chave_idempotencia` = '';

ALTER TABLE `Q_Tentativas`
  MODIFY COLUMN `chave_idempotencia` CHAR(36) NOT NULL;

SET @indice_idempotencia_existe = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Q_Tentativas'
    AND INDEX_NAME = 'uk_tentativa_idempotente'
);
SET @adicionar_indice_idempotencia = IF(
  @indice_idempotencia_existe = 0,
  'ALTER TABLE `Q_Tentativas` ADD UNIQUE KEY `uk_tentativa_idempotente` (`id_usuario`, `id_questionario`, `chave_idempotencia`)',
  'SELECT 1'
);
PREPARE adicionar_indice_idempotencia_stmt FROM @adicionar_indice_idempotencia;
EXECUTE adicionar_indice_idempotencia_stmt;
DEALLOCATE PREPARE adicionar_indice_idempotencia_stmt;

SET @check_matriculas_nota_existe = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Matriculas'
    AND CONSTRAINT_NAME = 'chk_matriculas_nota'
);
SET @adicionar_check_matriculas_nota = IF(
  @check_matriculas_nota_existe = 0,
  'ALTER TABLE `Matriculas` ADD CONSTRAINT `chk_matriculas_nota` CHECK (`nota_final` IS NULL OR (`nota_final` >= 0 AND `nota_final` <= 10))',
  'SELECT 1'
);
PREPARE adicionar_check_matriculas_nota_stmt FROM @adicionar_check_matriculas_nota;
EXECUTE adicionar_check_matriculas_nota_stmt;
DEALLOCATE PREPARE adicionar_check_matriculas_nota_stmt;

SET @check_matriculas_progresso_existe = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Matriculas'
    AND CONSTRAINT_NAME = 'chk_matriculas_progresso'
);
SET @adicionar_check_matriculas_progresso = IF(
  @check_matriculas_progresso_existe = 0,
  'ALTER TABLE `Matriculas` ADD CONSTRAINT `chk_matriculas_progresso` CHECK (`progresso_percentual` >= 0 AND `progresso_percentual` <= 100)',
  'SELECT 1'
);
PREPARE adicionar_check_matriculas_progresso_stmt FROM @adicionar_check_matriculas_progresso;
EXECUTE adicionar_check_matriculas_progresso_stmt;
DEALLOCATE PREPARE adicionar_check_matriculas_progresso_stmt;

SET @check_tentativas_percentual_existe = (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
  WHERE CONSTRAINT_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Q_Tentativas'
    AND CONSTRAINT_NAME = 'chk_tentativas_percentual'
);
SET @adicionar_check_tentativas_percentual = IF(
  @check_tentativas_percentual_existe = 0,
  'ALTER TABLE `Q_Tentativas` ADD CONSTRAINT `chk_tentativas_percentual` CHECK (`percentual` >= 0 AND `percentual` <= 100)',
  'SELECT 1'
);
PREPARE adicionar_check_tentativas_percentual_stmt FROM @adicionar_check_tentativas_percentual;
EXECUTE adicionar_check_tentativas_percentual_stmt;
DEALLOCATE PREPARE adicionar_check_tentativas_percentual_stmt;
