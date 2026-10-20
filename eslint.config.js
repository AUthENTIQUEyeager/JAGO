import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores(['dist', 'node_modules', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      // Règle expérimentale (React Compiler) : elle signale tout chargement asynchrone lancé dans un effet.
      // Ces effets (fetch puis setState) sont voulus ; voir docs/DECISIONS.md D-024.
      'react-hooks/set-state-in-effect': 'off',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      // Sécurité (XSS) : jamais de HTML brut injecté. Les reçus sont construits en texte.
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'dangerouslySetInnerHTML est interdit (risque XSS). Utilisez du texte échappé.',
        },
      ],
    },
  },
  {
    files: ['scripts/**'],
    rules: { 'no-console': 'off' }, // les scripts en ligne de commande affichent leurs résultats
  },
  {
    files: ['vite.config.ts', 'tailwind.config.ts', 'tests/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.{js,mjs}'],
    extends: [js.configs.recommended, tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
])
