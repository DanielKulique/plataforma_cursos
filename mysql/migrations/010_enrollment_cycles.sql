-- Goal 04: explicit academic cycles isolate current state from historical attempts.
-- Abort before DDL if an attempt has no logical enrollment to own its cycle.
DROP TEMPORARY TABLE IF EXISTS enrollment_cycle_preflight;
CREATE TEMPORARY TABLE enrollment_cycle_preflight (
  inconsistencias INT NOT NULL,
  CONSTRAINT enrollment_cycle_orphan_invalid CHECK (inconsistencias = 0)
);
INSERT INTO enrollment_cycle_preflight
SELECT COUNT(*)
FROM Q_Tentativas tentativa
LEFT JOIN Matriculas matricula
  ON matricula.id_aluno = tentativa.id_usuario
 AND matricula.id_turma = tentativa.id_turma
WHERE matricula.id_matricula IS NULL;
DROP TEMPORARY TABLE enrollment_cycle_preflight;

SET @add_enrollment_cycle = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Matriculas' AND COLUMN_NAME = 'ciclo_atual') = 0,
 'ALTER TABLE Matriculas ADD COLUMN `ciclo_atual` INT UNSIGNED NULL AFTER `progresso_percentual`',
 'SELECT 1');
PREPARE enrollment_cycle_statement FROM @add_enrollment_cycle;
EXECUTE enrollment_cycle_statement;
DEALLOCATE PREPARE enrollment_cycle_statement;

SET @add_attempt_cycle = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Q_Tentativas' AND COLUMN_NAME = 'ciclo_matricula') = 0,
 'ALTER TABLE Q_Tentativas ADD COLUMN `ciclo_matricula` INT UNSIGNED NULL AFTER `chave_idempotencia`',
 'SELECT 1');
PREPARE attempt_cycle_statement FROM @add_attempt_cycle;
EXECUTE attempt_cycle_statement;
DEALLOCATE PREPARE attempt_cycle_statement;

-- Normal legacy rows stay in cycle 1. If attempts predate the current enrollment
-- timestamp, that proves the timestamp was reset or the data is inconsistent.
-- Conservatively quarantine older attempts in cycle 1 and make the current
-- enrollment cycle 2; attempts on/after the current timestamp remain current.
UPDATE Matriculas matricula
SET matricula.ciclo_atual = CASE
  WHEN EXISTS (
    SELECT 1 FROM Q_Tentativas tentativa
    WHERE tentativa.id_usuario = matricula.id_aluno
      AND tentativa.id_turma = matricula.id_turma
      AND tentativa.iniciada_em < matricula.data_matricula
  ) THEN 2 ELSE 1 END
WHERE matricula.ciclo_atual IS NULL;

UPDATE Q_Tentativas tentativa
INNER JOIN Matriculas matricula
  ON matricula.id_aluno = tentativa.id_usuario
 AND matricula.id_turma = tentativa.id_turma
SET tentativa.ciclo_matricula = CASE
  WHEN matricula.ciclo_atual > 1
   AND tentativa.iniciada_em >= matricula.data_matricula
  THEN matricula.ciclo_atual ELSE 1 END
WHERE tentativa.ciclo_matricula IS NULL;

SET @harden_enrollment_cycle = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Matriculas' AND COLUMN_NAME = 'ciclo_atual'
   AND IS_NULLABLE = 'NO' AND COLUMN_DEFAULT = '1') = 0,
 'ALTER TABLE Matriculas MODIFY COLUMN `ciclo_atual` INT UNSIGNED NOT NULL DEFAULT 1 AFTER `progresso_percentual`',
 'SELECT 1');
PREPARE enrollment_cycle_hardening FROM @harden_enrollment_cycle;
EXECUTE enrollment_cycle_hardening;
DEALLOCATE PREPARE enrollment_cycle_hardening;

SET @harden_attempt_cycle = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Q_Tentativas' AND COLUMN_NAME = 'ciclo_matricula'
   AND IS_NULLABLE = 'NO' AND COLUMN_DEFAULT = '1') = 0,
 'ALTER TABLE Q_Tentativas MODIFY COLUMN `ciclo_matricula` INT UNSIGNED NOT NULL DEFAULT 1 AFTER `chave_idempotencia`',
 'SELECT 1');
PREPARE attempt_cycle_hardening FROM @harden_attempt_cycle;
EXECUTE attempt_cycle_hardening;
DEALLOCATE PREPARE attempt_cycle_hardening;

SET @add_enrollment_cycle_check = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
 WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'Matriculas'
   AND CONSTRAINT_NAME = 'chk_matriculas_ciclo') = 0,
 'ALTER TABLE Matriculas ADD CONSTRAINT `chk_matriculas_ciclo` CHECK (`ciclo_atual` >= 1)',
 'SELECT 1');
PREPARE enrollment_cycle_check FROM @add_enrollment_cycle_check;
EXECUTE enrollment_cycle_check;
DEALLOCATE PREPARE enrollment_cycle_check;

SET @add_attempt_cycle_check = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
 WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'Q_Tentativas'
   AND CONSTRAINT_NAME = 'chk_tentativas_ciclo') = 0,
 'ALTER TABLE Q_Tentativas ADD CONSTRAINT `chk_tentativas_ciclo` CHECK (`ciclo_matricula` >= 1)',
 'SELECT 1');
PREPARE attempt_cycle_check FROM @add_attempt_cycle_check;
EXECUTE attempt_cycle_check;
DEALLOCATE PREPARE attempt_cycle_check;

SET @replace_attempt_idempotency = IF(COALESCE((SELECT GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX)
 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Q_Tentativas'
   AND INDEX_NAME = 'uk_tentativa_idempotente'), '') <> 'id_usuario,id_questionario,ciclo_matricula,chave_idempotencia',
 IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Q_Tentativas'
       AND INDEX_NAME = 'uk_tentativa_idempotente') = 0,
    'ALTER TABLE Q_Tentativas ADD UNIQUE KEY `uk_tentativa_idempotente` (`id_usuario`, `id_questionario`, `ciclo_matricula`, `chave_idempotencia`)',
    'ALTER TABLE Q_Tentativas DROP INDEX `uk_tentativa_idempotente`, ADD UNIQUE KEY `uk_tentativa_idempotente` (`id_usuario`, `id_questionario`, `ciclo_matricula`, `chave_idempotencia`)'),
 'SELECT 1');
PREPARE attempt_idempotency_statement FROM @replace_attempt_idempotency;
EXECUTE attempt_idempotency_statement;
DEALLOCATE PREPARE attempt_idempotency_statement;

SET @add_attempt_cycle_index = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Q_Tentativas'
   AND INDEX_NAME = 'idx_tentativas_ciclo_atual') = 0,
 'ALTER TABLE Q_Tentativas ADD KEY `idx_tentativas_ciclo_atual` (`id_usuario`, `id_turma`, `ciclo_matricula`, `id_questionario`, `finalizada_em`)',
 'SELECT 1');
PREPARE attempt_cycle_index FROM @add_attempt_cycle_index;
EXECUTE attempt_cycle_index;
DEALLOCATE PREPARE attempt_cycle_index;
