SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `Certificados` (
  `id_certificado` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `id_aluno` INT NOT NULL,
  `id_turma` INT NOT NULL,

  `codigo_publico` VARCHAR(40)
    CHARACTER SET ascii COLLATE ascii_bin NOT NULL,

  `aluno_nome` VARCHAR(255) NOT NULL,
  `curso_nome` VARCHAR(255) NOT NULL,
  `turma_nome` VARCHAR(100) NOT NULL,
  `carga_horaria` INT NOT NULL,

  `emitido_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status` ENUM('ATIVO', 'REVOGADO') NOT NULL DEFAULT 'ATIVO',

  `sha256` CHAR(64)
    CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `storage_name` VARCHAR(64)
    CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `tamanho_bytes` BIGINT UNSIGNED NOT NULL,

  `id_usuario_emissor` INT NOT NULL,
  `revogado_em` DATETIME NULL,
  `id_usuario_revogador` INT NULL,
  `motivo_revogacao` VARCHAR(500) NULL,
  `criado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (`id_certificado`),

  UNIQUE KEY `uk_certificado_aluno_turma` (`id_aluno`, `id_turma`),
  UNIQUE KEY `uk_certificado_codigo_publico` (`codigo_publico`),
  UNIQUE KEY `uk_certificado_storage_name` (`storage_name`),
  KEY `idx_certificado_sha256` (`sha256`),

  CONSTRAINT `fk_certificado_matricula`
    FOREIGN KEY (`id_aluno`, `id_turma`)
    REFERENCES `Matriculas` (`id_aluno`, `id_turma`)
    ON DELETE RESTRICT,

  CONSTRAINT `fk_certificado_emissor`
    FOREIGN KEY (`id_usuario_emissor`)
    REFERENCES `Usuarios` (`id_usuario`)
    ON DELETE RESTRICT,

  CONSTRAINT `fk_certificado_revogador`
    FOREIGN KEY (`id_usuario_revogador`)
    REFERENCES `Usuarios` (`id_usuario`)
    ON DELETE RESTRICT,

  CONSTRAINT `chk_certificado_carga_horaria`
    CHECK (`carga_horaria` > 0),

  CONSTRAINT `chk_certificado_revogacao`
    CHECK (
      (
        `status` = 'ATIVO'
        AND `revogado_em` IS NULL
        AND `id_usuario_revogador` IS NULL
        AND `motivo_revogacao` IS NULL
      )
      OR
      (
        `status` = 'REVOGADO'
        AND `revogado_em` IS NOT NULL
        AND `id_usuario_revogador` IS NOT NULL
        AND `motivo_revogacao` IS NOT NULL
      )
    )
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;