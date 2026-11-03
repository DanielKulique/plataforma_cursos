# Goal 21 — Association answer security

Data: 03/11/2026, America/Sao_Paulo.

**STATUS: ASSOCIATION_ANSWER_SECURITY_READY**, para F18-02/T18-03.

## BASELINE_COMMIT

`d6bb5f34642c45285980baccce12e8a6ec6265aa`, entrega validada e limpa do Goal 20,
contendo o Goal 19 `dcccc29394a92574739c5b4351f240fe5d6e127e`.

Branch: `hotfix/association-answer-security-goal21`.
Worktree criada limpa: `/mnt/disco/projetoSite/worktrees/plataforma-cursos-goal21`.
HEAD, diff e histórico foram conferidos antes da alteração. Não houve merge, reset
ou stash da árvore original. HEAD, status e SHA-256 dos 725 arquivos da árvore
original, 734 do Goal 19 e 738 do Goal 20 permaneceram idênticos aos snapshots iniciais.

## ROOT_CAUSE

`persistirConteudoPergunta` grava os lados de um par com a mesma `ordem`.
`carregarItensAssociacao` lê cada lado nessa ordem; isso fornece a ordem canônica
dos vínculos. O DTO já removia a ordem dos itens e a tabela de gabaritos, mas
`embaralharSemPreservarPosicao` executava Fisher-Yates e, quando saía a identidade,
trocava os dois primeiros itens.

Logo, o processo de apresentação dependia observavelmente do gabarito. A falha não
era apenas visual: ela estava na distribuição do payload recebido pelo aluno.
O teste de integração antigo também exigia uma ordem diferente da original,
consolidando esse comportamento inseguro.

Inspecionados: `questoes.models.js`, `question-types.service.js`, migrations 016,
controllers/rotas, `turma-replication.service.js`, frontend `questionario.js` e os
testes de autoria/submissão. A autoria exige dois ou mais pares, rejeita IDs e
metadados de vínculo enviados pelo cliente e gera um UUID v4 independente para
cada lado usando `crypto.randomUUID()`. Não há ID sequencial ou ID compartilhado
de par no contrato de itens. A replicação gera UUIDs novos da mesma forma.

## TWO_PAIR_LEAK

Para pares canônicos `L1→R1, L2→R2`, os dois caminhos de RNG anteriores produziam
sempre `[R2,R1]`. Associar a primeira esquerda à segunda direita e vice-versa
acertava sem compreender o conteúdo. A reprodução usa a função exata da baseline
e enumera os caminhos, sem depender de sorte ou frequência amostral.

Após a correção, `[R1,R2]` e `[R2,R1]` aparecem uma vez cada nos dois caminhos.
Uma apresentação alinhada pode ocorrer por acaso; ela não informa qual gabarito
é correto, pois ambos os gabaritos candidatos geram a mesma distribuição pública.

## MULTI_PAIR_LEAK

Com `n` pares, cada caminho de Fisher-Yates tem probabilidade `1/n!`. A versão
anterior eliminava a identidade e dobrava a probabilidade da troca dos primeiros
dois itens. Como os IDs são estáveis, consultas repetidas permitiam observar essa
assimetria e inferir a ordem canônica. O ataque não precisava da propriedade
`ordem` no JSON. Para listas maiores isso é um canal estatístico, não uma afirmação
de que uma única consulta sempre revela todos os vínculos.

| Pares | Caminhos RNG enumerados | Permutações anteriores | Permutações corrigidas | Frequência corrigida por permutação |
| --- | ---: | ---: | ---: | ---: |
| 2 | 2 | 1, com frequência 2 | 2 | 1 |
| 3 | 6 | 5, uma com frequência 2 | 6 | 1 |
| 4 | 24 | 23, uma com frequência 2 | 24 | 1 |

A correção conserva todos os resultados do Fisher-Yates com `crypto.randomInt`.
Não acrescenta pós-processamento, rejeição de identidades ou restrição de posições.
Para qualquer ordem de entrada, cada permutação continua possível com a mesma
probabilidade. A única mudança de runtime é essa remoção, o nome do helper e seu
comentário; a leitura, persistência e correção permanecem iguais à baseline.

## STUDENT_PAYLOAD

O aluno recebe `itens_esquerda` e `itens_direita`, cada item estritamente com
`{ id_item, texto }`. A `ordem` da pergunta continua sendo a ordem da pergunta,
sem vínculo com os pares. Não são enviados `ordem` dos itens, `lado`, IDs de par,
`pares`, `correta`, `resposta_booleana` ou os vínculos `id_item_esquerda/direita`.

Os UUIDs públicos são os identificadores independentes dos próprios itens; não são
identificadores da relação correta. Mantê-los preserva rascunhos e submissões.
O serializer não consulta `Q_AssociacaoGabaritos`. A consulta de metadados com papel
ALUNO retorna somente a trilha, sem perguntas/gabaritos; o professor autorizado
continua recebendo os pares completos pela consulta de autoria.

Além da whitelist de todas as propriedades, a regressão compara o **JSON completo**
para cada gabarito candidato de dois e três pares. Ela mantém IDs/textos públicos
fixos, faz a ordem persistida da direita codificar cada gabarito candidato e enumera
todos os caminhos de RNG. Os conjuntos de payloads, incluindo multiplicidades, são
idênticos para todos os gabaritos. Na baseline, essa igualdade falhava. Isso verifica
o canal de inferência completo de ordem/metadados, e não apenas nomes de campos ausentes.

## HISTORICAL_COMPATIBILITY

Sem migração, regravação de itens, remapeamento de IDs ou atualização de tentativas.
Questões persistidas no formato existente continuam usando os mesmos UUIDs e ordens.
Os testes consultam registros já gravados, inclusive com ordens não consecutivas e
inserção fora de ordem; comparam itens/gabaritos antes e depois da apresentação.
Snapshots de tentativas, respostas e associações persistidas permanecem iguais após
retry e nova tentativa incorreta. A checagem de código confirma que as funções de
persistência e correção não foram modificadas.

No browser, `sessionStorage` guarda os IDs escolhidos e o UUID da submissão. A
restauração encontra itens por ID, não por posição. O E2E recarrega o questionário
e verifica a igualdade integral do rascunho e das escolhas restauradas. Os testes
determinísticos também comparam apresentações diferentes dos mesmos registros.

## GRADING

`prepararCorrecao` valida pertencimento à pergunta/lado, uso único de cada item e
compara os vínculos submetidos com `Q_AssociacaoGabaritos`, independentemente da
posição visual e da ordem dos matches. Para 2, 3 e 5 pares, os testes reais verificam
2,5 pontos/100% quando todos estão corretos e zero quando dois vínculos são trocados,
inclusive quando os demais estão corretos. IDs alheios e duplicados continuam
recusados. A replicação mantém textos/vínculos com IDs novos e corrige a cópia.

Não foram alterados Teste Final, aprovação, certificados, notas históricas ou qualquer
regra acadêmica. O frontend de produção e as dependências também não foram alterados.

## IDEMPOTENCY

O retry com o mesmo UUID retorna o mesmo `id_tentativa`, com `reutilizada: true`, sem
alterar snapshots das linhas. O E2E faz a primeira submissão chegar ao servidor real
e interrompe somente sua resposta ao browser; o aluno clica novamente, o browser
reenvia o UUID do rascunho e o histórico contém uma única tentativa. Esse caso foi
executado para duas e três associações em viewport de 320 px.

## TESTS

| Gate final | Resultado |
| --- | --- |
| Novas regressões contra baseline, antes da correção | 6 falhas esperadas, reproduzindo o vazamento |
| Jest direcionado: segurança, modelos/rotas Goal 3, autoria e questionário frontend | 5 suítes, **44/44 PASS** |
| Integração real de autoria/associação, MySQL 8.4.11 descartável | **11/11 PASS** |
| Chromium E2E com autoria UI, mobile, rascunho, submissão e retry | **2/2 PASS**, zero retries/flaky |
| Lint | PASS |
| Build: isolamento estático de banco e assets de produção | PASS |
| `git diff --check` e `git diff --cached --check` | PASS |
| Preservação de árvore original, Goal 19 e Goal 20 | HEAD, status e todos os hashes idênticos |

Ambiente: Node 24.20.0/npm 11.19.0 no host; app E2E na linha Node 20 declarada no
Dockerfile. `.env.test` local foi criado com credenciais exclusivamente sintéticas
e não integra o commit. O runner de integração usou `compose.integration.yaml` com
projeto novo e MySQL publicado somente em loopback:33307. O E2E usou
`compose.e2e.yaml`, projeto novo e app somente em loopback:3400. Nenhum deles usou
Compose de produção, banco do host ou volume permanente. Containers, redes e volumes
descartáveis foram removidos ao final.

Uma execução intermediária da integração terminou com SIGTERM durante preparação,
sem novo resultado Jest; não foi contabilizada como aprovação. Foi confirmado o
encerramento do processo e o ownership do laboratório retido, seguido de cleanup
somente desse projeto e nova execução completa com **11/11 PASS**. Na primeira
parametrização E2E, os casos compartilhavam um título único; títulos distintos de
fixture resolveram a colisão. A execução final dos dois casos passou sem retry.

Reprodução, após configurar `.env.test` somente para laboratório descartável:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npx --no-install jest --runInBand --runTestsByPath src/__tests__/association-answer.security.test.js src/__tests__/goal3.models.test.js src/__tests__/goal3.routes.test.js src/__tests__/assessment-authoring.frontend.test.js src/__tests__/questionario.frontend.test.js --detectOpenHandles
npm run test:integration -- --runTestsByPath src/__tests__/integration/question-authoring-types.integration.test.js
npm run test:e2e -- tests/e2e/question-authoring-types.spec.js
npm run lint
npm run build
git diff --check
```

[Evidência estruturada](evidence/goal21-association-answer-security.json),
[mobile com dois pares](evidence/goal21-association-mobile-2.png) e
[mobile com três pares](evidence/goal21-association-mobile-3.png).
O E2E também verificou ausência de overflow em 320, 360, 390, 412, 768 e 1440 px.

## FILES_CHANGED

| Arquivo | Finalidade |
| --- | --- |
| `src/api/models/questoes.models.js` | Shuffle sem viés, permitindo identidade |
| `src/__tests__/association-answer.security.test.js` | Enumeração determinística e distribuição do payload completo |
| `src/__tests__/integration/question-authoring-types.integration.test.js` | Payload, IDs, persistência, grading, retry e replicação reais |
| `tests/e2e/question-authoring-types.spec.js` | Dois/três pares, mobile, rascunho e retry após resposta perdida |
| `docs/engineering/question-authoring-types.md` | Contrato de apresentação e motivo para permitir identidade |
| `docs/engineering/GOAL_21_ASSOCIATION_ANSWER_SECURITY.md` | Este relatório |
| `docs/engineering/evidence/goal21-association-answer-security.json` | Resultados e hashes sanitizados |
| `docs/engineering/evidence/goal21-association-mobile-2.png` | Captura mobile sintética |
| `docs/engineering/evidence/goal21-association-mobile-3.png` | Captura mobile sintética |

## FIX_COMMIT

Commit isolado na branch indicada; o SHA imutável acompanha a entrega final e pode
ser obtido por `git log -1 --format=%H -- docs/engineering/GOAL_21_ASSOCIATION_ANSWER_SECURITY.md`.

## REMAINING_RISKS

- A garantia cobre inferência pelos IDs gerados pela aplicação, ordem e metadados do
  payload antes da submissão. Conteúdo textual que explicite a resposta e acesso
  autorizado do professor ao gabarito não são eliminados pelo shuffle.
- Permutações alinhadas podem ocorrer por acaso e são necessárias para remover o viés.
  Reintroduzir uma troca forçada ou expor a ordem persistida reabre esse canal.
- Não houve avaliação de outros achados do Goal 18, de inferência por feedback após
  submissões permitidas pelas regras existentes, de edição manual indevida do banco
  ou de prontidão geral de release. Não se mudou o regime de tentativas.
- Sem CI remota, merge, push ou inspeção de dados/imagem de produção. A correção vale
  para esta revisão; árvores anteriores permanecem preservadas e não foram atualizadas.

**DEPLOY: NO**. Nenhum dado real foi modificado.
