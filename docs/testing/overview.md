# Testes

A validação combina Jest, integração com MySQL, lint e verificações de assets/isolamento.
Escolha os comandos pelo risco da alteração. Resultados históricos não substituem executar
os testes relevantes quando código ou infraestrutura mudam.

## Preparar ambiente e MySQL de teste

Siga a [instalação](../getting-started/installation.md) e preencha `.env.test` inteiro.
Configure `TEST_SEED_PASSWORD`, JWT exclusivo e `DB_NAME=DB_ENVIRONMENT_IDENTITY=plataforma_cursos_test`.

`npm run test:integration` provisiona por conta própria um MySQL 8.4 descartável, valida o
alvo fixo `127.0.0.1:33307`, aplica migrations e fixtures e remove o serviço e seus dados ao
terminar. Não inicie outro serviço nessa porta em paralelo. Em CI, o comando usa o MySQL
efêmero provisionado pelo workflow. Nunca use MySQL nativo ou outro endpoint como fallback.

## Comandos

| Comando | Escopo |
| --- | --- |
| `npm test` | Jest principal, cobertura, execução sequencial e detectOpenHandles |
| `npm run test:integration` | Jest separado, MySQL Docker efêmero em `127.0.0.1:33307` |
| `npm run test:migrations:unit` | Parser/ledger/checksum e contrato estrutural |
| `npm run test:migrations:integration` | Bootstrap, upgrade e drift no MySQL de teste |
| `npm run test:security` | Recorte existente de segurança; não substitui todos os testes de segurança |
| `npm run lint` | ESLint |
| `npm run build` | Isolamento estático do banco e assets de produção |
| `npm run test:all` | Lint + Jest principal + integração + build |
| `npm run test:stability` | Conjunto completo duas vezes sem retry |
| `npm run test:e2e:smoke` | Browser smoke em Chromium, app e MySQL descartáveis |
| `npm run test:e2e` | E2E completo em Chromium |
| `npm run test:e2e:firefox-critical` | Smoke crítico em Firefox |
| `npm run test:e2e:webkit` | Smoke crítico em WebKit |
| `npm run test:matrix` | Regenera inventário de páginas, endpoints e evidências |

O Compose E2E usa sua própria instância MySQL sem porta publicada, em rede privada, e só
expõe a aplicação em `127.0.0.1:3400`. Não usa o MySQL de integração em 33307 nem o serviço
local em 3306. Veja [e2e.md](e2e.md) para setup, execução e depuração.

A suíte principal exclui `src/__tests__/integration`. Cobertura global mínima configurada:
50% em branches, funções, linhas e statements. `coverage/` é saída gerada ignorada pelo Git.
Testes de fixtures PDF válidos, corrompidos e criptografados são necessários: não os remova
como arquivos temporários.

## Áreas cobertas

Há contratos de autenticação/CSRF/perfis, ciclos de matrícula, gates exatos de 80%/75%, conteúdo incompleto após aprovação,
autoria concorrente, PDFs, snapshots/reemissão, storage e compensação, backup/restore,
readiness/pool e resiliência do frontend. Testes de integração exercitam restrições MySQL e locks;
unitários não comprovam esses comportamentos sozinhos.

Os scripts legados `scripts/smoke*_staging.js` agora recusam produção e staging persistente
antes de importar módulos de banco/browser. Só aceitam o laboratório Docker descartável,
`NODE_ENV=APP_ENV=test`, identidade `plataforma_cursos_test`, autorização explícita de escrita
e destinos HTTP internos de teste. Nunca execute esses scripts com dados ou certificados reais.

```bash
python3 tests/operations/run_academic_smokes.py --allow-lab-writes
```

O runner cria projeto, rede interna, MySQL 8.4, app e fixtures sintéticas e remove os recursos
ao terminar. Valida gate de 80% exclusivamente dos conteúdos, Simulado opcional, prova única
por aluno/turma, fronteira 74,99/75, certificado automático sem 100% e preservação da prova
após rematrícula. O cadastro é exercitado nas quatro combinações das flags
`EMAIL_DELIVERY_ENABLED` e `PUBLIC_REGISTRATION_EMAIL_VERIFICATION_REQUIRED`; o laboratório
não usa chave de provedor nem envia e-mail externo. Os outros smokes com nome staging
continuam especializados em suas fixtures, porém usam o mesmo bloqueio de ambiente.

## CI e limite conhecido

O [workflow atual](../../.github/workflows/ci.yml) usa MySQL 8.4 efêmero com identidade e flags
próprias, valida migrations/schema, roda a suíte completa, instala Chromium/Firefox/WebKit com
as dependências Linux, executa as suítes completas nos três projetos em etapas separadas e
constrói a imagem. Também valida documentação, smokes acadêmicos descartáveis e o reconciliador
real dentro da imagem com autorização limitada ao laboratório.
A identidade CI não é alternativa para integração local. A configuração do workflow não substitui
evidência de uma execução concluída; WebKit só conta como validado quando a etapa real passa.

## Documentação

```bash
python3 docs/engineering/validate_current_docs.py
git diff --check
```

O validador percorre Markdown do projeto, links/âncoras locais, índice, documentos obrigatórios
e inventário atual de endpoints. O validador antigo `validate_docs.py` pertence à baseline
histórica e compara fontes com um manifesto datado; não use seu checksum antigo para afirmar
que a aplicação atual está inválida. A matriz do Goal 16 está em
[FULL_APPLICATION_TEST_MATRIX.md](FULL_APPLICATION_TEST_MATRIX.md).
