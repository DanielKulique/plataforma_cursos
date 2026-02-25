# Testes Unitários - Plataforma de Cursos

Este documento descreve a estrutura de testes unitários implementada para a plataforma de cursos.

## Visão Geral

O projeto utiliza **Jest** como framework de testes e **Supertest** para testes de integração HTTP.

### Comandos Disponíveis

```bash
# Rodar todos os testes com coverage
npm test

# Rodar testes em modo watch (desenvolvimento)
npm run test:watch

# Rodar testes com relatório de cobertura
npm run test:coverage
```

## Estrutura de Testes

Os testes estão organizados em `src/__tests__/`:

```
src/__tests__/
├── auth.controller.test.js       # Testes de autenticação
├── cursos.controller.test.js     # Testes de cursos
├── turmas.controller.test.js     # Testes de turmas
├── matricula.controller.test.js  # Testes de matrículas
├── usuarios.controller.test.js   # Testes de usuários
├── health.controller.test.js     # Testes de health check
├── middlewares.test.js           # Testes de middlewares (auth, roles, permissões)
├── checkProfessorPermission.test.js  # Testes de permissão de professor
└── email.service.test.js         # Testes do serviço de e-mail
```

## Cobertura de Testes

### Controllers Testados

| Controller | Status | Testes |
|------------|--------|--------|
| Auth | ✅ | Login, Me, Verificar Email |
| Cursos | ✅ | Listar, Buscar por ID, Criar, Atualizar, Deletar |
| Turmas | ✅ | Listar, Buscar por ID, Criar, Atualizar, Deletar, Turmas do Professor |
| Matrícula | ✅ | Criar, Buscar do Aluno, Minha Sala, Buscar da Turma, Atualizar, Cancelar |
| Usuários | ✅ | Listar, Buscar por ID, Atualizar, Deletar |
| Health | ✅ | Status do banco |

### Middlewares Testados

| Middleware | Status | Funcionalidades |
|------------|--------|-----------------|
| checkAuth | ✅ | Validação de token JWT |
| checkRole | ✅ | Verificação de papel (ALUNO, PROFESSOR, ADMIN) |
| checkUserPermission | ✅ | Permissão de usuário |
| checkProfessorPermission | ✅ | Permissões específicas de professor |

### Services Testados

| Service | Status | Funcionalidades |
|---------|--------|-----------------|
| Email | ✅ | Envio de código de verificação (debug e produção) |

## Exemplo de Teste

```javascript
describe('POST /api/auth/login', () => {
    it('deve retornar token JWT quando login for bem-sucedido', async () => {
        const usuarioMock = {
            id_usuario: 1,
            nome_completo: 'Test User',
            email: 'test@example.com',
            tipo: 'ALUNO'
        };

        authModel.login.mockResolvedValue(usuarioMock);
        jwt.sign.mockReturnValue('fake-token');

        const response = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'test@example.com',
                senha: 'senha123'
            });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('token', 'fake-token');
        expect(response.body).toHaveProperty('usuario');
    });
});
```

## Mocks Utilizados

Os testes utilizam mocks para isolar as dependências:

- **Models**: Mockados com `jest.mock()`
- **Middlewares**: Retornam `next()` para permitir execução
- **Services**: Simulam comportamento de envio de e-mail
- **JWT**: Mockado para não verificar tokens reais

## Cobertura Mínima

O `package.json` define thresholds de cobertura:

```json
"coverageThreshold": {
  "global": {
    "branches": 50,
    "functions": 50,
    "lines": 50,
    "statements": 50
  }
}
```

## Resultados Atuais

- **Test Suites**: 9 passed, 9 total
- **Tests**: 93 passed, 93 total
- **Cobertura**: ~52% statements, ~34% branches, ~38% functions

## Próximos Passos

1. Aumentar cobertura de testes para models
2. Adicionar testes de integração end-to-end
3. Implementar testes para rotas admin
4. Adicionar testes de validação de schema

## Dicas para Desenvolvimento

1. Use `npm run test:watch` durante o desenvolvimento
2. Execute testes antes de cada commit
3. Mantenha os mocks atualizados com as mudanças no código
4. Adicione novos testes para cada nova funcionalidade
