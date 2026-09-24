import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Suite de tests du backend sous Vitest (remplace Jest depuis le 24/09/2026).
//
// Pourquoi Vitest : depuis NestJS 12, @nestjs/{common,core,platform-express,
// testing…} sont publiés en ESM pur. Jest exécute tout en CommonJS avec son
// propre chargeur de modules et refusait ces paquets : il fallait les
// retranscrire avec Babel et remplacer par une doublure un fichier interne de
// NestJS (load-package.util, qui utilise import.meta.url). Vitest laisse Node
// charger node_modules lui-même : les tests exécutent désormais le vrai code
// de NestJS, comme la production.
export default defineConfig({
  plugins: [
    // esbuild/oxc (transformeurs par défaut de Vite) n'émettent pas les
    // métadonnées de décorateurs (design:paramtypes) dont dépend l'injection de
    // dépendances de NestJS : SWC les émet, en lisant experimentalDecorators et
    // emitDecoratorMetadata dans tsconfig.json. useDefineForClassFields est
    // fixé à false comme le fait tsc pour la cible ES2021 de la production
    // (sinon un champ de classe déclaré sans valeur écraserait ce qu'un
    // constructeur parent y a posé).
    swc.vite({
      jsc: { transform: { useDefineForClassFields: false } },
    }),
  ],
  test: {
    // describe / it / expect / vi disponibles sans import dans les *.spec.ts,
    // comme sous Jest (types : test/vitest-globals.d.ts).
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    // Les suites « real-db » (RUN_DB_TESTS=1) partagent une même base : l'une
    // insère ses propres bons pendant que l'autre compare deux requêtes
    // d'inventaire entre elles, ce qui fausse la comparaison si elles tournent
    // en même temps (vu sous Linux). Avec la base, fichiers l'un après l'autre ;
    // sans elle, parallélisme normal.
    fileParallelism: process.env.RUN_DB_TESTS !== '1',
    // Les tests bcryptjs (coût 10-12) dépassent les 5 s par défaut quand la
    // machine ou le runner CI est chargé ; le délai maximal est relevé, pas le
    // comportement.
    testTimeout: 20000,
    hookTimeout: 20000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.module.ts', 'src/main.ts', 'src/**/*.spec.ts'],
      reportsDirectory: './coverage',
      // Seuils réellement appliqués en CI (job `backend` de docker.yml, via
      // `npm run test:cov`). Effet cliquet : chaque valeur est calée sur la
      // mesure arrondie à l'entier inférieur, pour que la couverture ne puisse
      // plus redescendre sans qu'on s'en rende compte. Cible à terme pour les
      // quatre métriques : 80. Ne pas relever ces seuils en ajoutant des tests
      // juste pour « faire le chiffre » — les relever au fur et à mesure que
      // la couverture progresse naturellement.
      // Mesure du 24/09/2026 (v8, après passage à Vitest) : instructions 80,06 ·
      // branches 72,31 · fonctions 76,83 · lignes 80,78. Branches et fonctions
      // relevées en conséquence (65 → 72, 72 → 76).
      thresholds: {
        branches: 72,
        functions: 76,
        lines: 80,
        statements: 80,
      },
    },
  },
});
