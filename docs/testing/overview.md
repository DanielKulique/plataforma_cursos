# Testes

A validação combina Jest, integração com MySQL, lint e verificações de assets/isolamento.
Escolha os comandos pelo risco da alteração. Resultados históricos não substituem executar
os testes relevantes quando código ou infraestrutura mudam.

## Preparar ambiente e MySQL de teste

Siga a [instalação](../getting-started/installation.md) e preencha `.env.test` inteiro.
Configure `TEST_SEED_PASSWORD`, JWT exclusivo e `DB_NAME=DB_ENVIRONMENT_IDENTITY=plataforma_cursos_test`.
Usuário/senha devem corresponder ao usuário provisionado pelo Compose local.

```bash
docker compose --env-file .env -f compose.yaml -f compose.local-db.yaml up -d db
docker compose --env-file .env -f compose.yaml -f compose.local-db.yaml ps db
NODE_ENV=test npm run db:identity:verify
npm run db:test:setup
npm run test:integration
```

Integrações locais usam exclusivamente `127.0.0.1:33307` via Docker. Se estiver indisponível,
corrija a stack dedicada; não use MySQL nativo ou outro endpoint. O setup recria somente o
banco descartável validado e as suítes limpam suas tabelas. Não execute suítes destrutivas
concorrentemente contra o mesmo banco. `npm run db:test:seed` é útil para dados demonstrativos,
mas as integrações possuem seus próprios fixtures.

## Comandos

| Comando | Escopo |
| --- | --- |
| `npm test` | Jest principal, cobertura, execução sequencial e detectOpenHandles |
| `npm run test:integration` | Jest separado, MySQL real e fixtures descartáveis |
| `npm run test:migrations:unit` | Parser/ledger/checksum e contrato estrutural |
| `npm run test:migrations:integration` | Bootstrap, upgrade e drift no MySQL de teste |
| `npm run test:security` | Recorte existente de segurança; não substitui todos os testes de segurança |
| `npm run lint` | ESLint |
| `npm run build` | Isolamento estático do banco e assets de produção |
| `npm run test:all` | Lint + Jest principal + integração + build |
| `npm run test:stability` | Conjunto completo duas vezes sem retry |

A suíte principal exclui `src/__tests__/integration`. Cobertura global mínima configurada:
50% em branches, funções, linhas e statements. `coverage/` é saída gerada ignorada pelo Git.
Testes de fixtures PDF válidos, corrompidos e criptografados são necessários: não os remova
como arquivos temporários.

## Áreas cobertas

Há contratos de autenticação/CSRF/perfis, ciclos de matrícula, gates 80%/75%, conclusão exata,
autoria concorrente, PDFs, snapshots/reemissão, storage e compensação, backup/restore,
readiness/pool e resiliência do frontend. Testes de integração exercitam restrições MySQL e locks;
unitários não comprovam esses comportamentos sozinhos.

Smokes de staging em `scripts/smoke_*_staging.js` exigem configuração e credenciais próprias;
alguns criam, alteram, emitem ou revogam dados. Leia o script e use cenários fictícios controlados.
Eles não fazem parte da validação documental e não devem ser executados por simples leitura deste guia.

## CI e limite conhecido

O [workflow atual](../../.github/workflows/ci.yml) usa MySQL 8.4 efêmero com identidade e flags
próprias, valida migrations/schema, roda a suíte completa e constrói a imagem. Há uma exceção
explícita de endpoint na CI existente; ela não é alternativa para integração local.

## Documentação

```bash
python3 docs/engineering/validate_current_docs.py
git diff --check
```

O validador percorre Markdown do projeto, links/âncoras locais, índice, documentos obrigatórios
e inventário atual de endpoints. O validador antigo `validate_docs.py` pertence à baseline
histórica e compara fontes com um manifesto datado; não use seu checksum antigo para afirmar
que a aplicação atual está inválida.
