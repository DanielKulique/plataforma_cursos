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

Tentativas registram `ciclo_matricula`. Progresso e exercícios pertencem ao ciclo atual; o
resultado do Teste Final é a exceção, pois a tentativa única é por aluno+turma e continua
válida após rematrícula. Histórico pode mostrar ciclos anteriores, identificados.

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

## Liberação do Teste Final: 80% dos conteúdos

A única prova final da turma é uma PROVA explicitamente marcada com `prova_final=1` e ativa.
Uma prova comum não vira final por nome ou posição.

```text
total_conteudos = todos os Conteudos da turma
conteudos_concluidos = conteúdos concluídos pelo aluno no ciclo atual
liberado = total_conteudos > 0 e conteudos_concluidos × 100 >= total_conteudos × 80
```

EXERCICIO, inclusive Simulado, é opcional e não entra no numerador nem no denominador. 0/0 e
79/100 bloqueiam; 80/100 libera. O percentual arredondado na tela não decide o gate. O backend
verifica a regra ao entregar perguntas e antes da primeira submissão do Teste Final.

## Tentativa, resultado e aprovação: uma tentativa, nota mínima 75%

Há uma tentativa finalizada do Teste Final por aluno+turma, independente do ciclo de matrícula.
Reenvio da mesma `submission_id` UUID devolve o resultado persistido; novo ID após a tentativa
finalizada recebe 409. A regra se aplica somente ao Teste Final; exercícios mantêm tentativas
livres.

CURSANDO vira APROVADO quando a tentativa finalizada do Teste Final tem percentual >=75.
74,99 não aprova; 75,00 aprova. Conteúdo incompleto não impede aprovação: por exemplo, 20/22
conteúdos + 100% e 18/22 + 75% aprovam. Resultado abaixo de 75 consome a tentativa e não gera
aprovação automática nem certificado.

A correção usa os pontos das perguntas e é calculada no servidor. A final trunca conservadoramente
o percentual em duas casas. Resultado abaixo de 75 não reprova a matrícula automaticamente.
Retries técnicos com a mesma `submission_id` são idempotentes e não criam outra tentativa.

`nota_final` é campo manual opcional entre 0 e 10, sem conversão automática do percentual.
Sua ausência não impede aprovação. PATCH para APROVADO exige Teste Final >=75 sem exigir
conteúdo completo. REPROVADO continua sendo decisão manual conforme o contrato existente.
CANCELADO e REPROVADO não são promovidos automaticamente por progresso ou outras avaliações.

## Certificados e replicação

Ao aprovar, o sistema inicia automaticamente a emissão do certificado. A elegibilidade exige
matrícula APROVADO e Teste Final >=75; não exige 100% dos conteúdos. A emissão é idempotente,
preserva código aleatório, QR, SHA-256, snapshot imutável, arquivo privado, validação pública,
ACTIVE/REVOKED e histórico de versões. Falha de PDF não desfaz nota ou aprovação; emissão pode
ser recuperada sem repetir a prova. Professor responsável/ADMIN só intervêm na recuperação.

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
