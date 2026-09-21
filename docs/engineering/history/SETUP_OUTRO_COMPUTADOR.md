> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Execução em outro computador

Este guia prepara a plataforma e, opcionalmente, o repositório do detector contextual. Arquivos `.env` reais, modelos baixados, documentos de usuários e bancos locais não são versionados.

## Clonar ou atualizar

```bash
git clone https://github.com/DanielKulique/motor_ia.git
git clone https://github.com/DanielKulique/plataforma_cursos.git

cd plataforma_cursos
git pull --ff-only
```

Use a branch ou o commit aprovado para o ambiente; nomes antigos de branches de trabalho não fazem parte do procedimento.

## 1. MySQL e plataforma

Pré-requisitos: Node.js 20 e Docker Compose. Não instale nem inicie MySQL nativo para esta plataforma. Siga a operação isolada em [ARQUITETURA_BANCO.md](ARQUITETURA_BANCO.md).

```bash
cd plataforma_cursos
npm ci
cp .env.example .env
```

Preencha no `.env` local os placeholders de `DB_HOST`, `DB_PORT`, `DB_USER`,
`DB_PASSWORD`, `DB_ENVIRONMENT_IDENTITY`, `MYSQL_ROOT_PASSWORD`, `JWT_SECRET`, `CANONICAL_SEED_PASSWORD`, `MAIL_FROM` e as demais variáveis
necessárias ao ambiente. O padrão recomendado para trabalhar só na plataforma é `DETECTOR_ENABLED=false`. Para integrar o detector, use `DETECTOR_ENABLED=true` e `DETECTOR_API_URL=http://127.0.0.1:8000`.

Prepare o banco de desenvolvimento por comandos explícitos:

```bash
docker compose --env-file .env -f compose.yaml -f compose.local-db.yaml up -d db
npm run db:identity:verify
npm run db:dev:setup
CANONICAL_SEED_PASSWORD='<senha-local-das-contas-mock>' npm run db:dev:seed
```

O banco de desenvolvimento é exclusivamente `plataforma_cursos_dev`. O MySQL nativo e bancos
legados não fazem parte da plataforma: não os use para setup, seed, migração ou testes.

Para a suíte de integração, crie uma configuração independente e descartável:

```bash
cp .env.test.example .env.test
# preencha os placeholders, inclusive TEST_SEED_PASSWORD
npm run db:test:setup
npm run db:test:seed
```

O único banco aceito pela automação de integração é `plataforma_cursos_test`.

Inicie a plataforma; ela não depende do motor quando a flag está desabilitada:

```bash
npm start
```

Abra `http://localhost:3000` no navegador.

## 2. Motor de IA

Pré-requisito: Python 3.10+.

No Linux e macOS:

```bash
cd ../motor_ia
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install torch==2.13.0 --index-url https://download.pytorch.org/whl/cpu
python -m pip install -r requirements-dev.txt
cp .env.example .env
```

No Windows (PowerShell), ative o ambiente com:

```powershell
.\.venv\Scripts\Activate.ps1
```

Em `.env`, use `MOTOR_IA_HOST=127.0.0.1`, `MOTOR_IA_PORT=8000` e, opcionalmente,
um `HF_HOME` fora do repositório. Na primeira execução, o modelo público é baixado para o
cache local.

Inicie o motor:

```bash
python main.py
```

O endereço esperado é `http://127.0.0.1:8000`; confira-o com:

```bash
curl --fail --silent http://127.0.0.1:8000/health
```

## Ordem de inicialização

1. MySQL;
2. opcionalmente, `motor_ia` em `127.0.0.1:8000`;
3. `plataforma_cursos` em `localhost:3000`;
4. navegador em `http://localhost:3000`.

## Testes

No motor:

```bash
python -m pytest
pip check
```

Na plataforma, com `.env.test` apontando exclusivamente para
`plataforma_cursos_test`:

```bash
npm test
npm run test:security
npm run test:integration
npm run test:all
npm run test:stability
```

Não versione `.env`, `.env.test`, `.venv`, `node_modules`, caches do modelo, documentos de
usuários, dumps, logs ou resultados de benchmark.
