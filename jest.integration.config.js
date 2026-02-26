module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '**/__tests__/integration/**/*.test.js'
  ],
  verbose: true,
  testTimeout: 30000, // 30 segundos para testes de integração
  maxWorkers: 1, // Executa sequencialmente para evitar conflitos no banco
  collectCoverage: false,
  
  // Configurações específicas para testes de integração
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/integration/setup.js'],
  
  // Variáveis de ambiente para testes
  testEnvironmentOptions: {
    env: {
      NODE_ENV: 'test',
      DB_HOST: 'localhost',
      DB_USER: 'appuser',
      DB_PASSWORD: 'tPJ"~s04_4K5',
      DB_NAME: 'site_cursos_test', // Banco de dados de teste
      JWT_SECRET: 'test_jwt_secret_key_for_integration_tests_only',
      PORT: '3001' // Porta diferente para não conflitar
    }
  }
};
