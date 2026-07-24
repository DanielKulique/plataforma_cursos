-- Schema canônico da plataforma.
-- Este arquivo não cria nem seleciona bancos. O banco-alvo é escolhido somente
-- pelos scripts protegidos scripts/setup_database.js.

SET NAMES utf8mb4;

CREATE TABLE `Usuarios` (
  `id_usuario` INT NOT NULL AUTO_INCREMENT,
  `nome_completo` VARCHAR(255) NOT NULL,
  `cpf` VARCHAR(11) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `senha` VARCHAR(255) NOT NULL COMMENT 'Hash da senha; nunca armazenar texto puro.',
  `telefone` VARCHAR(20) NULL,
  `tipo` ENUM('ALUNO', 'PROFESSOR', 'ADMIN') NOT NULL,
  `data_cadastro` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_usuario`),
  UNIQUE KEY `uk_usuarios_cpf` (`cpf`),
  UNIQUE KEY `uk_usuarios_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `EmailVerificacoes` (
  `id_verificacao` INT NOT NULL AUTO_INCREMENT,
  `email` VARCHAR(255) NOT NULL,
  `codigo` VARCHAR(6) NOT NULL,
  `verificado` TINYINT(1) NOT NULL DEFAULT 0,
  `expira_em` DATETIME NOT NULL,
  `criado_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id_verificacao`),
  UNIQUE KEY `uk_email_verificacao` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Cursos` (
  `id_curso` INT NOT NULL AUTO_INCREMENT,
  `nome_curso` VARCHAR(255) NOT NULL,
  `descricao` TEXT NULL,
  `carga_horaria` INT NOT NULL,
  PRIMARY KEY (`id_curso`),
  UNIQUE KEY `uk_cursos_nome` (`nome_curso`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Turmas` (
  `id_turma` INT NOT NULL AUTO_INCREMENT,
  `id_curso` INT NOT NULL,
  `id_professor` INT NOT NULL,
  `nome_turma` VARCHAR(100) NOT NULL,
  `data_inicio` DATE NOT NULL,
  `data_fim` DATE NULL,
  `status` ENUM('ABERTA', 'FECHADA', 'ENCERRADA') NOT NULL DEFAULT 'ABERTA',
  PRIMARY KEY (`id_turma`),
  UNIQUE KEY `uk_turmas_nome` (`nome_turma`),
  KEY `idx_turmas_curso` (`id_curso`),
  KEY `idx_turmas_professor` (`id_professor`),
  CONSTRAINT `fk_turmas_curso` FOREIGN KEY (`id_curso`) REFERENCES `Cursos` (`id_curso`) ON DELETE RESTRICT,
  CONSTRAINT `fk_turmas_professor` FOREIGN KEY (`id_professor`) REFERENCES `Usuarios` (`id_usuario`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Matriculas` (
  `id_matricula` INT NOT NULL AUTO_INCREMENT,
  `id_aluno` INT NOT NULL,
  `id_turma` INT NOT NULL,
  `data_matricula` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `nota_final` DECIMAL(5,2) NULL,
  `status_aprovacao` ENUM('CURSANDO', 'APROVADO', 'REPROVADO', 'CANCELADO') NOT NULL DEFAULT 'CURSANDO',
  `progresso_percentual` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (`id_matricula`),
  UNIQUE KEY `uk_aluno_turma` (`id_aluno`, `id_turma`),
  KEY `idx_matriculas_turma` (`id_turma`),
  CONSTRAINT `fk_matriculas_aluno` FOREIGN KEY (`id_aluno`) REFERENCES `Usuarios` (`id_usuario`) ON DELETE CASCADE,
  CONSTRAINT `fk_matriculas_turma` FOREIGN KEY (`id_turma`) REFERENCES `Turmas` (`id_turma`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Questionarios` (
  `id_questionario` INT NOT NULL AUTO_INCREMENT,
  `id_curso` INT NOT NULL,
  `id_turma` INT NOT NULL,
  `titulo` VARCHAR(255) NOT NULL,
  `descricao` VARCHAR(255) NOT NULL,
  `ativo` TINYINT(1) NOT NULL DEFAULT 1,
  `tipo` ENUM('PROVA', 'EXERCICIO') NOT NULL DEFAULT 'EXERCICIO',
  PRIMARY KEY (`id_questionario`),
  UNIQUE KEY `uk_questionario_turma_tipo_titulo` (`id_turma`, `tipo`, `titulo`),
  KEY `idx_questionarios_curso` (`id_curso`),
  CONSTRAINT `fk_questionarios_curso` FOREIGN KEY (`id_curso`) REFERENCES `Cursos` (`id_curso`) ON DELETE CASCADE,
  CONSTRAINT `fk_questionarios_turma` FOREIGN KEY (`id_turma`) REFERENCES `Turmas` (`id_turma`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Q_Perguntas` (
  `id_pergunta` INT NOT NULL AUTO_INCREMENT,
  `id_questionario` INT NOT NULL,
  `texto_pergunta` VARCHAR(255) NOT NULL,
  `tipo_pergunta` ENUM('MULTIPLA_ESCOLHA', 'VERDADEIRO_FALSO', 'RESPOSTA_CURTA') NOT NULL,
  `ordem` INT NOT NULL,
  `pontos` DECIMAL(6,2) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id_pergunta`),
  UNIQUE KEY `uk_pergunta_questionario_ordem` (`id_questionario`, `ordem`),
  CONSTRAINT `fk_perguntas_questionario` FOREIGN KEY (`id_questionario`) REFERENCES `Questionarios` (`id_questionario`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Q_Opcoes` (
  `id_opcao` INT NOT NULL AUTO_INCREMENT,
  `id_pergunta` INT NOT NULL,
  `texto_opcao` VARCHAR(255) NOT NULL,
  `ordem` INT NOT NULL,
  `correta` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id_opcao`),
  UNIQUE KEY `uk_opcao_pergunta_ordem` (`id_pergunta`, `ordem`),
  CONSTRAINT `fk_opcoes_pergunta` FOREIGN KEY (`id_pergunta`) REFERENCES `Q_Perguntas` (`id_pergunta`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Q_Tentativas` (
  `id_tentativa` INT NOT NULL AUTO_INCREMENT,
  `id_questionario` INT NOT NULL,
  `id_usuario` INT NOT NULL,
  `id_turma` INT NOT NULL,
  `pontuacao` DECIMAL(8,2) NOT NULL DEFAULT 0,
  `percentual` DECIMAL(5,2) NOT NULL DEFAULT 0,
  `acertos` INT NOT NULL DEFAULT 0,
  `total_perguntas` INT NOT NULL,
  `iniciada_em` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finalizada_em` DATETIME NULL,
  PRIMARY KEY (`id_tentativa`),
  KEY `idx_tentativas_aluno_questionario` (`id_usuario`, `id_questionario`),
  KEY `idx_tentativas_turma` (`id_turma`),
  CONSTRAINT `fk_tentativa_questionario` FOREIGN KEY (`id_questionario`) REFERENCES `Questionarios` (`id_questionario`) ON DELETE CASCADE,
  CONSTRAINT `fk_tentativa_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `Usuarios` (`id_usuario`) ON DELETE CASCADE,
  CONSTRAINT `fk_tentativa_turma` FOREIGN KEY (`id_turma`) REFERENCES `Turmas` (`id_turma`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Q_Respostas` (
  `id_resposta` INT NOT NULL AUTO_INCREMENT,
  `id_pergunta` INT NOT NULL,
  `id_usuario` INT NOT NULL,
  `id_questionario` INT NOT NULL,
  `id_tentativa` INT NOT NULL,
  `resposta_texto` TEXT NULL,
  `resposta_opcao` INT NULL,
  `data_resposta` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `correta` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id_resposta`),
  UNIQUE KEY `uk_resposta_tentativa_pergunta` (`id_tentativa`, `id_pergunta`),
  KEY `idx_respostas_usuario` (`id_usuario`),
  KEY `idx_respostas_questionario` (`id_questionario`),
  KEY `idx_respostas_opcao` (`resposta_opcao`),
  CONSTRAINT `fk_respostas_pergunta` FOREIGN KEY (`id_pergunta`) REFERENCES `Q_Perguntas` (`id_pergunta`) ON DELETE CASCADE,
  CONSTRAINT `fk_respostas_usuario` FOREIGN KEY (`id_usuario`) REFERENCES `Usuarios` (`id_usuario`) ON DELETE CASCADE,
  CONSTRAINT `fk_respostas_questionario` FOREIGN KEY (`id_questionario`) REFERENCES `Questionarios` (`id_questionario`) ON DELETE CASCADE,
  CONSTRAINT `fk_respostas_tentativa` FOREIGN KEY (`id_tentativa`) REFERENCES `Q_Tentativas` (`id_tentativa`) ON DELETE CASCADE,
  CONSTRAINT `fk_respostas_opcao` FOREIGN KEY (`resposta_opcao`) REFERENCES `Q_Opcoes` (`id_opcao`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Modulos` (
  `id_modulo` INT NOT NULL AUTO_INCREMENT,
  `id_turma` INT NOT NULL,
  `titulo` VARCHAR(255) NOT NULL,
  `descricao` TEXT NULL,
  `ordem` INT NOT NULL,
  PRIMARY KEY (`id_modulo`),
  UNIQUE KEY `uk_modulo_turma_ordem` (`id_turma`, `ordem`),
  CONSTRAINT `fk_modulo_turma` FOREIGN KEY (`id_turma`) REFERENCES `Turmas` (`id_turma`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `Conteudos` (
  `id_conteudo` INT NOT NULL AUTO_INCREMENT,
  `id_turma` INT NOT NULL,
  `id_modulo` INT NULL,
  `titulo` VARCHAR(255) NOT NULL,
  `descricao` TEXT NULL,
  `tipo` ENUM('VIDEO', 'TEXTO', 'PDF', 'LINK', 'ATIVIDADE') NOT NULL,
  `url` VARCHAR(1000) NULL,
  `corpo` MEDIUMTEXT NULL,
  `duracao_minutos` INT UNSIGNED NULL,
  `ordem` INT NOT NULL,
  PRIMARY KEY (`id_conteudo`),
  UNIQUE KEY `uk_conteudo_turma_ordem` (`id_turma`, `ordem`),
  KEY `idx_conteudo_modulo` (`id_modulo`),
  CONSTRAINT `fk_conteudo_turma` FOREIGN KEY (`id_turma`) REFERENCES `Turmas` (`id_turma`) ON DELETE CASCADE,
  CONSTRAINT `fk_conteudo_modulo` FOREIGN KEY (`id_modulo`) REFERENCES `Modulos` (`id_modulo`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `ConteudosProgresso` (
  `id_progresso` INT NOT NULL AUTO_INCREMENT,
  `id_aluno` INT NOT NULL,
  `id_conteudo` INT NOT NULL,
  `status` ENUM('NAO_INICIADO', 'INICIADO', 'CONCLUIDO') NOT NULL DEFAULT 'NAO_INICIADO',
  `iniciado_em` DATETIME NULL,
  `concluido_em` DATETIME NULL,
  PRIMARY KEY (`id_progresso`),
  UNIQUE KEY `uk_aluno_conteudo` (`id_aluno`, `id_conteudo`),
  CONSTRAINT `fk_progresso_aluno` FOREIGN KEY (`id_aluno`) REFERENCES `Usuarios` (`id_usuario`) ON DELETE CASCADE,
  CONSTRAINT `fk_progresso_conteudo` FOREIGN KEY (`id_conteudo`) REFERENCES `Conteudos` (`id_conteudo`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `AnalisesPlagio` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `usuario_id` INT NOT NULL,
  `trecho_texto` TEXT NOT NULL,
  `score_similaridade` DECIMAL(5,2) NOT NULL,
  `fontes_encontradas` JSON NULL,
  `criado_em` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_analises_usuario` (`usuario_id`),
  CONSTRAINT `fk_analises_plagio_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `Usuarios` (`id_usuario`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
