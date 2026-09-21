> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Goal Detector 4 — interface contextual

> **SUPERADO PARCIALMENTE PELO ROADMAP INCREMENTAL COM FONTES**
>
> O formulário posterior descrito abaixo foi preservado como análise completa, mas deixou de ser
> o fluxo principal. O editor incremental e seus gates estão em
> `ROADMAP_DETECTOR_INCREMENTAL_FONTES.md`.

## Fluxo e acesso

O verificador usa exclusivamente `POST /api/analises/contextual` por meio do cliente HTTP
compartilhado da plataforma. O navegador não chama o FastAPI diretamente. A página exige sessão
resolvida pelo módulo central e aceita ALUNO, PROFESSOR e ADMIN conforme o contrato do Goal 3.

O formulário envia `documento` e `fonte_comparada`; pode incluir `metadados_fonte` (autores, ano,
título, DOI e URL) e `parametros` experimentais. Documento e fonte têm limites visíveis de 100.000
e 50.000 caracteres. Os parâmetros ficam recolhidos e podem ser restaurados aos valores padrão.

## Estados e leitura

A página possui estados inicial, validação local, carregamento, sucesso sem alertas, sucesso com
alertas, indisponibilidade, timeout e resposta incompatível. Os dados digitados permanecem após
falhas. O botão Limpar remove apenas o estado visual e os campos atuais; nenhum texto é enviado a
armazenamento do navegador, URL, cookie ou log de frontend.

O relatório apresenta resumo, alertas, segmentos, scores semântico e lexical, citações,
referências e associações. Scores são percentuais de suas próprias métricas para facilitar leitura;
nunca são percentual ou confirmação de plágio. REG-01 a REG-07 recebem títulos e orientações para
revisão humana. REG-05 é explicitamente tratado como inconsistência documental.

## Privacidade e segurança

Os textos são enviados ao serviço de análise e a plataforma persiste somente o resumo técnico
documentado no Goal 3. A interface constrói o DOM com `createElement`, `textContent` e
`DocumentFragment`; não interpreta HTML da API. Segmentos com alertas usam `<mark>` criado pelo
renderizador de nós de texto e levam, por teclado ou clique, à aba de alertas. Links de referência
aceitam a mesma origem ou origens HTTPS presentes na allowlist explícita e usam `target="_blank"`
com `rel="noopener noreferrer"`.

## Acessibilidade e responsividade

Há labels visíveis, contadores, mensagens associadas aos campos, `aria-live`, navegação por tabs,
foco após sucesso e após erro, diálogos nativos com contenção de foco e suporte a teclado. Em telas
pequenas, grids de metadados, resumo e scores passam a uma coluna; URLs e textos longos quebram
sem rolagem horizontal. A animação de carregamento respeita movimento reduzido.

## Testes

```bash
npm run test:security
npm test
npm run test:integration
npm run test:all
```

O teste de interface `goal5.interface.test.js` cobre formulário, payload, contrato, regras,
estados, segurança, privacidade, acessibilidade e responsividade. A integração do Goal 3 continua
usando somente `plataforma_cursos_test` e simula o FastAPI.

## Limitações

Esta etapa não realiza upload de arquivos, OCR, consulta automática a fontes, correção de texto,
exportação, armazenamento local de textos, histórico visual ou calibração científica. Alertas são
indícios e requerem revisão humana.
