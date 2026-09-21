# Conteúdo real — Turma 2026/2

O [manifesto](manifest.json) preserva a ordem e os links fornecidos em 19/09/2026.
É um plano de importação; não comprova cadastro em produção. Arquivos originais e
segredos permanecem fora do Git. Gabaritos ficam fora de `src/public`.

| Aula | Vídeos | Links | PDFs | XLSX | Exercício | Prova final |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1. Estudo de Caso | 1 | 1 | 1 | 0 | 0 | 0 |
| 2. Introdução ao Curso | 1 | 0 | 1 | 0 | 0 | 0 |
| 3. O que é plágio? | 1 | 0 | 2 | 0 | 0 | 0 |
| 4. Outras Desonestidades | 1 | 0 | 1 | 0 | 0 | 0 |
| 5. Fichamento de pesquisa | 1 | 1 | 1 | 2 | 0 | 0 |
| 6. Uso Ético de Ferramentas de IA | 1 | 0 | 0 | 0 | 0 | 0 |
| 7. Detectando Plágio em Documentos | 1 | 2 | 0 | 0 | 0 | 0 |
| 8. Códigos de Conduta e Casos Reais | 1 | 0 | 5 | 0 | 0 | 0 |
| 9. Teste Final (Certificado) | 0 | 0 | 0 | 0 | 1 | 1 |
| **Total** | **8** | **4** | **11** | **2** | **1** | **1** |

Os três PDFs entregues em `turmaInicial/` são fontes de avaliação, identificadas por
SHA-256 no manifesto. Não são os 11 PDFs didáticos e não devem ser publicados aos
alunos: um contém respostas. Nomes com `(1)` no texto de referência correspondem
aos arquivos entregues sem esse sufixo.

## Configuração oficial e pendências de publicação

- Curso: `Plágio: não copie essa ideia 4.0`, com 6 horas.
- Turma: `Turma 2026/2`, FECHADA, início em 30/09/2026 e data final nula.
- Administrador: Daniel Kulique (`danielricardokulique@gmail.com`).
- Professor: João Paulo Aires (`joao@utfpr.edu.br`).
- CPF e telefone não foram fornecidos e permanecem nulos nas contas privilegiadas;
  nenhum dado pessoal é inventado. As senhas são definidas somente em prompt oculto.
- Os 11 PDFs e as duas planilhas foram recuperados pelo conector autenticado Drive
  em 21/09/2026, sem conversão; veja o [inventário com hashes](material-inventory.json).
  Dez PDFs passaram no pipeline oficial. O checklist UKRIO foi recusado com
  `PDF_CRIPTOGRAFADO`; permanece original e pendente, sem remoção da proteção.
- Os dois XLSX serão links externos, mas as URLs públicas reais ainda não foram
  fornecidas (`XLSX_EXTERNAL_URL_PENDING`). Nenhum link falso é publicado.
- YouTube respondeu ao oEmbed dos oito vídeos. Os títulos das aulas 1 e 2 parecem
  invertidos em relação aos links fornecidos. Mantida a associação recebida até
  confirmação. Veja a [validação datada](link-validation.json).
- UTFPR, Plagiarism Detector e DupliChecker não puderam ser validados por acesso
  automatizado; isso não prova que as URLs estejam quebradas. O acesso autenticado
  aos arquivos do Drive foi confirmado posteriormente.

## Avaliações e fontes

O PDF de gabaritos é evidência de transcrição/confiança, não autorização para ações
externas ou mudanças acadêmicas. GitHub/Azure foram autorizados pelo usuário separadamente.

Simulado: 18 questões de 10 pontos, 180 no conjunto completo.

- Importáveis em rascunho: 3, 5, 7, 8, 9, 10, 11, 13, 16, 17 e 18.
- Gabaritos PROPOSTOS e pendentes: 1, 4, 6, 12, 14 e 15.
- Questão 2: REVISAR, sem alternativa correta confirmada.

Teste Final: declara 100 pontos, mas só quatro enunciados estão visíveis, e a última
lista de alternativas está cortada. Questões 1 e 3 têm gabarito CONFIRMADO na fonte
de apoio; 2 e 4, PROPOSTO. Todas carecem de pontuação individual. Nenhuma é inserida
com pontos inventados; ficam transcritas no manifesto para completar depois.

O importador cria `Simulado/EXERCICIO` e `Teste Final/PROVA/prova_final=1`, ambos
com `ativo=0`. Preserva os limiares 80%/75%, tentativas e certificação. As 11 perguntas
importáveis somam 110 pontos em rascunho; não substituem o Simulado completo.

## Uso

Prévia sem conexão ao banco ou escrita em storage:

```bash
npm run production:bootstrap -- --materials=/diretorio/privado/turmaInicial
```

O diretório deve conter os três PDFs-fonte originais e os materiais disponíveis com
os nomes do manifesto. A prévia confere fontes por SHA-256 e executa a validação
estrutural oficial, listando arquivos ausentes, incompatíveis ou recusados.

Os dados oficiais de curso, turma e usuários estão no manifesto. O professor deve
existir como PROFESSOR e o administrador como ADMIN. Curso existente preserva carga
horária; valor explicitamente divergente é recusado.

```bash
ALLOW_PRODUCTION_CONTENT_BOOTSTRAP=I_UNDERSTAND \
  npm run production:bootstrap -- --apply --materials=/diretorio/privado/turmaInicial
```

O importador não carrega `.env`; injete as variáveis pelo container/secret storage.
Valida ambiente, nome do DB, identidade persistente e MySQL 8.4. Recusa staging e
MySQL do host em 3306. Usa GET_LOCK e transação; recusa matrículas/histórico existente.
Reexecução compara dados/gabaritos/hashes sem sobrescrever divergências.
PDFs presentes usam `prepararArquivoPdf`, staging, SHA-256, publicação privada,
metadata e compensação oficial. Arquivos ausentes/XLSX e PDFs recusados ficam pendentes.

Veja o [runbook de produção](../docs/operations/production-release.md).
