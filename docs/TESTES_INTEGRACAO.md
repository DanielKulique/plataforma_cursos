# Guia de Testes de Integração - Plataforma de Cursos

Este documento descreve como configurar e executar testes de integração para a plataforma.

## Diferença entre Testes Unitários e de Integração

| Tipo | Escopo | Banco de Dados | Velocidade |
|------|--------|----------------|------------|
| **Unitários** | Funções/métodos isolados | Mockado | Rápidos |
| **Integração** | Fluxos completos | Real (teste) | Mais lentos |

## Configuração Inicial

### 1. Instalar Dependências

```bash
npm install
```

### 2. Configurar Banco de Dados de Teste

O banco de dados de teste é separado do banco de desenvolvimento/produção.

```bash
# Configurar banco de dados de teste (roda uma vez)
npm run db:test:setup
```

Este comando:
- Cria o banco `site_cursos_test`
- Cria todas as tabelas (schema)
- Prepara o ambiente para testes

### 3. Variáveis de Ambiente de Teste

O arquivo `.env.test` contém as configurações para testes:

```env
NODE_ENV=test
DB_HOST=localhost
DB_USER=appuser
DB_PASSWORD=sua_senha
DB_NAME=site_cursos_test
JWT_SECRET=test_jwt_secret_key_for_integration_tests_only
PORT=3001
```

## Executando Testes de Integração

### Comandos Disponíveis

```bash
# Rodar todos os testes de integração
npm run test:integration

# Rodar em modo watch (reexecuta ao salvar)
npm run test:integration:watch

# Rodar testes unitários E de integração
npm run test:all
```

## Estrutura dos Testes de Integração

```
src/__tests__/integration/
├── setup.js                          # Configuração do banco de teste
├── auth.integration.test.js          # Testes de autenticação
├── cursos-turmas.integration.test.js # Testes de cursos e turmas
└── matriculas.integration.test.js    # Testes de matrículas
```

## Testes Implementados

### 1. Autenticação (`auth.integration.test.js`)

Testa o fluxo completo de autenticação:

```javascript
// Exemplo de teste
describe('POST /api/auth/login', () => {
    it('deve autenticar usuário ADMIN com sucesso', async () => {
        const response = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'admin@teste.com',
                senha: 'Teste@123'
            });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('token');
    });
});
```

**Cenários testados:**
- ✅ Login de ADMIN
- ✅ Login de PROFESSOR
- ✅ Login de ALUNO
- ✅ Credenciais inválidas (401)
- ✅ Usuário inexistente (401)
- ✅ Recuperação de sessão (/me)
- ✅ Token ausente/inválido

### 2. Cursos e Turmas (`cursos-turmas.integration.test.js`)

Testa CRUD completo de cursos e turmas:

**Cursos:**
- ✅ Criar curso (ADMIN)
- ✅ Listar cursos (público)
- ✅ Buscar curso por ID
- ✅ Atualizar curso (ADMIN)
- ✅ Deletar curso (ADMIN)
- ✅ Permissões (401/403)

**Turmas:**
- ✅ Criar turma (ADMIN)
- ✅ Listar turmas (público)
- ✅ Buscar turma por ID
- ✅ Permissões

### 3. Matrículas (`matriculas.integration.test.js`)

Testa fluxo de matrículas:

**Cenários testados:**
- ✅ Aluno se matricula em turma
- ✅ Matrícula duplicada (409)
- ✅ Listar matrículas do aluno
- ✅ Professor visualiza matrículas da turma
- ✅ Professor atualiza nota
- ✅ Aluno cancela matrícula
- ✅ Sala virtual do aluno

## Setup e Teardown

Cada arquivo de teste segue este padrão:

```javascript
beforeAll(async () => {
    // 1. Conecta ao banco de teste
    await initTestPool();
    
    // 2. Limpa banco
    await clearDatabase();
    
    // 3. Cria dados seed (usuários, etc)
    testUsers = await seedBasicData();
    
    // 4. Faz login para obter tokens
    authToken = await login();
});

afterEach(async () => {
    // Limpa banco após cada teste para isolamento
    await clearDatabase();
    await seedBasicData();
});

afterAll(async () => {
    // Fecha conexão
    await closeTestPool();
});
```

## Dados de Teste

O seed básico cria:

| Tipo | Email | Senha |
|------|-------|-------|
| ADMIN | admin@teste.com | Teste@123 |
| PROFESSOR | professor@teste.com | Teste@123 |
| ALUNO | aluno@teste.com | Teste@123 |

## Escrevendo Novos Testes de Integração

### Template

```javascript
const request = require('supertest');
const { initTestPool, clearDatabase, seedBasicData, closeTestPool } = require('../setup');
const app = require('../../../index');

describe('Testes de Integração - [Funcionalidade]', () => {
    let authToken = null;
    let testUsers = null;

    beforeAll(async () => {
        await initTestPool();
        await clearDatabase();
        testUsers = await seedBasicData();
        
        // Login se necessário
        const login = await request(app)
            .post('/api/auth/login')
            .send({ email: 'admin@teste.com', senha: 'Teste@123' });
        authToken = login.body.token;
    });

    afterEach(async () => {
        await clearDatabase();
        testUsers = await seedBasicData();
    });

    afterAll(async () => {
        await closeTestPool();
    });

    describe('POST /api/[endpoint]', () => {
        it('deve [ação] com sucesso', async () => {
            const response = await request(app)
                .post('/api/[endpoint]')
                .set('Authorization', `Bearer ${authToken}`)
                .send({ /* dados */ });

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('id');
        });
    });
});
```

### Boas Práticas

1. **Isole testes**: Cada teste deve ser independente
2. **Limpe dados**: Use `afterEach` para limpar o banco
3. **Use seed**: Recrie dados básicos antes de cada teste
4. **Teste permissões**: Verifique 401/403 para usuários sem permissão
5. **Nomes descritivos**: Descreva o cenário completo no `it()`

## Debug de Testes

### Ver Logs Detalhados

```bash
npm run test:integration -- --verbose
```

### Execute um Arquivo Específico

```bash
npm run test:integration -- auth.integration.test.js
```

### Execute um Teste Específico

```bash
npm run test:integration -- -t "deve autenticar usuário ADMIN"
```

## CI/CD Integration

### GitHub Actions (Exemplo)

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      mysql:
        image: mysql:8
        env:
          MYSQL_ROOT_PASSWORD: root
          MYSQL_DATABASE: site_cursos_test
          MYSQL_USER: appuser
          MYSQL_PASSWORD: password
        ports:
          - 3306:3306
        options: --health-cmd="mysqladmin ping"
    
    steps:
      - uses: actions/checkout@v2
      
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm install
      
      - name: Setup test database
        run: npm run db:test:setup
      
      - name: Run unit tests
        run: npm test
      
      - name: Run integration tests
        run: npm run test:integration
```

## Troubleshooting

### Erro: "Cannot connect to database"

```bash
# Verifique se MySQL está rodando
mysql -u appuser -p

# Recrie o banco de teste
npm run db:test:setup
```

### Erro: "Table doesn't exist"

```bash
# O schema não foi executado
npm run db:test:setup
```

### Testes falhando aleatoriamente

Isso pode indicar que os testes não estão isolados. Verifique:
- O `afterEach` está limpando o banco?
- O seed está sendo recriado?
- Os IDs estão sendo capturados corretamente?

## Próximos Passos

1. **Adicionar mais cenários**: Testar casos de borda
2. **Testes de performance**: Medir tempo de resposta
3. **Testes de carga**: Simular múltiplos usuários
4. **Cobertura**: Adicionar testes para módulos faltantes

## Recursos

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Supertest Documentation](https://github.com/ladjs/supertest)
- [MySQL2 Documentation](https://github.com/sidorares/node-mysql2)
