SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `ArquivosMateriais` (
  `id_arquivo_material` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `storage_name` VARCHAR(64) NOT NULL,
  `original_name` VARCHAR(255) NOT NULL,
  `mime_type` VARCHAR(100) NOT NULL,
  `size_bytes` BIGINT UNSIGNED NOT NULL,
  `sha256` CHAR(64) NOT NULL,
  `id_usuario_upload` INT NULL,
  `status` ENUM('ATIVO', 'RETIDO') NOT NULL DEFAULT 'ATIVO',
  `criado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_arquivo_material`),
  UNIQUE KEY `uk_arquivo_material_storage` (`storage_name`),
  KEY `idx_arquivo_material_sha256` (`sha256`),
  KEY `idx_arquivo_material_usuario` (`id_usuario_upload`),
  CONSTRAINT `fk_arquivo_material_usuario` FOREIGN KEY (`id_usuario_upload`) REFERENCES `Usuarios` (`id_usuario`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @add_material_column = IF(
  (SELECT COUNT(*) FROM `INFORMATION_SCHEMA`.`COLUMNS`
   WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = 'Conteudos'
     AND `COLUMN_NAME` = 'id_arquivo_material') = 0,
  'ALTER TABLE `Conteudos` ADD COLUMN `id_arquivo_material` BIGINT UNSIGNED NULL AFTER `tipo`',
  'SELECT 1'
);
PREPARE add_material_column_statement FROM @add_material_column;
EXECUTE add_material_column_statement;
DEALLOCATE PREPARE add_material_column_statement;

SET @add_material_index = IF(
  (SELECT COUNT(*) FROM `INFORMATION_SCHEMA`.`STATISTICS`
   WHERE `TABLE_SCHEMA` = DATABASE() AND `TABLE_NAME` = 'Conteudos'
     AND `INDEX_NAME` = 'idx_conteudo_arquivo_material') = 0,
  'ALTER TABLE `Conteudos` ADD KEY `idx_conteudo_arquivo_material` (`id_arquivo_material`)',
  'SELECT 1'
);
PREPARE add_material_index_statement FROM @add_material_index;
EXECUTE add_material_index_statement;
DEALLOCATE PREPARE add_material_index_statement;

SET @add_material_fk = IF(
  (SELECT COUNT(*) FROM `INFORMATION_SCHEMA`.`TABLE_CONSTRAINTS`
   WHERE `CONSTRAINT_SCHEMA` = DATABASE() AND `TABLE_NAME` = 'Conteudos'
     AND `CONSTRAINT_NAME` = 'fk_conteudo_arquivo_material') = 0,
  'ALTER TABLE `Conteudos` ADD CONSTRAINT `fk_conteudo_arquivo_material` FOREIGN KEY (`id_arquivo_material`) REFERENCES `ArquivosMateriais` (`id_arquivo_material`) ON DELETE RESTRICT',
  'SELECT 1'
);
PREPARE add_material_fk_statement FROM @add_material_fk;
EXECUTE add_material_fk_statement;
DEALLOCATE PREPARE add_material_fk_statement;
