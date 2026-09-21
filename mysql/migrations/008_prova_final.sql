SET @academic_ddl = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Questionarios' AND COLUMN_NAME = 'prova_final') = 0,
 'ALTER TABLE Questionarios ADD COLUMN prova_final TINYINT(1) NULL DEFAULT NULL,
 ADD UNIQUE KEY uk_prova_final_turma (id_turma, prova_final),
 ADD CONSTRAINT chk_prova_final_tipo CHECK (prova_final IS NULL OR (prova_final = 1 AND tipo = ''PROVA''))', 'SELECT 1');
PREPARE academic_statement FROM @academic_ddl;
EXECUTE academic_statement;
DEALLOCATE PREPARE academic_statement;
