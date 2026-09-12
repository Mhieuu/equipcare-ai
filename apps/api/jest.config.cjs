/**
 * @type {import('jest').Config}
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  setupFiles: ['<rootDir>/test/setup.ts'],
  testRegex: '.*\\.(e2e-spec|spec)\\.ts$',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: false,
        tsconfig: {
          module: 'CommonJS',
          target: 'ES2022',
          esModuleInterop: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          isolatedModules: false,
          strict: false,
          skipLibCheck: true,
          // Disable strict mode for test only to avoid extra churn
          noImplicitAny: false,
        },
      },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@equipcare/shared$': '<rootDir>/../../packages/shared/src',
    '^@equipcare/backend-core$': '<rootDir>/../../packages/backend-core/src',
    // Strip .js extension on import paths (so `app.module.js` → `app.module`)
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testTimeout: 30000,
  verbose: true,
};
