# Relatório mestre — API de análise de plágio e similaridade

**Data de referência:** 01/08/2026
**Base inspecionada:** `motor_ia` em `236e1fb` e `plataforma_cursos` em `fe946af`
**Escopo:** implementação em código, contratos, fluxo de dados, segurança, persistência,
interface e testes. Este documento descreve o que está implementado; não é uma alegação de
detecção conclusiva de plágio.

## 1. Resumo executivo

Há dois produtos de API relacionados, mas semanticamente diferentes:

| Caminho | Finalidade | Resultado principal | Situação |
| --- | --- | --- | --- |
| Similaridade legada | Compara dois textos inteiros | Um score semântico de 0 a 100 | Mantido por compatibilidade |
| Detector contextual 1.0 | Analisa documento e uma fonte manual | Métricas por segmento, citações, referências e alertas | Implementado, experimental |
| Detector incremental 2.0 | Analisa somente o parágrafo alterado e candidatas | Resultado parcial, versão do segmento e alertas vinculados | Implementado |
| Detector completo 2.0 | Consolida documento sob ação explícita | Visão global, inclusive regras de referências | Implementado |

O sistema atual **não confirma plágio**. Ele produz indícios de similaridade e de
inconsistências documentais para revisão humana. Os limiares atuais são provisórios para
desenvolvimento; não houve calibração científica, corpus autorizado, avaliação de precisão ou
política institucional que os transforme em decisão disciplinar.

O frontend fala somente com a API Node autenticada. A API Node chama o FastAPI do motor por rede
servidor-a-servidor. O navegador não recebe URL, token ou acesso direto ao motor.

```text
Navegador autenticado
       │ HTTPS/HTTP relativo + JWT Bearer
       ▼
plataforma_cursos (Express /api)
       │ validação, autorização, limite, timeout, redaction
       ▼
motor_ia (FastAPI 127.0.0.1:8000 por padrão)
       │ MiniLM + Jaccard + citações/referências/regras
       ▼
resposta estrutural ──► plataforma ──► interface segura
       │
       └─ somente análises completas: resumo técnico no MySQL
```

## 2. Componentes e responsabilidade

| Camada | Arquivos principais | Responsabilidade |
| --- | --- | --- |
| Motor semântico | `motor_ia/main.py` | Carrega uma única instância MiniLM, expõe FastAPI e serializa contratos. |
| Núcleo contextual puro | `motor_ia/detector/` | Segmentação, extração, associação, métricas, regras, fontes candidatas e orquestração. |
| Gateway da plataforma | `src/api/services/detector-contextual.service.js` | Chama o motor, aplica timeout/cancelamento e valida a resposta externa. |
| API pública | `routes`, `controllers` e `middlewares` contextuais | JWT, limite por usuário, allowlist de payload, resposta pública e logs redigidos. |
| Persistência | `analise-contextual.model.js` e `AnalisesContextuais` | Guarda resumo técnico apenas para análises completas. |
| Editor | `public/js/verificador.js` e `incremental-editor.js` | Debounce, versões efêmeras, cancelamento e renderização sem HTML dinâmico. |

## 3. Inventário de endpoints

### 3.1 API pública da plataforma (`plataforma_cursos`)

| Método e rota | Papéis | Encaminha para | Persistência | Observações |
| --- | --- | --- | --- | --- |
| `POST /api/plagio/analisar` | somente `ALUNO` | `POST /api/analisar` | `AnalisesPlagio` | Fluxo legado de dois textos; máximo 20.000 caracteres por campo. |
| `POST /api/analises/contextual` | `ALUNO`, `PROFESSOR`, `ADMIN` | `POST /api/v1/detectar` | resumo em `AnalisesContextuais` | Contrato contextual 1.0, uma fonte manual obrigatória. |
| `POST /api/analises/contextual/segmento` | `ALUNO`, `PROFESSOR`, `ADMIN` | `POST /api/v2/detectar/segmento` | **não persiste** | Fluxo de edição incremental. |
| `POST /api/analises/contextual/documento` | `ALUNO`, `PROFESSOR`, `ADMIN` | `POST /api/v2/detectar/documento` | resumo em `AnalisesContextuais` | Consolidação explícita do documento. |

`checkAuth` exige `Authorization: Bearer <JWT>`, verifica a assinatura e consulta o usuário no
banco a cada requisição. Assim, usuário removido ou com papel alterado não permanece autorizado
apenas pelo conteúdo de um token antigo.

### 3.2 API interna do motor (`motor_ia`)

| Método e rota | Contrato | Uso pela plataforma |
| --- | --- | --- |
| `POST /api/analisar` | `texto_original`, `texto_suspeito` → `status`, `score_similaridade` | Serviço legado. |
| `POST /api/v1/detectar` | documento + fonte manual + metadados/parâmetros opcionais | Rota contextual legada. |
| `POST /api/v2/detectar/segmento` | segmento versionado + contexto mínimo + modo de fonte | Editor incremental. |
| `POST /api/v2/detectar/documento` | documento + modo de fonte + fonte manual opcional conforme modo | Botão de análise completa. |
| `GET /health` | estado simples do serviço | Smoke/monitoramento local. |

Essas rotas FastAPI não implementam autenticação própria. A premissa operacional é que o motor
fique em rede privada/local e seja chamado pela plataforma. Expor a porta 8000 publicamente
seria uma mudança de arquitetura e exige autenticação, TLS, autorização e rate limit próprios.

## 4. Contratos de entrada

### 4.1 Similaridade legada

```json
{
  "texto_original": "texto com 10 a 20.000 caracteres",
  "texto_suspeito": "texto com 10 a 20.000 caracteres"
}
```

O motor produz `score_similaridade` de 0 a 100, calculado como cosseno dos embeddings MiniLM
multilíngues. Esse score não é percentual de plágio, não identifica fonte e não faz análise
bibliográfica.

### 4.2 Detector contextual 1.0

```json
{
  "documento": "até 100.000 caracteres",
  "fonte_comparada": "até 50.000 caracteres",
  "metadados_fonte": {
    "autores": ["Autora"],
    "ano": 2025,
    "titulo": "Opcional",
    "doi": "Opcional",
    "url": "Opcional"
  },
  "parametros": {
    "limiar_semantico": 0.8,
    "limiar_lexical_reproducao": 0.7,
    "limiar_lexical_parafrase": 0.2
  }
}
```

Campos desconhecidos são recusados. Há no máximo 20 autores; o ano deve estar entre 1500 e
2100; cada limiar pertence ao intervalo `[0, 1]`; e o de paráfrase deve ser estritamente menor
que o de reprodução.

### 4.3 Detector incremental 2.0

```json
{
  "sessao_id": "efemero-no-navegador",
  "segmento_id": "id-estavel-durante-a-sessao",
  "versao": 12,
  "indice": 3,
  "texto_segmento": "Somente o parágrafo alterado.",
  "inicio": 80,
  "fim": 111,
  "tipo": "PARAGRAFO",
  "analisavel": true,
  "contexto": {
    "segmento_anterior": "Opcional",
    "segmento_seguinte": "Opcional",
    "referencias_atuais": []
  },
  "modo_fontes": "FONTE_MANUAL",
  "fonte_manual": {
    "fonte_id": "fonte-manual-sessao",
    "trecho_fonte_id": "trecho-manual-sessao",
    "texto_trecho": "Trecho da fonte.",
    "origem": "MANUAL"
  },
  "limite_candidatos": 5
}
```

Os modos são:

| Modo | Regra atual |
| --- | --- |
| `FONTE_MANUAL` | `fonte_manual` é obrigatória; não consulta repositório. |
| `BUSCA_AUTOMATICA` | fonte manual é proibida; consulta a porta de recuperação. Sem provedor configurado, retorna indisponibilidade sem inventar resultado. |
| `HIBRIDO` | fonte manual obrigatória e tentativa adicional de recuperação. |

O documento completo 2.0 usa `documento`, `modo_fontes`, `fonte_manual`,
`limite_candidatos` e `parametros`, sem `sessao_id` nem versão de segmento.

## 5. Fluxos de processamento

### 5.1 Caminho legado

1. Um aluno autenticado envia os dois textos a `/api/plagio/analisar`.
2. Express valida tipo e tamanho; o serviço Node usa `IA_ANALISE_URL` e timeout de 10 s.
3. FastAPI codifica ambos os textos com a instância global do MiniLM e calcula o cosseno.
4. A plataforma devolve o score e registra em `AnalisesPlagio` o usuário, o texto suspeito,
   score e fontes retornadas pelo motor.

### 5.2 Contextual 1.0

1. A plataforma valida documento, fonte e metadados antes de qualquer chamada externa.
2. O motor segmenta por blocos separados por linha em branco.
3. O título `Referências`/`Bibliografia` inicia a área não analisável de referências.
4. Para cada parágrafo analisável, MiniLM calcula similaridade com a única fonte; Jaccard mede
   sobreposição lexical normalizada.
5. O núcleo extrai citações autor-data, referências, associações conservadoras e `REG-01..07`.
6. Node rejeita contratos externos inesperados e persiste apenas um resumo técnico validado.

### 5.3 Incremental 2.0

1. O editor divide o texto localmente com a mesma regra de parágrafos do motor.
2. Em edição sem mudança estrutural, preserva `segmento_id` e incrementa `versao`.
3. Cada segmento tem debounce de **900 ms** e `AbortController` próprio.
4. Apenas o parágrafo modificado, vizinhos mínimos e referências atuais seguem à plataforma.
5. Node aplica autenticação, rate limit e timeout incremental de 8 s por padrão.
6. FastAPI resolve candidatas, calcula métricas somente do segmento e ecoa sessão, ID e versão.
7. O navegador aplica a resposta somente se sessão, ID e versão ainda coincidirem; respostas
   antigas são descartadas. Não há escrita em MySQL nesse caminho.

### 5.4 Documento completo 2.0

1. O usuário aciona explicitamente “Executar análise completa”.
2. O motor percorre todos os segmentos analisáveis e aplica também regras globais.
3. `REG-05` (referência não citada) é calculada somente nesta visão global.
4. Node persiste o resumo técnico e retorna `id_analise` ao cliente.

## 6. Métricas, evidências e regras

### Métricas

- **Semântica:** cosseno de embeddings MiniLM, normalizado entre 0 e 1 no detector contextual.
- **Lexical:** Jaccard sobre conjuntos de tokens normalizados; remove pontuação, reduz caixa e
  preserva o texto submetido sem reescrevê-lo.
- **Recuperação:** quando existir provider futuro, `score_recuperacao` apenas ordenará candidatas;
  não é similaridade, gravidade nem percentual de plágio.

### Regras vigentes

| Código | Condição resumida | Gravidade | Escopo |
| --- | --- | --- | --- |
| `REG-01` | alta proximidade semântica e lexical, sem citação vinculada | ALTA | segmento × fonte |
| `REG-02` | alta semântica e sobreposição lexical de paráfrase, sem vínculo | MEDIA | segmento × fonte |
| `REG-03` | alta semântica com citação e referência vinculadas | BAIXA | segmento × fonte |
| `REG-04` | citação sem referência correspondente | MEDIA | incremental somente com referências fornecidas; completo sim |
| `REG-05` | referência listada sem chamada no documento | INFORMATIVA | somente análise completa |
| `REG-06` | possível inconformidade em citação direta/página | MEDIA | segmento × fonte |
| `REG-07` | metadados da candidata divergem de citação relevante | ALTA | segmento × fonte |

Alertas são deduplicados por regra, segmento, fonte, trecho e evidências. A associação
citação–referência não escolhe silenciosamente uma referência ambígua.

## 7. Estados contextuais e erros

| Estado | Significado |
| --- | --- |
| `COMPLETO` | documento analisado com contexto global aplicável. |
| `ANALISE_PARCIAL` | resultado incremental com contexto suficiente para as regras parciais. |
| `CONTEXTO_INSUFICIENTE` | o segmento foi recebido sem contexto. |
| `REFERENCIAS_NAO_FORNECIDAS` | não foi possível avaliar regras dependentes de referências. |
| `SEM_CANDIDATOS` | não houve fonte disponível; não é erro 5xx. |
| `RECUPERACAO_INDISPONIVEL` | busca automática solicitada sem provider configurado. |
| `RECUPERACAO_PARCIAL` | modo híbrido preservou a fonte manual, mas a busca falhou. |

| HTTP público | Código | Origem típica |
| --- | --- | --- |
| 401 | sessão inválida/ausente | JWT ou usuário removido. |
| 413 | `DETECTOR_CONTEUDO_EXCESSIVO` | limite de texto excedido. |
| 422 | `DETECTOR_PAYLOAD_INVALIDO` | allowlist, formato, modo ou limiares inválidos. |
| 429 | `DETECTOR_LIMITE_EXCEDIDO` | mais de 60 chamadas por usuário em 60 s, por padrão. |
| 499 | `DETECTOR_CANCELADO` | cliente interrompeu análise incremental. |
| 502 | resposta externa inválida/erro externo | contrato FastAPI incompatível ou erro externo. |
| 503 | `DETECTOR_INDISPONIVEL` | motor indisponível. |
| 504 | `DETECTOR_TIMEOUT` | timeout incremental/completo excedido. |

## 8. Segurança e privacidade

### Controles implementados

- JWT e consulta do usuário atual no banco para todas as rotas contextuais.
- Allowlist de chaves nos três payloads; limites antes do `fetch` servidor-a-servidor.
- `DETECTOR_API_URL` aceita apenas HTTP/HTTPS e rejeita credenciais embutidas.
- Timeout padrão de 15 s; 8 s incremental e 20 s completo nos exemplos de ambiente.
- Rate limit em memória por `id_usuario`, com cabeçalhos `RateLimit-Limit` e
  `RateLimit-Remaining`.
- Node valida o contrato de resposta e recusa campos acusatórios, embeddings, tensores, stack
  traces e caminhos locais antes de devolver qualquer dado ao navegador.
- Logs contextuais registram IDs técnicos, papel, tamanhos, contagens, duração e erro
  classificado; não registram documento ou fonte.
- Frontend usa `textContent`/`createElement`, valida URLs externas em HTTP/HTTPS e não usa
  `innerHTML` para resposta da API.
- CSP bloqueia conexão do navegador fora de `'self'`; o acesso ao motor permanece no backend.

### Persistência

`AnalisesContextuais` armazena: usuário, status, totais de segmentos/analisados/alertas,
gravidade máxima, versão do contrato, duração e parâmetros JSON. Não armazena documento, fonte,
citações, referências, alertas detalhados, embeddings, texto de segmentos ou versões
incrementais.

**Diferença importante:** o fluxo legado persiste `trecho_texto` em `AnalisesPlagio`, que recebe
o `texto_suspeito`. Logo, a promessa de não persistir texto vale para o detector contextual, não
para a API legada. Qualquer política de retenção/privacidade deve tratar esse legado como risco
separado.

## 9. Frontend e experiência operacional

O verificador fica em `/verificador.html`, exige sessão de `ALUNO`, `PROFESSOR` ou `ADMIN` e
oferece:

- editor e contadores de tamanho;
- escolha manual, automática ou híbrida de fontes;
- parâmetros avançados claramente marcados como experimentais;
- estado por parágrafo: pendente, analisando, concluído, erro ou contexto desatualizado;
- análise global via botão, tabs ARIA, mensagens vivas, foco, diálogos, Escape e restauração de
  foco;
- links de referência com `noopener noreferrer` e DOM seguro.

O estado do editor, IDs, versões, timers e respostas é mantido somente em memória da página.
Não usa `localStorage`, `sessionStorage`, query string ou cookie para guardar os textos do
detector.

## 10. Banco e operação

| Banco | Papel | Política |
| --- | --- | --- |
| `plataforma_cursos_dev` | desenvolvimento/manual | alterações somente por comando explícito. |
| `plataforma_cursos_test` | integração automatizada | descartável; a automação pode recriá-lo. |
| `site_cursos` | legado | protegido; não é alvo de setup, seed, migração ou teste. |

A tabela `AnalisesContextuais` é criada pelo schema canônico e a migração explícita
`npm run db:dev:migrate:detector` é idempotente e protegida para o banco de desenvolvimento
canônico. Não há migração automática em runtime.

## 11. Cobertura verificada

| Camada | Evidências principais |
| --- | --- |
| Motor | 42 testes Python: API 1.0/2.0, segmentação, citações, referências, regras, múltiplas fontes e provider indisponível. |
| Gateway Node | validação, timeouts, cancelamento, resposta inválida, campos proibidos, URL insegura e três modos de fonte. |
| Integração | autenticação, 413, 429, persistência do resumo, ausência de persistência incremental e papéis ALUNO/PROFESSOR/ADMIN. |
| Frontend | debounce, uma requisição por sequência, cancelamento, corrida fora de ordem, segmentos independentes e ausência de persistência local. |
| Segurança | CSP, XSS, redaction, autorização, proteção do banco de testes e ausência de sinks dinâmicos. |

Na última validação registrada: `python -m pytest` no ambiente virtual do motor aprovou 42
testes; `npm test` aprovou 408; `npm run test:security`, 81; e `npm run test:integration`/
`npm run test:all` foram aprovados contra `plataforma_cursos_test`.

## 12. Limitações e riscos conhecidos

### Não implementado por decisão

- provider acadêmico real, corpus autorizado, ingestão, indexação vetorial e remoção de fontes;
- scraping, coleta em tempo de edição, upload de PDF/DOCX, OCR, correção automática e
  calibração científica;
- persistência de versões incrementais, histórico detalhado de alerta e documento colaborativo;
- rate limit distribuído para múltiplas instâncias;
- autorização própria no FastAPI caso ele seja exposto fora da rede privada.

### Pontos de atenção técnica

1. O rate limit contextual é uma `Map` em memória: reinicia com o processo e não é compartilhado
   entre réplicas.
2. `DETECTOR_API_URL` é configuração confiável de servidor; ela não aceita credenciais, mas não
   possui allowlist de host. Em produção, restrinja a rede/egress e gerencie a variável em cofre.
3. A API legada armazena texto suspeito e pode devolver detalhes textuais de erro do motor por
   intermédio do serviço legado. Esse caminho precisa de uma revisão de privacidade/redaction
   própria antes de uso com documentos sensíveis.
4. As heurísticas de citação/referência reconhecem somente padrões textuais limitados; não são
   validação completa de ABNT, DOI, autoria ou licença.
5. Segmentos têm identidade estável durante uma sessão do editor, não uma identidade permanente
   de documento salvo.

## 13. Próximos passos recomendados

1. Aprovar política institucional: fontes, licenças, retenção, acesso, revisão humana e canais
   de contestação.
2. Definir e implementar `RepositorioFontes` real com ingestão autorizada, top-K determinístico,
   versionamento do índice e remoção auditável — sem varrer o corpus a cada edição.
3. Medir recuperação, falsos positivos/negativos, latência e impacto do debounce em corpus
   representativo antes de alterar limiares.
4. Endurecer o legado: remover persistência desnecessária de texto, redigir detalhes externos e
   alinhar sua política à do detector contextual.
5. Para escala horizontal, mover rate limit para serviço distribuído e isolar o motor em rede
   privada autenticada.
6. Só depois, avaliar upload/OCR ou integração com fontes externas sob requisitos jurídicos e
   de privacidade explícitos.

## 14. Referências de implementação

- Motor: `motor_ia/main.py`, `motor_ia/detector/application.py`,
  `motor_ia/detector/service.py`, `motor_ia/detector/rules.py` e
  `motor_ia/detector/source_repository.py`.
- Plataforma: `src/api/services/detector-contextual.service.js`,
  `src/api/controllers/analises-contextuais.controller.js`,
  `src/middlewares/detectorContextual.validation.js`,
  `src/middlewares/detectorRateLimit.middleware.js` e `mysql/schema.sql`.
- Interface: `src/public/verificador.html`, `src/public/js/verificador.js` e
  `src/public/js/incremental-editor.js`.
- Complemento arquitetural: `docs/ROADMAP_DETECTOR_INCREMENTAL_FONTES.md`.
