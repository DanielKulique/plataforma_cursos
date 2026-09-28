# Produto

Uma turma representa uma oferta de um curso para um grupo de alunos, sob responsabilidade
de um professor. O curso define o tema e a carga horária; cada turma tem seus próprios
materiais, avaliações, matrículas e resultados.

## Jornada principal

1. O administrador cadastra professores, cursos e turmas.
2. O aluno cria sua conta, confirma o e-mail e se matricula em turma aberta.
3. Na Sala Virtual, acessa aulas, marca conteúdos concluídos e realiza exercícios.
4. O Teste Final fica disponível ao concluir pelo menos 80% dos conteúdos; o Simulado é opcional.
5. Uma única tentativa finalizada com pelo menos 75% aprova o aluno, mesmo com conteúdos restantes.
6. O sistema emite o certificado automaticamente; o aluno acessa o PDF privado na sua área.
7. Qualquer pessoa pode consultar um código ou enviar o PDF para comparação de autenticidade.

## Escopo e limites

A plataforma contém catálogo público, área do aluno, área do professor, administração,
recuperação de senha, materiais PDF privados, resultados acadêmicos e operação com backups.
A replicação de turma copia estrutura para uma oferta independente, sem copiar alunos ou resultados.

Conteúdos podem ser VIDEO, TEXTO, PDF, LINK ou ATIVIDADE. Marcar conclusão registra uma ação
do aluno: não comprova tempo de leitura ou de vídeo. ATIVIDADE não é uma caixa de entrega
com correção de arquivos. Avaliações suportam múltipla escolha e verdadeiro/falso.

A integração de similaridade é opcional. Com `DETECTOR_ENABLED=false`, a capacidade é
informada como indisponível e as rotas do detector falham de forma controlada. Não é necessária
para cursos, avaliações ou certificados. Não há cobrança, controle de vagas ou LMS externo
no fluxo descrito aqui.

Consulte [regras](business-rules.md), [perfis](roles.md) e [certificados](certificates.md).
