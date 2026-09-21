-- Goal 11B: índices direcionados por EXPLAIN para listagens paginadas crescentes.
SET @add_usuarios_nome_index = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Usuarios'
   AND INDEX_NAME = 'idx_usuarios_nome_lista') = 0,
 'ALTER TABLE Usuarios ADD KEY `idx_usuarios_nome_lista` (`nome_completo`, `id_usuario`)',
 'SELECT 1');
PREPARE runtime_index_statement FROM @add_usuarios_nome_index;
EXECUTE runtime_index_statement;
DEALLOCATE PREPARE runtime_index_statement;

SET @add_turmas_data_index = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Turmas'
   AND INDEX_NAME = 'idx_turmas_data_lista') = 0,
 'ALTER TABLE Turmas ADD KEY `idx_turmas_data_lista` (`data_inicio` DESC, `id_turma` DESC)',
 'SELECT 1');
PREPARE runtime_index_statement FROM @add_turmas_data_index;
EXECUTE runtime_index_statement;
DEALLOCATE PREPARE runtime_index_statement;

SET @add_tentativas_aluno_data_index = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Q_Tentativas'
   AND INDEX_NAME = 'idx_tentativas_aluno_data') = 0,
 'ALTER TABLE Q_Tentativas ADD KEY `idx_tentativas_aluno_data` (`id_usuario`, `iniciada_em` DESC, `id_tentativa` DESC)',
 'SELECT 1');
PREPARE runtime_index_statement FROM @add_tentativas_aluno_data_index;
EXECUTE runtime_index_statement;
DEALLOCATE PREPARE runtime_index_statement;

SET @add_tentativas_turma_data_index = IF((SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Q_Tentativas'
   AND INDEX_NAME = 'idx_tentativas_turma_data') = 0,
 'ALTER TABLE Q_Tentativas ADD KEY `idx_tentativas_turma_data` (`id_turma`, `iniciada_em` DESC, `id_tentativa` DESC)',
 'SELECT 1');
PREPARE runtime_index_statement FROM @add_tentativas_turma_data_index;
EXECUTE runtime_index_statement;
DEALLOCATE PREPARE runtime_index_statement;
