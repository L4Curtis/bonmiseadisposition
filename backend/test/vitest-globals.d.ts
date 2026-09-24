// Types des globales de Vitest (describe, it, expect, vi, beforeEach…) pour les
// fichiers *.spec.ts, activées par `globals: true` dans vitest.config.ts.
// Ce fichier est vu par `tsc --noEmit` (tsconfig.json) mais pas par
// `nest build` (tsconfig.build.json exclut test/) : le code compilé pour la
// production ne peut donc pas dépendre de ces globales par mégarde. Les
// utilitaires de test hors *.spec.ts (helpers, fixtures), eux, compilés par
// `nest build`, importent explicitement `vi` depuis 'vitest'.
/// <reference types="vitest/globals" />
