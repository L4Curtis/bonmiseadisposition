/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': 'ts-jest',
    // Depuis NestJS 12, @nestjs/{common,core,platform-express,schedule,jwt,
    // passport,testing} sont publiés en ESM pur ("type": "module", pas de
    // point d'entrée CommonJS). Node 22 sait faire require(esm), mais le
    // chargeur de modules de Jest (jest-runtime) reste indépendant de celui
    // de Node et échoue sur `import`/`export` tant que le fichier n'est pas
    // passé par un transform — cf. transformIgnorePatterns ci-dessous.
    // On a d'abord tenté de réutiliser ts-jest (déjà en dépendance) en mode
    // isolé pour ce transform .js, mais deux configurations ts-jest
    // distinctes ('.ts' pleinement typée, '.js' isolée avec
    // esModuleInterop) dans le même projet Jest produisent un résultat
    // incohérent (le compilateur créé pour '.ts' semble réutilisé pour
    // certains fichiers '.js' malgré des options différentes, provoquant
    // un import par défaut cassé sur jsonwebtoken). babel-jest — déjà
    // présent en interne comme dépendance de Jest — avec le seul plugin de
    // conversion de modules est le mécanisme standard pour ce cas de figure
    // et n'a pas ce problème : chaque appel de transform y est indépendant.
    '^.+\\.js$': [
      'babel-jest',
      {
        babelrc: false,
        configFile: false,
        plugins: ['@babel/plugin-transform-modules-commonjs'],
      },
    ],
  },
  // Par défaut Jest n'exécute aucun transform sur node_modules. On lève cette
  // exclusion pour le seul scope @nestjs (ESM pur depuis la v12) afin que le
  // transform '.js' ci-dessus s'applique aux fichiers qu'il expose ; le reste
  // de node_modules (CommonJS) continue d'être ignoré, comme avant.
  transformIgnorePatterns: ['node_modules/(?!(@nestjs)/)'],
  moduleNameMapper: {
    // @nestjs/common/utils/load-package.util.js utilise `import.meta.url`
    // dans sa branche synchrone de secours : un jeton qu'aucune
    // transpilation ne peut abaisser vers CommonJS (contrairement au reste
    // du fichier, uniquement fait d'import/export). Voir le commentaire de
    // la doublure pour le détail ; ce fichier est ré-exporté sous
    // '@nestjs/common/internal', d'où l'utilisation de ce module par
    // @nestjs/core, @nestjs/platform-express et @nestjs/testing.
    '(^|/)utils/load-package\\.util\\.js$': '<rootDir>/test/mocks/nestjs-common-load-package.util.ts',
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
