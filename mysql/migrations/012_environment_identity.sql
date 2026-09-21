-- O valor do marcador nunca é inferido nem atualizado por uma migration.
-- Bancos existentes devem ser registrados uma única vez pelo comando protegido
-- db:identity:register antes de qualquer migration posterior.
CREATE TABLE IF NOT EXISTS `environment_identity` (
  `singleton_id` TINYINT UNSIGNED NOT NULL,
  `identity_key` VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `database_name` VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`singleton_id`),
  UNIQUE KEY `uk_environment_identity_key` (`identity_key`),
  CONSTRAINT `chk_environment_identity_singleton` CHECK (`singleton_id` = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
