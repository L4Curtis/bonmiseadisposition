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
  // Seuils désormais réellement appliqués en CI (job `backend` de docker.yml,
  // via `npm run test:cov`) — jusqu'ici le seuil déclaré ici n'avait aucun
  // effet car la CI lançait `npm test` (sans `--coverage`).
  // Mesure du 19/09/2026 sur la suite complète (branches/functions/lines/
  // statements) : 65,73 % / 72,01 % / 80,97 % / 80,34 %. Chaque valeur ci-
  // dessous est calée sur le chiffre mesuré arrondi à l'entier inférieur (effet
  // cliquet : la couverture ne pourra plus redescendre sans qu'on s'en rende
  // compte). Cible à terme pour les quatre métriques : 80. Ne pas relever ces
  // seuils en ajoutant des tests juste pour « faire le chiffre » — les relever
  // au fur et à mesure que la couverture progresse naturellement.
  coverageThreshold: {
    global: {
      branches: 65,
      functions: 72,
      lines: 80,
      statements: 80,
    },
  },
};
