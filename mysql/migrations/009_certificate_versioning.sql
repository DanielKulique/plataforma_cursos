-- Safe diagnosis without printing personal data; CHECK fails before any table alteration.
DROP TEMPORARY TABLE IF EXISTS certificate_legacy_preflight;
CREATE TEMPORARY TABLE certificate_legacy_preflight (
  inconsistencias INT NOT NULL,
  CONSTRAINT certificate_legacy_metadata_invalid CHECK (inconsistencias = 0)
);
INSERT INTO certificate_legacy_preflight
SELECT COUNT(*) FROM Certificados
WHERE sha256 IS NULL OR sha256 NOT REGEXP '^[0-9a-f]{64}$'
   OR storage_name IS NULL OR storage_name NOT REGEXP '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]pdf$'
   OR tamanho_bytes < 5 OR codigo_publico NOT REGEXP '^CERT-[0-9A-F]{8}(-[0-9A-F]{8}){3}$'
   OR TRIM(aluno_nome) = '' OR TRIM(curso_nome) = '' OR TRIM(turma_nome) = ''
   OR (status = 'REVOGADO' AND (revogado_em IS NULL OR id_usuario_revogador IS NULL OR motivo_revogacao IS NULL OR CHAR_LENGTH(TRIM(motivo_revogacao)) < 3));
INSERT INTO certificate_legacy_preflight
SELECT COUNT(*) FROM (
  SELECT id_aluno, id_turma FROM Certificados WHERE status = 'ATIVO'
  GROUP BY id_aluno, id_turma HAVING COUNT(*) > 1
) conflitos;
DROP TEMPORARY TABLE certificate_legacy_preflight;

-- MySQL 8: atomic DDL; the legacy UNIQUE remains until all new constraints exist.
-- No UPDATE of issued data, and no filesystem writes. Legacy snapshot_json stays NULL.
SET @certificate_ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Certificados' AND COLUMN_NAME = 'versao') = 0,
 'ALTER TABLE Certificados
 ADD COLUMN `versao` INT UNSIGNED NOT NULL DEFAULT 1,
 ADD COLUMN `id_certificado_anterior` BIGINT UNSIGNED NULL,
 ADD COLUMN `motivo_reemissao` VARCHAR(500) NULL,
 ADD COLUMN `reemitido_em` DATETIME NULL,
 ADD COLUMN `id_usuario_reemissor` INT NULL,
 ADD COLUMN `snapshot_json` JSON NULL,
 ADD COLUMN `ativo_unico` TINYINT GENERATED ALWAYS AS (CASE WHEN `status` = ''ATIVO'' THEN 1 ELSE NULL END) STORED,
 ADD UNIQUE KEY `uk_certificado_ativo` (`id_aluno`, `id_turma`, `ativo_unico`),
 ADD UNIQUE KEY `uk_certificado_versao` (`id_aluno`, `id_turma`, `versao`),
 ADD UNIQUE KEY `uk_certificado_anterior` (`id_certificado_anterior`),
 ADD CONSTRAINT `fk_certificado_anterior` FOREIGN KEY (`id_certificado_anterior`) REFERENCES `Certificados` (`id_certificado`) ON DELETE RESTRICT,
 ADD CONSTRAINT `fk_certificado_reemissor` FOREIGN KEY (`id_usuario_reemissor`) REFERENCES `Usuarios` (`id_usuario`) ON DELETE RESTRICT,
 ADD CONSTRAINT `chk_certificado_versao` CHECK (`versao` >= 1),
 ADD CONSTRAINT `chk_certificado_reemissao` CHECK (
    (`versao` = 1 AND `id_certificado_anterior` IS NULL AND `motivo_reemissao` IS NULL AND `reemitido_em` IS NULL AND `id_usuario_reemissor` IS NULL)
    OR (`versao` > 1 AND `id_certificado_anterior` IS NOT NULL AND `motivo_reemissao` IS NOT NULL
        AND CHAR_LENGTH(TRIM(`motivo_reemissao`)) BETWEEN 3 AND 500 AND `reemitido_em` IS NOT NULL
        AND `id_usuario_reemissor` IS NOT NULL AND `snapshot_json` IS NOT NULL)
  ),
 DROP INDEX `uk_certificado_aluno_turma`', 'SELECT 1');
PREPARE certificate_statement FROM @certificate_ddl;
EXECUTE certificate_statement;
DEALLOCATE PREPARE certificate_statement;
