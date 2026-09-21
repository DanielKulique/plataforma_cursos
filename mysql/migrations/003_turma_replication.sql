SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `ReplicacoesTurma` (
  `id_replicacao` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `id_turma_origem` INT NULL,
  `id_turma_destino` INT NOT NULL,
  `id_usuario_admin` INT NULL,
  `chave_idempotencia` VARCHAR(64) NOT NULL,
  `criada_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_replicacao`),
  UNIQUE KEY `uk_replicacao_chave` (`chave_idempotencia`),
  UNIQUE KEY `uk_replicacao_destino` (`id_turma_destino`),
  KEY `idx_replicacao_origem` (`id_turma_origem`),
  KEY `idx_replicacao_admin` (`id_usuario_admin`),
  CONSTRAINT `fk_replicacao_origem` FOREIGN KEY (`id_turma_origem`) REFERENCES `Turmas` (`id_turma`) ON DELETE SET NULL,
  CONSTRAINT `fk_replicacao_destino` FOREIGN KEY (`id_turma_destino`) REFERENCES `Turmas` (`id_turma`) ON DELETE CASCADE,
  CONSTRAINT `fk_replicacao_admin` FOREIGN KEY (`id_usuario_admin`) REFERENCES `Usuarios` (`id_usuario`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
