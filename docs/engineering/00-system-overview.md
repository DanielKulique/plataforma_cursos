> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../index.md).

# Visão geral do sistema existente

Baseline de 2026-09-06 e 2026-09-07. Escopo: árvore de trabalho de `plataforma_cursos`, incluindo arquivos modificados e não versionados. O commit-base, sozinho, não reproduz este sistema. Método e limitações: [README](README.md).

## Finalidade e público

A plataforma, apresentada na interface como **Plágio**, reúne formação por cursos e turmas, materiais educacionais, avaliações objetivas e certificados de conclusão. Também oferece uma interface experimental de análise de textos, dependente de um motor externo e de uma feature flag. Serve a alunos, professores responsáveis por turmas e administradores. O problema operacional resolvido é organizar oferta, participação, materiais, acompanhamento e comprovação da formação em um único sistema web.

Não há comércio, pagamento, videoconferência própria ou motor de IA dentro desta aplicação. `motor_ia`, presente como diretório irmão no workspace, é uma fronteira externa: foram auditados seus contratos de integração na plataforma, não sua implementação interna.

## Organização do repositório

```text
plataforma_cursos/
├── index.js                     # composição Express, middleware, estáticos e inicialização
├── src/
│   ├── api/
│   │   ├── routes/               # endpoints e validações de entrada
│   │   ├── controllers/          # HTTP e parte das autorizações/orquestração
│   │   ├── models/               # SQL, transações e muitas regras de domínio
│   │   └── services/             # arquivos, certificados, replicação e gateways de IA
│   ├── config/                   # pool MySQL, ambiente, sessão e diretórios privados
│   ├── middlewares/              # autenticação, papéis, ownership, limites e validação
│   ├── services/                 # serviço de e-mail, separado dos services da API
│   ├── utils/                    # logger com redação de dados sensíveis
│   ├── public/                   # HTML servido pelo Express
│   │   ├── js/                   # módulos ES, cliente HTTP e lógica de cada página
│   │   ├── css/                  # tokens, base, componentes, layouts e responsividade
│   │   └── assets/               # imagens e PDFs legados com bloqueio de acesso estático
│   ├── assets/certificates/      # imagens incorporadas nos PDFs emitidos
│   └── __tests__/                # Jest; integration/ usa MySQL descartável
├── mysql/
│   ├── schema.sql                # DDL canônico, 19 tabelas
│   ├── migrations/               # sete migrations incrementais reaplicáveis
│   └── site_cursos_db.mwb        # artefato de modelagem; não é fonte canônica do runtime
├── storage/                      # destino padrão dos arquivos privados, quando criado
│   ├── materials/                # uploads de materiais
│   └── certificates/             # PDFs finais emitidos
├── scripts/                      # setup, seeds, verificações, backup, deploy e capturas
├── docs/                         # histórico funcional, operacional e evidências visuais
│   ├── screenshots/              # capturas datadas; não provam estado atual do servidor
│   └── engineering/              # este levantamento
├── .github/workflows/ci.yml       # validações, integração e imagem Docker
├── Dockerfile                    # imagem Node em dois estágios
├── compose.yaml                  # db, app, caddy e cinco volumes
├── compose.staging.yaml          # ajustes de demonstração e proxy
├── Caddyfile / Caddyfile.staging  # TLS, proxy e proteção adicional no staging
├── .env.*.example                # contratos de configuração, sem valores neste baseline
└── package.json                  # dependências e gates
```

`coverage/` e `node_modules/` são artefatos locais. `.azure-staging`, `.deployments`, `.stitch` e `.impeccable`, quando presentes, são auxiliares operacionais/design; não são containers nem módulos de negócio. `fotos_equipe_plagio/` contém originais de imagens, enquanto a interface usa assets de `src/public`. Scripts históricos de seed e documentos de Goals coexistem com os fluxos canônicos; sua presença não significa execução automática.

## Atores e stakeholders

Há **cinco atores humanos**: quatro categorias de acesso HTTP e um operador. Apenas três são valores de `Usuarios.tipo`. Instituição ofertante, responsáveis acadêmicos e mantenedores são stakeholders, sem um papel adicional próprio no banco.

| Ator | Objetivo e dados acessíveis | Permissões e limites confirmados |
| --- | --- | --- |
| Visitante/anônimo | Conhecer a oferta, cadastrar-se, recuperar acesso, validar certificado | Catálogo e metadados de turmas são públicos. Validação retorna nome do aluno e dados acadêmicos por código/hash. Não acessa materiais privados nem administração. Staging acrescenta Basic Auth na borda. |
| Aluno | Aprender e consultar a própria participação | Autoinscrição em turma ABERTA; acesso com matrícula não cancelada e turma não ENCERRADA; progresso próprio, submissões, histórico e próprios certificados. Não edita estrutura, não lança nota, não emite certificado. |
| Professor | Produzir materiais e acompanhar suas turmas | Gestão estrutural da turma atribuída, alunos dessa turma, resultados, nota/situação e emissão de certificados. Não faz CRUD global de cursos/turmas/usuários, não replica turmas nem revoga certificados. |
| Administrador | Gerir cadastro, oferta e situações acadêmicas | CRUD global e gestão de qualquer turma, replicação, emissão e revogação. Continua sujeito a integridade, bloqueios de histórico e turma encerrada. Rotas específicas de aluno e `/turmas/professor/:id` não aceitam ADMIN apenas por ser ADMIN. |
| Operador de infraestrutura | Executar, diagnosticar e recuperar o serviço | Atua por shell, Docker, banco e ferramentas Azure conforme credenciais externas. Não há `OPERADOR` no enum nem endpoint de backup. Poderes no host não são concedidos por `checkRole`. |

Evidências: `src/api/routes/*.js`, `checkAuth.middleware.js`, `checkUserPermission.middleware.js`, `checkProfessorPermission.middleware.js`, `academic-access.service.js`, `certificate.service.js`. A [matriz completa](05-api-and-authorization.md) detalha exceções por endpoint.

## Jornadas e execução

1. Visitante consulta `index.html`/catálogo, cadastra-se e a interface solicita código por e-mail; login direciona cada papel à sua área. A API permite criar a conta sem gerar essa verificação: ver RN-002 e riscos.
2. Aluno inscreve-se, abre `sala-virtual.html`, acessa `sala-aula.html`, percorre aulas e materiais e registra conclusão. Questionários abrem uma página específica e devolvem resultado calculado no servidor.
3. Professor abre suas turmas, organiza aulas (`Modulos`), publica conteúdos e avaliações, acompanha alunos e lança nota/situação. A emissão de certificado é uma ação separada da aprovação.
4. Administrador gerencia usuários/cursos/turmas e acessa a gestão acadêmica global. Pode replicar uma estrutura e revogar um certificado.
5. Operador instala dependências e inicia `node index.js` localmente; a entrega de staging usa bundle, Compose, migrations e verificações. Detalhes em [deploy](07-deployment-infrastructure.md).

Não existe vínculo obrigatório de pré-requisito entre aulas. A navegação sugere continuação, mas a API não exige concluir uma aula para acessar a próxima ou fazer uma prova.

## Inventário de features e estado

Estado significa implementação observada, não homologação comercial. READY equivale a IMPLEMENTADO no escopo descrito; PARTIAL a PARCIALMENTE IMPLEMENTADO. Flags e serviços externos afetam disponibilidade.

| Feature | Estado | Evidência e delimitação |
| --- | --- | --- |
| Cadastro público de aluno | IMPLEMENTADO / READY | `usuarios.routes/controller/models`; CPF/e-mail únicos; CPF não tem validação de dígitos verificadores no backend. |
| Login, sessão, logout global | IMPLEMENTADO / READY | `auth.*`, `session.js`, `checkAuth`; cookie e versão de sessão. |
| Confirmação de e-mail | PARCIALMENTE IMPLEMENTADO / PARTIAL | Envio e validação existem, mas geração separada do cadastro e ausência de registro permite login. |
| Recuperação e troca de senha | IMPLEMENTADO, entrega CONDICIONADA | Tokens e revogação existem; recebimento de e-mail depende de Resend habilitado/configurado. |
| Catálogo, cursos e turmas | IMPLEMENTADO / READY | Rotas e models de cursos/turmas; CRUD de oferta restrito ao ADMIN. |
| Matrícula, cancelamento, reativação | IMPLEMENTADO / READY | `matricula.models.js`; reativação reinicia nota/progresso e preserva tentativas. |
| Sala virtual por aulas | IMPLEMENTADO / READY | `learning-path.js`, `sala-aula.js`, migration 007; itens sem aula têm seções próprias. |
| Texto, vídeo, PDF, link, atividade | IMPLEMENTADO com limites | `conteudos.*`; texto simples, YouTube embed, PDF local e links da allowlist. |
| Entrega de atividade pelo aluno | NÃO UTILIZADO como fluxo de entrega | ATIVIDADE é conteúdo; não há tabela/rota de envio de arquivo/resposta dessa atividade. Não há evidência de planejamento aprovado. |
| Upload e substituição de PDF | IMPLEMENTADO / READY | `material-upload.service.js`, integração PDF; acesso privado. |
| Autoria de questionários e perguntas | PARCIALMENTE IMPLEMENTADO na UX | Backend permite editar/excluir perguntas e opções; tela cria perguntas com duas opções, sem editor completo de perguntas existentes. |
| Prova e exercício objetivos | IMPLEMENTADO / READY | `questoes.*`; MULTIPLA_ESCOLHA, VERDADEIRO_FALSO e ASSOCIACAO; pesos, tentativas e idempotência. |
| Resposta curta/dissertativa | LEGADO no schema / NÃO UTILIZADO no fluxo atual | `RESPOSTA_CURTA` existe no enum; leitura/submissão rejeita esse tipo. |
| Correção automática | IMPLEMENTADO / READY | Pontuação e percentual da tentativa calculados no backend. |
| Nota final e aprovação | IMPLEMENTADO como decisão manual | `matricula.models.js`; não há média automática nem nota mínima fixa. |
| Progresso acadêmico | IMPLEMENTADO com limitação | Derivado de conteúdos; percentual arredondado é usado no gate de situação final. |
| Replicação estrutural | IMPLEMENTADO / READY | ADMIN, deep copy relacional, arquivos compartilhados imutáveis, sem matrículas/histórico. |
| Certificado, PDF, QR e hash | IMPLEMENTADO / READY | Services/model/controller de certificados; PDF imutável e código aleatório. |
| Validação pública por código e upload | IMPLEMENTADO / READY | Código retorna VALIDO; arquivo retorna AUTENTICO; revogação é consultada. |
| Revogação | IMPLEMENTADO / READY | ADMIN; preserva PDF e identidade do certificado. |
| Reemissão de revogado | NÃO UTILIZADO / sem operação dedicada | Emissão reutiliza registro existente, inclusive revogado; não há reativação/substituição. |
| Páginas institucionais e materiais públicos | IMPLEMENTADO como conteúdo estático | HTML institucional e `institucional.js`; não há CMS de páginas. PDFs acadêmicos da pasta materiais estão bloqueados no caminho estático. |
| Detector contextual/incremental | IMPLEMENTADO no gateway; disponibilidade INCERTA | Flag experimental e contratos externos; Compose não inclui motor IA. Staging documenta detector desligado. |
| Análise de similaridade indexada | PARCIALMENTE IMPLEMENTADO na plataforma | API, validação e gateway; não foram encontrados consumidores na interface pública atual. |
| Comparação antiga de dois textos | LEGADO, ainda roteado | `/api/plagio/analisar`; armazena trecho e devolve resposta externa bruta. |
| Administração do índice do corpus | IMPLEMENTADO apenas na API | Status/reload ADMIN; serviço e corpus externos. |
| Backup/restore | IMPLEMENTADO como scripts; operação PARCIAL | Dump, dois volumes e manifesto; sem agendador/offsite/ensaio de recuperação comprovado nesta análise. |
| Produção institucional | INCERTO | Há configuração e runbook; só staging tem relato de implantação. Não há evidência suficiente para afirmar produção em operação. |
| Expansões de corpus/fontes | PLANEJADO no roadmap histórico | `docs/engineering/history/ROADMAP_DETECTOR_INCREMENTAL_FONTES.md`; não transforma itens do roadmap em garantia do estado atual. |

As divergências verificadas estão consolidadas em [riscos e dívida](09-risks-technical-debt.md). Nenhuma alteração funcional foi feita neste levantamento.
