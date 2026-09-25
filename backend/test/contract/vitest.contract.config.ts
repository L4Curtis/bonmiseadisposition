import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import baseConfig from '../../vitest.config';

// Tests de contrat HTTP (`npm run test:contract`) : l'application Nest réelle,
// interrogée par supertest, sur une base PostgreSQL jetable désignée par
// CONTRACT_DATABASE_URL (voir support/database.ts et docs/testing-guide.md).
//
// Configuration séparée de vitest.config.ts : `npm test` ne voit jamais ces
// fichiers (suffixe `.contract.ts`, pas `.spec.ts`) et n'a donc besoin
// d'aucune base. Les greffons (SWC, métadonnées de décorateurs) viennent de
// la configuration principale, pour que Nest s'exécute ici comme là-bas.
export default defineConfig({
  ...baseConfig,
  root: resolve(__dirname, '..', '..'),
  test: {
    globals: false,
    environment: 'node',
    include: ['test/contract/**/*.contract.ts'],
    globalSetup: ['test/contract/support/global-setup.ts'],
    setupFiles: ['test/contract/support/setup-env.ts'],
    // Chaque fichier vide et remplit la même base : un fichier à la fois.
    fileParallelism: false,
    // Les modules (AppModule et tout le backend) ne sont chargés qu'une fois
    // pour toute la suite, au lieu d'une fois par fichier : l'import du
    // backend coûte une quinzaine de secondes. Chaque fichier monte malgré
    // tout sa propre application et recrée son jeu de données ; le backend
    // ne garde aucun état au niveau des modules (vérifié : pas de cache
    // global, tout vit dans les instances de services).
    isolate: false,
    // Démarrer l'application et recréer le jeu de données prend quelques
    // secondes, davantage sur un poste ou un runner CI chargé.
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
