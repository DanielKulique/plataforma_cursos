> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Jornada pedagógica por aulas

## Auditoria e decisão

`Modulos` já pertence a `Turmas`, agrupa `Conteudos` por `id_modulo` e possui
`ordem` explícita e única na turma. A interface passa a chamar esses módulos de
**Aulas**, mantendo tabela, IDs, relacionamentos e rotas `/modulos`.
Nenhuma tabela Aula foi criada. A identidade visual existente foi preservada.

O schema anterior de `Questionarios` não tinha vínculo com módulo nem ordem.
A consulta do aluno devolvia somente um questionário por tipo. A migration
aditiva e idempotente `007_classroom_learning_path.sql` acrescenta `id_modulo`
opcional e `ordem`. Os registros existentes permanecem sem aula, com ordem 0;
a autoria permite organizar essa ordem. Nenhuma tentativa ou nota é migrada.
A FK impede excluir uma aula que contenha avaliações. A API valida que a aula
pertence à mesma turma e preserva as verificações de ownership.

## Navegação, sequência e progresso

- Aulas ordenadas por `Modulos.ordem`, com numeração pedagógica contínua.
- Materiais e questionários intercalados pelo campo `ordem`. Em empate,
  conteúdos precedem questionários; tipo e título definem o desempate entre questionários.
  IDs não definem a sequência. O formulário sugere a próxima posição e permite
  editar a ordem explicitamente.
- Accordion com botão, `aria-expanded`, `aria-controls`, foco visível e uma aula
  expandida por vez. A primeira aula pendente abre inicialmente; o hash conserva
  a aula ao voltar de uma avaliação.
- Texto, vídeo e atividade abrem dentro do item na aula. PDF e links têm uma ação
  explícita para abrir em nova aba dentro do mesmo painel contextualizado.
- Resumo compacto, pesquisa e filtros recolhíveis. Filtrar não altera os dados,
  a numeração nem os denominadores de progresso.
- Progresso da aula conta materiais concluídos em `ConteudosProgresso` e
  questionários com pelo menos uma tentativa finalizada do próprio aluno.
  Concluir exercício significa enviá-lo, não atingir uma nota mínima.
  Aulas vazias não são tratadas como concluídas.
- O progresso geral continua vindo da regra acadêmica existente, baseada nos
  conteúdos; questionários não alteram esse percentual. Nota, aprovação e
  certificados conservam suas regras anteriores.
- PROVA com aula aparece nessa aula. PROVA sem aula aparece em **Avaliação final**.
  Exercícios e conteúdos antigos sem aula continuam acessíveis em materiais
  complementares; não são vinculados automaticamente por inferência de título.
- A consulta de metadados agora aceita aluno matriculado, expõe somente avaliações
  ativas e sua própria conclusão, sem gabarito. A abertura aceita o parâmetro
  opcional `id_questionario`, sempre validado junto da turma e do tipo.

## Autoria e preservação

Professor responsável e ADMIN global usam a mesma organização por aulas. Cada
uma oferece edição, adição de conteúdo e questionário. A autoria de FECHADA
continua permitida; ENCERRADA continua somente leitura. A posição e o vínculo
podem mudar mesmo com tentativas, pois não alteram a avaliação respondida;
perguntas, título e demais campos acadêmicos continuam protegidos pelo histórico.

A replicação remapeia o vínculo das avaliações para os módulos novos e conserva
ordem, provas finais, perguntas, alternativas e referência dos arquivos privados.
Não copia alunos, progresso, respostas, tentativas, notas ou certificados.
A estratégia PDF_UPLOAD_READY (volume privado, autorização e retenção) permanece.

## Verificação

Testes de unidade cobrem agrupamento, ordem intercalada, conclusão, aulas vazias
e invariância dos filtros. Integração MySQL cobre vínculo, acesso por ID,
separação da prova final, tentativas preservadas ao reorganizar, 403 por ownership,
ENCERRADA, replicação e upload PDF. A suíte existente complementa as regressões.

O staging utiliza a VM existente, sem reprovisionamento. O deploy desta mudança
usa `SKIP_STAGING_DEMO_SEED=1`, pois o seed antigo regrava progresso e notas da
sua turma demonstrativa. `scripts/seed_learning_path_demo.js` cria uma turma
nova de três aulas, dois exercícios e prova final, sem modificar o histórico
existente. Reexecutá-lo conserva a demonstração já criada.

### Gates da versão final — 2026-09-06

| Gate | Evidência |
| --- | --- |
| `npm run lint` | Sem erros |
| `npm run test:all` | 53 suítes / 499 testes unitários e 12 suítes / 152 testes de integração; build aprovado |
| `npm run test:stability` | Duas execuções completas consecutivas aprovadas, 651 testes cada |
| `npm run build` | Artefatos de produção validados |
| `npm audit` | Zero vulnerabilidades |
| `npm audit --omit=dev` | Zero vulnerabilidades |
| `git diff --check` | Sem erros |

Logs locais preservados em `.deployments/learning-path-validation/`.
O teste integrado novo também verifica que reorganizar uma avaliação com
histórico preserva a tentativa e continua bloqueando alterações acadêmicas.

### Evidências por requisito

| Requisito do objetivo | Implementação / evidência |
| --- | --- |
| Aulas como eixo, reutilizar módulos, agrupamento e ordem (1–3, 12) | `learning-path.js`, `sala-aula.js`, teste `learning-path.frontend.test.js`; mesma ordenação na autoria |
| Exercícios e dois contextos de prova (4–5) | Vínculo opcional em `Questionarios`, consulta por ID e lista contextual; migration 007; integração de autoria |
| Accordion, leitura contextual e progresso real (6–8) | Botões e painéis vinculados; conclusão por registros existentes; validação real de teclado, foco e envio de exercício |
| Resumo compacto e filtros secundários (9–10) | `sala-aula.html` e `learning-path.css`; invariância dos contadores testada em unidade e navegador |
| Professor/ADMIN, FECHADA e ENCERRADA (11) | Gestão estrutural existente preservada; autoria contextual; validação de estrutura no staging |
| Replicação e PDF_UPLOAD_READY (13–14) | Remapeamento de aulas nas avaliações; integração PDF/replicação; upload e download privado reais e réplica sem alunos/tentativas |
| Responsividade e acessibilidade (15–16) | Capturas 1440/390 px e verificações de overflow, botão, Enter, `aria-expanded` e retorno de foco |
| Restrições e regressões (17–18) | Sem nova tabela Aula; sem alteração das regras de nota/progresso/aprovação; suítes existentes e novos cenários |
| Gates (19) | Tabela acima e logs persistidos |
| Staging e demonstração (20) | VM existente, turma 25, réplica 26; screenshots e relatórios autenticados |
| Relatório final (21) | Este documento e status comunicado ao usuário |

### Staging confirmado — 2026-09-06

**CLASSROOM_LEARNING_PATH_READY**

- [Demonstração, turma 25](https://plataforma-cursos-demo-dk-20260901.chilecentral.cloudapp.azure.com/sala-aula.html?id_turma=25): três aulas, dois exercícios e prova final.
- [Capturas e relatórios](../../screenshots/jornada-aulas-2026-09-05/README.md): ALUNO, PROFESSOR e ADMIN em 1440/390 px, sem overflow horizontal; leitura contextual, vídeo, PDF privado, atividade, exercício e prova final verificados.
- Réplica 26: estrutura e PDF preservados, sem alunos ou resultados; FECHADA aceita autoria e ENCERRADA recusa alterações dos dois papéis gestores.
- PDF enviado antes do último deploy continuou acessível após a recriação do container. `CERTIFICATE_STORAGE_OK certificados=1` confirmou o certificado existente.
- Migration 007 reaplicada sem alteração destrutiva: schema validado com as mesmas 19 tabelas. Seed idempotente confirmou a turma 25, sem regravar histórico.
- App, MySQL e Caddy saudáveis. Nenhum recurso Azure foi reprovisionado.
- Backup completo anterior ao deploy registrado em `.deployments/learning-path-validation/deploy-final.log`.
- SHA-256 do bundle implantado: `a9fdbcf0e4e2f61e0d1bdb20a229b46ba16dd5f5853253c5a51f470aaa117f5f`.
- Registro de implantação: `2026-09-06T12:17:43Z revision=bundle-without-git source_sha256=770b6c064edc3583cb016891cc97d8c635abb4c00df2d242d70295c4118d1e05`.
- Hashes dos arquivos centrais no container conferem com o worktree.

[Resumo dos gates](../../screenshots/jornada-aulas-2026-09-05/gates.json).
