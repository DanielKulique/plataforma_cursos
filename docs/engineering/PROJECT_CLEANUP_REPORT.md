# Relatório de limpeza e documentação — Goal 14

Data: 19/09/2026. Escopo: repositório `plataforma_cursos`, sem alterar funcionalidades,
regras de negócio, API, schema, migrations, certificados, frontend, backend ou backup.
O estado inicial já continha muitas mudanças locais; elas não foram revertidas ou atribuídas
a esta entrega. Nenhum commit, deploy ou acesso a banco foi executado.

## Resultado

**PROJECT_DOCUMENTATION_READY** no escopo documental e de organização segura.
A documentação vigente é autossuficiente em [docs/index.md](../index.md), sem depender
de relatórios dos Goals para explicar o funcionamento básico.

- **110 arquivos removidos:** exclusivamente HTML, CSS, JavaScript e imagens auxiliares
  gerados em `coverage/lcov-report/` (relatório de cobertura renderizado).
- **54 arquivos movidos:** 50 Markdown históricos e quatro resultados de cobertura.
- **641 arquivos não Markdown preservados byte a byte** em comparação com a entrada,
  incluindo fontes, testes, configurações, migrations, assets e evidências anteriores.
- **Nenhuma alteração funcional realizada.** O único script novo valida documentação.

O [inventário completo](evidence/goal14-cleanup-inventory.json) registra origem/destino,
hashes anteriores/posteriores, cada remoção e os arquivos preservados. As exclusões de
`src/public/js/professor-turma.js` e `src/public/js/sala-aula.js` já existiam antes deste Goal.

## Classificação e ação

| Categoria | Itens | Tratamento |
| --- | --- | --- |
| Essencial | `src/`, `index.js`, `mysql/`, `scripts/`, `deploy/`, Compose/Caddy/Docker, configs e testes | Preservados; documentação corrente criada por assunto |
| Histórico/evidência | Relatórios GOAL, análises, guias antigos, baseline de engenharia, capturas e resultados | Goals em `goals/`, demais guias em `history/`, evidências indexadas |
| Temporário/gerado | Relatório HTML de coverage | Removido após auditoria de referências; quatro saídas originais preservadas em `evidence/coverage-before-goal14/` |
| Gerado necessário ao ambiente local | `node_modules/`, arquivos privados e diretórios operacionais ignorados | Mantidos; não eram alvo seguro de descarte |
| Duplicado/obsoleto | Manuais antigos que se sobrepunham ao README e guias atuais | Arquivados, não apagados |
| Uso incerto | Prototipação HTML, scripts antigos, imagens originais e ferramentas locais | Mantidos por segurança |

Antes de remover, foram procuradas referências no código, testes, scripts, Docker/Compose/Caddy,
CI, deploy e documentação. Jest gera `coverage/`; Git, ESLint e Docker já o excluem.
Nenhum consumidor dos arquivos renderizados foi encontrado. O bundle de staging inclui
`docs/` recursivamente e não depende dos nomes anteriores dos Markdown.

## Estrutura vigente

```text
docs/
  index.md
  getting-started/   instalação, rotina local, variáveis
  product/           visão, perfis, regras, certificados
  architecture/      visão, backend, frontend, banco/storage
  api/               endpoints e autenticação
  database/          entidades e migrations
  security/          controles e limites
  testing/           ambiente e comandos de validação
  operations/        deploy, backup/restore, monitoramento, troubleshooting
  adr/               três decisões consolidadas
  engineering/
    goals/           entregas históricas
    history/         guias e análises anteriores
    evidence/        evidências e inventário desta limpeza
  screenshots/       capturas preservadas nos caminhos consumidos pelos scripts
```

README reescrito como porta de entrada. Criados 21 guias permanentes por assunto,
índice geral, índice de ADRs e três ADRs, além de índices de Goals/histórico/evidências,
relatório, inventário e validador documental. A referência da API lista 86 operações
(84 nos routers e healthz/readyz), confrontadas com o código.

A baseline numerada de engenharia foi marcada como histórica e permanece no lugar para
preservar IDs e estrutura do verificador antigo. Os README anteriores foram copiados para
histórico. Links dos documentos movidos foram recalculados; referências textuais de paths
foram atualizadas quando apontavam para esses arquivos. A senha fixa do antigo documento
de mocks foi substituída por placeholder, sem estabelecer credencial nova.

## `.gitignore`

Mantidas as exclusões existentes de coverage, logs, dependências, storage, backups,
secrets e áreas operacionais. Acrescentada somente a exceção
`!/docs/engineering/history/*.md`: regras antigas por basename também ignoravam os Markdown
movidos, impedindo que o histórico acompanhasse a documentação em um clone.
Não foram ignorados arquivos necessários à execução, deploy ou testes.

## Histórico preservado e candidatos mantidos

Preservados todos os relatórios de integridade acadêmica, matrícula/ciclos, certificados,
autorização, storage, backup/restore, migrations, staging, segurança e testes. JSONs históricos,
manifesto de fontes, screenshots e PDFs de amostra não foram reescritos para aparentar validação
recente. Resultados de cobertura JSON/LCOV/XML foram movidos byte a byte.

Mantidos por dúvida ou valor histórico: `audit-autoria.js`, `audit-report.html`, `color-report.html`,
`layout.html`, scripts antigos de seed/auditoria, `fotos_equipe_plagio/`, `.stitch/`, `.impeccable/`,
`.azure-staging/` e `.deployments/`. Não foi comprovado que seus originais/configurações/logs
podem ser descartados. As pastas irmãs da workspace, caches e registros de Goals fora deste
repositório ficaram fora do escopo. PDFs em fixtures/assets/storage não são lixo.

## Validação

- Estado Git inicial registrado; estado final, arquivos removidos/movidos e alterações conferidos.
- Comparação SHA-256 dos 641 arquivos não Markdown preservados; zero alteração de runtime.
- Validador documental: 101 documentos, 504 links locais/âncoras e 86 endpoints; zero erros.
- Auditoria de referências dos paths movidos em código, scripts, infraestrutura e documentação.
- `git diff --check` e verificação de whitespace dos documentos correntes.
- Markdownlint não está instalado no PATH nem nas dependências locais; não houve instalação.
- Sem suítes pesadas, lint da aplicação, build ou integração: não houve mudança que afetasse execução.

Contagens e resultado do validador ficam em [evidência desta entrega](evidence/goal14-documentation-validation.json).
O validador histórico `validate_docs.py`/manifesto anterior foi preservado, não usado como gate
para a árvore atual. A validação nova não importa o app, executa SQL ou altera serviços.

## Limitações restantes

Esta entrega valida documentação e preservação da árvore, não uma nova homologação de runtime
ou de staging. As mudanças funcionais pré-existentes continuam com seu próprio histórico de testes.
O workflow existente tem uma exceção explícita de MySQL efêmero na CI; os guias locais usam
exclusivamente Docker em `127.0.0.1:33307`. Nenhum MySQL nativo ou detector foi iniciado.

Logs operacionais ignorados não acompanham clones; foram preservados localmente. Não houve
reescrita de histórico Git ou comprovação de rotação de secrets antigos. O instalador de backup
existente assume `azureuser` e `/opt/plataforma-cursos`; o guia explicita esses pré-requisitos
e o campo obrigatório `BACKUP_DRILL_DIR` ausente do exemplo antigo. Nenhum script operacional
foi alterado para corrigir essas limitações.
