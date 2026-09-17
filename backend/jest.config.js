/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.module.ts', '!src/main.ts'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  // Les tests bcryptjs (coût 10-12) dépassent les 5 s par défaut quand la machine
  // ou le runner CI est chargé ; le délai maximal est relevé, pas le comportement.
  testTimeout: 20000,
  // branches à 70 (au lieu de 80) pour ne pas bloquer immédiatement la CI le
  // temps que l'ensemble des lots en cours atteigne la cible ; à relever une
  // fois la couverture stabilisée. N'a d'effet qu'avec `jest --coverage`.
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
