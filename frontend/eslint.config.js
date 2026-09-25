// Vérification statique du frontend (`npm run lint`, lancée par la CI).
// Règles : JavaScript recommandé, TypeScript recommandé, règles des hooks
// React et accessibilité (jsx-a11y). Une erreur bloque la CI ; un
// avertissement signale une dette connue, à résorber sans en ajouter.
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },

  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      reactHooks.configs.flat['recommended-latest'],
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      // Dépendances d'effet oubliées : source classique de bugs React. Une
      // exception se justifie sur la ligne (`-- raison`).
      'react-hooks/exhaustive-deps': 'error',

      // Règles du compilateur React (plugin v7) : elles visent la préparation
      // au React Compiler et signalent des motifs qui fonctionnent sous
      // React 18 (état de chargement posé dans un effet, référence lue au
      // rendu). 65 cas existants au 24/09/2026 : avertissements, à résorber
      // écran par écran lors des refontes.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',

      // `_` en tête de nom : variable volontairement ignorée (déstructuration
      // pour retirer une propriété, paramètre imposé par une signature).
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],
      // Interfaces de props shadcn qui prolongent un type HTML sans l'étendre.
      '@typescript-eslint/no-empty-object-type': ['error', { allowInterfaces: 'with-single-extends' }],

      // Placer le focus sur le premier champ d'une fenêtre modale est la
      // conduite attendue (WAI-ARIA, motif « Dialog ») : autorisé sur les
      // composants (`<Input autoFocus>`), toujours interdit sur un élément HTML nu.
      'jsx-a11y/no-autofocus': ['error', { ignoreNonDOM: true }],
    },
  },

  {
    // Composants shadcn/ui : le contenu arrive par `{...props}` (children),
    // ce que la règle ne sait pas voir.
    files: ['src/components/ui/**/*.tsx'],
    rules: { 'jsx-a11y/heading-has-content': 'off' },
  },

  {
    // DETTE CONNUE — écrans du bon, en cours de refonte par un autre lot (vague 2,
    // lot 2A) : les erreurs existantes y sont des avertissements jusqu'à cette
    // refonte. Ne pas ajouter de fichier à cette liste : corriger plutôt.
    files: ['src/pages/bons/**/*.{ts,tsx}'],
    linterOptions: { reportUnusedDisableDirectives: 'warn' },
    rules: {
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      'jsx-a11y/label-has-associated-control': 'warn',
      'jsx-a11y/role-has-required-aria-props': 'warn',
    },
  },
);
