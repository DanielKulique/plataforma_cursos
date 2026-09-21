SET NAMES utf8mb4;

SET @versao_sessao_existe = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'Usuarios'
    AND COLUMN_NAME = 'versao_sessao'
);
SET @adicionar_versao_sessao = IF(
  @versao_sessao_existe = 0,
  'ALTER TABLE `Usuarios` ADD COLUMN `versao_sessao` INT UNSIGNED NOT NULL DEFAULT 0 AFTER `tipo`',
  'SELECT 1'
);
PREPARE adicionar_versao_sessao_stmt FROM @adicionar_versao_sessao;
EXECUTE adicionar_versao_sessao_stmt;
DEALLOCATE PREPARE adicionar_versao_sessao_stmt;

CREATE TABLE IF NOT EXISTS `PasswordResetTokens` (
  `id_token` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `id_usuario` INT NOT NULL,
  `token_hash` CHAR(64) NOT NULL,
  `expira_em` DATETIME NOT NULL,
  `usado_em` DATETIME NULL,
  `criado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_token`),
  UNIQUE KEY `uk_password_reset_hash` (`token_hash`),
  KEY `idx_password_reset_usuario_estado` (`id_usuario`, `usado_em`, `expira_em`),
  CONSTRAINT `fk_password_reset_usuario`
    FOREIGN KEY (`id_usuario`) REFERENCES `Usuarios` (`id_usuario`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
