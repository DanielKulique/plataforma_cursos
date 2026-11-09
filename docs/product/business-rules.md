# Regras de negócio

O backend decide matrícula, acesso, progresso, aprovação e certificação. A interface apresenta
os resultados dessas decisões; percentuais visuais e campos enviados pelo cliente não as substituem.

## Curso, turma e estados

Curso tem nome único e carga horária. Turma pertence a um curso, tem professor do perfil
PROFESSOR, nome único e datas coerentes. ADMIN gerencia esses metadados.

| Estado | Novas matrículas/rematrículas | Estudo do aluno | Autoria estrutural |
| --- | --- | --- | --- |
| ABERTA | Permitidas | Permitido com matrícula válida | Responsável ou ADMIN |
| FECHADA | Bloqueadas | Permitido com matrícula válida | Responsável ou ADMIN |
| ENCERRADA | Bloqueadas | Bloqueado | Bloqueada |

Datas não mudam o estado automaticamente. ADMIN pode reabrir uma turma.
Curso com turmas e turma com matrículas não são excluídos pelo fluxo normal.

## Matrícula e ciclo acadêmico

A automatrícula é exclusiva de ALUNO e usa o ID autenticado. Exige turma ABERTA e unicidade
aluno + turma; duplicação de matrícula não cancelada retorna conflito. Não há limite de vagas
nem bloqueio automático pelas datas de início/fim.

Cancelar altera o status para CANCELADO, sem apagar a linha. Rematricular reaproveita essa linha,
incrementa `ciclo_atual`, zera nota/progresso e limpa o progresso dos conteúdos da turma.
A situação volta a CURSANDO quando não há Teste Final concluído; se houver resultado final,
APROVADO ou REPROVADO é restaurado a partir dessa tentativa histórica. Tentativas, respostas e certificados históricos são preservados. PATCH acadêmico
não substitui a rematrícula. Certificado ATIVO bloqueia cancelamento ou saída de APROVADO
até revogação administrativa.

Tentativas registram `ciclo_matricula`. Progresso e exercícios pertencem ao ciclo atual; o
resultado do Teste Final é a exceção deliberada, pois a tentativa única é por aluno+turma e
continua válida após rematrícula. Histórico mostra ciclos anteriores identificados.

## Aulas, conteúdos e exercícios

Aula é `Modulos`: pertence à turma e agrupa conteúdos e avaliações. `id_modulo` pode ser nulo;
quando preenchido, deve pertencer à mesma turma. Não há bloqueio sequencial entre aulas.

Conteúdo pode ser VIDEO, TEXTO, PDF, LINK ou ATIVIDADE. O aluno registra INICIADO ou CONCLUIDO;
CONCLUIDO não regride pelo fluxo de progresso. Conteúdo com progresso e aula com itens não
podem ser excluídos. PDF substituído gera arquivo novo e preserva referências anteriores.

Questionários são EXERCICIO ou PROVA. Exercício conta como realizado após tentativa finalizada,
independentemente da nota e sem contar retries duas vezes. Perguntas suportam múltipla escolha
com duas ou mais alternativas e uma ou mais corretas, verdadeiro/falso e associação. A correção
de cada pergunta exige resposta exata, sem crédito parcial. O gabarito não
é enviado na leitura respondível do aluno. Histórico acadêmico restringe edição e exclusão;
para mudar uma avaliação já utilizada, respeite os conflitos retornados pelo backend.

## Liberação do Teste Final: 80% dos conteúdos

A única prova final da turma é uma PROVA explicitamente marcada com `prova_final=1` e ativa.
Uma prova comum não vira final por nome ou posição.

```text
total_trilha = todos os Conteudos da turma
trilha_realizada = conteúdos concluídos pelo aluno
liberada = total_trilha > 0 e trilha_realizada × 100 >= total_trilha × 80
```

Exercícios EXERCICIO, inclusive o Simulado, são opcionais e não entram no denominador nem no
numerador. O Simulado não bloqueia o Teste Final nem o certificado. 0/0 bloqueia; 79/100
bloqueia e 80/100 libera. A decisão usa comparação inteira exata, nunca percentual arredondado.
O backend verifica a regra ao entregar perguntas e antes de aceitar a submissão.

## Resultado do Teste Final: uma tentativa, aprovação com 75%

O aluno pode finalizar o Teste Final uma vez por turma. Um reenvio com o mesmo `submission_id`
UUID devolve o resultado persistido; um novo ID após a tentativa finalizada recebe 409. A regra
vale somente para PROVA FINAL. Exercícios, incluindo o Simulado, mantêm tentativas livres.

A tentativa finalizada do Teste Final determina automaticamente a situação: percentual >=75
resulta em APROVADO; percentual <75 resulta em REPROVADO, mesmo com apenas 80% dos conteúdos.
Sem tentativa finalizada o aluno continua CURSANDO. CANCELADO é preservado.
74,99 não aprova; 75,00 aprova. Conteúdo incompleto não impede aprovação: 20/22 + 100% e
18/22 + 75% são exemplos válidos. O progresso informa o aluno e libera o Teste Final, mas não
é requisito de aprovação após a prova. Tentativa abaixo de 75% fica registrada como resultado
final, sem nova tentativa e sem certificado.

O backend calcula a nota com os pontos das perguntas e a persiste em duas casas, com truncamento
conservador para a final. Repetir a mesma submissão é idempotente; uma submissão diferente não
cria segunda tentativa final.

`nota_final` é campo manual opcional entre 0 e 10, sem conversão automática do percentual.
Sua ausência não impede aprovação. PATCH para APROVADO exige resultado do Teste Final >=75,
sem exigir conclusão de 100% dos conteúdos. Após finalizar o Teste Final, PATCH não pode
contradizer a situação calculada nem alterar a nota manual anterior. O percentual exibido
na lista de alunos vem de `Q_Tentativas.percentual`, em campo separado de `nota_final`.
As leituras históricas, contadores e filtros usam esse resultado; a reconciliação de situações
é dry-run por padrão e APPLY é restrito a laboratório descartável explicitamente autorizado.

## Certificados e replicação

Ao aprovar, o sistema inicia automaticamente a emissão do certificado. A elegibilidade exige
matrícula APROVADO e Teste Final >=75; não exige 100% dos conteúdos. A emissão é idempotente,
preserva código aleatório, QR, SHA-256, snapshot imutável, arquivo privado, validação pública,
ACTIVE/REVOKED e histórico de versões. Uma falha no PDF não desfaz a nota ou a aprovação; a
emissão pode ser recuperada sem repetir a prova. ADMIN/Professor não precisam autorizar a emissão.

Certificados têm versões imutáveis, revogação e reemissão administrativa explícitas;
veja [certificação](certificates.md). Replicação administrativa copia apenas estrutura,
remapeando IDs; não copia matrículas, progresso, tentativas, respostas ou certificados.
`Idempotency-Key` reaproveita a mesma operação somente quando os dados também coincidem.

## Fontes técnicas

As regras centrais estão em [academic-progress.service.js](../../src/api/services/academic-progress.service.js),
[matricula.models.js](../../src/api/models/matricula.models.js),
[questoes.models.js](../../src/api/models/questoes.models.js),
[academic-access.service.js](../../src/api/services/academic-access.service.js) e
[certificate.service.js](../../src/api/services/certificate.service.js).
