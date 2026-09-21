> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Roadmap do detector incremental com fontes

Status: contrato arquitetural transversal implementado em 29/07/2026. Este documento não
autoriza ingestão ou scraping e não escolhe uma tecnologia definitiva de índice.

## Caso de uso e escopo

O fluxo principal é a **análise incremental durante a escrita**: depois de 900 ms sem nova
alteração, somente o parágrafo modificado e seu contexto mínimo são enviados. A escrita não é
bloqueada. A análise completa continua disponível por ação explícita para regras globais e
relatório consolidado.

“Próxima ao tempo real” não significa requisição por tecla, promessa de latência absoluta,
scraping ao vivo, persistência de versões ou reenvio integral do documento. Não há percentual
nem veredito de plágio; fontes recuperadas são candidatas e exigem revisão humana.

## Diagnóstico dos Goals anteriores

| Componente | Estado anterior | Impacto incremental | Impacto de fontes | Correção transversal | Goal |
| --- | --- | --- | --- | --- | --- |
| MiniLM | implementado, instância global | podia operar em lote, mas só recebia documento | comparava uma fonte | preservado; no modo incremental codifica apenas um segmento e seus candidatos | Detector 1/2 |
| Segmentador Python | parcial, IDs `seg-N` posicionais e sem versão | IDs não sobreviviam a inserções no editor | neutro | `Segmento` ganhou versão; o editor fornece e a API ecoa ID estável | Detector 1/4 |
| Núcleo contextual | documento + uma fonte | REG-05 era sempre global; não havia contexto parcial | sem múltiplos candidatos nem vínculo fonte-alerta | análise de segmento e documento, múltiplas candidatas, deduplicação e vínculo por IDs | Detector 1 |
| REG-01 a REG-07 | implementadas para documento completo | REG-04/05 podiam gerar falso alerta sem contexto | REG-07 dependia de uma fonte manual | aplicabilidade por modo; REG-05 só completa; REG-04 exige referências fornecidas | Detector 1 |
| FastAPI `/api/v1/detectar` | implementado, documento e fonte obrigatórios | incompatível | somente manual | preservado; adicionados endpoints 2.0 incremental e completo | Detector 2 |
| Recuperação | ausente | não havia top-K nem status próprio | automática inexistente | porta `RepositorioFontes`, provedor não configurado e fixture injetável | Detector 2 / Fontes |
| Node `/contextual` | implementado, timeout único | cada chamada era persistida | payload manual 1.0 | rotas de segmento/documento, timeouts distintos, cancelamento e zero persistência incremental | Detector 3 |
| Rate limit | 10/minuto | incompatível com debounce normal | neutro | padrão 60/minuto por usuário; requer solução distribuída em múltiplas instâncias | Detector 3 |
| Persistência | resumo de toda chamada | incompatível com versões intermediárias | não guardava textos | somente análise completa persiste resumo; incremental permanece em memória | Detector 3 |
| Verificador | formulário posterior de dois textos | sem editor, debounce, versão ou corrida | fonte manual obrigatória | editor por parágrafo, três modos, debounce, cancelamento, descarte obsoleto e ação completa | Detector 4 |
| Goal Detector 5 | ausente | sem métricas de interação | sem métricas de recuperação | avaliação separada em recuperação, classificação e incrementalidade | Detector 5 |

Classificação consolidada:

- implementado: MiniLM global, regras, citações, referências, associações, fonte manual,
  análise completa, autenticação, CSP, DOM seguro e resumo sem textos;
- parcialmente implementado: identificação estável existe durante a sessão do editor, não como
  identificador permanente de documentos; otimização de mudança de referências apenas evita
  recomputação e marca contexto desatualizado;
- planejado: ingestão, índice real, recuperação autorizada, métricas científicas e
  reassociação incremental especializada;
- incompatível e corrigido: fonte obrigatória em todos os modos, persistência de toda chamada,
  timeout único, rate limit 10/minuto e atualização sem versão;
- ausente por decisão: scraping, corpus autorizado, banco/índice definitivo, PDF, DOCX e OCR.

## Arquitetura dos quatro pipelines

```text
INGESTÃO (fora da escrita)
fontes autorizadas → coleta/importação → licença/origem → normalização → trechos

INDEXAÇÃO (fora da escrita)
trechos normalizados → embeddings/metadados → índice versionado → atualização/remoção

RECUPERAÇÃO (durante a análise)
segmento → consulta top-K no índice existente → candidatas ordenadas

DETECÇÃO CONTEXTUAL
segmento/documento + candidatas → MiniLM/Jaccard → citações/referências → REG-01..07
→ alertas vinculados à candidata → revisão humana
```

Ingestão nunca é chamada pela recuperação ou pelo editor. A porta do núcleo não conhece MySQL,
um banco vetorial, arquivos ou scraping. Uma implementação real deverá garantir consulta
indexada top-K; varredura linear de todo o corpus não é aceita.

## Contratos 2.0

### Incremental

`POST /api/v2/detectar/segmento` no FastAPI e
`POST /api/analises/contextual/segmento` na plataforma:

```json
{
  "sessao_id": "efemero",
  "segmento_id": "id-estavel-na-sessao",
  "versao": 12,
  "indice": 3,
  "texto_segmento": "Texto atual.",
  "inicio": 80,
  "fim": 92,
  "tipo": "PARAGRAFO",
  "analisavel": true,
  "contexto": {
    "segmento_anterior": "Anterior.",
    "segmento_seguinte": "Seguinte.",
    "referencias_atuais": []
  },
  "modo_fontes": "BUSCA_AUTOMATICA",
  "limite_candidatos": 5
}
```

A resposta 2.0 repete `sessao_id`, `segmento_id` e `versao`, informa
`status_contexto`, `status_recuperacao`, `versao_indice`, candidatas, métricas separadas,
citações, associações, alertas e tempos. Não retorna todos os segmentos do documento.

Estados incluem `ANALISE_PARCIAL`, `REFERENCIAS_NAO_FORNECIDAS`, `SEM_CANDIDATOS`,
`RECUPERACAO_INDISPONIVEL` e `RECUPERACAO_PARCIAL`. Ausência de candidata não é erro 5xx.

### Completo

`POST /api/v2/detectar/documento` e
`POST /api/analises/contextual/documento` recebem documento, modo, fonte manual opcional conforme
o modo, limite e parâmetros. A resposta consolida segmentos, fontes por segmento, regras globais,
citações, referências, associações, resumo e tempos.

`POST /api/analisar`, `/api/v1/detectar` e `/api/analises/contextual` permanecem compatíveis.

### Fonte candidata

```json
{
  "fonte_id": "fonte-123",
  "trecho_fonte_id": "trecho-9",
  "texto_trecho": "Somente o trecho necessário e permitido.",
  "titulo": "Título",
  "autores": ["Autora"],
  "ano": "2025",
  "doi": "10.x/x",
  "url": "https://origem.autorizada",
  "origem": "REPOSITORIO_AUTORIZADO",
  "score_recuperacao": 0.82,
  "versao_fonte": "v3"
}
```

O score de recuperação apenas ordena candidatas. Ele não é score semântico, lexical, gravidade
ou percentual de plágio. Alertas dependentes de fonte carregam `fonte_id` e
`trecho_fonte_id`; a interface os apresenta como candidata, nunca como origem confirmada.

## Modos e abstração de fontes

- `FONTE_MANUAL`: exige trecho manual e não consulta o repositório;
- `BUSCA_AUTOMATICA`: consulta `RepositorioFontes`; sem implementação real retorna
  `RECUPERACAO_INDISPONIVEL` e lista vazia;
- `HIBRIDO`: usa a fonte manual e tenta o repositório; se este falhar, retorna resultado parcial.

`RepositorioFontes` é um protocolo com `recuperar(texto_segmento, limite)` e
`versao_indice`. `RepositorioFontesNaoConfigurado` torna a ausência explícita.
`RepositorioFontesMemoria` existe apenas para fixtures controladas e injeção em testes; não deve
ser divulgado como base automática funcional.

## Sessão do editor, versões e corrida

O estado permanece em memória. IDs não derivam do texto nem apenas do índice. Na edição sem
mudança estrutural, o ID é preservado e a versão incrementa. Ao dividir, o primeiro trecho
preserva o ID anterior e o novo recebe outro; ao unir, prevalece deterministicamente o primeiro
ID; ao excluir, timer e requisição são cancelados e o estado removido.

Cada segmento possui seu próprio timer e `AbortController`. O debounce é 900 ms. O coordenador
só aplica a resposta quando sessão, ID e versão ainda correspondem ao estado atual. Assim, se
v11 chegar antes de v10, v11 é aplicada e v10 é descartada. Dois parágrafos são independentes.

Alterações em referências ou somente nos metadados não disparam recomputação semântica de todos
os parágrafos. Nesta adaptação mínima, resultados existentes ficam marcados como contexto
desatualizado e a análise completa consolida associações. Um endpoint futuro de reassociação
deverá reaplicar somente associações/REG-04/REG-07 usando métricas e candidatas vigentes, sem
novo embedding. Atualização do índice só afeta consultas futuras.

## Aplicabilidade das regras

| Regra | Incremental | Completa | Observação |
| --- | --- | --- | --- |
| REG-01 | sim | sim | por segmento × candidata |
| REG-02 | sim | sim | por segmento × candidata |
| REG-03 | sim, com referência atual | sim | vinculada à candidata |
| REG-04 | só se referências foram fornecidas | sim | nunca inferida quando contexto ausente |
| REG-05 | não | sim | exige visão global |
| REG-06 | sim | sim | por candidata relevante |
| REG-07 | sim, com metadados | sim | não confirma autoria |

Alertas duplicados são consolidados por regra, segmento, fonte, trecho e evidências.

## Persistência, privacidade e conteúdo

A rota incremental não chama model de persistência. Texto, fonte, versão, requisições canceladas,
respostas obsoletas e embeddings não são gravados. O editor não usa `localStorage`,
`sessionStorage`, cookies ou query strings. Logs registram IDs técnicos, contagens, tamanhos,
status e tempos, nunca os textos.

A análise completa preserva a política atual de resumo técnico: usuário, contagens, gravidade,
duração, contrato e parâmetros. Quantidade de candidatas e versão do índice ainda não possuem
colunas; qualquer evolução exige migração explícita somente nos bancos canônicos. Persistência
integral permanece desativada.

Fontes automáticas futuras devem retornar só metadados, localização permitida e trecho necessário.
Documentos completos protegidos não devem ser expostos ou armazenados sem autorização.

## Goal Detector 1

**Objetivo:** núcleo compatível com segmento, documento e múltiplas candidatas.

- entregas: `Segmento.versao`, `FonteCandidata`, análise parcial/completa, scores por candidata,
  vínculo fonte-alerta, deduplicação e REG-05 somente global;
- dependências: segmentador, citações, referências, regras e scores do MiniLM;
- contratos: dataclasses independentes de FastAPI e `RepositorioFontes`;
- testes: uma/múltiplas/nenhuma candidata, contexto insuficiente, vínculo, deduplicação, REG-05;
- exclusões: banco, scraping, índice, UI e fine-tuning;
- gate: núcleo não acessa banco, aceita candidatas e não gera REG-04/05 falsos em contexto ausente;
- limitação: interpretação bibliográfica continua heurística.

## Goal Detector 2

**Objetivo:** API incremental e completa com recuperação injetável.

- entregas: endpoints 2.0, IDs/versões ecoados, três modos, status de recuperação, tempos e
  provider substituível;
- dependências: Goal 1 e MiniLM global preservado;
- contratos: requests/responses descritos acima; contrato 1.0 mantido;
- testes: incremental, completo, manual, automático indisponível, híbrido, sem candidatas,
  validação e fixture injetável;
- exclusões: provedor real, scraping e persistência;
- gate: automático não inventa resultado e ausência de candidata não vira falha;
- limitação: provider padrão é deliberadamente indisponível.

## Goal Detector 3

**Objetivo:** integração Node com timeout, cancelamento e privacidade.

- entregas: rotas de segmento/documento, validação estrita, timeout 8 s/20 s, cancelamento,
  rate limit compatível com debounce e persistência apenas completa;
- dependências: endpoints 2.0;
- contratos: browser fala somente com Node autenticado; erros são classificados;
- testes: rotas, timeout, cancelamento, modos, provider indisponível, sem candidatas, logs e
  ausência de persistência incremental;
- exclusões: fila distribuída e armazenamento de texto;
- gate: nenhuma versão intermediária entra em `AnalisesContextuais`;
- limitação: rate limit em memória não serve a múltiplas instâncias.

## Goal Detector 4

**Objetivo:** editor incremental com candidatas e alertas por segmento.

- entregas: editor, segmentação em memória, IDs estáveis, versão, debounce 900 ms, cancelamento,
  descarte obsoleto, estados por parágrafo, três modos e botão de análise completa;
- dependências: Goal 3 e sessão já existente;
- contratos: contexto mínimo; DOM construído com APIs seguras;
- testes: debounce, uma chamada por sequência, cancelamento, corrida, dois segmentos, modos,
  candidata, sem fonte, análise completa e ausência de persistência local;
- exclusões: editor rico, correção automática, upload, PDF/DOCX/OCR;
- gate: digitação não bloqueia e somente a versão atual atualiza o parágrafo;
- limitação: mudança isolada de referência/metadado é marcada para consolidação, pois a rota
  especializada de reassociação ainda não existe.

## Goal Fontes — definição, ingestão, indexação e recuperação

**Objetivo:** definir e implementar a base real autorizada.

Antes de iniciar, decidir fontes, termos, `robots.txt`, formatos, volume, atualização, retenção,
licenças, infraestrutura, índice, algoritmo e remoção. Só então implementar:

```text
fontes → coleta/importação → normalização → segmentação → embeddings
→ indexação → recuperação → atualização → remoção
```

- dependências: aprovação jurídica/institucional e requisitos de escala;
- contratos: implementar `RepositorioFontes`, top-K determinístico e versão do índice;
- testes: atualização/remoção, licença, limite, ordenação, indisponibilidade e desempenho;
- exclusões atuais: qualquer scraping real;
- gate: nenhum conteúdo não autorizado e nenhuma varredura linear durante a escrita;
- limitação: tecnologia propositalmente não escolhida.

## Goal Detector 5

**Objetivo:** calibração, avaliação da recuperação, classificação, desempenho e usabilidade.

Separar:

- recuperação: Recall@K, Precision@K, MRR, nDCG, posição relevante, consultas sem relevante e
  latência;
- classificação com fonte correta fornecida: precisão, revocação, F1, matriz de confusão,
  falsos positivos e falsos negativos;
- incremental: debounce, recuperação, inferência, latência percebida, requisições/minuto,
  requisições evitadas, cancelamentos, obsoletas descartadas e impacto sobre a escrita.

Cenários incluem digitação contínua/pausas, edição repetida, alternância, inclusão, exclusão,
divisão, união, referências, modo, sem candidata, indisponibilidade, completa e respostas fora
de ordem. Não inventar participantes, corpus ou resultados.

- dependências: fixtures podem começar antes; avaliação final de recuperação depende do Goal
  Fontes;
- gate: distinguir `ERRO_DE_RECUPERACAO` de `ERRO_DE_CLASSIFICACAO` e publicar metodologia;
- exclusões: fine-tuning do MiniLM nesta fase.

## Tecnologias consideradas, sem decisão

O contrato permite índice vetorial gerenciado, extensão vetorial de banco relacional, mecanismo
de busca híbrida ou serviço institucional. A escolha depende de volume, atualização, licença,
latência, custo, operação e política de remoção. Nenhuma delas é requisito do detector.

## Ordem e gates

```text
Detector 1 → Detector 2 → Detector 3 → Detector 4
→ Goal Fontes → integração do provider real → Detector 5
```

As adaptações mínimas dos Goals 1–4 estão presentes, mas isso não declara o Goal Fontes nem o
Goal 5 concluídos. Cada próximo Goal só avança após seus testes e gate próprios.

## Evidências automatizadas desta revisão

- Python: núcleo, repositório injetável, API manual/automática/híbrida e contratos 1.0;
- Node: validação, endpoints, timeout/cancelamento, privacidade e persistência;
- frontend: debounce, IDs/versões, divisão/união/exclusão, corrida v10/v11 e dois segmentos;
- segurança: CSP existente, sem script/handler inline, sem `innerHTML` com dados externos e
  redaction preservada;
- integração: usa exclusivamente `plataforma_cursos_test`.

Não há scraping durante a escrita, requisição por tecla, persistência de versões intermediárias,
comparação linear com uma base, substituição do MiniLM ou alteração automática de banco.
