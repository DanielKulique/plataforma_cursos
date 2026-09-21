# Goal 15 — Preparação da produção e turma inicial

Status em 21/09/2026: **PRODUCTION_RELEASE_PARTIAL**.

## Release

Branch de trabalho: `agent/checkpoint-goals-1-5-frontend-visual`.
Remote revisado: `https://github.com/DanielKulique/plataforma_cursos.git` (privado).
Este commit consolida o runtime, a documentação reorganizada, migrations, storage,
certificados, autenticação e testes já existentes na árvore, mais o bootstrap real.
O SHA final e a implantação são registrados em `.azure-production/evidence/`, fora
do Git, depois de confirmar HEAD local/remoto. Não há declaração de publicação pronta.

Arquivos novos inventariados e diff/histórico recente revisados; sem correspondências
dos padrões de chaves privadas, tokens GitHub, Resend ou SAS verificados. `.env`,
credenciais, storage, backups, fontes acadêmicas e áreas operacionais ficam ignorados.
Originais de design/fotos ficam locais; os assets usados pelo runtime estão em `src`.

## Validação desta preparação

Em 21/09/2026 passaram `npm run lint`, `npm test` (717 testes),
`npm run test:integration` (266 testes), `npm run build`, `npm audit`, `npm audit --omit=dev`
e `git diff --check`. Ambas as auditorias apontaram zero vulnerabilidades.
Integração usou exclusivamente MySQL 8.4 Docker em `127.0.0.1:33307`; as credenciais
foram obtidas do container local, sem impressão e sem reutilização em produção.

O primeiro CI remoto revelou dois testes de arquivos `.env` que herdavam variáveis
do runner. O isolamento dessas fixtures foi corrigido sem mudar a precedência de
configuração do runtime. O serviço MySQL do CI passou a publicar 33307, alinhado ao
ambiente local e ao bootstrap, mantendo 3306 somente dentro do container.

O teste de bootstrap demonstra: nove aulas, 23 conteúdos suportados quando os PDFs
estão presentes, 11 PDFs no pipeline privado, 11 questões confirmadas, avaliações
inativas, turma fechada, repetição sem duplicar arquivos/registros, recusa de conflito
e rollback quando falta professor real. Esses números são evidência de **teste**,
não dados existentes em produção. XLSX permanece pendente.

## Infraestrutura criada

- Grupo exclusivo: `plataforma-cursos-prod-rg`.
- VM: `plataforma-cursos-prod-cl`, `Standard_B2als_v2`, Chile Central.
- IP reservado: `57.156.58.112`; SSH limitado ao IP administrativo individual.
- Chave SSH própria; chave do host conferida pela API Azure.
- Conta offsite: `pcprodbackup20260921dk`, Brazil South, container privado
  `plataforma-backups`, acesso da VM por identidade gerenciada.
- Brazil South recusou os tamanhos de VM tentados. Os recursos de rede da tentativa
  sem VM foram removidos; o staging não foi transformado em produção.

## Bootstrap e pendências

O [manifesto](../../../production-content/manifest.json) prevê 9 aulas, 8 vídeos,
4 links, 11 PDFs, 2 planilhas, 1 exercício e 1 prova final. O
[inventário pedagógico](../../../production-content/README.md) detalha os gabaritos,
fontes, pontuações e incompatibilidades. O [runbook](../../operations/production-release.md)
documenta migrations em banco vazio, senha oculta, importação, smoke e backup.

Continuam necessários: domínio/DNS definitivo, configuração de e-mail de produção,
nome/CPF/telefone e senha privada do administrador, professor real, data inicial e
carga horária confirmada. Também faltam os 11 PDFs didáticos e duas planilhas locais,
decisão sobre XLSX privado, confirmação dos vídeos 1/2, revisão dos gabaritos propostos
e da questão 2 do Simulado, formulário final completo com pontuações/gabaritos.

Sem esses dados não se deve afirmar que ADMIN/curso/turma reais foram cadastrados,
que HTTPS/smoke passou ou que existe backup inicial após bootstrap. A aplicação e
as matrículas públicas permanecem indisponíveis. Não executar seeds demonstrativos.
