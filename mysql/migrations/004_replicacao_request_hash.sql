SET NAMES utf8mb4;

SET @add_requisicao_hash = IF(
  (SELECT COUNT(*)
   FROM `INFORMATION_SCHEMA`.`COLUMNS`
   WHERE `TABLE_SCHEMA` = DATABASE()
     AND `TABLE_NAME` = 'ReplicacoesTurma'
     AND `COLUMN_NAME` = 'requisicao_hash') = 0,
  'ALTER TABLE `ReplicacoesTurma` ADD COLUMN `requisicao_hash` CHAR(64) NULL AFTER `chave_idempotencia`',
  'SELECT 1'
);
PREPARE add_requisicao_hash_statement FROM @add_requisicao_hash;
EXECUTE add_requisicao_hash_statement;
DEALLOCATE PREPARE add_requisicao_hash_statement;

UPDATE `ReplicacoesTurma`
SET `requisicao_hash` = SHA2(CONCAT('legacy:', `id_replicacao`, ':', `chave_idempotencia`), 256)
WHERE `requisicao_hash` IS NULL;

ALTER TABLE `ReplicacoesTurma`
  MODIFY COLUMN `requisicao_hash` CHAR(64) NOT NULL;
