import swc from 'unplugin-swc';
import { defineConfig, type ConfigEnv } from 'vitest/config';
import type { CoverageV8Options } from 'vitest/node';

// Suite de tests du backend sous Vitest (remplace Jest depuis le 24/09/2026).
//
// Pourquoi Vitest : depuis NestJS 12, @nestjs/{common,core,platform-express,
// testing…} sont publiés en ESM pur. Jest exécute tout en CommonJS avec son
// propre chargeur de modules et refusait ces paquets : il fallait les
// retranscrire avec Babel et remplacer par une doublure un fichier interne de
// NestJS (load-package.util, qui utilise import.meta.url). Vitest laisse Node
// charger node_modules lui-même : les tests exécutent désormais le vrai code
// de NestJS, comme la production.

// Couverture « partielle » : chacune des trois suites que lance la CI
// (unitaires, « real-db », contrat HTTP) n'exerce qu'une partie du code. Le
// cycle de vie des bons, par exemple, n'est vérifié que sur une vraie base
// (test/contract/lifecycle). Les seuils s'appliquent donc au total fusionné
// des trois (`npm run test:cov:merge`), jamais à une suite seule : lancée
// avec `--mode couverture-partielle`, une suite enregistre sa couverture
// sans la juger. Voir docs/testing-guide.md § 4.
export const PARTIAL_COVERAGE_MODE = 'couverture-partielle';

// Seuils réellement appliqués en CI (job `backend` de docker.yml, étape
// « Couverture fusionnée »), au total des trois suites. Effet cliquet : chaque
// valeur est calée sur la mesure arrondie à l'entier inférieur, pour que la
// couverture ne puisse plus redescendre sans qu'on s'en rende compte. Cible à
// terme pour les quatre métriques : 80. Ne pas relever ces seuils en ajoutant
// des tests juste pour « faire le chiffre » — les relever au fur et à mesure
// que la couverture progresse naturellement.
// Mesure du 24/09/2026 (v8, après passage à Vitest, suite unitaire seule) :
// instructions 80,06 · branches 72,31 · fonctions 76,83 · lignes 80,78.
// Branches et fonctions relevées en conséquence (65 → 72, 72 → 76).
// Mesure du 27/09/2026 (total fusionné unitaires + base réelle + contrat) :
// instructions 91,10 · branches 82,36 · fonctions 94,07 · lignes 92,50.
// Cliquet posé un peu sous la mesure, pour absorber les variations d'une
// suite à l'autre : 88 / 80 / 90 / 90.
export const COVERAGE_THRESHOLDS = {
  branches: 80,
  functions: 90,
  lines: 90,
  statements: 88,
} as const;

// esbuild/oxc (transformeurs par défaut de Vite) n'émettent pas les
// métadonnées de décorateurs (design:paramtypes) dont dépend l'injection de
// dépendances de NestJS : SWC les émet, en lisant experimentalDecorators et
// emitDecoratorMetadata dans tsconfig.json. useDefineForClassFields est fixé à
// false comme le fait tsc pour la cible ES2021 de la production (sinon un
// champ de classe déclaré sans valeur écraserait ce qu'un constructeur parent
// y a posé). Partagé avec la configuration des tests de contrat.
export const backendPlugins = [
  swc.vite({
    jsc: { transform: { useDefineForClassFields: false } },
  }),
];

/** Réglages de couverture communs aux trois suites ; seuils hors mode partiel. */
export function coverageOptions(mode: string | undefined): { provider: 'v8' } & CoverageV8Options {
  return {
    provider: 'v8' as const,
    include: ['src/**/*.ts'],
    // Les utilitaires de test (doublures, jeux de données) vivent sous
    // src/**/__tests__ sans être des *.spec.ts : ce n'est pas du code de l'application.
    exclude: ['src/**/*.module.ts', 'src/main.ts', 'src/**/*.spec.ts', 'src/**/__tests__/**'],
    reportsDirectory: './coverage',
    thresholds: mode === PARTIAL_COVERAGE_MODE ? undefined : COVERAGE_THRESHOLDS,
  };
}

export default defineConfig(({ mode }: ConfigEnv) => ({
  plugins: backendPlugins,
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
    coverage: coverageOptions(mode),
  },
}));
