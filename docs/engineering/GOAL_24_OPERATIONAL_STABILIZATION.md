# Goal 24 — Final operational stabilization

Data: 06/11/2026, America/Sao_Paulo.
Branch: `release/goal24-operational-stabilization`.
Baseline: `c78e61076942a37053edbfb4e45760163fed8219`.

## Consolidação e critério de conclusão

Os gates locais abaixo foram executados na árvore consolidada. Este relatório é
selado antes do único push e, portanto, **não antecipa aprovação da CI final**.
`OPERATIONAL_STABILIZATION_READY` exige conclusão verde do workflow completo no
SHA exato que contém este arquivo; qualquer falha resulta em `PARTIAL`, sem
novo ciclo de mudanças/reruns. O resultado final, URL da execução e SHA são
registrados na entrega e em `final-verification.json` nas evidências locais.
Não haverá commit documental posterior que substitua silenciosamente o SHA testado.

Foi verificado que os dois commits solicitados têm a main como pai direto;
`git merge-tree` não encontrou conflitos. A integração preserva os commits
originais como ancestrais, sem reimplementar as funcionalidades:

| Trabalho | Commit incorporado | Resultado local consolidado |
| --- | --- | --- |
| Goal 24.1, F18-08/T18-08 | `1ccabb9f5ee33abc2d2356b66516e67497e76983` | Reconciliador real na imagem, dry-run sem escrita, APPLY sintético idempotente |
| Goal 24.2, F18-05/T18-05 | `ab7e8898b0029a81a6e8a999dfec4b4d5a731af5` | Busca/paginação ADMIN e professores além da página inicial |
| Goal 24.3, F18-06/T18-06 | Alterações de smokes/documentação neste Goal | Expectativas alinhadas à aplicação existente e bloqueio obrigatório de produção |

O primeiro commit entrou por fast-forward; o segundo por merge sem conflitos.
O merge de consolidação é `9a8cae22a58667cd5374ea3cccace749522511a9`.
Main, RC e branches/worktrees dos Goals anteriores não foram movidos.

## Smokes atuais, aplicação preservada

As inconsistências estavam nas expectativas dos scripts: exercícios contados no
gate, nova prova depois de uma tentativa finalizada, aprovação condicionada a
100% dos conteúdos, nota/aprovação manual e cadastro sempre pendente. Foram
corrigidas somente essas expectativas e suas fixtures:

- Sete de dez conteúdos bloqueiam o Teste Final; oito de dez liberam. Exercícios
  e Simulado são opcionais e não contam no denominador ou numerador.
- 74,99% não aprova e consome a tentativa finalizada; um novo submission ID é
  recusado. Outro aluno da fixture comprova aprovação com exatamente 75%.
- Prova aprovada com 80% dos conteúdos emite certificado automaticamente; nota
  manual permanece nula. Alterar a estrutura depois não substitui o certificado.
- Rematrícula reinicia conteúdos/exercícios e conserva tentativa final,
  aprovação e certificado revogado. O cenário revoga seu certificado sintético
  com ADMIN antes de cancelar: a aplicação recusa corretamente cancelar com
  certificado ativo. Não se enfraqueceu essa proteção para o smoke passar.
- O smoke de versionamento reutiliza a emissão automática antes da reemissão.
  Os scripts gerais deixam de tentar aprovar por PATCH ou escolher respostas
  arbitrárias da prova; opções corretas são obtidas somente nas fixtures do lab.
- Cadastro respeita as flags atuais: sem exigir verificação, cria VERIFICADO e
  permite login imediato; verificação exigida com entrega desabilitada retorna
  503 sem criar usuário/código; entrega habilitada sem provedor real mantém
  PENDENTE, com confirmação concorrente consistente e rate limits reais.

Não foram alterados serviços/regras acadêmicas, migrations, banco real,
certificados reais ou frontend para acomodar os scripts antigos. O frontend
desta branch é exatamente o já integrado do Goal 24.2.

## Isolamento obrigatório dos smokes

Os dez entrypoints `scripts/smoke*staging.js` executam o guard
`scripts/lib/disposable-smoke.js` **antes** de importar banco ou browser.
O nome histórico staging não concede mais autorização para alterar staging
persistente. Exigem NODE_ENV e APP_ENV test, banco/identidade canônicos de teste,
DB_HOST db e porta interna 3306, E2E_RUN, nome exclusivo de laboratório e autorização
explícita. URLs externas e chave real de provedor de e-mail são recusadas.
O acesso de banco ainda passa pela validação persistente de identidade existente.

```sh
python3 -u tests/operations/run_academic_smokes.py --allow-lab-writes
```

O runner cria projeto Compose, rede interna, MySQL 8.4, app e dados sintéticos.
O readiness é confirmado pelo healthcheck do próprio container, sem depender
do encaminhamento de portas da rede interna. Cada combinação de flags recria
somente o app desse projeto; nenhuma credencial de produção é carregada.
Os scripts recebem credenciais sintéticas por stdin. A chave de provedor fica
vazia, mesmo no caso EMAIL_DELIVERY_ENABLED=true; não se envia e-mail externo.
Falhas preservam logs app/db antes do cleanup; sucesso ou erro removem o projeto
e seus volumes. Não existe fallback para MySQL nativo.

Os smokes especializados de browser/storage mantêm suas fixtures próprias;
o guard foi testado em todos eles. Não se alega executar seus fluxos gerais
inteiros neste recorte: os cenários acadêmicos, de matrícula/versionamento e
identidade foram executados pelos scripts reais descritos abaixo.

## Verificações locais

| Gate | Evidência |
| --- | --- |
| Unitários direcionados | 8 suítes, 107 testes aprovados: guards, filtros, controllers, ADMIN, interface/segurança |
| Harness E2E/CI alterado ou integrado | Suítes direcionadas dos runners executadas; resultado JSON preservado |
| Integração acadêmica relevante | 3 suítes, 58 testes aprovados: academic-exam, enrollment-lifecycle, certificados |
| Smokes acadêmicos reais | 7 invocações aprovadas: conclusão, rematrícula, versionamento e identidade nas quatro combinações de flags |
| Paginação ADMIN | 4 testes Chromium aprovados, zero retries/skips/flaky; 125 usuários, 125 turmas, 121 professores; mobile/desktop |
| Reconciliador Docker | Dry-run explícito/padrão sem mudanças em 25 tabelas e PDFs; primeiro APPLY corrige 3 aprovações/gera 2 certificados; segundo altera zero; 2 certificados existentes preservados |
| Lint e build | PASS; isolamento estático e assets de produção |
| Documentação e diff | Validador atual e `git diff --check`; resultados preservados antes do push |

Os testes de integração usaram MySQL Docker descartável em 127.0.0.1:33307,
credenciais sintéticas e storage deste worktree. Smokes e E2E usaram projetos
próprios; o reconciliador usou outra rede/instância descartável. O APPLY tem a
autorização explícita de laboratório do Goal 24.1 e sua flag obrigatória.
Não houve APPLY/backfill, migration operacional ou payload contra produção.

Uma primeira checagem de readiness tentou acessar a porta do host de uma rede
Docker interna; os logs mostraram readyz 200 dentro do container. O runner foi
corrigido para inspecionar esse healthcheck. O cenário de rematrícula também
foi corrigido após a recusa legítima com certificado ativo. Nenhuma dessas
correções alterou a aplicação ou aumentou retries/timeouts.
O rótulo provisório de revisão de uma imagem local foi preenchido incorretamente;
a imagem de entrega é reconstruída com o SHA consolidado, e a CI usa GITHUB_SHA.

## Documentação e CI final única

Foram atualizados apenas os guias operacionais inconsistentes: migrations
001–016, procedimentos de teste/smokes, escopo completo dos browsers na CI e
acompanhamento dos achados F18-05/06/08. Os documentos dos Goals 24.1/24.2
foram integrados como evidências históricas, sem reescrever seus resultados.

O workflow mantém os gates completos anteriores e acrescenta documentação,
smokes descartáveis e reconciliador na imagem construída com o SHA do job.
Os logs desses gates entram no artefato existente `playwright-e2e-<SHA>`, junto
com JSONs, traces e screenshots. A branch é publicada uma vez depois dos gates
locais; o push dispara uma única CI completa. Falha dessa execução encerra a
rodada, sem novo push, rerun, aumento de timeout ou retry. O resultado deve ser
conferido no [GitHub Actions](https://github.com/DanielKulique/plataforma_cursos/actions)
pelo SHA final informado na entrega.

Evidências locais: `/mnt/disco/projetoSite/.tmp/goal24-operational-stabilization/`.
Incluem preflight de merge, snapshots/hashes de preservação, logs dos smokes e
cleanup, JSONs de integração/unitários/harness, paginação ADMIN com screenshots,
reconciliador, build Docker, lint/build, validação documental, CI remota e
`final-verification.json`. Dados/cookies sintéticos dos artefatos brutos não
integram este commit.

## Pendências e limites

Os únicos P0/P1 originais do Goal 18 são F18-01 a F18-04, com remediações já
ancestrais da baseline. Este Goal preserva essas correções; F18-03 conserva o
gate final de CI. Não há novo P0/P1 identificado neste escopo. Uma CI final
vermelha impede declarar a estabilização pronta, independentemente dos gates
locais e das provas históricas.

A intermitência histórica Firefox da main, execução `42225134622`, não tem
causa interna comprovada e permanece limitação conhecida; não foi investigada
ou mascarada aqui. A CI final executa todos os browsers, sem retry. Uma eventual
execução verde não prova a eliminação definitiva dessa intermitência. Os demais
P2 do acompanhamento do Goal 18 continuam fora deste escopo, incluindo transporte
offsite, alertas externos e homologação pedagógica.

`goal22-rc.1` conserva o objeto anotado
`5b8ca5a3888b5373d23eb794697269434668035b`, apontando para a baseline. Nenhuma
tag foi criada/recriada. Não houve acesso à VM, Azure/VPS, produção, deploy,
alteração de backups, atualização de dependências ou nova migration.

DEPLOY: NO.
