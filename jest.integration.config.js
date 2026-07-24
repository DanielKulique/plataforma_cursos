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
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/integration/setup.js']
};
