SET NAMES utf8mb4;

SET @learning_lesson = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Questionarios' AND COLUMN_NAME = 'id_modulo') = 0, 'ALTER TABLE Questionarios ADD COLUMN id_modulo INT NULL AFTER tipo', 'SELECT 1');
PREPARE learning_statement FROM @learning_lesson;
EXECUTE learning_statement;
DEALLOCATE PREPARE learning_statement;

SET @learning_order = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Questionarios' AND COLUMN_NAME = 'ordem') = 0, 'ALTER TABLE Questionarios ADD COLUMN ordem INT NOT NULL DEFAULT 0 AFTER id_modulo', 'SELECT 1');
PREPARE learning_statement FROM @learning_order;
EXECUTE learning_statement;
DEALLOCATE PREPARE learning_statement;

SET @learning_fk = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'Questionarios' AND CONSTRAINT_NAME = 'fk_questionario_modulo') = 0, 'ALTER TABLE Questionarios ADD CONSTRAINT fk_questionario_modulo FOREIGN KEY (id_modulo) REFERENCES Modulos (id_modulo) ON DELETE RESTRICT', 'SELECT 1');
PREPARE learning_statement FROM @learning_fk;
EXECUTE learning_statement;
DEALLOCATE PREPARE learning_statement;

