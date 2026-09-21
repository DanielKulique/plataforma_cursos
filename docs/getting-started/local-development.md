# Rotina de desenvolvimento

Inicie o banco Docker, confira a identidade e execute Node na raiz do repositório:

```bash
docker compose --env-file .env -f compose.yaml -f compose.local-db.yaml up -d db
npm run db:identity:verify
npm run db:migrate:status
npm start
```

`npm run dev` também executa `node index.js`; não há reinício automático. Reinicie o processo
após alterar backend/configuração. Para páginas estáticas, recarregue o navegador.

## Mudanças e verificações

- Backend/API: localize rota, controller, model/serviço e testes do domínio.
- Frontend: preserve contratos de página e confira estados de erro, sessão e responsividade.
- Schema: use uma migration nova e atualize contrato/DDL seguindo [migrations](../database/migrations.md).
- Apenas documentação: valide links e `git diff --check`; não execute suítes pesadas sem motivo.

Os comandos `npm run lint`, `npm test`, `npm run test:integration` e `npm run build` estão
explicados no [guia de testes](../testing/overview.md). O build é uma validação estática,
não uma compilação de HTML/JS.

## Parar e conservar dados

Encerre Node com Ctrl+C; o servidor trata encerramento gracioso. Pare apenas o banco local:

```bash
docker compose --env-file .env -f compose.yaml -f compose.local-db.yaml stop db
```

O volume permanece. Não use `down -v` como rotina. Não limpe `storage/`: há PDFs privados
ligados a registros. `node_modules/`, `coverage/` e logs são gerados e já estão no `.gitignore`.
Capturas úteis e resultados sanitizados devem ser identificados como evidência de engenharia.

Não execute deploy, restore ou reconciliador APPLY para resolver uma falha local de teste.
Consulte [troubleshooting](../operations/troubleshooting.md) e investigue o alvo configurado.
