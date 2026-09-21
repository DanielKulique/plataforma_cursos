-- Additive, repeatable. No file deletion; legacy unreferenced assets get a fresh retention window.
ALTER TABLE ArquivosMateriais MODIFY status ENUM('ATIVO', 'RETIDO', 'PURGANDO', 'PURGADO') NOT NULL DEFAULT 'ATIVO';
SET @storage_add_retido = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ArquivosMateriais' AND COLUMN_NAME = 'retido_em') = 0,
 'ALTER TABLE ArquivosMateriais ADD COLUMN retido_em DATETIME NULL', 'SELECT 1');
PREPARE storage_stmt FROM @storage_add_retido;
EXECUTE storage_stmt;
DEALLOCATE PREPARE storage_stmt;
SET @storage_add_purgado = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ArquivosMateriais' AND COLUMN_NAME = 'purgado_em') = 0,
 'ALTER TABLE ArquivosMateriais ADD COLUMN purgado_em DATETIME NULL', 'SELECT 1');
PREPARE storage_stmt FROM @storage_add_purgado;
EXECUTE storage_stmt;
DEALLOCATE PREPARE storage_stmt;
UPDATE ArquivosMateriais a SET status = 'RETIDO', retido_em = COALESCE(retido_em, NOW())
WHERE status IN ('ATIVO', 'RETIDO') AND NOT EXISTS (SELECT 1 FROM Conteudos c WHERE c.id_arquivo_material = a.id_arquivo_material);
UPDATE ArquivosMateriais a SET status = 'ATIVO', retido_em = NULL
WHERE status = 'RETIDO' AND EXISTS (SELECT 1 FROM Conteudos c WHERE c.id_arquivo_material = a.id_arquivo_material);
