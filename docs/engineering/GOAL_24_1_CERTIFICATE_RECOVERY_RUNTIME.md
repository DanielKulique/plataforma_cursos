# Goal 24.1 — Certificate recovery runtime

STATUS: CERTIFICATE_RECOVERY_RUNTIME_READY

Data: 06/11/2026, America/Sao_Paulo. Escopo exclusivo: F18-08/T18-08.
Branch: `test/goal24-1-certificate-runtime`, criada limpa da main remota
`c78e61076942a37053edbfb4e45760163fed8219`.

## Diagnóstico e alteração mínima

O achado descreve uma imagem sem o script chamado por
`academic:reconcile-certificates`. Na main atual essa omissão **já está
corrigida**: o commit `aacb054` acrescentou
`scripts/reconcile_academic_certificates.js` à lista explícita de COPY do
Dockerfile. `PROJECT_REVIEW_AND_NEXT_STEPS.md`, entrada F18-08, também registra
essa inclusão e deixa pendente sua confirmação no artefato e em runtime.

Uma imagem nova, construída do Dockerfile da baseline, confirmou:

| Verificação | Resultado |
| --- | --- |
| Comando no package.json | `node scripts/reconcile_academic_certificates.js` |
| Script presente na imagem | PASS |
| SHA-256 do script, idêntico ao fonte | `592d7508d97b5d1d5a896e0e1fccc02b170514c95dbc4af454be7b84c098f95b` |
| Usuário padrão | node, UID 1000 |
| Dependências de produção | Presentes; sem Jest |
| Revisão OCI da imagem | `c78e61076942a37053edbfb4e45760163fed8219` |
| ID da imagem validada | `sha256:2cf2ea0794d70bf84004c7deb026fdde4ff53a792a4b00ba5e297c77c9dfaa2f` |

Não foi necessária nova alteração de empacotamento. Esta entrega acrescenta
somente um teste de runtime reproduzível e este relatório. Dockerfile,
package.json, lockfile, reconciliador, serviços, migrations, regras de aprovação
e certificados permanecem inalterados. A imagem foi construída antes da inclusão
dos testes; os testes são montados separadamente e não substituem código da imagem.

## Teste na imagem real

```sh
docker build --build-arg APP_RELEASE_SHA=c78e61076942a37053edbfb4e45760163fed8219 \
  --tag plataforma-cursos-goal24-1:baseline .
python3 tests/operations/test_certificate_recovery_runtime.py \
  --image plataforma-cursos-goal24-1:baseline --allow-lab-apply
```

O teste fixa o ID da imagem inspecionada, cria uma rede Docker interna exclusiva
e MySQL 8.4 novo, sem portas publicadas ou acesso a bancos externos. Executa as
migrations existentes apenas nessa fixture vazia. O arquivo JS de teste é
montado read-only em `/app`; toda a aplicação, suas dependências e seus assets
de PDF são os da imagem de produção, sem instalação adicional dentro dela.

A imagem é usada com `NODE_ENV=test` e identidade canônica
`plataforma_cursos_test`, preservando as validações reais de identidade do banco.
Não se simulou uma confirmação de backup de produção com `--backup-good`.
A autorização para APPLY é a tarefa 6 do Goal 24.1, limitada aos dados sintéticos
do laboratório, e é expressa também pela flag obrigatória `--allow-lab-apply`.
Sem essa flag, o runner encerra com código 2 antes de criar recursos Docker.

Os dados sintéticos incluem cinco alunos: aprovação pendente com prova final
75%, aprovado sem certificado, dois com certificados existentes (ativo e
revogado) e estado de aprovação legado inconsistente, e um com prova 74,99%.
Os certificados existentes são PDFs reais gerados pelo serviço da imagem antes
da reconciliação. Não houve mocks da aplicação nem acesso a dados reais.

O teste chama o **comando npm real em processos separados**, sem importar o
reconciliador para substituir sua interface operacional. Compara todas as linhas
das 25 tabelas e os hashes dos arquivos privados antes/depois de cada dry-run e
do segundo APPLY. Na primeira aplicação verifica cada certificado, o estado das
matrículas e a preservação das demais tabelas.

| Etapa | Evidência |
| --- | --- |
| Dry-run explícito | 4 candidatos; 3 aprovações pendentes; 2 certificados previstos; zero alterações em tabelas e arquivos |
| Invocação sem argumentos | Mesmo relatório DRY_RUN; zero alterações em tabelas e arquivos |
| Primeiro APPLY de laboratório | 3 aprovações corrigidas; 2 certificados novos; zero emissões pendentes |
| Certificados existentes | 2 registros completos e hashes de PDFs preservados, incluindo o revogado |
| PDFs ao final | 4 válidos, duas páginas cada; tamanho e SHA-256 conferem com o banco |
| Prova de 74,99% | Continua CURSANDO, sem certificado |
| Progresso e histórico | Nenhum conteúdo concluído artificialmente; progresso, tentativas e demais tabelas preservados |
| Segundo APPLY | Zero candidatos/correções/emissões; todas as tabelas e arquivos idênticos ao estado após o primeiro APPLY |
| Limpeza | Containers, dados e rede exclusivos do laboratório removidos |

As provas sintéticas finalizadas são inseridas diretamente para representar
histórico legado. Isso não altera nem testa novamente o fluxo completo de
submissão: a recuperação usa as regras acadêmicas definitivas já existentes.

## Verificações e evidências

`npm run lint`: PASS. `npm run build`: PASS (isolamento estático do banco e
assets de produção). Build Docker: PASS. Teste de runtime direcionado: PASS.
Verificação da flag obrigatória: PASS. Sintaxe Python/JavaScript e
`git diff --check`: PASS. Nenhuma CI completa foi iniciada.

Evidências locais preservadas em
`/mnt/disco/projetoSite/.tmp/goal24-1-certificate-runtime/`: logs do build Docker,
inspeção da imagem e do script, log integral do teste, lint/build, instalação
pelo lockfile, recusa sem autorização de laboratório, snapshots de worktrees e
verificação final com SHA do commit de entrega. O teste usou o projeto
`certificate-recovery-lab-d66b406ba190b319` e encerrou com código 0.

## Preservação e riscos restantes

A main remota continua em `c78e61076942a37053edbfb4e45760163fed8219`; a tag
`goal22-rc.1` conserva o objeto anotado
`5b8ca5a3888b5373d23eb794697269434668035b` e aponta para a mesma baseline.
Os worktrees preexistentes e os arquivos pendentes foram preservados. O commit
de entrega está somente na branch local deste Goal, sem push ou alteração da RC.

A imagem em execução em produção não foi acessada ou substituída. A conclusão
comprova o artefato construído da baseline, não a distribuição operacional de uma
imagem antiga. Uma futura operação real continua exigindo seus backups GOOD,
autorização e preflight próprios; nenhum backfill ou APPLY de produção foi
executado aqui. O teste não cobre falha de disco, concorrência de operadores ou
recuperação após interrupção de processo, que não integram este achado de
empacotamento.

A falha intermitente de Firefox na CI da main
[42225134622](https://github.com/DanielKulique/plataforma_cursos/actions/runs/42225134622)
permanece pendência conhecida, conforme diagnóstico do Goal 23.1. Não foi
investigada, corrigida ou reexecutada neste Goal e impede declarar a CI global
estável. Ela não é um bloqueador do teste isolado de recuperação de certificados.

DEPLOY: NO. Dependências atualizadas: NO. Migrations alteradas: NO.
