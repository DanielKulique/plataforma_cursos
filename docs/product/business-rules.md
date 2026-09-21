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
incrementa `ciclo_atual`, volta a CURSANDO, zera nota/progresso e limpa o progresso dos conteúdos
da turma. Tentativas, respostas e certificados históricos são preservados. PATCH acadêmico
não substitui a rematrícula. Certificado ATIVO bloqueia cancelamento ou saída de APROVADO
até revogação administrativa.

Tentativas registram `ciclo_matricula`. Exercícios realizados, aprovação da prova final e
certificação usam apenas o ciclo atual. Histórico pode mostrar ciclos anteriores, identificados.

## Aulas, conteúdos e exercícios

Aula é `Modulos`: pertence à turma e agrupa conteúdos e avaliações. `id_modulo` pode ser nulo;
quando preenchido, deve pertencer à mesma turma. Não há bloqueio sequencial entre aulas.

Conteúdo pode ser VIDEO, TEXTO, PDF, LINK ou ATIVIDADE. O aluno registra INICIADO ou CONCLUIDO;
CONCLUIDO não regride pelo fluxo de progresso. Conteúdo com progresso e aula com itens não
podem ser excluídos. PDF substituído gera arquivo novo e preserva referências anteriores.

Questionários são EXERCICIO ou PROVA. Exercício conta como realizado após tentativa finalizada,
independentemente da nota e sem contar retries duas vezes. Perguntas suportam múltipla escolha
ou verdadeiro/falso, pelo menos duas alternativas e exatamente uma correta. O gabarito não
é enviado na leitura respondível do aluno. Histórico acadêmico restringe edição e exclusão;
para mudar uma avaliação já utilizada, respeite os conflitos retornados pelo backend.

## Liberação da prova final: 80% da trilha

A única prova final da turma é uma PROVA explicitamente marcada com `prova_final=1` e ativa.
Uma prova comum não vira final por nome ou posição.

```text
total_trilha = todos os Conteudos + Questionarios EXERCICIO ativos
trilha_realizada = conteúdos concluídos + exercícios finalizados no ciclo atual
liberada = total_trilha > 0 e trilha_realizada × 100 >= total_trilha × 80
```

Provas, exercícios inativos e tentativas de outras turmas/alunos/ciclos não entram no cálculo.
0/0 bloqueia. Com 101 itens, 80 realizados bloqueiam e 81 liberam. O percentual arredondado
na tela não decide o gate. O backend verifica a regra tanto ao entregar perguntas quanto
antes de aceitar nova submissão da final.

## Nota, conclusão e aprovação: conteúdos integrais + 75% na final

Conclusão de conteúdos exige `total_conteudos > 0` e igualdade exata entre concluídos e total.
Questionários não entram nessa contagem. 200/201 pode aparecer como 100% arredondado, mas
não é conclusão integral.

CURSANDO vira APROVADO automaticamente quando há conclusão integral e alguma tentativa
finalizada da prova final ativa com percentual >=75 no ciclo atual. A avaliação ocorre nas
transações de progresso e submissão, independentemente da ordem em que o aluno cumpre os requisitos.

A correção usa os pontos das perguntas e é calculada no servidor. A final trunca conservadoramente
o percentual em duas casas: 74,99 não aprova; 75,00 aprova. Resultado abaixo de 75 não reprova
a matrícula automaticamente. Outra tentativa pior não apaga a conquista anterior. Tentativas
não têm limite acadêmico; `submission_id` UUID evita duplicação no mesmo ciclo.

`nota_final` é campo manual opcional entre 0 e 10, sem conversão automática do percentual.
Sua ausência não impede aprovação. PATCH para APROVADO exige os mesmos requisitos objetivos;
REPROVADO é decisão manual que exige conteúdos completos e nota. CANCELADO e REPROVADO
não são promovidos automaticamente.

## Certificados e replicação

Aprovar não emite certificado automaticamente. Uma nova emissão revalida requisitos atuais,
além de exigir matrícula APROVADO. Turma ENCERRADA pode ter certificado emitido. Conteúdo
adicionado após aprovação pode impedir nova emissão até ser concluído, sem rebaixar o status
armazenado. Documento ativo existente é devolvido sem regeneração.

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
